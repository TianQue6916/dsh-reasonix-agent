#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
memory-merge-finalize.py — 归一产物的收尾规范化（在 staging 里跑，不动线上）

做三件事（都是对 workflow 产物的修补，依据是 14 个独立 verify agent 的报告）：
  1. 修损坏字段：12 的 front-matter `name` 被写成 `merged`，改回与文件名一致的值。
  2. 统一 revision 语义：
       - merged 与某一侧逐字节相同  → 保留那一侧的 revision（内容本来就是它）
       - merged 与两侧都不同        → revision = max(win, lin) + 1，并刷新 updated_at
     依据：既有归一惯例是显式 bump，而 workflow 产物出现了「12 bump 了、13 反而从 2 退到 1」的不一致。
  3. 结构变更留痕：12/13 被改了 heading 层级（12 全部降一级、13 的 lin 侧 H1 降为 blockquote），
     外部按 anchor 引用会失配，所以在 front-matter 之后插一条 blockquote 记录这件事。

用法:  python3 memory-merge-finalize.py --check | --apply
"""
import argparse
import datetime
import os
import re
import sys

STAGE = os.path.join(os.path.expanduser('~'), '.dsh', 'tmp-probe', 'merge')
NOW = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')

# 需要留痕的结构变更（依据 verify agent 报告）
STRUCTURAL_NOTES = {
    '12': ('⚠️ **结构变更（2026-10-01 双机归一）**：本文把两侧正文合并进'
           '「第一部分：Linux 机蒸馏层」与「第二部分：Windows 主力机原文」两节，'
           '因此**源文件里所有 heading 都被降了一级**（原 `##` 变 `###`，原 `###` 变 `####`）。'
           '正文行零丢失（行级 diff `delete=0`）。若有外部资料按 `## 用户提问 N` 之类的 anchor 引用本文，'
           '那些 anchor 需要相应升一级才能命中。'),
    '13': ('⚠️ **格式变更（2026-10-01 双机归一）**：Linux 侧的 H1 被降级为 blockquote'
           '（`> 学习-高等数学问答（2026-08-16 蒸馏…）`），以避免合并后出现两个 H1；'
           '同时 **Linux 侧原来的 YAML front-matter 不再以 YAML 形式存在**，其字段值以文本形式'
           '记录在本文「Linux 机版（study-calculus-qa）并入内容」一节内。'
           '正文逐行一致（除插入的新 H1），但机器可解析性下降。'),
}


def split_fm(text):
    m = re.match(r'^(---\r?\n)(.*?\r?\n)(---\r?\n)', text, re.S)
    if not m:
        return None, None, text
    return m.group(1) + m.group(2) + m.group(3), m.group(2), text[m.end():]


def get_field(fm_body, key):
    m = re.search(rf'^{key}:\s*(.+)$', fm_body, re.M)
    return m.group(1).strip().strip('"\'') if m else None


def set_field(fm_body, key, value):
    if re.search(rf'^{key}:', fm_body, re.M):
        return re.sub(rf'^{key}:.*$', f'{key}: {value}', fm_body, count=1, flags=re.M)
    return fm_body.rstrip('\n') + f'\n{key}: {value}\n'


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--check', action='store_true')
    g.add_argument('--apply', action='store_true')
    a = ap.parse_args()

    plan = []
    for i in sorted(os.listdir(STAGE)):
        d = os.path.join(STAGE, i)
        if not os.path.isdir(d):
            continue
        mp, wp, lp = (os.path.join(d, n) for n in ('merged.md', 'win.md', 'lin.md'))
        if not os.path.exists(mp):
            continue
        mt = open(mp, encoding='utf-8').read()
        wt = open(wp, encoding='utf-8').read() if os.path.exists(wp) else None
        lt = open(lp, encoding='utf-8').read() if os.path.exists(lp) else None
        head, fmb, body = split_fm(mt)
        if head is None:
            plan.append((i, 'no-front-matter', None, None, None))
            continue

        revs = []
        for t in (wt, lt):
            if t:
                _, fb, _ = split_fm(t)
                if fb:
                    v = get_field(fb, 'revision')
                    if v and v.isdigit():
                        revs.append(int(v))
        maxrev = max(revs) if revs else 0
        cur = get_field(fmb, 'revision')
        cur = int(cur) if cur and cur.isdigit() else None

        same_win = wt is not None and mt == wt
        same_lin = lt is not None and mt == lt
        if same_win or same_lin:
            target = maxrev  # 内容就是那一侧，revision 不该动
            reason = 'merged == win' if same_win else 'merged == lin'
        else:
            target = maxrev + 1
            reason = f'differs from both (max={maxrev})'

        name_fix = None
        nm = get_field(fmb, 'name')
        if nm is None or nm.lower() in ('merged', 'none', 'null'):
            # 优先用 win 侧的 name；win 侧也没有就回落到文件名（去掉 .md）
            if wt:
                _, fw, _ = split_fm(wt)
                if fw:
                    name_fix = get_field(fw, 'name')
            if not name_fix:
                wname = os.path.basename(wp)[:-3] if wp.endswith('.md') else None
                name_fix = wname
        plan.append((i, reason, cur, target, name_fix))

    print(f"  {'idx':4s} {'判定':28s} {'rev 现':>6s} {'rev→':>6s}  name 修补")
    n_bump = 0
    for i, reason, cur, target, name_fix in plan:
        mark = ''
        if target is not None and cur is not None and target != cur:
            mark = 'BUMP'
            n_bump += 1
        print(f"  {i:4s} {reason:28s} {str(cur):>6s} {str(target):>6s}  {name_fix or '-'}  {mark}")
    print(f"\n  需要改 revision 的 = {n_bump}")
    if a.check:
        return 0

    for i, reason, cur, target, name_fix in plan:
        if target is None and not name_fix:
            continue
        mp = os.path.join(STAGE, i, 'merged.md')
        mt = open(mp, encoding='utf-8').read()
        head, fmb, body = split_fm(mt)
        if head is None:
            continue
        if target is not None and cur is not None and target != cur:
            fmb = set_field(fmb, 'revision', str(target))
            fmb = set_field(fmb, 'updated_at', f'"{NOW}"')
        if name_fix:
            fmb = set_field(fmb, 'name', name_fix)
        new = '---\n' + fmb + '---\n'
        note = STRUCTURAL_NOTES.get(i)
        if note:
            body = '\n' + note + '\n' + body
        open(mp, 'w', encoding='utf-8', newline='').write(new + body)
    print("  已应用")
    return 0


if __name__ == '__main__':
    sys.exit(main())
