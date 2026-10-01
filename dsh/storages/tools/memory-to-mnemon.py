#!/usr/bin/env python3
"""memory-to-mnemon — 把 reasonix memory 语料喂进 mnemon（全量重喂，靠 mnemon 自动去重）

用法:
  python memory-to-mnemon.py [--dry-run] [--data-dir D] [--src DIR] [--draft PATH]

设计:
  * 全量重喂是安全的 —— mnemon import 走正常写入路径（去重 + 图边 + lifecycle）
  * 按 markdown 的 `##` 分节切块，用**字节**预算（mnemon 是 Go，len() 数 UTF-8 字节：
    content ≤ 8000 字节、每个 tag ≤ 100 字节）—— 初版按字符数算会直接被拒
"""
import os, re, json, sys, subprocess, argparse, datetime, shutil, tempfile, time

def blen(s): return len(s.encode("utf-8"))
def cutb(s, maxb):
    if blen(s) <= maxb: return s
    b = s.encode("utf-8")[:maxb]
    while b and (b[-1] & 0xC0) == 0x80: b = b[:-1]
    return b.decode("utf-8", "ignore")

MAXB, TAGB = 7500, 100

def list_facts(src):
    return sorted(f for f in os.listdir(src) if f.endswith(".md") and f != "MEMORY.md"
                  and ".bak" not in f and ".conflict." not in f)

def discover_scopes(root):
    """发现 reasonix memory 树下的全部 scope → [(label, dir), ...]

    2026-09-28：旧版只读 `~/.reasonix/memory/global`，于是 `project/` 与
    `eecdfd87f26b0ddb/`（另一个 project scope）下的 fact 从来没进过 mnemon。
    以 `.` 开头的目录被跳过 —— `.revisions` 是修订历史快照，不是记忆本体。
    `global/.archive` 单独收尾、标签为 archive（importance 压到 ≤2，使其可被 gc 回收）。
    """
    out = []
    if not os.path.isdir(root):
        return out
    for name in sorted(os.listdir(root)):
        p = os.path.join(root, name)
        if os.path.isdir(p) and not name.startswith("."):
            out.append((name, p))
    out.sort(key=lambda kv: kv[0] != "global")      # global 是主 scope，排第一
    arch = os.path.join(root, "global", ".archive")
    if os.path.isdir(arch):
        out.append(("archive", arch))
    # REASONIX.md —— reasonix 侧的常驻画像摘要（身份与角色 / 方舟计划 / 执行清单 / 书目）。
    # 2026-09-30 补：它不在 memory/<scope>/ 下，旧版 discover_scopes 只遍历 root 的子目录，
    # 所以这份「reasonix 其实一直常驻在上下文里」的画像从来没进过 mnemon。
    # 单独 append 到末尾（global 已排首位），标签 src:reasonix-root 标明来源。
    rh = os.path.expanduser("~/.reasonix")
    if os.path.isfile(os.path.join(rh, "REASONIX.md")):
        out.append(("reasonix-root", rh))
    return out

def build_insights(scopes, only=None):
    """scopes: [(label, dir), ...]"""
    found = []
    for label, d in scopes:
        for f in list_facts(d):
            if only and f != only and f != only + ".md":
                continue
            found.append((label, d, f))
    if only and not found:
        raise SystemExit(f"[mnemon-sync] 找不到 fact 文件: {only}")
    files = [f"{label}/{f}" for label, _, f in found]
    ins = []
    for label, d, f in found:
        t = open(os.path.join(d, f), encoding="utf-8", errors="replace").read()
        fms, body = "", t
        if t.startswith("---"):
            i = t.find("\n---", 3)
            if i != -1:
                j = t.find("\n", i + 4)
                fms, body = t[:i], t[j + 1:]
        def g(k):
            # frontmatter 的 metadata 块是**缩进**的（"  fact_type: x"）。
            # 2026-09-28 之前这里把 ^ 锚在行首 —— metadata 下的键一个都读不到，
            # 后果是每条 insight 的 category 都塌成 "fact"（mnemon status 实证 212/212）。
            m = re.search(rf"^[ \t]*{k}:\s*(.+)$", fms, re.M)
            return m.group(1).strip().strip('"') if m else ""
        name = g("name") or f[:-3]
        desc = g("description")
        tags = [cutb(x.strip(), TAGB) for x in re.split(r"[,，]", g("keywords")) if x.strip()][:8]
        if cutb(name, TAGB) not in tags: tags.append(cutb(name, TAGB))
        # 非 global 的 fact 打来源标签；global 是默认 scope，不加噪音 ⇒ 既有 189 条行为完全不变
        if label != "global" and ("src:" + label) not in tags:
            tags.append("src:" + label)
        # fact_type 才是权威维度。type 里的 "user" 在本语料里是默认填充值（142/177 个文件），
        # 不携带信息量 —— 若把它当画像标记，几乎全部 fact 都会跳到 importance 4，
        # 直接废掉 mnemon 的 importance decay（下方注释已警告过这个陷阱）。
        ft = g("fact_type")
        if not ft:
            t2 = g("type")
            ft = t2 if t2 in ("feedback", "project", "reference") else "reference"
        cat = {"feedback": "preference", "user": "context", "project": "context"}.get(ft, "fact")
        # 分层 importance —— 关键：mnemon 的 gc 把 importance >= 4 视为 immune，
        # 若全员 4 则 importance decay 完全失效（实测 candidates_found: 0）
        # 分层 importance（mnemon 1-5；gc threshold 0.5 归一化后约等于 importance 2.5，
        # 所以 3 已属"高分不可回收"区，低价值历史记录必须落到 1-2 才算真正可 decay）
        low = (name + desc).lower()
        HIST = ("工具-", "下载", "安装记录", "电影", "ocr", "ppt", "word", "迅雷", "b站", "维基", "zim",
                "codex桌面", "工具箱", "桌面挂件", "鲸鱼娘", "钢琴", "vscode-semester")
        if ft == "feedback" or "元规则" in name or name.startswith("rule-") or "user-persona" in name:
            imp = 5
        elif any(k in low for k in ("铁律", "规范", "禁止", "must", "画像")):
            imp = 5
        elif ft == "user" or ft == "project":
            imp = 4
        elif any(k in low for k in HIST):
            imp = 1      # 历史记录类：价值随时间衰减，应被 gc 回收
        elif any(k in low for k in ("陷阱", "trap", "教训", "根因", "排障", "定论", "踩坑", "verification traps")):
            imp = 4      # 方法论 / 排障定论：跨会话可复用，不该被 importance decay 回收
        elif any(k in low for k in ("dsh", "reasonix", "memory", "备份", "脱敏", "网关", "goat", "websearch")):
            imp = 4      # 当前仍在使用的基础设施
        else:
            imp = 2      # 普通 reference：可被 gc 评审
        if label == "archive":
            imp = min(imp, 2)   # 已归档 = 历史态：留在可 decay 区，否则永久 immune 永远不被回收
        head = cutb((f"# {name}\n{desc}\n\n" if desc else f"# {name}\n\n"), 600)
        secs = [s for s in re.split(r"\n(?=## )", body.strip()) if s.strip()]
        chunks, cur = [], head
        for s in secs:
            if blen(cur) + blen(s) + 2 <= MAXB:
                cur += s + "\n\n"
            else:
                if cur.strip() != head.strip(): chunks.append(cur.strip())
                if blen(s) + blen(head) > MAXB:
                    room = MAXB - blen(head) - 24
                    buf, acc = b"", ""
                    for ch in s:
                        cb = ch.encode("utf-8")
                        if len(buf) + len(cb) > room:
                            chunks.append(head + "（续）\n" + acc); buf, acc = b"", ""
                        buf += cb; acc += ch
                    if acc: chunks.append(head + "（续）\n" + acc)
                    cur = head
                else:
                    cur = head + "（续）\n" + s + "\n\n"
        if cur.strip() != head.strip(): chunks.append(cur.strip())
        for c in chunks:
            ins.append({"content": cutb(c, MAXB), "category": cat, "importance": imp, "tags": tags, "source": "user"})
    return files, ins

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", action="append", default=None,
                    help="fact 目录，可重复指定；不传则自动发现 ~/.reasonix/memory 下的全部 scope")
    ap.add_argument("--memory-root", default=os.path.expanduser("~/.reasonix/memory"))
    ap.add_argument("--draft", default=os.path.expanduser("~/.dsh/storages/mnemon-draft.json"))
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--only", default=None,
                    help="只同步一个 fact（文件名或 name，可省 .md）—— 供 memory_remember 实时触发")
    a = ap.parse_args()

    # 可观测性：计划任务只暴露 LastTaskResult，而实测它在脚本崩溃时仍报 0
    # （2026-09-28 实证）—— 脚本必须自己留日志，否则失败是隐形的。
    log_path = os.path.expanduser("~/.dsh/logs/memory-to-mnemon.log")

    def emit(m):
        print(m)
        try:
            os.makedirs(os.path.dirname(log_path), exist_ok=True)
            with open(log_path, "a", encoding="utf-8") as fh:
                fh.write(f"{datetime.datetime.now().isoformat(timespec='seconds')} {m}\n")
        except OSError:
            pass

    if a.src:
        scopes = [(os.path.basename(os.path.normpath(s.rstrip("/\\"))) or "src", s) for s in a.src]
    else:
        scopes = discover_scopes(a.memory_root)
    if not scopes:
        emit(f"[mnemon-sync] 在 {a.memory_root} 下没有发现任何 scope，跳过")
        return 0
    files, ins = build_insights(scopes, a.only)
    if not ins:
        emit(f"[mnemon-sync] only={a.only} 没有可写入的 insight，跳过")
        return 0
    # --only 走独立临时 draft，避免与每日全量任务互相覆盖（两者可能同时跑）
    draft_path = a.draft if not a.only else os.path.join(
        tempfile.gettempdir(), f"mnemon-draft-{a.only}-{int(time.time() * 1000)}.json")
    draft = {"schema_version": "1", "insights": ins}
    open(draft_path, "w", encoding="utf-8", newline="").write(json.dumps(draft, ensure_ascii=False))
    from collections import Counter
    dist = dict(Counter(f.split("/", 1)[0] for f in files))
    emit(f"[mnemon-sync] only={a.only} files={len(files)} insights={len(ins)} scopes={dist}")
    emit("  max content "
         + str(max(blen(x["content"]) for x in ins))
         + " 字节 / max tag "
         + str(max(blen(t) for x in ins for t in x["tags"]))
         + " 字节")
    # Windows 上 mnemon 是 npm 的 .cmd shim —— subprocess 不带 shell 找不到它
    mnemon = os.environ.get("MNEMON_BIN") or shutil.which("mnemon") or "mnemon.cmd"
    # cmd.exe 不把正斜杠路径当命令解析（"C:/tmp/x.cmd" is not recognized）——
    # MNEMON_BIN 常被写成正斜杠，这里统一归一化。
    if os.name == "nt":
        mnemon = mnemon.replace("/", "\\")
    cmd = f'"{mnemon}" import "{draft_path}"' + (" --dry-run" if a.dry_run else "")
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True, encoding="utf-8", errors="replace")
    tail = (r.stdout or r.stderr or "").strip().splitlines()
    emit("  " + "\n  ".join(tail[-4:]))
    emit(f"[mnemon-sync] done rc={r.returncode} draft={draft_path}")
    if a.only and not a.dry_run:
        try:
            os.remove(draft_path)
        except OSError:
            pass
    return r.returncode

if __name__ == "__main__":
    sys.exit(main())
