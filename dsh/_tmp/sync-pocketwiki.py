#!/usr/bin/env python3
"""把指定目录下的 Markdown 同步进 PocketWiki（/media/OS/wiki-data/pages）。

PocketWiki 的检索是「整串子串 + 多词 AND」（local-search.py: search_pocketwiki），
所以文件名就是检索标题。通用文件名（archive.md / index.md …）单独放没有辨识度，
这里用父目录名做前缀，例如 PLAN.d/dsh-roadmap/archive.md -> dsh-roadmap__archive.md。

用法：
    sync-pocketwiki.py --dry-run ~/notes ~/00-Inbox     # 先看会做什么
    sync-pocketwiki.py ~/notes ~/00-Inbox               # 真正同步

规则：
  * 只收 *.md，递归遍历
  * 扁平化（PocketWiki 不支持子目录）
  * 通用文件名加父目录前缀；仍撞名时再加 8 位路径 hash 前缀
  * 内容相同则跳过；内容变化则覆盖
  * 从不删除 pages/ 里的其它文件（含 首页.md）
"""
import hashlib
import json
import os
import sys

PAGES = os.environ.get("LOCAL_POCKETWIKI_PAGES", "/media/OS/wiki-data/pages")
INDEX = os.path.join(PAGES, ".sync-index.json")

# 这些名字太通用，单放会变成一堆 "archive"、无法区分来源
GENERIC_STEMS = {"archive", "index", "readme", "notes", "note", "todo", "summary", "log", "plan"}


def load_index():
    try:
        with open(INDEX, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def dest_name_for(src):
    stem = os.path.basename(src)[:-3]
    if stem.lower() in GENERIC_STEMS:
        parent = os.path.basename(os.path.dirname(src)) or "root"
        return f"{parent}__{stem}.md"
    return f"{stem}.md"


def main(argv):
    dry = "--dry-run" in argv
    dirs = [a for a in argv if not a.startswith("-")]
    if not dirs:
        print(__doc__)
        return 1
    os.makedirs(PAGES, exist_ok=True)
    index = load_index()
    added = updated = skipped = 0
    for root in dirs:
        root = os.path.expanduser(root)
        if not os.path.isdir(root):
            print(f"skip (not a dir): {root}")
            continue
        for dirpath, _dirnames, filenames in os.walk(root):
            for fn in filenames:
                if not fn.lower().endswith(".md"):
                    continue
                src = os.path.join(dirpath, fn)
                try:
                    body = open(src, "rb").read()
                except OSError as exc:
                    print(f"skip (unreadable {exc}): {src}")
                    continue
                dest_name = dest_name_for(src)
                dest = os.path.join(PAGES, dest_name)
                if os.path.exists(dest) and index.get(dest_name) not in (None, src):
                    h = hashlib.sha1(src.encode()).hexdigest()[:8]
                    dest_name = f"{h}__{dest_name}"
                    dest = os.path.join(PAGES, dest_name)
                old = None
                if os.path.exists(dest):
                    old = open(dest, "rb").read()
                if old == body:
                    skipped += 1
                    index.setdefault(dest_name, src)
                    continue
                action = "update" if old is not None else "add"
                print(f"{action}: {src} -> {dest_name}")
                if not dry:
                    with open(dest, "wb") as f:
                        f.write(body)
                    index[dest_name] = src
                added += action == "add"
                updated += action == "update"
    if not dry:
        with open(INDEX, "w", encoding="utf-8") as f:
            json.dump(index, f, ensure_ascii=False, indent=1)
    print(f"\nadd={added} update={updated} skip={skipped} dry_run={dry}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
