#!/usr/bin/env python3
"""给 goat-gateway 的 agent 回收加「判活」守卫（2026-11-11）。

根因：getAgent()/resetAgents() 在 agentMaxAgeMs 超龄时无条件 e.agent.destroy()。
Node 的 http.Agent.destroy() 销毁的是**正在使用**的 socket（不只是 free pool），
所以正在传的 SSE 被腰斩 → 上游侧记 `upstream aborted` → dsh 报
`upstream stream ended before a completion event; this turn may be incomplete`。

证据：
  - 最小复现 ~/.dsh/storages/tools/repro-agent-destroy-truncation.mjs
    naive outcome=error:aborted chunks=4/30 / guarded outcome=end chunks=30/30
  - 全期日志 1376 次 AGENT-RECYCLE，269 次（19.5%）±1s 内伴随 STREAM-ERR upstream aborted（dt 3–14ms）

用法：python patch-gateway-agent-recycle.py [--check|--apply|--verify|--restore]
"""
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys

GW = os.path.join("D:/Toolbox/goat-gateway", "gateway.mjs")
STATE = os.path.expanduser("~/.dsh/storages/gateway-agent-recycle-patch.json")
BAK = GW + ".bak-20261111-pre-agent-recycle-guard"

OLD_RESET = '''function resetAgents(reason) {
  for (const e of agents.values()) {
    try { e.agent.destroy(); } catch {}
  }
  agents.clear();
  if (reason) log(`AGENT-RECYCLE ${reason}`);
}
'''

NEW_RESET = '''// 判活：agent.sockets 是**正在使用**的连接，freeSockets 才是空闲池。
// destroy() 两者都销 —— 2026-11-11 实测会把 in-flight SSE 斩断（见 repro-agent-destroy-truncation.mjs）。
function activeSocketCount(agent) {
  let n = 0;
  for (const list of Object.values(agent.sockets || {})) n += list.length;
  return n;
}

function resetAgents(reason) {
  for (const [key, e] of [...agents]) {
    const active = activeSocketCount(e.agent);
    if (active > 0) {
      e.pendingRecycle = true;
      log(`AGENT-RECYCLE-DEFER origin=${key} activeSockets=${active} reason=${reason || '-'}`);
      continue;
    }
    try { e.agent.destroy(); } catch {}
    agents.delete(key);
    if (reason) log(`AGENT-RECYCLE origin=${key} ${reason}`);
  }
}
'''

OLD_GET = '''  let e = agents.get(key);
  if (e && maxAge > 0 && Date.now() - e.bornAt > maxAge) {
    try { e.agent.destroy(); } catch {}
    log(`AGENT-RECYCLE origin=${key} age=${Date.now() - e.bornAt}ms > ${maxAge}ms`);
    e = null;
  }
'''

NEW_GET = '''  let e = agents.get(key);
  if (e && maxAge > 0 && Date.now() - e.bornAt > maxAge) {
    const active = activeSocketCount(e.agent);
    if (active > 0) {
      // 有流在飞：这次不回收，标记待回收 —— 否则 destroy() 会把这条长流腰斩。
      if (!e.pendingRecycle) {
        e.pendingRecycle = true;
        log(`AGENT-RECYCLE-DEFER origin=${key} age=${Date.now() - e.bornAt}ms activeSockets=${active}`);
      }
    } else {
      try { e.agent.destroy(); } catch {}
      log(`AGENT-RECYCLE origin=${key} age=${Date.now() - e.bornAt}ms > ${maxAge}ms`);
      e = null;
    }
  }
'''

def read(p):
    with open(p, encoding="utf-8") as f:
        return f.read()

def sha(s):
    return hashlib.sha256(s.encode()).hexdigest()[:16]

def check():
    s = read(GW)
    a, b = s.count(OLD_RESET), s.count(OLD_GET)
    ok = (a == 1 and b == 1)
    print(f"gateway.mjs {len(s.encode())} B  anchor resetAgents={a} getAgent={b}  -> {'READY' if ok else 'ANCHOR CHANGED'}")
    return ok

def apply():
    if os.path.exists(STATE):
        print("already applied (state exists); use --restore first")
        return 1
    if not check():
        print("anchor 不唯一，拒绝打补丁")
        return 2
    s = read(GW)
    shutil.copy2(GW, BAK)
    new = s.replace(OLD_RESET, NEW_RESET, 1).replace(OLD_GET, NEW_GET, 1)
    with open(GW, "w", encoding="utf-8", newline="") as f:
        f.write(new)
    r = subprocess.run(["node", "--check", GW], capture_output=True, text=True)
    if r.returncode != 0:
        shutil.copy2(BAK, GW)
        print("node --check FAILED, 已回滚:\n" + (r.stderr or "")[:800])
        return 3
    json.dump({"before": sha(s), "after": sha(new), "bak": BAK, "bytes": len(new.encode())},
              open(STATE, "w"), indent=1)
    print(f"applied: {len(s.encode())} -> {len(new.encode())} B, node --check OK, bak={os.path.basename(BAK)}")
    return 0

def verify():
    if not os.path.exists(STATE):
        print("no state: not applied")
        return 1
    st = json.load(open(STATE))
    s = read(GW)
    ok = True
    for name, cond in [
        ("old resetAgents gone", s.count(OLD_RESET) == 0),
        ("old getAgent gone", s.count(OLD_GET) == 0),
        ("new resetAgents present", s.count(NEW_RESET) == 1),
        ("new getAgent present", s.count(NEW_GET) == 1),
        ("activeSocketCount defined", s.count("function activeSocketCount(agent)") == 1),
        ("sha matches state", sha(s) == st["after"]),
    ]:
        print(("PASS " if cond else "FAIL ") + name)
        ok = ok and cond
    r = subprocess.run(["node", "--check", GW], capture_output=True, text=True)
    print(("PASS " if r.returncode == 0 else "FAIL ") + "node --check")
    return 0 if ok and r.returncode == 0 else 4

def restore():
    if not os.path.exists(BAK):
        print("no backup")
        return 1
    shutil.copy2(BAK, GW)
    if os.path.exists(STATE):
        os.remove(STATE)
    print(f"restored from {os.path.basename(BAK)} ({len(read(GW).encode())} B)")
    return 0

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "--check"
    fn = {"--check": check, "--apply": apply, "--verify": verify, "--restore": restore}.get(cmd)
    if fn is None:
        print("unknown action: " + cmd)
        sys.exit(9)
    r = fn()
    sys.exit(0 if r is True else r)
