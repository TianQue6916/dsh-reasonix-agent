#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
patch-gateway-reasoning-filter.py —— 在 goat-gateway 的请求路径上删掉「非中文 reasoning 回灌」。

症状
----
dsh 的思考链（reasoning）会长时间锁在英文，即使 system prompt 里的语言契约完好、
thinking-anchor 每步都在注入。用户两次追问（m02206 / m02462「思考语言还是英文?为什么?」）。

根因（离线消融实验，见 ~/.dsh/tmp-probe/replay-fix9.py）
----
pi-ai 适配层把每一步 assistant 的 thinking 块回灌成 request 里的
`reasoning_content`（@earendil-works/pi-ai/dist/api/openai-completions.js 的
`nonEmptyThinkingBlocks.map(b => b.thinking).join("\\n")` 分支）。
同一份真实请求体重复 6 次：

    full-control（保留 24 条英文 reasoning_content）   0/6 中文
    full-echo-drop（删掉这 24 条）                     4/6 中文
    full-echo-zh（换成中文 reasoning）                 3/6 中文
    full-zh-all（echo + 注入全中文化）                 4/6 中文

⇒ 回灌的自身 reasoning 是「语言自锁」的唯一载体（Fisher p≈0.033）。
机制自洽：每步把自己上一段的语言回灌给自己 ⇒ 锁死；compaction/重启重置链条 ⇒ 翻语言；
短上下文没有链条可黏 ⇒ 抛硬币。语言契约在 system 里、锚点在尾部，都只是先验，压不过它。

修法（棘轮）
----
非中文的 reasoning 一律不回灌（discard），中文的原样保留。于是英文链条被切断、重掷先验；
一旦某一步落到中文，它就被自己回灌强化 ⇒ 收敛到中文，且中文会话保留完整思维连续性。
残余概率由 step 级的语言守卫兜底（后续阶段）。

为什么落在 gateway 而不是 dsh
----
- `agent/pre-step` 看不到 durable history（context-gate.mjs 头注释原话：「Durable history
  (compaction summaries included) never passes through this gate」）⇒ preset 插件无法改历史。
- 改 pi-ai / dsh-llm-pi-ai 要动 npm 树 + desktop 的 app.asar（官方 nightly 更新会覆盖），
  而 gateway 是本机自己的代码、Win/Linux 同构、且是**所有** dsh 出口的必经点（两个 profile
  的 baseURL 都是 http://127.0.0.1:8788/v1）。
- 这里只需要 JSON 层的一处字段裁剪，`forward()` 会按 sendBody 重算 content-length。

开关（不用重启）
----
`logs/.reasoning-filter.json` 存在才生效：
  {"enabled": true, "minCjk": 0.25, "mode": "strip", "uaHints": ["deepseek-harness"], "verbose": false}
  - 删掉该文件 = 关闭；{"enabled": false} = 关闭。
  - mode: "strip"（删字段）| "empty"（置空串，给要求字段存在的上游兜底）。
  - uaHints: 只对 UA 含这些片段的客户端生效，默认只作用于 dsh（reasonix 的 UA 是
    Go-http-client/1.1，不受影响）。
  - minCjk: han/(han+latin) 阈值，低于它判为非中文。

用法
----
  python patch-gateway-reasoning-filter.py --check
  python patch-gateway-reasoning-filter.py                 # 打补丁（默认 target）
  python patch-gateway-reasoning-filter.py --verify
  python patch-gateway-reasoning-filter.py --restore
  python patch-gateway-reasoning-filter.py --file <别的 gateway.mjs>
  python patch-gateway-reasoning-filter.py --write-config  # 写好开关文件（= 启用）
"""

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

DEFAULT_TARGET = r"D:\Toolbox\goat-gateway\gateway.mjs"
CONFIG_PATH = r"D:\Toolbox\goat-gateway\logs\.reasoning-filter.json"

HELPER_ANCHOR = "function forward(clientReq, clientRes, keyEntry, body, meta) {"
CALL_ANCHOR = "  // bodylog-end"
APPLIED_MARK = "function filterReasoningEcho("

HELPER_BLOCK = r"""// reasoning-echo-filter-start (2026-10-03)
// 为什么：dsh 的 pi-ai 适配层把上一步自己的 reasoning 以 reasoning_content 回灌给模型
//（@earendil-works/pi-ai/dist/api/openai-completions.js 的 nonEmptyThinkingBlocks 分支）。
// 回灌是语言自锁的载体：同一上下文重复 6 次，保留英文回灌 0/6 中文，删掉/本地化 3-4/6
//（Fisher p≈0.033，见 ~/.dsh/storages/tools/patch-gateway-reasoning-filter.py 头注释）。
// 策略=棘轮：非中文 reasoning 不回灌，中文原样保留 ⇒ 一旦有一步中文就被自己强化并收敛。
// 开关 = logs/.reasoning-filter.json 是否存在（每请求现读，改完不用重启）。
const ECHO_FILTER_FIELDS = ['reasoning_content', 'reasoning', 'reasoning_text'];
const ECHO_FILTER_DEFAULT = { enabled: true, minCjk: 0.25, mode: 'strip', uaHints: ['deepseek-harness'], verbose: false };
function echoFilterConfig() {
  try {
    const f = p('logs', '.reasoning-filter.json');
    if (!fs.existsSync(f)) return null;
    const raw = JSON.parse(fs.readFileSync(f, 'utf8'));
    const cfg = { ...ECHO_FILTER_DEFAULT, ...(raw && typeof raw === 'object' ? raw : {}) };
    return cfg.enabled === false ? null : cfg;
  } catch {
    return null;
  }
}
function cjkRatioOf(text) {
  const s = String(text);
  const han = s.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g);
  const hanN = han ? han.length : 0;
  const lat = s.match(/[A-Za-z]/g);
  const latN = lat ? lat.length : 0;
  if (!hanN && !latN) return 1;
  return hanN / (hanN + latN);
}
function filterReasoningEcho(parsed, req, cfg) {
  if (!cfg || !parsed || !Array.isArray(parsed.messages)) return null;
  const ua = String((req && req.headers && req.headers['user-agent']) || '');
  if (Array.isArray(cfg.uaHints) && cfg.uaHints.length && !cfg.uaHints.some((h) => ua.includes(String(h)))) return null;
  const min = Number(cfg.minCjk);
  const floor = isFinite(min) ? min : 0.25;
  const stats = { seen: 0, dropped: 0, kept: 0, chars: 0 };
  for (const m of parsed.messages) {
    if (!m || typeof m !== 'object' || m.role !== 'assistant') continue;
    for (const field of ECHO_FILTER_FIELDS) {
      const v = m[field];
      if (typeof v !== 'string' || !v.length) continue;
      stats.seen += 1;
      if (cjkRatioOf(v) >= floor) {
        stats.kept += 1;
        continue;
      }
      stats.dropped += 1;
      stats.chars += v.length;
      if (cfg.mode === 'empty') m[field] = '';
      else delete m[field];
    }
  }
  return stats;
}
// reasoning-echo-filter-end
"""

CALL_BLOCK = r"""  // echo-filter-call-start (2026-10-03；见 patch-gateway-reasoning-filter.py)
  try {
    const echoCfg = echoFilterConfig();
    const echoStats = filterReasoningEcho(parsed, req, echoCfg);
    if (echoStats && echoStats.dropped > 0) {
      body = Buffer.from(JSON.stringify(parsed), 'utf8');
      log(
        `ECHO-FILTER id=${req._reqId} dropped=${echoStats.dropped} kept=${echoStats.kept}` +
          ` chars=${echoStats.chars} minCjk=${echoCfg.minCjk} mode=${echoCfg.mode} bytes=${body.length}`,
      );
    } else if (echoStats && echoStats.verbose) {
      log(`ECHO-FILTER id=${req._reqId} dropped=0 kept=${echoStats.kept}`);
    }
  } catch (echoErr) {
    log(`ECHO-FILTER-ERR ${String(echoErr && echoErr.message ? echoErr.message : echoErr)}`);
  }
  // echo-filter-call-end
"""


def count(text, needle):
    return text.count(needle)


def read_text(path):
    with open(path, "rb") as fh:
        raw = fh.read()
    return raw, raw.decode("utf-8")


def md5(path):
    h = hashlib.md5()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def find_backup(path):
    d = os.path.dirname(path)
    base = os.path.basename(path)
    cands = sorted(
        [f for f in os.listdir(d) if f.startswith(base + ".bak-") and "pre-reasoning-filter" in f],
        reverse=True,
    )
    return os.path.join(d, cands[0]) if cands else None


def node_check(path):
    try:
        r = subprocess.run(
            ["node", "--check", path], capture_output=True, text=True, timeout=90
        )
        return r.returncode == 0, (r.stderr or r.stdout).strip()
    except Exception as exc:  # pragma: no cover
        return False, str(exc)


def insert_once(text, anchor, block, where, label):
    if count(text, anchor) != 1:
        raise SystemExit(f"锚点不唯一/缺失：{label} count={count(text, anchor)} anchor={anchor!r}")
    if where == "before":
        return text.replace(anchor, block + anchor, 1)
    return text.replace(anchor, anchor + "\n" + block.rstrip("\n"), 1)


def cmd_check(path, helper_anchor=HELPER_ANCHOR, call_anchor=CALL_ANCHOR):
    raw, text = read_text(path)
    applied = APPLIED_MARK in text
    print(f"{path}  {len(raw)} bytes  md5={md5(path)}")
    print(f"  已打补丁 = {applied}")
    print(f"  helper 锚点 count = {count(text, helper_anchor)}")
    print(f"  call   锚点 count = {count(text, call_anchor)}")
    print(f"  helper 锚点原文 = {helper_anchor!r}")
    print(f"  call   锚点原文 = {call_anchor!r}")
    if applied:
        print(f"  helper 块 = {'reasoning-echo-filter-start' in text}")
        print(f"  call   块 = {'echo-filter-call-start' in text}")
    ok, err = node_check(path)
    print(f"  node --check: {'OK' if ok else 'FAIL'} {err[:400]}")
    cfg = os.path.exists(CONFIG_PATH)
    print(f"  {CONFIG_PATH}: {'存在（启用）' if cfg else '不存在（关闭）'}")
    return 0 if (not applied) or ok else 1


def cmd_apply(path, helper_anchor=HELPER_ANCHOR, call_anchor=CALL_ANCHOR):
    raw, text = read_text(path)
    if APPLIED_MARK in text:
        print("已打过补丁，跳过（幂等）")
        cmd_check(path, helper_anchor, call_anchor)
        return 0
    if count(text, helper_anchor) != 1 or count(text, call_anchor) != 1:
        print(f"锚点不唯一：helper={count(text, helper_anchor)} call={count(text, call_anchor)}")
        return 2
    backup = find_backup(path)
    if backup is None:
        stamp = "20261003-reasoning-filter"
        backup = f"{path}.bak-{stamp}-pre-reasoning-filter"
        shutil.copy2(path, backup)
        print(f"备份 -> {backup}")
    else:
        print(f"复用已有备份 -> {backup}")

    new_text = insert_once(text, helper_anchor, HELPER_BLOCK, "before", "helper")
    new_text = insert_once(new_text, call_anchor, CALL_BLOCK, "after", "call")

    with open(path, "wb") as fh:
        fh.write(new_text.encode("utf-8"))
    ok, err = node_check(path)
    print(f"{path}  {len(raw)} -> {os.path.getsize(path)} bytes  node --check: {'OK' if ok else 'FAIL'} {err[:400]}")
    if not ok:
        print("语法检查失败，自动回滚")
        shutil.copy2(backup, path)
        return 3
    return cmd_check(path)


def cmd_restore(path):
    backup = find_backup(path)
    if backup is None:
        print(f"找不到 {path}.bak-*-pre-reasoning-filter")
        return 2
    shutil.copy2(backup, path)
    print(f"已恢复 {path} <- {backup}  md5={md5(path)}")
    return cmd_check(path)


# ── 功能自检：把 helper 抽出来在 node 里真跑 ─────────────────────────────────
EXTRACT_RE = re.compile(
    r"// reasoning-echo-filter-start.*?// reasoning-echo-filter-end", re.S
)
TESTS_JS = r"""
import assert from 'node:assert/strict';
import fs from 'node:fs';

__HELPER__

// 1) cjkRatioOf
assert.equal(cjkRatioOf('中文中文'), 1);
assert.ok(Math.abs(cjkRatioOf('中文abc') - 2 / 5) < 1e-9);
assert.equal(cjkRatioOf('all english words here'), 0);
assert.equal(cjkRatioOf('123 / 456'), 1);

// 2) 过滤：只对 assistant + UA 命中 + 低于阈值
const mk = (o) => o;
const body = {
  model: 'deepseek/deepseek-v4.1-flash',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: '中文问题' },
    { role: 'assistant', content: '', reasoning_content: 'The user asks me to compute the token buckets. Let me check the numbers again.' },
    { role: 'assistant', content: 'ok', reasoning_content: '用户问的是 token 桶的分布，让我核对一下数字。' },
    { role: 'assistant', content: 'x', reasoning: 'This is a short english thought.' },
    { role: 'assistant', content: 'y', reasoning_content: '' },
    { role: 'tool', content: 'result' },
  ],
};
const cfg = { enabled: true, minCjk: 0.25, mode: 'strip', uaHints: ['deepseek-harness'] };
cfg.__proto__ = null;  // 保持纯对象
const req = { headers: { 'user-agent': 'deepseek-harness/0.2.0-rc.2 (+https://github.com/deepseek-ai/deepseek-harness)' } };
const st = filterReasoningEcho(body, req, cfg);
assert.equal(st.seen, 3);
assert.equal(st.dropped, 2);
assert.equal(st.kept, 1);
assert.equal('reasoning_content' in body.messages[2], false);
assert.equal('reasoning' in body.messages[4], false);
assert.equal(body.messages[3].reasoning_content.length > 0, true);
assert.equal('reasoning_content' in body.messages[5], true, '空串不动');
// 非 assistant 不动
assert.equal('content' in body.messages[0], true);
assert.equal(body.messages[0].reasoning_content, undefined);

// 3) mode=empty 保字段
const body2 = { messages: [{ role: 'assistant', reasoning_content: 'English only thought here.' }] };
const st2 = filterReasoningEcho(body2, req, { enabled: true, minCjk: 0.25, mode: 'empty', uaHints: ['deepseek-harness'] });
assert.equal(st2.dropped, 1);
assert.equal(body2.messages[0].reasoning_content, '');

// 4) UA 不命中 = 不动
const st3 = filterReasoningEcho({ messages: [{ role: 'assistant', reasoning_content: 'english' }] }, { headers: { 'user-agent': 'Go-http-client/1.1' } }, cfg);
assert.equal(st3, null);

// 5) 没有 messages / 没有 cfg 都不炸
assert.equal(filterReasoningEcho({}, req, cfg), null);
assert.equal(filterReasoningEcho({ messages: [] }, req, null), null);

// 6) 阈值边界：ratio == floor 保留
const b4 = { messages: [{ role: 'assistant', reasoning_content: '中文a' }] };  // 2/3
const st4 = filterReasoningEcho(b4, req, { enabled: true, minCjk: 2 / 3, mode: 'strip', uaHints: [] });
assert.equal(st4.kept, 1);

console.log('assertions: 6 组全过');
"""


def cmd_verify(path):
    raw, text = read_text(path)
    problems = []
    if APPLIED_MARK not in text:
        problems.append("未找到 filterReasoningEcho 定义")
    for mark in ("reasoning-echo-filter-start", "reasoning-echo-filter-end", "echo-filter-call-start", "echo-filter-call-end"):
        if mark not in text:
            problems.append(f"缺标记 {mark}")
    if count(text, "filterReasoningEcho(parsed, req, echoCfg)") != 1:
        problems.append("调用点不唯一")
    if "let body;" not in text:
        problems.append("body 不是 let（无法重写）")
    ok, err = node_check(path)
    if not ok:
        problems.append(f"node --check FAIL: {err[:200]}")
    if problems:
        print("RESULT: FAIL")
        for p in problems:
            print("  -", p)
        return 1

    m = EXTRACT_RE.search(text)
    helper = m.group(0) if m else ""
    tmp = tempfile.mkdtemp(prefix="echo-filter-")
    js = os.path.join(tmp, "test.mjs")
    with open(js, "w", encoding="utf-8") as fh:
        fh.write(TESTS_JS.replace("__HELPER__", helper))
    r = subprocess.run(["node", js], capture_output=True, text=True, timeout=120)
    print("功能自检：", (r.stdout or "").strip())
    if r.returncode != 0:
        print("RESULT: FAIL")
        print((r.stderr or "")[:2000])
        return 1
    print(f"标记齐全，node --check OK，{CONFIG_PATH}: {'存在' if os.path.exists(CONFIG_PATH) else '不存在'}")
    print("RESULT: PASS")
    return 0


def cmd_write_config(enable=True):
    os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
    cfg = {
        "enabled": bool(enable),
        "minCjk": 0.25,
        "mode": "strip",
        "uaHints": ["deepseek-harness"],
        "verbose": False,
        "_comment": "非中文 reasoning 不回灌（切断语言自锁）；删掉本文件即关闭。",
    }
    with open(CONFIG_PATH, "w", encoding="utf-8") as fh:
        json.dump(cfg, fh, ensure_ascii=False, indent=2)
    print(f"写入 {CONFIG_PATH}: enabled={cfg['enabled']} minCjk={cfg['minCjk']} mode={cfg['mode']}")
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--verify", action="store_true")
    ap.add_argument("--restore", action="store_true")
    ap.add_argument("--file", default=DEFAULT_TARGET)
    ap.add_argument("--helper-anchor", default=HELPER_ANCHOR,
                    help="覆盖 helper 插入锚点；Linux 版 gateway.mjs 行号/内容可能不同")
    ap.add_argument("--call-anchor", default=CALL_ANCHOR,
                    help="覆盖 call 插入锚点；Linux 版没有 bodylog 补丁，默认锚点会 count=0")
    ap.add_argument("--write-config", action="store_true")
    ap.add_argument("--disable", action="store_true", help="和 --write-config 一起用则写 enabled=false")
    args = ap.parse_args()
    if args.write_config:
        return cmd_write_config(not args.disable)
    if args.check:
        return cmd_check(args.file, args.helper_anchor, args.call_anchor)
    if args.verify:
        return cmd_verify(args.file)
    if args.restore:
        return cmd_restore(args.file)
    return cmd_apply(args.file, args.helper_anchor, args.call_anchor)


if __name__ == "__main__":
    sys.exit(main())
