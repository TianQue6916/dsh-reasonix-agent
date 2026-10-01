#!/usr/bin/env python3
"""dsh-session-id-backfill.py

给 session.v4.jsonl.zstd 里缺 `id` 的 user/message 事件补一个确定性 id。

── 背景（2026-09-29 incident） ─────────────────────────────────────────────
preset module `.agent-presets/anchored-standard/git-context.mjs` 手写的
user/message 形状漏了 `id` 字段。DSH 的 session validator 会报

    session event at seq N lacks an identified message

并把**整个 session 判为 corrupt** —— 历史加载失败，workspace 侧边栏里
那个对话就"消失"了。源码补丁在 commit e01da0d 加上 `id: randomUUID()`，
但 preset 的 .mjs 不参与 HMR，必须重启 dsh 进程才生效；重启窗口内旧进程
仍会继续往 session 里写坏数据（实测：重启前 3 分钟又写了一条，把
session-a0d5fbf8 的 9526 条事件整个判死）。

── id 构造 ─────────────────────────────────────────────────────────────────
与 2026-09-29 01:47 那一轮修复实测一致（可从现存 .bak-20260929-pre-id-fix
反推验证）：

    uuid5(NAMESPACE_DNS, f"{session_id}:{seq}")

    验证：uuid5(DNS, "68026ac5-70ab-4f6c-8ca1-d43c92797617:18")
        == b4ccaa46-b2e5-596c-bdc8-c9ecd9d28528   ✓

确定性 ⇒ 脚本可重复执行，同一条事件永远得到同一个 id。

── 用法 ────────────────────────────────────────────────────────────────────
    python dsh-session-id-backfill.py            # dry-run（默认），只报告
    python dsh-session-id-backfill.py --apply    # 备份后原地重写

只重写**确实需要补 id 的行**，其它行按原始字节 verbatim 复制。备份写到
    session.v4.jsonl.zstd.bak-<ts>-pre-id-backfill
（同名已存在则复用，保证幂等）。
"""

import argparse
import json
import os
import sys
import time
import uuid

try:
    import zstandard
except ImportError:
    sys.exit("需要 `pip install zstandard`")

NS = uuid.NAMESPACE_DNS
SESSION_FILENAME = "session.v4.jsonl.zstd"
BACKFILL_SUFFIX = "-pre-id-backfill"
# 文件在最近这么多秒内被写过 ⇒ 认为 dsh 可能正持有它，跳过
SAFETY_MTIME_WINDOW = 120.0


def dsh_home() -> str:
    return os.environ.get("DSH_HOME") or os.path.join(os.path.expanduser("~"), ".dsh")


def read_lines(path: str):
    """返回压缩文件里的原始行（bytes），不解码、不重排。"""
    dctx = zstandard.ZstdDecompressor()
    with open(path, "rb") as f:
        with dctx.stream_reader(f) as r:
            blob = r.read()
    lines = blob.split(b"\n")
    # 末尾通常有一个空片段（文件以 \n 结尾）
    if lines and lines[-1] == b"":
        lines.pop()
    return lines, (blob.endswith(b"\n"))


def needs_id(obj) -> bool:
    return (
        obj.get("type") == "user/message"
        and isinstance(obj.get("data"), dict)
        and not obj["data"].get("id")
    )


def patch_line(raw: bytes, session_id: str, ensure_ascii: bool) -> bytes:
    obj = json.loads(raw)
    seq = obj.get("seq")
    obj["data"]["id"] = str(uuid.uuid5(NS, f"{session_id}:{seq}"))
    return json.dumps(obj, ensure_ascii=ensure_ascii, separators=(",", ":")).encode("utf-8")


def process(path: str, apply: bool, force: bool):
    session_id = os.path.basename(os.path.dirname(path))
    age = time.time() - os.path.getmtime(path)
    if not force and age < SAFETY_MTIME_WINDOW and apply:
        return {"path": path, "status": "SKIP(active)", "age": age, "patched": 0}

    lines, trailing_nl = read_lines(path)
    if not lines:
        return {"path": path, "status": "EMPTY", "patched": 0}

    # 原始文件是否含非 ASCII 原字节 → 决定 json.dumps 的 ensure_ascii，
    # 让改动行的风格与原文件保持一致
    ensure_ascii = not any(b > 0x7F for line in lines for b in line)

    out = []
    patched = 0
    for raw in lines:
        if not raw.strip():
            out.append(raw)
            continue
        try:
            obj = json.loads(raw)
        except Exception:
            out.append(raw)  # 解析不了的行原样保留，不碰
            continue
        if needs_id(obj):
            out.append(patch_line(raw, session_id, ensure_ascii))
            patched += 1
        else:
            out.append(raw)

    if patched == 0:
        return {"path": path, "status": "clean", "patched": 0}

    old_size = os.path.getsize(path)
    if not apply:
        return {"path": path, "status": "WOULD-FIX", "patched": patched, "old_size": old_size}

    # 备份（同名已存在则复用 → 幂等）
    ts = time.strftime("%Y%m%d-%H%M%S")
    bak = path + f".bak-{ts}{BACKFILL_SUFFIX}"
    existing = [p for p in os.listdir(os.path.dirname(path)) if p.endswith(BACKFILL_SUFFIX)]
    if existing:
        bak = os.path.join(os.path.dirname(path), existing[0])
    else:
        with open(bak, "wb") as f:
            with open(path, "rb") as src:
                f.write(src.read())

    cctx = zstandard.ZstdCompressor(level=19)
    tmp = path + ".tmp-backfill"
    payload = b"\n".join(out) + (b"\n" if trailing_nl else b"")
    with open(tmp, "wb") as f:
        with cctx.stream_writer(f) as w:
            w.write(payload)
    os.replace(tmp, path)
    new_size = os.path.getsize(path)
    return {
        "path": path,
        "status": "FIXED",
        "patched": patched,
        "old_size": old_size,
        "new_size": new_size,
        "backup": os.path.basename(bak),
    }


def iter_session_files(home: str):
    root = os.path.join(home, "sessions")
    for dirpath, _dirnames, filenames in os.walk(root):
        for fn in filenames:
            if fn == SESSION_FILENAME:
                yield os.path.join(dirpath, fn)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true", help="实际写回（默认 dry-run）")
    ap.add_argument("--force", action="store_true", help="忽略 active 安全阀，强行处理")
    ap.add_argument("--session", help="只处理指定 session id（目录名）")
    args = ap.parse_args()

    home = dsh_home()
    print(f"DSH_HOME = {home}")
    print(f"模式     = {'APPLY' if args.apply else 'DRY-RUN'}\n")

    results = []
    for path in sorted(iter_session_files(home)):
        if args.session and os.path.basename(os.path.dirname(path)) != args.session:
            continue
        results.append(process(path, args.apply, args.force))

    dirty = [r for r in results if r.get("patched")]
    print(f"扫描 {len(results)} 个 session 文件；需要补 id 的 {len(dirty)} 个\n")
    for r in dirty:
        sid = os.path.basename(os.path.dirname(r["path"]))
        line = f"  [{r['status']:>10}] {sid:44} +{r['patched']} id"
        if "old_size" in r:
            line += f"  {r['old_size'] / 1e6:.2f}MB"
            if "new_size" in r:
                line += f" → {r['new_size'] / 1e6:.2f}MB"
        if "backup" in r:
            line += f"  bak={r['backup']}"
        print(line)
    if not dirty:
        print("  全部干净 —— 没有缺 id 的 user/message。")
    elif not args.apply:
        print("\n这是 dry-run。加 --apply 实际写回（会先备份）。")

    print("\n跳过（active 安全阀）:")
    skipped = [r for r in results if r.get("status") == "SKIP(active)"]
    for r in skipped:
        print(f"  {os.path.basename(os.path.dirname(r['path'])):44} mtime {r['age']:.0f}s 前")
    if not skipped:
        print("  无")


if __name__ == "__main__":
    main()
