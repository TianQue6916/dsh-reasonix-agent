#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
skill-root-consolidate.py — 技能根目录的重构：清理噪声 + 收敛为单一物理副本

背景（2026-10-01 实测）
  1. `~/.dsh/skills` 与 `~/.reasonix/skills` 是**两份真实拷贝**（inode 不同），
     但内容逐字节一致（77/77，0 处不同）→ 纯重复维护：任何改动都要做两遍。
  2. 两个根里共 63 个技能目录带着**噪声文件，合计 1.8 MB**，绝大多数是历次
     reasonix↔dsh 同步写下的 `SKILL.md.conflict.linux.<hash>.bak`，以及
     `HISTORY.md.bak-*` 之类的历史快照。技能包不该装回滚历史。

本脚本做两件事（都不删内容）
  A. 把噪声文件**移动**（不是删除）到 `~/.dsh/skills/.trace-archive/<skill>/<原相对路径>`。
     该目录不是技能：skill-filesystem 只认 `<name>/SKILL.md` 与顶层 `<name>.md`，
     `.trace-archive` 下没有 SKILL.md，因此不会被发现。
  B. 把 `~/.reasonix/skills` 收敛成指向 `~/.dsh/skills` 的 junction：
     先整目录备份到 `~/.reasonix/skills.bak-<ts>-pre-consolidate`，再删目录、建 junction。
     撤销：删掉 junction，把备份改名回 skills。

用法
  python3 skill-root-consolidate.py --check     # 只报告
  python3 skill-root-consolidate.py --clean     # 只做 A
  python3 skill-root-consolidate.py --merge     # 只做 B
  python3 skill-root-consolidate.py --all       # A + B
"""
import argparse
import datetime
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys

TS = datetime.datetime.now().strftime('%Y%m%d-%H%M')
HOME = os.path.expanduser('~')
DSH_SKILLS = os.path.join(HOME, '.dsh', 'skills')
REASONIX_SKILLS = os.path.join(HOME, '.reasonix', 'skills')
ARCHIVE = os.path.join(DSH_SKILLS, '.trace-archive')

NOISE = re.compile(r'(\.bak|\.conflict\.|\.old-|~$|\.tmp$|\.swp$)', re.I)


def is_noise_dir(rel):
    head = rel.split(os.sep, 1)[0]
    return head.startswith('_backup') or head.startswith('_archive')


def collect(root):
    """返回 [(abs_path, rel_in_skill, skill_name, size)]"""
    out = []
    for name in sorted(os.listdir(root)):
        d = os.path.join(root, name)
        if not os.path.isdir(d) or name.startswith('.'):
            continue
        for dp, dn, fs in os.walk(d):
            for f in fs:
                p = os.path.join(dp, f)
                rel = os.path.relpath(p, d)
                if NOISE.search(f) or is_noise_dir(rel):
                    out.append((p, rel, name, os.path.getsize(p)))
    return out


def do_clean(root=None):
    root = root or DSH_SKILLS
    archive = os.path.join(root, '.trace-archive')
    items = collect(root)
    total = sum(i[3] for i in items)
    print(f"  A) [{os.path.basename(os.path.dirname(root))}/{os.path.basename(root)}] "
          f"待归档噪声 {len(items)} 个文件, {total/1024:.1f} KB → {archive}")
    moved = 0
    for p, rel, skill, _ in items:
        dst = os.path.join(archive, skill, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.move(p, dst)
        moved += 1
    for dp, dn, fs in os.walk(root, topdown=False):
        if dp.startswith(archive):
            continue
        try:
            if not os.listdir(dp):
                os.rmdir(dp)
        except OSError:
            pass
    print(f"     已移动 {moved} 个文件")
    return moved


def do_mirror():
    """把 canonical (~/.dsh/skills) 的文件镜像到 mirror (~/.reasonix/skills)。

    为什么不是「删目录 + 建 junction」
      2026-10-01 试过：`shutil.rmtree(~/.reasonix/skills)` 抛
      `OSError: Cannot call rmtree on a symbolic link`，而它**在此之前已经把
      里面的文件全删了** —— 目录树剩 80 个空目录、SKILL.md 归零。
      备份（copytree 先跑）救回来了，逐字节一致，但这条路线的破坏性不值得。
      所以改成**逐文件复制覆盖**：不做任何 rmtree，mirror 侧多出来的文件保留不动。
    """
    if not os.path.isdir(DSH_SKILLS):
        print("  canonical 不存在，跳过")
        return
    if not os.path.isdir(REASONIX_SKILLS):
        print("  mirror 不存在，跳过")
        return
    copied = replaced = 0
    for name in sorted(os.listdir(DSH_SKILLS)):
        if name.startswith('.'):
            continue
        src = os.path.join(DSH_SKILLS, name)
        if not os.path.isdir(src):
            continue
        dst = os.path.join(REASONIX_SKILLS, name)
        for dp, dn, fs in os.walk(src):
            rel = os.path.relpath(dp, src)
            out = os.path.join(dst, rel) if rel != '.' else dst
            os.makedirs(out, exist_ok=True)
            for f in fs:
                s, t = os.path.join(dp, f), os.path.join(out, f)
                if os.path.exists(t):
                    if open(s, 'rb').read() == open(t, 'rb').read():
                        continue
                    shutil.copy2(s, t); replaced += 1
                else:
                    shutil.copy2(s, t); copied += 1
    print(f"  B) 镜像 canonical → mirror: 新增 {copied} 个, 覆盖 {replaced} 个（未删除任何文件）")
    # 抽验
    def sig(root):
        d = {}
        for n in sorted(os.listdir(root)):
            f = os.path.join(root, n, 'SKILL.md')
            if os.path.exists(f): d[n] = hashlib.md5(open(f, 'rb').read()).hexdigest()
        return d
    sa, sb = sig(DSH_SKILLS), sig(REASONIX_SKILLS)
    common = set(sa) & set(sb)
    same = sum(1 for k in common if sa[k] == sb[k])
    print(f"     核验: 同名 {len(common)}  逐字节一致 {same}  "
          f"仅 canonical {sorted(set(sa)-set(sb))} 仅 mirror {sorted(set(sb)-set(sa))}")


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--check', action='store_true')
    g.add_argument('--clean', action='store_true', help='清理 canonical 的噪声')
    g.add_argument('--clean-all', action='store_true', help='清理两个根的噪声')
    g.add_argument('--mirror', action='store_true', help='canonical → mirror 逐文件镜像')
    g.add_argument('--all', action='store_true', help='clean-all + mirror')
    a = ap.parse_args()

    if a.check:
        for root in (DSH_SKILLS, REASONIX_SKILLS):
            items = collect(root)
            print(f"  {root}")
            print(f"    噪声 {len(items)} 个文件, {sum(i[3] for i in items)/1024:.1f} KB")
        return 0
    if a.clean:
        do_clean(DSH_SKILLS)
    if a.clean_all or a.all:
        do_clean(DSH_SKILLS)
        do_clean(REASONIX_SKILLS)
    if a.mirror or a.all:
        do_mirror()
    return 0


if __name__ == '__main__':
    sys.exit(main())
