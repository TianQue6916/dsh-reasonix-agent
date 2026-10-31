# -*- coding: utf-8 -*-
import json, os, re, collections
def load(p):
    raw = open(p, encoding='utf-8').read()
    return json.loads(raw.split('GAPJSON:')[1].strip().splitlines()[0])
W = load(r'C:/Users/27063/.dsh/tools/win.gap')[0]
L = load(r'C:/Users/27063/.dsh/tools/lin.gap2')[0]
WS = 'C:/Users/27063/Desktop/课程文件'

rows = []
for p in W['pdf_gap']:
    rows.append(('WIN', p.replace(WS, '').replace(os.sep, '/').lstrip('/'), 'PDF'))
for x in W['srt_gap']:
    rows.append(('WIN', x['path'].replace(WS, '').replace(os.sep, '/').lstrip('/'), 'SRT_AUTO' if x['auto_only'] else 'SRT'))
for p in L['pdf_gap']:
    rows.append(('LNX', p.replace(L['root'], '').lstrip('/'), 'PDF'))
for x in L['srt_gap']:
    rows.append(('LNX', x['path'].replace(L['root'], '').lstrip('/'), 'SRT_AUTO' if x['auto_only'] else 'SRT'))

def verdict(r, kind):
    if re.search(r'线性代数导论/\d+-\d+', r): return 'SKIP', '扫描件无文字层，已学完科目，不做'
    if 'progress_table' in r: return 'SKIP', '进度表/索引页'
    if '6.046J/06-代码' in r: return 'SKIP', '代码仓库不是讲义'
    if 'CS144/05-教材' in r: return 'LATER', '整本 Peterson 教材，按章另议'
    if '扫描件' in r: return 'SKIP', '扫描件需 OCR，非当前 P0'
    if r.endswith('_双语详解.pdf'): return 'DONE', '本身就是双语成品 PDF'
    if 'latex_build' in r: return 'SKIP', 'LaTeX 编译中间产物'
    return 'TODO', ''

tbl = collections.defaultdict(list)
for tag, r, kind in rows:
    v, why = verdict(r, kind)
    course = r.split('/')[0]
    tbl[(v, course, kind)].append((tag, r))

o = []
o.append('# 未翻译资产点名清单（2026-10-27）\n\n')
o.append('> 判据：`kb-gaps.py` v2（stem 精确匹配 + 编号次级匹配，排除文件名自述「双语」的成品）。两机合并。\n')
o.append('> 说明：`SRT_AUTO` = 只有 YouTube 自动中文轨（`.zh.srt`）；`SRT` = 连中文轨都没有；`PDF` = 无对应 `.bilingual.md`。\n\n')
for v in ('TODO', 'LATER', 'DONE', 'SKIP'):
    sub = {k: x for k, x in tbl.items() if k[0] == v}
    if not sub: continue
    n = sum(len(x) for x in sub.values())
    o.append('\n## %s（%d 项）\n\n' % ({'TODO': '待翻', 'LATER': '暂缓', 'DONE': '已完成', 'SKIP': '不翻'}[v], n))
    for (vv, course, kind), items in sorted(sub.items(), key=lambda t: (-len(t[1]), t[0][1])):
        o.append('### %s · %s · %s 项\n\n' % (course, kind, len(items)))
        for tag, r in items[:200]:
            o.append('- `%s` %s\n' % (tag, r))
        o.append('\n')
p = r'C:/Users/27063/.dsh/tools/未翻译清单-20261027.md'
open(p, 'w', encoding='utf-8').write(''.join(o))
print('written', p, len(''.join(o)))
for v in ('TODO', 'LATER', 'DONE', 'SKIP'):
    n = sum(len(x) for k, x in tbl.items() if k[0] == v)
    print(v, n)
print('\n--- TODO 明细汇总（课程/类型/数量）---')
for (v, c, k), items in sorted(tbl.items(), key=lambda t: (-len(t[1]))):
    if v == 'TODO': print('  %-40s %-9s %d' % (c[:40], k, len(items)))
