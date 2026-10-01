#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
clause5-neutralize.py — 把 persona 前缀里的 clause 5 从「硬约束中文」改回中立化措辞。

为什么需要它（2026-09-30）
  thinking-anchor.mjs（agent/pre-step 尾部锚点）改为逐 step 读
  $DSH_HOME/storages/thinking-language.json 之后，「思考链语言」的唯一真相源
  就是那个状态文件。此时 persona 里若还写死「用中文写，这是硬约束」，
  就会与 Settings → 思考语言 的切换互相打架（切 en 时 system prompt 自相矛盾）。
  所以 clause 5 必须回到「语言由部署的 thinking-language directive 指定（默认中文）」。

匹配策略
  不靠逐字匹配整段（硬约束段落历史上出现过 3 行 / 4 行两种变体），
  而是定位起始行 `5. 思考链...` 与下一行 `6. `，把区间整体换掉，保留原缩进。

安全
  * 每个文件必须恰好命中 1 处，否则报错退出、不动文件
  * 先用 mtime+size 做「读入后未被改动」校验，避免覆盖并发 session 的写入
  * 写完立刻回读断言：中立化 == 1 且 硬约束 == 0

用法
  python3 ~/.dsh/storages/tools/clause5-neutralize.py --check   # 只看状态
  python3 ~/.dsh/storages/tools/clause5-neutralize.py           # 执行
"""
import argparse
import hashlib
import os
import re
import sys

HOME = os.path.expanduser('~')
PROFILES = os.path.join(HOME, '.dsh', 'profiles')

# 起始行（各种历史变体都覆盖）
START_RE = re.compile(r'^(\s*)5\.\s*思考链（reasoning / thinking）用中文写')
NEXT_RE = re.compile(r'^(\s*)6\.\s')

NEW_BODY = [
    '5. 思考链（reasoning / thinking）的语言由部署的 thinking-language directive 指定（默认中文）；',
    '英文术语原样保留，不要在 thinking 里输出完整英文句子。',
]

NEUTRAL_MARK = 'thinking-language directive'
HARD_MARK = '用中文写，这是硬约束'


def fingerprint(path):
    st = os.stat(path)
    with open(path, 'rb') as fh:
        digest = hashlib.sha256(fh.read()).hexdigest()
    return (st.st_mtime_ns, st.st_size, digest)


def neutralize(text):
    """返回 (新文本, 是否改动)。起始行找不到 → (原文本, False)。"""
    lines = text.split('\n')
    starts = [i for i, l in enumerate(lines) if START_RE.match(l)]
    if len(starts) != 1:
        return text, False, f'起始行命中 {len(starts)} 处（应为 1）'
    start = starts[0]
    indent = START_RE.match(lines[start]).group(1)
    # 找紧随其后的 `6. ` 行
    end = None
    for j in range(start + 1, len(lines)):
        if NEXT_RE.match(lines[j]):
            end = j
            break
    if end is None:
        return text, False, '找不到后续的 `6. ` 行，无法界定 clause 5 的范围'
    body = [indent + NEW_BODY[0]] + [indent + '   ' + NEW_BODY[1]]
    new_lines = lines[:start] + body + lines[end:]
    return '\n'.join(new_lines), True, f'替换 {end - start} 行 → {len(body)} 行'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true', help='只报告状态，不写文件')
    args = ap.parse_args()

    targets = []
    for prof in sorted(os.listdir(PROFILES)):
        f = os.path.join(PROFILES, prof, 'cordis.patch.yml')
        if os.path.isfile(f):
            targets.append((prof, f))
    if not targets:
        print('找不到任何 profiles/*/cordis.patch.yml')
        return 2

    rc = 0
    for prof, path in targets:
        with open(path, encoding='utf-8') as fh:
            text = fh.read()
        neutral = text.count(NEUTRAL_MARK)
        hard = text.count(HARD_MARK)

        if hard == 0 and neutral >= 1:
            print(f'  SKIP  {prof:9s} 已是中立化（中立化={neutral} 硬约束=0）')
            continue
        if hard == 0 and neutral == 0:
            print(f'  SKIP  {prof:9s} 没有 clause 5（中立化=0 硬约束=0）')
            continue

        if args.check:
            print(f'  TODO  {prof:9s} 中立化={neutral} 硬约束={hard}（--check，未改动）')
            rc = 1
            continue

        before = fingerprint(path)
        new_text, changed, note = neutralize(text)
        if not changed:
            print(f'  FAIL  {prof:9s} {note}')
            rc = 1
            continue
        if fingerprint(path) != before:
            print(f'  FAIL  {prof:9s} 文件在读取后被并发改动，放弃写入')
            rc = 1
            continue

        with open(path, 'w', encoding='utf-8', newline='') as fh:
            fh.write(new_text)

        with open(path, encoding='utf-8') as fh:
            check = fh.read()
        cn, ch = check.count(NEUTRAL_MARK), check.count(HARD_MARK)
        ok = (cn == 1 and ch == 0)
        print(f'  {"OK  " if ok else "FAIL"}  {prof:9s} {note}；回读：中立化={cn} 硬约束={ch}')
        if not ok:
            rc = 1
    return rc


if __name__ == '__main__':
    sys.exit(main())
