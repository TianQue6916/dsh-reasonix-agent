#!/usr/bin/env python3
"""relay — 两端 agent 嘱托目录 `C:\\relay` 的 Linux 侧 CLI。

真身只有一份：Windows（天阙九泉 / 27063）本机的 `C:\\relay`。
Linux 侧通过 Tailscale SSH + SFTP 远程读写（本机没有副本，也就没有双头问题）。

协议（权威是 `C:\\relay\\README.md`）只做三件事：
  · 消息不可变
  · 状态靠 rename 表达：0-inbox → 1-wip → 2-done / 3-dead
  · 单写者：lin2win 只有 Linux 写，win2lin 只有 Windows 写

    relay ls [--to lin|win|all] [--state inbox|wip|done|dead|all] [--json]
    relay send --to win --slug fix-plan-anchor [--kind task] [--priority p1] [-f body.md]
    relay claim <id> | done <id> [-m 备注] | dead <id> -m 理由 | reopen <id>
    relay show <id>
    relay log [--tail 20] [--side lin|win|all]
    relay state
    relay selftest

环境变量：RELAY_ROOT=<本地目录> 时改用本地 backend（离线演练 / 自测用）；
          RELAY_SSH_HOST / RELAY_SSH_USER / RELAY_SSH_PASS 可覆盖 SSH 凭据。
"""
from __future__ import annotations

import argparse
import json
import os
import re
import stat
import sys
from datetime import datetime, timezone

DEFAULT_ROOT = "C:/relay"
SELF = os.environ.get("RELAY_SELF", "lin")
STATES = {"inbox": "0-inbox", "wip": "1-wip", "done": "2-done", "dead": "3-dead"}
KINDS = ("task", "reply", "question", "note")
PRIOS = ("p0", "p1", "p2")
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,39}$")
NAME_RE = re.compile(r"^(\d{8}T\d{6}Z)-(\d{4})-([a-z0-9][a-z0-9-]{0,39})\.md$")


# ---------------------------------------------------------------- backend

class LocalBackend:
    """本地目录 backend（selftest / 离线演练）。"""
    kind = "local"

    def __init__(self, root):
        from pathlib import Path
        self.root = Path(root)
        self.desc = f"local:{root}"

    def _p(self, rel):
        return self.root / rel if rel else self.root

    def listdir(self, rel):
        d = self._p(rel)
        if not d.is_dir():
            return []
        out = []
        for p in d.iterdir():
            out.append((p.name, p.is_dir(), p.stat().st_size if p.is_file() else 0))
        return out

    def read(self, rel):
        return self._p(rel).read_bytes()

    def write(self, rel, data):
        p = self._p(rel)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)

    def append(self, rel, data):
        p = self._p(rel)
        p.parent.mkdir(parents=True, exist_ok=True)
        with p.open("ab") as f:
            f.write(data)

    def mkdir(self, rel):
        self._p(rel).mkdir(parents=True, exist_ok=True)

    def rename(self, src, dst):
        import os as _os
        a, b = self._p(src), self._p(dst)
        if b.exists():
            raise FileExistsError(str(b))
        if not b.parent.is_dir():      # 不自动建目录：让路径 bug 立刻暴露
            raise FileNotFoundError(f"目标目录不存在: {b.parent}")
        _os.replace(a, b)

    def remove(self, rel):
        self._p(rel).unlink()

    def exists(self, rel):
        return self._p(rel).exists()

    def isdir(self, rel):
        return self._p(rel).is_dir()

    def close(self):
        pass


class SshBackend:
    """Windows OpenSSH + SFTP backend。全部走 SFTP API，不拼 shell 命令（避免引号地狱）。"""
    kind = "ssh"

    def __init__(self, root, host=None, user=None, password=None, timeout=15):
        import warnings
        warnings.filterwarnings("ignore")
        import paramiko
        host, user, password = (host or self._from_sync_module("HOST"),
                                user or self._from_sync_module("USER"),
                                password or self._from_sync_module("PASS"))
        if not (host and user and password):
            die("缺少 SSH 凭据：设 RELAY_SSH_HOST/USER/PASS，或保证 sync_reasonix 可导入")
        self.root = root.replace("\\", "/").rstrip("/")
        self.desc = f"ssh:{user}@{host}:{self.root}"
        cli = paramiko.SSHClient()
        cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        cli.connect(host, username=user, password=password, timeout=timeout,
                    banner_timeout=timeout, auth_timeout=timeout)
        self._cli = cli
        self._sftp = cli.open_sftp()

    @staticmethod
    def _from_sync_module(key):
        try:
            sys.path.insert(0, os.path.expanduser("~/.reasonix/global-workspace/sync"))
            import sync_reasonix as R
            return getattr(R, key, None)
        except Exception:
            return None

    def _p(self, rel):
        return self.root if not rel else f"{self.root}/{rel.strip('/')}"

    def listdir(self, rel):
        try:
            attrs = self._sftp.listdir_attr(self._p(rel))
        except IOError:
            return []
        return [(a.filename, stat.S_ISDIR(a.st_mode),
                 a.st_size if not stat.S_ISDIR(a.st_mode) else 0) for a in attrs]

    def read(self, rel):
        with self._sftp.open(self._p(rel), "rb") as f:
            return f.read()

    def write(self, rel, data):
        with self._sftp.open(self._p(rel), "wb") as f:   # 父目录必须已存在
            f.write(data)

    def append(self, rel, data):
        try:
            old = self.read(rel)
        except IOError:
            old = b""
        self.write(rel, old + data)

    def mkdir(self, rel):
        cur = self.root
        for seg in rel.strip("/").split("/"):
            cur = f"{cur}/{seg}"
            try:
                self._sftp.stat(cur)
            except IOError:
                self._sftp.mkdir(cur)

    def rename(self, src, dst):
        if self.exists(dst):
            raise FileExistsError(dst)
        self._sftp.rename(self._p(src), self._p(dst))

    def remove(self, rel):
        self._sftp.remove(self._p(rel))

    def exists(self, rel):
        try:
            self._sftp.stat(self._p(rel)); return True
        except IOError:
            return False

    def isdir(self, rel):
        try:
            return stat.S_ISDIR(self._sftp.stat(self._p(rel)).st_mode)
        except IOError:
            return False

    def run(self, cmd, timeout=300):
        _i, o, e = self._cli.exec_command(cmd, timeout=timeout)
        out = o.read().decode("utf-8", "replace").strip()
        err = e.read().decode("utf-8", "replace").strip()
        return o.channel.recv_exit_status(), out, err

    def close(self):
        try:
            self._sftp.close(); self._cli.close()
        except Exception:
            pass


def make_backend(root=None):
    root_override = os.environ.get("RELAY_ROOT")
    if root_override:
        return LocalBackend(root or root_override)
    if root and root.startswith("/"):      # posix 绝对路径 = 本机目录（如 plansync 刷本地 PLAN）
        return LocalBackend(root)
    return SshBackend(root or DEFAULT_ROOT,
                      host=os.environ.get("RELAY_SSH_HOST"),
                      user=os.environ.get("RELAY_SSH_USER"),
                      password=os.environ.get("RELAY_SSH_PASS"))


# ---------------------------------------------------------------- 通用

B = None   # backend，main() 里初始化（SshBackend 连接有成本，allow 子命令就不必连）


def now_utc():
    return datetime.now(timezone.utc)


def other(side):
    return "win" if side == "lin" else "lin"


def spool(src):
    """src2dst 的 spool 相对路径。"""
    return f"{src}2{other(src)}"


def die(msg, code=2):
    print(f"relay: {msg}", file=sys.stderr)
    raise SystemExit(code)


def append_log(op, **kw):
    rec = {"ts": now_utc().strftime("%Y-%m-%dT%H:%M:%SZ"), "side": SELF, "op": op, **kw}
    B.append(f"log/{SELF}.jsonl", (json.dumps(rec, ensure_ascii=False) + "\n").encode())


def parse_front(text):
    if not text.startswith("---\n"):
        return {}
    end = text.find("\n---\n", 4)
    if end < 0:
        return {}
    meta = {}
    for line in text[4:end].split("\n"):
        if not line.strip() or line.lstrip().startswith("#") or ":" not in line:
            continue
        k, v = line.split(":", 1)
        meta[k.strip()] = v.strip()
    return meta


def read_msg(rel):
    raw = B.read(rel)
    txt = raw.decode("utf-8", "replace")
    meta = parse_front(txt)
    end = txt.find("\n---\n", 4)
    return meta, (txt[end + 5:] if end >= 0 else txt), raw


def iter_msgs(side, state="all"):
    """side = 收件人。产出 (state_dir, relpath)。"""
    src = other(side)
    states = list(STATES.values()) if state == "all" else [STATES[state]]
    for st in states:
        base = f"{spool(src)}/{st}"
        for name, isdir, _sz in sorted(B.listdir(base)):
            if isdir or not name.endswith(".md") or name.startswith(".tmp-"):
                continue
            yield st, f"{base}/{name}"


def resolve(prefix):
    hits = []
    for side in ("lin", "win"):
        for _st, rel in iter_msgs(side):
            name = rel.rsplit("/", 1)[-1]
            m = NAME_RE.match(name)
            if not m:
                continue
            stem, slug = name[:-3], m.group(3)
            if stem.startswith(prefix) or slug.startswith(prefix) or prefix in slug:
                hits.append(rel)
    uniq = set(hits)
    if not uniq:
        die(f"找不到消息: {prefix!r}")
    if len(uniq) > 1:
        die("前缀不唯一，候选:\n" + "\n".join("  " + r.rsplit('/', 1)[-1][:-3] for r in sorted(uniq)))
    return uniq.pop()


def move(rel, to_state, note=""):
    parts = rel.split("/")          # <spool>/<state>/<file>
    name = parts[-1]
    dst = "/".join(parts[:-2] + [STATES[to_state], name])
    if B.exists(dst):
        die(f"目标已存在（拒绝覆盖）: {dst}")
    B.rename(rel, dst)
    if note:
        B.write(dst[:-3] + ".note.txt", (note.rstrip() + "\n").encode())
    return dst


# ---------------------------------------------------------------- 子命令

def send_message(to, slug, kind, priority, body, re_id=""):
    """发布一条消息，返回 id。供 cmd_send / cmd_dispatch 共用。"""
    inbox = f"{spool(SELF)}/0-inbox"
    B.mkdir(inbox)
    ts = now_utc().strftime("%Y%m%dT%H%M%SZ")
    seen = 0
    for st in STATES.values():
        for name, isdir, _ in B.listdir(f"{spool(SELF)}/{st}"):
            m = NAME_RE.match(name)
            if m and not isdir and m.group(1) == ts:
                seen = max(seen, int(m.group(2)))
    seq = seen + 1
    if seq > 9999:
        die("同一秒内 seq 溢出（>9999）")
    name = f"{ts}-{seq:04d}-{slug}.md"
    meta = ["---", f"id: {name[:-3]}", f"from: {SELF}", f"to: {to}",
            f"created: {now_utc().strftime('%Y-%m-%dT%H:%M:%SZ')}",
            f"kind: {kind}", f"re: {re_id or ''}", f"priority: {priority}", "---", ""]
    content = "\n".join(meta) + body.rstrip() + "\n"
    if "\r" in content:
        die("正文含 CR —— 协议要求 LF")
    payload = content.encode("utf-8")
    if payload.startswith(b"\xef\xbb\xbf"):
        die("内容带 BOM —— R4 禁止")
    tmp = f"{inbox}/.tmp-{name}"
    B.write(tmp, payload)
    B.rename(tmp, f"{inbox}/{name}")
    append_log("send", id=name[:-3], to=to, kind=kind, priority=priority)
    return name[:-3]


def cmd_send(a):
    if not SLUG_RE.match(a.slug):
        die(f"slug 非法 {a.slug!r}: 只允许 [a-z0-9-]，字母开头，≤40 字符（NTFS 要求）")
    if a.kind not in KINDS:
        die(f"kind 必须是 {KINDS}")
    if a.priority not in PRIOS:
        die(f"priority 必须是 {PRIOS}")
    if a.to == SELF:
        die("--to 不能是自己")
    if a.file and a.file != "-":
        body = open(a.file, encoding="utf-8").read()
    else:
        body = sys.stdin.read()
    body = body.replace("\r\n", "\n").replace("\r", "\n")   # R4：入口归一化到 LF
    if not body.strip():
        die("正文为空；从 stdin 或 -f 给内容")
    mid = send_message(a.to, a.slug, a.kind, a.priority, body, a.re)
    print(f"sent {mid}  ->  {spool(SELF)}/0-inbox/")
    return 0


REMOTE_HELPER_PS1 = r"""$ErrorActionPreference = 'Continue'
$bin = 'C:\Users\27063\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\lib\bin.js'
$log = 'C:\relay\.probe\headless.log'
$task = Get-Content 'C:\relay\.probe\task.txt' -Raw -Encoding UTF8
Set-Location 'C:\relay'
"=== start $(Get-Date -Format o) ===" | Out-File -FilePath $log -Encoding utf8
& node $bin headless $task 2>&1 | ForEach-Object { "$_" } | Out-File -FilePath $log -Append -Encoding utf8
"=== end $(Get-Date -Format o) ===" | Out-File -FilePath $log -Append -Encoding utf8
Write-Output 'SCRIPT-END'
"""


def cmd_dispatch(a):
    """C 策略：投递一条嘱托，并立刻在对端拉一个 headless session 去处理它。"""
    if B.kind != "ssh":
        die("dispatch 需要 ssh backend（本地 backend 没有对端可拉）")
    if a.file and a.file != "-":
        body = open(a.file, encoding="utf-8").read()
    else:
        body = sys.stdin.read()
    body = body.replace("\r\n", "\n").replace("\r", "\n")
    if not body.strip():
        die("正文为空；从 stdin 或 -f 给内容")

    mid = send_message("win", a.slug, a.kind, a.priority, body, a.re)
    print(f"queued {mid}  ->  lin2win/0-inbox/")
    if a.no_run:
        print("(未派发；plansync 会在对端开新 session 时让它看到)")
        return 0

    task = (
        "你是 Windows 侧（天阙九泉）的 dsh agent。Linux 侧刚投递了一条嘱托，"
        f"id = {mid}，文件在 C:\\relay\\lin2win\\0-inbox\\{mid}.md。\n"
        "按 C:\\relay\\README.md 的协议处理它：\n"
        f"1. 读那条消息（C:\\relay\\lin2win\\0-inbox\\{mid}.md）\n"
        "2. 认领：移到 C:\\relay\\lin2win\\1-wip\\；处理后移到 2-done\\（放弃则移到 3-dead\\ 并写理由）\n"
        "3. 回复写进 C:\\relay\\win2lin\\0-inbox\\（R1：lin2win 只有 Linux 写），"
        "文件名 <UTC时间>-0001-<slug>.md，UTF-8 无 BOM、行尾 LF\n"
        "4. 只改 C:\\relay 内的文件，不要碰别的目录\n"
        "做完输出一行 DONE，并列出实际改动/创建的绝对路径。\n\n"
        "--- 嘱托正文 ---\n\n" + body
    )
    B.mkdir(".probe")
    B.write(".probe/task.txt", task.encode("utf-8"))
    B.write(".probe/run-headless.ps1", REMOTE_HELPER_PS1.encode("utf-8"))
    print(f"dispatching headless on {B.desc}  (timeout {a.timeout}s) ...")
    rc, out, err = B.run(
        r"powershell -NoProfile -ExecutionPolicy Bypass -File C:\relay\.probe\run-headless.ps1",
        timeout=a.timeout)
    log = B.read(".probe/headless.log").decode("utf-8", "replace").lstrip("\ufeff")
    print(log[-a.tail:] if a.tail else log)
    append_log("dispatch", id=mid, rc=rc)
    if rc != 0 and err:
        print("ERR:", err[:400], file=sys.stderr)
    return 0


def cmd_ls(a):
    sides = ["lin", "win"] if a.to == "all" else [a.to]
    rows = []
    for side in sides:
        for st, rel in iter_msgs(side, a.state):
            meta, body, raw = read_msg(rel)
            rows.append({"box": spool(other(side)), "state": st,
                         "id": rel.rsplit("/", 1)[-1][:-3],
                         "prio": meta.get("priority", "?"), "kind": meta.get("kind", "?"),
                         "bytes": len(raw), "lines": body.count("\n")})
    if a.json:
        print(json.dumps(rows, ensure_ascii=False, indent=2))
        return 0
    if not rows:
        print("(空)")
        return 0
    order = {v: i for i, v in enumerate(STATES.values())}
    rows.sort(key=lambda r: (r["box"], order[r["state"]], r["id"]))
    w = max(len(r["id"]) for r in rows)
    cur = None
    for r in rows:
        if r["box"] != cur:
            cur = r["box"]
            print(f"\n== {cur} ==")
        print(f"  {r['state']}  {r['id']:<{w}}  {r['prio']}  {r['kind']:<8}  {r['bytes']:>6}B  {r['lines']:>3}行")
    print()
    return 0


def cmd_show(a):
    rel = resolve(a.id)
    meta, body, raw = read_msg(rel)
    print(f"# {rel}  ({len(raw)} bytes)")
    for k in ("id", "from", "to", "created", "kind", "re", "priority"):
        if meta.get(k):
            print(f"{k:9}= {meta[k]}")
    print("-" * 60)
    print(body.rstrip())
    return 0


def cmd_claim(a):
    rel = resolve(a.id)
    if rel.split("/")[-2] != "0-inbox":
        die(f"{a.id} 当前不在 0-inbox，只有收件箱里的能认领")
    dst = move(rel, "wip")
    append_log("claim", id=rel.rsplit("/", 1)[-1][:-3], spool=rel.split("/")[0])
    print(f"claimed -> {dst}")
    return 0


def cmd_done(a):
    rel = resolve(a.id)
    if rel.split("/")[-2] not in ("0-inbox", "1-wip"):
        die(f"{a.id} 不在可完成状态")
    dst = move(rel, "done", a.msg or "")
    append_log("done", id=rel.rsplit("/", 1)[-1][:-3], note=a.msg or "")
    print(f"done -> {dst}")
    return 0


def cmd_dead(a):
    if not a.msg:
        die("dead 必须给理由（-m），否则对侧不知道为什么放弃")
    rel = resolve(a.id)
    dst = move(rel, "dead", a.msg)
    append_log("dead", id=rel.rsplit("/", 1)[-1][:-3], reason=a.msg)
    print(f"dead -> {dst}")
    return 0


def cmd_reopen(a):
    rel = resolve(a.id)
    if rel.split("/")[-2] == "0-inbox":
        die(f"{a.id} 已在 0-inbox")
    dst = move(rel, "inbox")
    append_log("reopen", id=rel.rsplit("/", 1)[-1][:-3])
    print(f"reopened -> {dst}")
    return 0


def cmd_log(a):
    sides = ["lin", "win"] if a.side == "all" else [a.side]
    for side in sides:
        rel = f"log/{side}.jsonl"
        if not B.exists(rel):
            print(f"== {rel} == (不存在)")
            continue
        lines = B.read(rel).decode("utf-8", "replace").splitlines()
        print(f"== {rel} == ({len(lines)} 条)")
        for ln in lines[-a.tail:]:
            print(" ", ln)
    return 0


PLAN_ROOT = os.environ.get("RELAY_PLAN_ROOT", "C:/Users/27063/.dsh")
BLOCK_BEGIN = "<!-- RELAY:BEGIN"
BLOCK_END = "<!-- RELAY:END -->"


def render_block(unread, crlf, role="win"):
    """role=win → 给 Windows agent 看的块；role=lin → 给 Linux 自己看的块。"""
    if role == "win":
        head = f"- 未读 **{len(unread)}** 条，在 `C:\\relay\\lin2win\\0-inbox\\`"
        reply = ("- 回话：写 `C:\\relay\\win2lin\\0-inbox\\<UTC时间>-0001-<slug>.md`，"
                 "UTF-8 **无 BOM**、LF（R1：`lin2win\\` 只有 Linux 写）")
    else:
        head = f"- 待我处理 **{len(unread)}** 条，在 `C:\\relay\\win2lin\\0-inbox\\`（`relay ls --to lin`）"
        reply = ("- 发嘱托：`relay send --to win --slug <slug> [-f body.md]`；"
                 "未读刷新：`relay plansync`（cron 每 20 min 已自动）")
    lines = [
        BLOCK_BEGIN + " —— 由 Linux 侧自动维护（`relay plansync`），手改会被覆盖 -->",
        "## relay 待办 · `C:\\relay`（每 turn 必查）",
        "",
        head,
    ]
    for u in unread[:5]:
        lines.append(f"  - `{u}`")
    lines += [
        "- 流程：读 → `1-wip\\` → 完成 `2-done\\`（放弃 `3-dead\\` + 理由）",
        "- 协议 `C:\\relay\\README.md`｜状态板 `C:\\relay\\STATE.md`"
        + ("（只改 `## WIN` 段）" if role == "win" else "（只改 `## LIN` 段）"),
        reply,
        BLOCK_END,
    ]
    return ("\r\n" if crlf else "\n").join(lines)


def cmd_plansync(a):
    """把 relay 未读状态刷进对端 dsh 的 PLAN.md 顶部（plan-anchor 每 turn 现读 head 30 行）。"""
    role = "lin" if PLAN_ROOT.startswith("/") else "win"
    unread = [rel.rsplit("/", 1)[-1][:-3] for _s, rel in iter_msgs(role, "inbox")]
    pb = make_backend(PLAN_ROOT)
    try:
        if not pb.exists("PLAN.md"):
            die(f"{PLAN_ROOT}/PLAN.md 不存在，无法注入")
        raw = pb.read("PLAN.md")
        txt = raw.decode("utf-8")
        crlf = "\r\n" in txt
        block = render_block(unread, crlf, role)
        if BLOCK_BEGIN in txt and BLOCK_END in txt:
            i = txt.index(BLOCK_BEGIN)
            j = txt.index(BLOCK_END) + len(BLOCK_END)
            new = txt[:i] + block + txt[j:]
            action = "replaced"
        else:
            anchor = "\r\n## 当前目标" if crlf else "\n## 当前目标"
            if anchor in txt:
                i = txt.index(anchor)
                new = txt[:i] + ("\r\n" if crlf else "\n") + block + txt[i:]
            else:
                nl = "\r\n" if crlf else "\n"
                head = txt.split(nl, 1)
                new = head[0] + nl + nl + block + nl + (head[1] if len(head) > 1 else nl)
            action = "inserted"
        if new == txt:
            print(f"plansync unchanged: {len(unread)} 条未读 -> {PLAN_ROOT}/PLAN.md（无变化，不写盘）")
            return 0
        # 备份固定名覆盖，避免每轮新增 300 KB+ 备份把远端塞爆
        pb.write("PLAN.md.bak-relay", raw)
        pb.write("PLAN.md", new.encode("utf-8"))
        append_log("plansync", plan_root=PLAN_ROOT, unread=len(unread), action=action)
        print(f"plansync {action}: {len(unread)} 条未读 -> {PLAN_ROOT}/PLAN.md "
              f"(行尾={'CRLF' if crlf else 'LF'}, 备份=PLAN.md.bak-relay)")
    finally:
        pb.close()
    return 0


def cmd_state(a):
    if not B.exists("STATE.md"):
        die("STATE.md 不存在")
    print(B.read("STATE.md").decode("utf-8", "replace").rstrip())
    return 0


def cmd_selftest(a):
    fails, oks = [], []

    def check(name, cond, detail=""):
        (oks if cond else fails).append(f"{name}{'  ' + detail if detail else ''}")

    check("backend 连通", True, B.desc)
    check("README.md 存在", B.exists("README.md"))
    check("STATE.md 存在", B.exists("STATE.md"))
    for src in ("lin", "win"):
        for st in STATES.values():
            check(f"{spool(src)}/{st}", B.isdir(f"{spool(src)}/{st}"))
    if fails:
        print(f"selftest: {len(oks)} 通过, {len(fails)} 失败")
        for f in fails:
            print("  FAIL", f)
        return 1

    ts = "99991231T235959Z"
    # 幂等：同一固定 ts 的 probe 若上次跑挂了会残留，先清掉
    for st in STATES.values():
        for name, isdir, _sz in B.listdir(f"{spool(SELF)}/{st}"):
            if not isdir and ts in name:
                B.remove(f"{spool(SELF)}/{st}/{name}")
    inbox = f"{spool(SELF)}/0-inbox"
    name = f"{ts}-0001-selftest-probe.md"
    content = ("---\nid: " + name[:-3] + f"\nfrom: {SELF}\nto: {other(SELF)}\ncreated: "
               "2026-10-28T00:00:00Z\nkind: note\nre: \npriority: p2\n---\n\nselftest body\n")
    tmp = f"{inbox}/.tmp-{name}"
    B.write(tmp, content.encode())
    B.rename(tmp, f"{inbox}/{name}")
    probe = f"{inbox}/{name}"
    check("发布后存在", B.exists(probe))
    raw = B.read(probe)
    check("无 BOM", not raw.startswith(b"\xef\xbb\xbf"))
    check("无 CR（纯 LF）", b"\r" not in raw)
    check("文件名 ASCII + 合法", bool(NAME_RE.match(name)) and name.isascii())
    meta = parse_front(raw.decode())
    check("front-matter 可解析", meta.get("from") == SELF and meta.get("to") == other(SELF))
    check("对侧可见", probe in [r for _s, r in iter_msgs(other(SELF), "inbox")])
    check("前缀/slug 解析", resolve(name[:-3]) == probe)
    d1 = move(probe, "wip")
    check("0-inbox → 1-wip",
          d1.count("/") == 2 and d1.split("/")[1] == "1-wip" and B.exists(d1)
          and not B.exists(probe), d1)
    d2 = move(d1, "done", "selftest note")
    check("1-wip → 2-done",
          d2.count("/") == 2 and d2.split("/")[1] == "2-done" and B.exists(d2)
          and not B.exists(d1), d2)
    note_rel = d2[:-3] + ".note.txt"
    check("done note 落盘", B.exists(note_rel))
    bad = ["Foo", "a b", "a/b", "", "-x", "a" * 41]
    check("slug 校验拒绝非法", all(not SLUG_RE.match(s) for s in bad))
    check("slug 校验接受合法", all(bool(SLUG_RE.match(s)) for s in ["fix-plan", "a", "x" * 40]))
    bad_names = ["foo.md", "2026-10-28-x.md", "2026102T162500Z-0001-a.md",
                 "20261028T162500Z-1-a.md", "20261028T162500Z-0001-A.md"]
    check("非法文件名被拒", all(not NAME_RE.match(x) for x in bad_names))

    append_log("selftest", passed=len(oks), failed=len(fails))
    lp = f"log/{SELF}.jsonl"
    check("log 可写且合法 JSONL", B.exists(lp) and all(
        json.loads(l) for l in B.read(lp).decode("utf-8").splitlines() if l.strip()))

    B.remove(d2)
    B.remove(note_rel)
    check("自测产物已清理", not B.exists(d2) and not B.exists(note_rel))

    print(f"selftest: {len(oks)} 通过, {len(fails)} 失败  [{B.desc}]")
    for f in fails:
        print("  FAIL", f)
    return 0 if not fails else 1


# ---------------------------------------------------------------- main

def main(argv=None):
    global B
    ap = argparse.ArgumentParser(prog="relay", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("send"); p.add_argument("--to", default="win", choices=["lin", "win"])
    p.add_argument("--slug", required=True); p.add_argument("--kind", default="task")
    p.add_argument("--priority", default="p1"); p.add_argument("--re", default="")
    p.add_argument("-f", "--file"); p.set_defaults(fn=cmd_send)

    p = sub.add_parser("dispatch", help="投递并立刻在对端拉 headless 处理（C 策略）")
    p.add_argument("--slug", required=True); p.add_argument("--kind", default="task")
    p.add_argument("--priority", default="p1"); p.add_argument("--re", default="")
    p.add_argument("-f", "--file"); p.add_argument("--no-run", action="store_true")
    p.add_argument("--timeout", type=int, default=280); p.add_argument("--tail", type=int, default=3000)
    p.set_defaults(fn=cmd_dispatch)

    p = sub.add_parser("ls"); p.add_argument("--to", default="lin", choices=["lin", "win", "all"])
    p.add_argument("--state", default="all", choices=list(STATES) + ["all"])
    p.add_argument("--json", action="store_true"); p.set_defaults(fn=cmd_ls)

    for name, fn in (("show", cmd_show), ("claim", cmd_claim), ("done", cmd_done),
                     ("dead", cmd_dead), ("reopen", cmd_reopen)):
        p = sub.add_parser(name); p.add_argument("id")
        p.add_argument("-m", "--msg", default=""); p.set_defaults(fn=fn)

    p = sub.add_parser("log"); p.add_argument("--tail", type=int, default=20)
    p.add_argument("--side", default="lin", choices=["lin", "win", "all"]); p.set_defaults(fn=cmd_log)

    sub.add_parser("state").set_defaults(fn=cmd_state)
    sub.add_parser("plansync").set_defaults(fn=cmd_plansync)
    sub.add_parser("selftest").set_defaults(fn=cmd_selftest)

    a = ap.parse_args(argv)
    B = make_backend()
    try:
        return a.fn(a)
    finally:
        B.close()


if __name__ == "__main__":
    raise SystemExit(main())
