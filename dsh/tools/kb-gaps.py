# -*- coding: utf-8 -*-
"""点名未翻译资产（铁律 13：扫描根必须含 D:/gh-publish —— 2026-10-28 补）（v2：支持编号次级匹配，避免 L10.bilingual.md 漏配 L10 - xxx.pdf）
用法: python kb-gaps.py <root> ...
"""
import os, sys, json, re, collections

CJK = re.compile(r'[\u4e00-\u9fff]')

def stem(p): return os.path.splitext(os.path.basename(p))[0]

def keys_of(name):
    """从文件名抽归一化编号键，用于次级匹配。"""
    n = name.lower()
    ks = set()
    for m in re.finditer(r'(?:^|[^a-z])(l|lec|lecture|ps|pset|prob|problem|exams?|lnote?s?|part|chunk|unit)\s*0*(\d+)', n):
        pfx = m.group(1)
        pfx = {'lecture':'lec','pset':'ps','problem':'prob','lnote':'lnotes','exam':'exams'}.get(pfx, pfx)
        ks.add('%s%s' % (pfx, int(m.group(2))))
    return ks

def scan(root, maxdepth=6):
    pdfs, srt, bili_stems, bili_keys, zho = [], [], set(), set(), set()
    for dp, dn, fn in os.walk(root):
        rel = os.path.relpath(dp, root)
        depth = 0 if rel == '.' else rel.count(os.sep) + 1
        if depth > maxdepth:
            dn[:] = []; continue
        for f in fn:
            p = os.path.join(dp, f); low = f.lower()
            if low.endswith('.bilingual.md') or low.endswith('.bilingual.pdf'):
                s = re.sub(r'\.bilingual$', '', stem(f))
                bili_stems.add((dp, s.lower()))
                bili_keys |= keys_of(s)
            elif low.endswith('.zho-hans.srt'):
                zho.add((dp, re.sub(r'\.zho-hans$', '', stem(f))))
            elif low.endswith('.srt'):
                srt.append(p)
            elif low.endswith('.pdf'):
                pdfs.append(p)
    gap_pdf = []
    for p in pdfs:
        d, s = os.path.dirname(p), stem(p)
        if CJK.search(s) and '双语' in s:      # 文件名自述双语成品，跳过
            continue
        if s.lower() + '.bilingual' in {fs for (dd, fs) in bili_stems if dd == d}:
            continue
        if (d, s.lower()) in bili_stems:
            continue
        ks = keys_of(s)
        if ks and (ks & bili_keys):
            continue                            # 编号命中，视为已翻
        gap_pdf.append(p)
    gap_srt = []
    for p in srt:
        d, s = os.path.dirname(p), stem(p)
        base = re.sub(r'\.(zh|zh-CN|zh-cn|zho-hans|translation|双语|realesrgan|realcugan|1|2)$', '', s)
        if not any(b == base or b == s for (dd, b) in zho if dd == d):
            gap_srt.append({'path': p, 'auto_only': bool(re.search(r'\.zh(-CN)?$', s)), 'base': base})
    return {'root': root, 'pdf_total': len(pdfs), 'pdf_gap': gap_pdf,
            'srt_total': len(srt), 'srt_gap': gap_srt,
            'bilingual': len(bili_stems), 'zho': len(zho)}

if __name__ == '__main__':
    out=[scan(r) for r in sys.argv[1:]]
    print('GAPJSON:' + json.dumps(out, ensure_ascii=False))
    for r in out:
        print('\n== %s | pdf %d (未翻 %d) | srt %d (未翻 %d) | bilingual %d' % (
            r['root'], r['pdf_total'], len(r['pdf_gap']), r['srt_total'], len(r['srt_gap']), r['bilingual']), file=sys.stderr)
        c=collections.Counter(os.path.dirname(p).replace(r['root'],'') or '.' for p in r['pdf_gap'])
        for k,v in c.most_common(25): print('  PDF缺 %-52s %d'%(k[-52:],v), file=sys.stderr)
        c2=collections.Counter(os.path.dirname(x['path']).replace(r['root'],'') or '.' for x in r['srt_gap'])
        for k,v in c2.most_common(10): print('  SRT缺 %-52s %d'%(k[-52:],v), file=sys.stderr)
