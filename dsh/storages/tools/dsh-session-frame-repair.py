#!/usr/bin/env python3
"""dsh-session-frame-repair.py

修复被「整体重压成单个 zstd frame」破坏的 dsh session 文件，同时补上缺失的
message id。**保持 dsh 的 concatenated-frame 结构**。

── 为什么必须按 frame 修 ────────────────────────────────────────────────────
dsh 的 jsonl backend（@deepseek-ai/dsh-session-persistence-jsonl）不把文件当成
一个 zstd 流，而是 **concatenated-frame container**：header 单独一个 frame，
之后每个 append batch 一个 frame（用于 append / recover）。读路径
`decodeCurrentGeneration()` 做的是：

    const { frames, tornStart } = scanZstdFrames(bytes)
    if (tornStart !== void 0) throw "current session generation has a torn physical tail"
    const header = plaintext.next()            // 第一个 frame
    assertIndependentHeaderFrame(header.value)
    //   ↑ plaintext.indexOf(10) !== plaintext.length - 1 就抛
    //     "corrupt Zstandard session log: first frame is not exactly one header line"
    for (const chunk of plaintext) scanner.write(chunk)   // 其余 frame 流式喂
    // 之后要求 committedBytes === inputBytes（无 torn tail）

所以把整个文件重压成 1 个 frame（哪怕 checksum 正确、标准 zstd 工具都能读），
dsh 也会判它 corrupt：session 打不开，重启后被从 workspace 剔除。

dsh 自己的编码是（见 lib/index.js）：
    import { zstdCompress, constants } from "node:zlib"
    CHECKSUM_OPTIONS = { params: { [constants.ZSTD_c_checksumFlag]: 1 } }
即每个 frame 独立、带 checksum。本脚本用
`ZstdCompressor(level=3, write_checksum=True).compress()` 复现之。

── 策略 ─────────────────────────────────────────────────────────────────────
1. 候选 source = 同目录下所有 `session.v4.jsonl.zstd.bak-*pre-id*` 备份。
2. `data_src`  = 事件行最多的那个（数据最全）。
3. `skeleton`  = frame[0] 合法（恰好一行）的里面事件行最多的那个，
                 它的 frame 划分被完整保留。
4. 校验 skeleton 的行序列是 data_src 行序列的前缀（允许仅 data.id 不同）。
5. 逐 frame：取对应行段 → 补 id → 与原文逐字相同时直接复用原 frame 字节
   （所以只有真正改动的 frame 被重压）；skeleton 没覆盖的尾部行 → 追加为新 frame。

因为 frame[0] 永远来自 skeleton，它的「恰好一行」性质与其它 frame 的 checksum
全部保持。

── id 补法 ─────────────────────────────────────────────────────────────────
与 2026-09-29 01:47 那轮一致（可从现存 .bak-20260929-pre-id-fix 反推）：
    uuid5(NAMESPACE_DNS, f"{session_id}:{seq}")
确定性 ⇒ 幂等，重复执行得到同一个 id。

── 用法 ────────────────────────────────────────────────────────────────────
    python dsh-session-frame-repair.py                # dry-run
    python dsh-session-frame-repair.py --apply        # 重建（source 不动）
    python dsh-session-frame-repair.py --scan-all     # 附带全盘结构体检
"""

import argparse
import glob
import json
import os
import sys
import time
import uuid

try:
    import zstandard
except ImportError:
    sys.exit("需要 `pip install zstandard`")

ZSTD_MAGIC = 4247762216
SRC_GLOBS = ("session.v4.jsonl.zstd.bak-*pre-id*",)
TARGET = "session.v4.jsonl.zstd"


def scan_zstd_frames(buf, max_frames=float("inf")):
    """只扫结构、不解压。逐字移植 dsh 的 scanZstdFrames()。"""
    frames = []
    offset = 0
    while offset < len(buf):
        start = offset
        if len(buf) - offset < 4:
            return frames, start
        if int.from_bytes(buf[offset:offset + 4], "little") != ZSTD_MAGIC:
            raise ValueError("invalid frame magic at byte %d" % offset)
        offset += 4
        if offset == len(buf):
            return frames, start
        descriptor = buf[offset]
        offset += 1
        if (descriptor & 24) != 0:
            raise ValueError("reserved frame-header bit at byte %d" % (offset - 1))
        content_size_flag = descriptor >> 6
        single_segment = (descriptor & 32) != 0
        checksum = (descriptor & 4) != 0
        dictionary_flag = descriptor & 3
        dictionary_bytes = 4 if dictionary_flag == 3 else dictionary_flag
        if content_size_flag == 0:
            content_size_bytes = 1 if single_segment else 0
        else:
            content_size_bytes = 1 << content_size_flag
        remaining = (0 if single_segment else 1) + dictionary_bytes + content_size_bytes
        if len(buf) - offset < remaining:
            return frames, start
        offset += remaining
        while True:
            if len(buf) - offset < 3:
                return frames, start
            block_header = int.from_bytes(buf[offset:offset + 3], "little")
            offset += 3
            last_block = (block_header & 1) != 0
            block_type = (block_header >> 1) & 3
            block_size = block_header >> 3
            if block_type == 3:
                raise ValueError("reserved block type at byte %d" % (offset - 3))
            payload = 1 if block_type == 1 else block_size
            if len(buf) - offset < payload:
                return frames, start
            offset += payload
            if last_block:
                break
        if checksum:
            if len(buf) - offset < 4:
                return frames, start
            offset += 4
        frames.append((start, offset))
        if len(frames) == max_frames:
            return frames, None
    return frames, None


def decompress_frame(buf):
    return zstandard.ZstdDecompressor().decompressobj().decompress(buf)


def compress_frame(plaintext):
    """复现 dsh: zstdCompress(input, {params:{ZSTD_c_checksumFlag:1}})。"""
    return zstandard.ZstdCompressor(level=3, write_checksum=True).compress(plaintext)


def is_header_frame_ok(plaintext):
    """逐字对应 dsh 的 assertIndependentHeaderFrame()。

        if (plaintext.length === 0 || plaintext.indexOf(10) !== plaintext.length - 1)

    indexOf 是第一个换行 ⇒ 要求首个 frame 恰好一行。写成 rfind 会退化成
    「末尾有换行就算过」，对「单 frame 包住整个文件」的坏结构给假阴性。
    """
    return len(plaintext) > 0 and plaintext.find(b"\n") == len(plaintext) - 1


def load_candidate(path):
    raw = open(path, "rb").read()
    frames, torn = scan_zstd_frames(raw)
    if torn is not None:
        raise ValueError("torn physical tail")
    texts = [decompress_frame(raw[s:e]) for s, e in frames]
    lines = b"".join(texts).decode("utf-8").split("\n")
    if lines and lines[-1] == "":
        lines.pop()
    return {"path": path, "raw": raw, "frames": frames, "texts": texts,
            "lines": lines, "hdr_ok": is_header_frame_ok(texts[0])}


def only_id_diff(a, b):
    """b 是否等于 a 但多了 data.id（其余逐字/逐值相同）。"""
    try:
        oa, ob = json.loads(a), json.loads(b)
    except Exception:
        return False
    if {k: v for k, v in oa.items() if k != "data"} != {k: v for k, v in ob.items() if k != "data"}:
        return False
    da, db = dict(oa.get("data") or {}), dict(ob.get("data") or {})
    return (set(db) - set(da) == {"id"} and not set(da) - set(db)
            and all(da[k] == db[k] for k in da))


def patch_id(line, sid):
    """缺 id 的 user/message → 补确定性 id。返回 (新行, 是否改动)。"""
    try:
        o = json.loads(line)
    except Exception:
        return line, False
    if o.get("type") != "user/message":
        return line, False
    d = o.get("data")
    if not isinstance(d, dict) or d.get("id"):
        return line, False
    d["id"] = str(uuid.uuid5(uuid.NAMESPACE_DNS, "%s:%s" % (sid, o.get("seq"))))
    return json.dumps(o, ensure_ascii=False, separators=(",", ":")), True


def fix_session(sdir, apply):
    sid = os.path.basename(sdir)
    dest = os.path.join(sdir, TARGET)
    cands = sorted({p for g in SRC_GLOBS for p in glob.glob(os.path.join(sdir, g))})
    if not cands:
        return {"session": sid, "status": "NO-SOURCE"}
    infos = []
    for c in cands:
        try:
            infos.append(load_candidate(c))
        except Exception as exc:
            infos.append({"path": c, "error": str(exc)})
    good = [i for i in infos if "lines" in i]
    if not good:
        return {"session": sid, "status": "ALL-SOURCES-BAD"}

    data_src = max(good, key=lambda i: len(i["lines"]))
    skel_pool = [i for i in good if i["hdr_ok"]]
    if not skel_pool:
        return {"session": sid, "status": "NO-VALID-SKELETON",
                "detail": [(os.path.basename(i["path"]), len(i["frames"]), i["hdr_ok"]) for i in good]}
    skel = max(skel_pool, key=lambda i: len(i["lines"]))

    D, S = data_src["lines"], skel["lines"]
    if len(S) > len(D):
        return {"session": sid, "status": "SKELETON-LONGER"}
    for i in range(len(S)):
        if S[i] != D[i] and not only_id_diff(S[i], D[i]):
            return {"session": sid, "status": "PREFIX-MISMATCH", "at": i}

    out, patched, rewritten, verbatim = [], 0, 0, 0
    idx = 0
    for (s, e), text in zip(skel["frames"], skel["texts"]):
        k = text.count(b"\n")
        seg = D[idx:idx + k]
        idx += k
        new = []
        for line in seg:
            nl, ch = patch_id(line, sid)
            new.append(nl)
            patched += int(ch)
        rebuilt = ("\n".join(new) + "\n").encode("utf-8") if k else b""
        if rebuilt == text:
            out.append(skel["raw"][s:e])
            verbatim += 1
        else:
            out.append(compress_frame(rebuilt))
            rewritten += 1

    tail = D[idx:]
    if tail:
        new_tail = []
        for line in tail:
            nl, ch = patch_id(line, sid)
            new_tail.append(nl)
            patched += int(ch)
        out.append(compress_frame(("\n".join(new_tail) + "\n").encode("utf-8")))

    rebuilt_bytes = b"".join(out)

    v = {}
    vf, vt = scan_zstd_frames(rebuilt_bytes)
    v["no_torn"] = vt is None
    v["frame_count_ok"] = len(vf) == len(skel["frames"]) + (1 if tail else 0)
    try:
        vtexts = [decompress_frame(rebuilt_bytes[s:e]) for s, e in vf]
        v["all_frames_decode"] = True
        v["header_ok"] = is_header_frame_ok(vtexts[0])
        all_lines = b"".join(vtexts).decode("utf-8").split("\n")
        if all_lines and all_lines[-1] == "":
            all_lines.pop()
        v["line_count_ok"] = len(all_lines) == len(D)
        diffs = sum(1 for a, b in zip(all_lines, D) if a != b)
        v["only_id_differs"] = all(a == b or only_id_diff(b, a) for a, b in zip(all_lines, D)) and diffs == patched
    except Exception as exc:
        v["all_frames_decode"] = False
        v["error"] = str(exc)

    ok = all(bool(x) for x in v.values())
    res = {"session": sid, "status": "?", "skeleton": os.path.basename(skel["path"]),
           "data_src": os.path.basename(data_src["path"]),
           "skel_frames": len(skel["frames"]), "tail_lines": len(tail),
           "patched": patched, "rewritten": rewritten, "verbatim": verbatim, "verify": v}

    if not apply:
        res["status"] = "WOULD-FIX"
        return res
    if not ok:
        res["status"] = "VERIFY-FAILED"
        return res
    if os.path.exists(dest):
        os.replace(dest, dest + ".broken-" + time.strftime("%Y%m%d-%H%M%S"))
    with open(dest, "wb") as f:
        f.write(rebuilt_bytes)
    res["status"] = "FIXED"
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--scan-all", action="store_true")
    args = ap.parse_args()

    home = os.environ.get("DSH_HOME") or os.path.join(os.path.expanduser("~"), ".dsh")
    base = os.path.join(home, "sessions")

    targets = sorted({os.path.dirname(p) for g in SRC_GLOBS
                      for p in glob.glob(os.path.join(base, "*", "*", g))})
    print("发现 %d 个被重压过的 session（凭 pre-id 备份判定）\n" % len(targets))
    print("%-44s %6s %5s %4s %5s %5s  verify" % ("session", "skelF", "tail", "+id", "重压", "复用"))
    for d in targets:
        r = fix_session(d, args.apply)
        if r["status"] in ("NO-SOURCE", "ALL-SOURCES-BAD", "NO-VALID-SKELETON",
                           "SKELETON-LONGER", "PREFIX-MISMATCH", "VERIFY-FAILED"):
            print("%-44s  !! %s %s" % (r["session"][:42], r["status"], r.get("detail") or r.get("at") or ""))
            continue
        v = r["verify"]
        print("%-44s %6d %5d %4d %5d %5d  %s" % (
            r["session"][:42], r["skel_frames"], r["tail_lines"], r["patched"],
            r["rewritten"], r["verbatim"], "OK" if all(v.values()) else v))
    if not args.apply:
        print("\ndry-run。加 --apply 重建（source 备份不动，旧目标改名 .broken-<ts>）。")

    if args.scan_all:
        print("\n=== 全盘结构体检：frame[0] 不是'恰好一行'的 ===")
        n = 0
        for dirpath, _d, files in os.walk(base):
            if TARGET not in files:
                continue
            p = os.path.join(dirpath, TARGET)
            try:
                raw = open(p, "rb").read()
                fr, torn = scan_zstd_frames(raw)
                first = decompress_frame(raw[fr[0][0]:fr[0][1]]) if fr else b""
                if not fr or torn is not None or not is_header_frame_ok(first):
                    print("  %-44s frames=%d torn=%s hdr_ok=%s" % (
                        os.path.basename(dirpath), len(fr), torn, is_header_frame_ok(first)))
                    n += 1
            except Exception as exc:
                print("  %-44s ERR %s" % (os.path.basename(dirpath), exc))
                n += 1
        print("  共 %d 个可疑文件" % n)


if __name__ == "__main__":
    main()
