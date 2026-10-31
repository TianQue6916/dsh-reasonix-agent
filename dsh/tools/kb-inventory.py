# -*- coding: utf-8 -*-
"""双机学习资产清单：按课程目录聚合翻译/字幕/原始料的覆盖度。
用法: python kb-inventory.py <root1> [root2 ...]
输出: JSON 到 stdout（前缀 INVJSON:），+ 人读表格到 stderr
"""
import os, sys, json, re, collections

TRANS = ('.bilingual.md',)
SRC = ('.pdf',)
ZHO = ('.zho-hans.srt',)

def classify(name):
    n = name.lower()
    if n.endswith('.bilingual.md'): return 'bilingual_md'
    if n.endswith('.bilingual.pdf'): return 'bilingual_pdf'
    if n.endswith('.zho-hans.srt'): return 'zho_srt'
    if n.endswith('.srt'): return 'srt'
    if n.endswith('.pdf'): return 'pdf'
    if n.endswith(('.mp4', '.mkv', '.webm', '.m4a')): return 'video'
    return None

def scan(roots, maxdepth=6):
    out = {}
    for root in roots:
        if not os.path.isdir(root): continue
        base = os.path.abspath(root)
        for dp, dn, fn in os.walk(base):
            rel = os.path.relpath(dp, base)
            depth = 0 if rel == '.' else rel.count(os.sep) + 1
            if depth > maxdepth:
                dn[:] = []
                continue
            tags = collections.Counter()
            for f in fn:
                c = classify(f)
                if c: tags[c] += 1
            if not any(tags.values()):
                continue
            # 归到课程层：取前三段
            parts = [] if rel == '.' else rel.split(os.sep)
            key = '/'.join(parts[:2]) if parts else '(root)'
            d = out.setdefault(key, collections.Counter())
            for k, v in tags.items(): d[k] += v
    return {k: dict(v) for k, v in sorted(out.items())}

if __name__ == '__main__':
    roots = sys.argv[1:]
    data = scan(roots)
    print('INVJSON:' + json.dumps(data, ensure_ascii=False))
    print('\n{:44s} {:>7s} {:>7s} {:>8s} {:>6s} {:>6s}'.format('dir', 'bili', 'biliPDF', 'pdf', 'zho', 'srt'), file=sys.stderr)
    for k, v in data.items():
        print('{:44s} {:>7d} {:>7d} {:>8d} {:>6d} {:>6d}'.format(
            k[:44], v.get('bilingual_md', 0), v.get('bilingual_pdf', 0),
            v.get('pdf', 0), v.get('zho_srt', 0), v.get('srt', 0)), file=sys.stderr)
