# -*- coding: utf-8 -*-
"""把「中文（English）」翻正为「English（中文）」—— 只处理高置信术语子集。
约束：中文段必须是 1-8 个纯汉字（无标点/数字/空格/的了吗是）；英文段 ≤4 个词。
用法: python flip-terms.py <in.md> <out.md> [--dry]
"""
import re, sys, os
PAT = re.compile(r'(?<![\u4e00-\u9fff])([\u4e00-\u9fff]{1,8})（([A-Za-z][A-Za-z /\-]{0,28})）')
PAT2 = re.compile(r'(?<![\u4e00-\u9fff])([\u4e00-\u9fff]{1,8})\(([A-Za-z][A-Za-z /\-]{0,28})\)')
BAD_ZH = set('的了是在和与就都也很把被让这那哪什么吗呢吧之其')
BAD_END = set('的了是在和与就都也把被让')

def ok(zh, en):
    if len(zh) > 8 or len(en.split()) > 4: return False
    if zh[0] in BAD_ZH or zh[-1] in BAD_END: return False
    return True

def flip_line(line, log):
    parts = re.split(r'(\$[^$\n]*\$)', line)
    out = []
    for p in parts:
        if p.startswith('$') and p.endswith('$') and len(p) > 1:
            out.append(p); continue
        def rp(m):
            zh, en = m.group(1), m.group(2).strip()
            if not ok(zh, en): return m.group(0)
            log.append((zh, en)); return '%s（%s）' % (en, zh)
        p = PAT.sub(rp, p)
        def rp2(m):
            zh, en = m.group(1), m.group(2).strip()
            if not ok(zh, en): return m.group(0)
            log.append((zh, en)); return '%s（%s）' % (en, zh)
        p = PAT2.sub(rp2, p)
        out.append(p)
    return ''.join(out)

if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    dry = '--dry' in sys.argv
    d = open(src, encoding='utf-8', errors='replace').read()
    log = []
    nd = '\n'.join(flip_line(l, log) for l in d.split('\n'))
    print('flipped %d terms' % len(log))
    for zh, en in log[:12]:
        print('   %s（%s） -> %s（%s）' % (zh, en, en, zh))
    if not dry:
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        open(dst, 'w', encoding='utf-8').write(nd)
        print('written', dst)
