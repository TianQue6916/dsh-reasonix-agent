#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
skill-triage.py — 技能分诊：把「非必要 / 非常用」的 skill 暂时关闭（不是删除）

依据（2026-10-01）
  1. 社区经验 `EIGHTfs/dsh-skill-scoreboard`：skill 是否值得留应该由**真实使用数据**说话。
  2. 实测那份数据（扫 ~/.dsh/sessions/**/session.v4.jsonl.zstd，894 个 session、26696 次
     tool/call）：`skill` 工具的**真实调用次数 = 0**，只有 18 次 `skill_search`。
     也就是说当前 81 个 skill 的用量全是 0 —— 技能目录目前是**纯 token 成本、零已实现收益**。
  3. 因此判据从「用量」改为「重叠度 / 是否有个人上下文 / 是否损坏」。

关闭机制（非破坏）
  dsh-skill-filesystem 的 SKILL.md frontmatter 原生支持：
    disable-model-invocation: true   → 从模型可见的 catalog 与 loader 摘掉
    user-invocable: false            → 从人类可见命令里摘掉
  本脚本只加 `disable-model-invocation: true`。不移动、不重命名、不删除任何文件，
  每个被改的文件先存 `<name>/SKILL.md.bak-<ts>-pre-triage`。
  恢复：把该行删掉即可（或跑 `--restore`）。

用法
  python3 skill-triage.py --check     # 只报告，不动文件
  python3 skill-triage.py --apply     # 执行
  python3 skill-triage.py --restore   # 撤销（移除本脚本加过的所有 disable 行）
  python3 skill-triage.py --list      # 打印完整分诊表
"""
import argparse
import datetime
import json
import os
import re
import shutil
import sys

TS = datetime.datetime.now().strftime('%Y%m%d-%H%M')
HOME = os.path.expanduser('~')
ROOTS = [
    os.path.join(HOME, '.dsh', 'skills'),
    os.path.join(HOME, '.reasonix', 'skills'),
]
MANIFEST = os.path.join(HOME, '.dsh', 'storages', 'skill-triage-manifest.json')

# ── 分诊表：suffix 判断用「包含」匹配，避免中文/变体名漏掉 ──────────────────
FILLER = [  # 通用骨架清单（≤400 B，无个人上下文，装包批量塞入）
    'api-design', 'backend-api', 'code-review', 'data-analysis', 'database',
    'debugging', 'devops', 'docker', 'frontend-ui', 'fullstack-dev',
    'git-workflow', 'kubernetes', 'learning-method', 'linux-admin',
    'ml-engineering', 'product-thinking', 'prompt-engineering', 'python',
    'react-nextjs', 'refactoring', 'rust', 'security', 'sre', 'system-design',
    'technical-writing', 'testing', 'typescript', 'vue-nuxt', 'algorithms',
]
SUPERSEDED = [  # 已被更全的同族技能取代 / 彼此重复
    'caveman', 'grill-me', 'zoom-out',              # thinking-modes 自述已合并这三者
    'humanizer', 'anti-aigc-2026', 'anti-ai-detection', 'ai-vibe-writing',
                                                    # aigc-master 自述已整合这四个
    'academic-research-skills',                     # academic-writing 自述已合并 5 个
    'webapp-testing',                               # 与 playwright-automation 重复
    'baoyu-slide-deck', 'html-ppt', 'paper-slide-deck',   # 与 ppt-master 重复
    'reasonix-power-user',                          # 主战场已迁 dsh
]
COLLECTION = [  # 第三方大合集（nested ** /SKILL.md 不被 skill-filesystem 发现）
    'antigravity-awesome-skills', 'anthropic-skills', 'vercel-agent-skills',
]
BROKEN = [  # 缺 SKILL.md，本来就加载不了
    'bilingual-translator', 'ocw-lecture-translator', 'ai-vibe-writing-skills',
]

KEEP = [
    'academic-paper-composer', 'academic-paper-strategist', 'academic-writing',
    'aigc-master', 'bilingual-ocw-translator', 'context-handoff-protocol',
    'control-main-machine', 'course-summarizer', 'detailed-docx', 'diagnose',
    'direct-mode', 'docx', 'dsh-gate', 'dsh-mode', 'frontend-design',
    'latex-writing', 'mcp-builder', 'mind-language', 'mit-ocw-downloader',
    'pdf', 'planning-with-files', 'playwright-automation', 'ppt-master',
    'skill-creator', 'subtitleedit', 'tdd', 'thinking-modes', 'tool-lean4',
    'tool-offline-wiki', 'tool-pocketwiki', 'trailofbits-security',
    'xparse-parser', 'document-preview',
]


def classify(name):
    n = name.lower()
    for group, lst in (('disable-broken', BROKEN), ('disable-superseded', SUPERSEDED),
                       ('disable-collection', COLLECTION), ('disable-filler', FILLER)):
        for s in lst:
            if s in n:
                return group
    return 'keep'


def roots_skills():
    out = []
    for root in ROOTS:
        if not os.path.isdir(root):
            continue
        for name in sorted(os.listdir(root)):
            d = os.path.join(root, name)
            if os.path.isdir(d) and not name.startswith('-'):
                out.append((root, name, os.path.join(d, 'SKILL.md')))
    return out


DISABLE_LINE = 'disable-model-invocation: true'


def set_disabled(path, on):
    """在 frontmatter 里增删 disable-model-invocation。返回 'added'/'removed'/'noop'/'nofm'"""
    text = open(path, encoding='utf-8').read()
    m = re.match(r'^---\r?\n(.*?\r?\n)---\r?\n', text, re.S)
    if not m:
        return 'nofm'
    fm = m.group(1)
    has = re.search(r'^disable-model-invocation:', fm, re.M) is not None
    if on and has:
        return 'noop'
    if not on and not has:
        return 'noop'
    if on:
        new_fm = fm.rstrip('\n') + '\n' + DISABLE_LINE + '\n'
    else:
        new_fm = re.sub(r'^disable-model-invocation:.*\r?\n', '', fm, flags=re.M)
    new_text = '---\n' + new_fm + '---\n' + text[m.end():]
    shutil.copy2(path, path + f'.bak-{TS}-pre-triage')
    open(path, 'w', encoding='utf-8', newline='').write(new_text)
    return 'added' if on else 'removed'


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--check', action='store_true')
    g.add_argument('--apply', action='store_true')
    g.add_argument('--restore', action='store_true')
    g.add_argument('--list', action='store_true')
    a = ap.parse_args()

    items = roots_skills()
    tri = []
    for root, name, skill_md in items:
        grp = classify(name)
        if not os.path.exists(skill_md):
            grp = 'disable-broken'
        tri.append({'root': root, 'name': name, 'group': grp, 'skill_md': skill_md})

    counts = {}
    for t in tri:
        counts[t['group']] = counts.get(t['group'], 0) + 1

    if a.list or a.check:
        print(f"  扫描根: {[os.path.basename(os.path.dirname(r)) + '/' + os.path.basename(r) for r in ROOTS]}")
        print(f"  合计 {len(tri)} 项")
        for gname in ('disable-filler', 'disable-superseded', 'disable-collection',
                      'disable-broken', 'keep'):
            print(f"    {gname:22s} {counts.get(gname, 0):3d}")
        for gname in ('disable-broken', 'disable-collection', 'disable-superseded',
                      'disable-filler'):
            names = sorted(t['name'] for t in tri if t['group'] == gname)
            print(f"\n  ── {gname} ({len(names)}) ──")
            print('    ' + ', '.join(names))
        kept = sorted(t['name'] for t in tri if t['group'] == 'keep')
        print(f"\n  ── keep ({len(kept)}) ──")
        print('    ' + ', '.join(kept))

    if a.check:
        return 0

    if a.apply:
        stats = {}
        for t in tri:
            on = t['group'].startswith('disable')
            if not os.path.exists(t['skill_md']):
                stats['skip-no-skillmd'] = stats.get('skip-no-skillmd', 0) + 1
                continue
            r = set_disabled(t['skill_md'], on)
            key = f"{t['group']}:{r}"
            stats[key] = stats.get(key, 0) + 1
        print('  apply 结果:')
        for k in sorted(stats):
            print(f"    {k:38s} {stats[k]}")
        json.dump({'ts': TS, 'items': tri}, open(MANIFEST, 'w', encoding='utf-8'),
                  ensure_ascii=False, indent=1)
        print(f"  分诊表已写: {MANIFEST}")
        return 0

    if a.restore:
        n = 0
        for t in tri:
            if os.path.exists(t['skill_md']) and set_disabled(t['skill_md'], False) == 'removed':
                n += 1
        print(f"  已移除 disable 行: {n}")
        return 0
    return 0


if __name__ == '__main__':
    sys.exit(main())
