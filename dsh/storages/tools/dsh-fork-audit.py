#!/usr/bin/env python3
"""dsh-fork-audit.py

核账 dsh 的 session fork（分支）：谁 fork 了谁、prefix 有多长、cut 落在哪。
**只读**——不写任何 session 文件。

── 为什么需要它 ────────────────────────────────────────────────────────────
`session fork` 在磁盘上只留下几个字段（header 的 `isSeeded` / `parentSession` /
`origin` / `delegationDepth`）和**一条 tagged evt** `session/end-seed`。
只看 UI 你无法回答三个必须回答的问题：

  1. 这个 child 到底是「fork 了父对话的 prefix」还是「只领了一条 prompt 的子任务」？
     → header.isSeeded。false = 没有继承 prefix（subagent spawn / mnemon 一次性 child），
       true = 真的 fork。
  2. fork 的 cut 精确落在哪个 event？prefix 有多长？
     → 最后一个 `session/end-seed` event；它之前（含自身）的事件即继承前缀。
       （host 侧 `inheritedEventCount = boundary + 1`，不存 header，只能这样反推。）
  3. 这次 fork 的「重放成本」量级？
     → prefix 的字符数。child 首轮会把整个 prefix 重新发给 provider，能否便宜
       取决于 exact-prefix prompt cache 是否命中；time-context / git-context 注入
       会破坏逐字节一致性。真实 token 数看 dsh-token-meter，不看这个数。

── 关键实现约束（踩过的坑）────────────────────────────────────────────────
dsh 的 jsonl backend 不是「一个 zstd 流」，而是 **concatenated-frame container**：
header 单独一个 frame，之后每个 append batch 一个 frame。
所以读全文必须 `stream_reader(fh, read_across_frames=True)`，
否则你只会拿到第一个 frame（= 只有 header），事件数永远是 0。
详见 dsh-session-persistence-jsonl/lib/index.js 的 decodeCurrentGeneration()。

── 用法 ────────────────────────────────────────────────────────────────────
    python dsh-fork-audit.py                     # 汇总
    python dsh-fork-audit.py --forks             # 只列 isSeeded=true 的 fork
    python dsh-fork-audit.py --parents           # 只列 subagent children（未继承 prefix）
    python dsh-fork-audit.py --id 4b33f68a       # 单会话详情
    python dsh-fork-audit.py --id 4b33f68a -n 30 # 详情 + 最后 30 条事件摘要
    python dsh-fork-audit.py --json              # 机器可读
"""
from __future__ import annotations

import argparse
import glob
import io
import json
import os
import sys
from collections import Counter
from datetime import datetime, timezone

import zstandard

SESSIONS_GLOB = os.path.expanduser("~/.dsh/sessions/*/*/session.v4.jsonl.zstd")
# 文件名的所有变体：session.v4.jsonl.zstd / .bak-* / .broken-* —— 只有正牌参与核账
VALID_SUFFIX = "session.v4.jsonl.zstd"


def _die(msg: str, code: int = 2) -> None:
    print(f"error: {msg}", file=sys.stderr)
    raise SystemExit(code)


def iter_files() -> list[str]:
    return sorted(p for p in glob.glob(SESSIONS_GLOB) if p.endswith(VALID_SUFFIX))


def open_log(path: str):
    """打开 concatenated-frame 容器；必须 read_across_frames=True 才能读到 header 之后的内容。"""
    fh = open(path, "rb")
    reader = zstandard.ZstdDecompressor().stream_reader(fh, read_across_frames=True)
    return fh, io.BufferedReader(reader)


def read_all(path: str) -> tuple[dict, list[dict], int]:
    """-> (header, events, decompressed_bytes)。header 是第一条 JSONL 行。"""
    fh, r = open_log(path)
    try:
        first = r.readline()
        if not first.strip():
            raise ValueError("empty log (no header frame)")
        header = json.loads(first)
        events: list[dict] = []
        nbytes = len(first)
        for line in r:
            nbytes += len(line)
            if line.strip():
                try:
                    events.append(json.loads(line))
                except json.JSONDecodeError:
                    pass  # 容忍尾部半行（torn tail）
        return header, events, nbytes
    finally:
        fh.close()


def short_id(sid: str | None) -> str:
    if not sid:
        return "-"
    return str(sid).replace("session-", "")[:8]


def parent_of(h: dict) -> str | None:
    """parentSession 带 `session-` 前缀，目录名/header.id 不带 —— 统一成裸 uuid 比。"""
    return str(h.get("parentSession")).replace("session-", "") if h.get("parentSession") else None


def find_cut(events: list[dict]) -> tuple[int | None, dict | None]:
    """最后一个 tagged `session/end-seed` 的位置（inclusive）。未 seeded 时 -> (None, None)。"""
    cut_i, cut_ev = None, None
    for i, ev in enumerate(events):
        blob = json.dumps(ev, ensure_ascii=False)
        if "end-seed" in blob or "fork-close" in blob or "fork-closer" in blob:
            cut_i, cut_ev = i, ev
    return cut_i, cut_ev


def ev_kind(ev: dict) -> str:
    return str(ev.get("type") or ev.get("name") or ev.get("tag") or "?")


def describe(path: str, want_events: int = 0) -> dict:
    rec: dict = {"path": path, "dir": os.path.basename(os.path.dirname(path))}
    try:
        header, events, nbytes = read_all(path)
    except Exception as exc:  # noqa: BLE001 - 核账工具要能报坏文件而不是崩
        rec["unreadable"] = f"{type(exc).__name__}: {exc}"
        return rec
    cut_i, cut_ev = find_cut(events)
    prefix_events = events[: cut_i + 1] if cut_i is not None else []
    rec.update(
        id=header.get("id"),
        sid=short_id(header.get("id")),
        cwd=header.get("cwd"),
        created=header.get("createdAt"),
        created_iso=(
            datetime.fromtimestamp(header["createdAt"] / 1000, tz=timezone.utc).strftime("%Y-%m-%d %H:%M")
            if isinstance(header.get("createdAt"), (int, float))
            else "-"
        ),
        is_seeded=bool(header.get("isSeeded")),
        origin=header.get("origin"),
        depth=header.get("delegationDepth", 0),
        preset=header.get("agentPreset"),
        parent=parent_of(header),
        parent_sid=short_id(header.get("parentSession")),
        n_events=len(events),
        nbytes=nbytes,
        cut_index=cut_i,
        prefix_events=len(prefix_events),
        prefix_chars=sum(len(json.dumps(e, ensure_ascii=False)) for e in prefix_events),
        kinds=dict(Counter(ev_kind(e) for e in events).most_common(8)),
    )
    if cut_ev is not None:
        rec["cut_event"] = json.dumps(cut_ev, ensure_ascii=False)[:400]
    if want_events:
        rec["tail"] = [
            {"i": i, "kind": ev_kind(e), "preview": json.dumps(e, ensure_ascii=False)[:160]}
            for i, e in enumerate(events[-want_events:], start=len(events) - want_events)
        ]
    return rec


def print_record(r: dict, verbose: bool = False) -> None:
    if "unreadable" in r:
        print(f"  UNREADABLE {r['dir'][:8]}  {r['unreadable']}")
        return
    role = "FORK" if r["is_seeded"] else ("child" if r["parent"] else "root")
    line = (
        f"  {r['sid']}  {role:5s}  depth={r['depth']}  ev={r['n_events']:<4d}  "
        f"{(r['nbytes']/1024):7.1f}KiB  {r['created_iso']}  preset={r['preset']}"
    )
    if r["parent"]:
        line += f"  <- parent {r['parent_sid']}"
    print(line)
    if verbose:
        print(f"          cwd={r['cwd']}")
        if r["is_seeded"]:
            print(
                f"          cut=event#{r['cut_index']}  inherited_prefix={r['prefix_events']} events "
                f"/ {r['prefix_chars']} chars  ≈{r['prefix_chars']//3.5:.0f} tokens(粗估)"
            )
            if r.get("cut_event"):
                print(f"          cut event: {r['cut_event']}")
        print(f"          kinds={r['kinds']}")
        for t in r.get("tail", []):
            print(f"          [{t['i']:>4d}] {t['kind']:<22s} {t['preview']}")


def main() -> int:
    ap = argparse.ArgumentParser(description="dsh session fork 核账（只读）")
    ap.add_argument("--forks", action="store_true", help="只列 isSeeded=true 的 fork")
    ap.add_argument("--parents", action="store_true", help="只列 isSeeded=false 的 subagent children")
    ap.add_argument("--id", help="单会话详情（id 前缀即可，8 位足够）")
    ap.add_argument("-n", "--events", type=int, default=0, help="详情模式额外打印最后 N 条事件")
    ap.add_argument("-v", "--verbose", action="store_true", help="核对每个会话的 prefix 细节")
    ap.add_argument("--json", action="store_true", help="机器可读输出")
    ap.add_argument("--limit", type=int, default=40, help="列表模式最多打印多少条")
    args = ap.parse_args()

    files = iter_files()
    if not files:
        _die(f"no session log found: {SESSIONS_GLOB}")

    if args.id:
        needle = args.id.replace("session-", "")
        hits = []
        for f in files:
            try:
                header, _, _ = read_all(f)
            except Exception:  # noqa: BLE001
                continue
            if needle in str(header.get("id", "")):
                hits.append(f)
        if not hits:
            _die(f"no session matching id prefix {args.id!r}")
        for f in hits:
            rec = describe(f, want_events=args.events)
            if args.json:
                print(json.dumps(rec, ensure_ascii=False, indent=1))
            else:
                print_record(rec, verbose=True)
            # 顺手把它在磁盘上的血亲（parent）也带出来
            if rec.get("parent"):
                for g in files:
                    if os.path.basename(os.path.dirname(g)) == rec["parent"]:
                        print("\n  -- parent --")
                        print_record(describe(g), verbose=True)
        return 0

    recs = [describe(f) for f in files]
    forks = [r for r in recs if r.get("is_seeded")]
    children = [r for r in recs if r.get("parent") and not r.get("is_seeded")]
    roots = [r for r in recs if not r.get("parent")]

    if args.json:
        print(json.dumps(
            {"total": len(recs), "roots": len(roots), "children": len(children),
             "forks": forks, "unreadable": [r for r in recs if "unreadable" in r]},
            ensure_ascii=False, indent=1))
        return 0

    print(f"sessions: {len(recs)}   roots: {len(roots)}   subagent children: {len(children)}   "
          f"session forks (isSeeded=true): {len(forks)}")

    if not forks and not args.parents:
        print("\n  → 本机从未用过 session fork（没有任何 child 携带 fork-inherited prefix）。")
        print("    判定：UI 那个「在新会话中分支」按钮若生效，这里会出现 isSeeded=true。")
        print("    agent 侧想开携带历史的分支，走 subagent_fork（provider: fork），不是这个按钮。")

    if args.forks or forks:
        if forks:
            print(f"\nFORKS ({len(forks)}):")
            for r in sorted(forks, key=lambda x: x.get("created") or 0)[-args.limit:]:
                print_record(r, verbose=True)  # fork 列表永远展开 prefix 核账细节
        elif args.forks:
            print("\n  (none)")

    if args.parents or (children and not args.forks):
        print(f"\nSUBAGENT CHILDREN（未继承 prefix，isSeeded=false）{len(children)} 条，"
              f"按 delegationDepth / 事件数采样：")
        for r in sorted(children, key=lambda x: -(x.get("n_events") or 0))[: min(8, args.limit)]:
            print_record(r, verbose=False)
        if args.verbose:
            for r in sorted(children, key=lambda x: x.get("created") or 0)[-args.limit:]:
                print_record(r, verbose=True)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
