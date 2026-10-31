# -*- coding: utf-8 -*-
"""交叉核对：TODO 未翻清单 vs 三源全量已翻名单（铁律 13 全资源搜索）"""
import os, re, json, collections
BS = chr(92)
def norm(s):
    s = s.lower()
    s = re.sub(r'[\s_\-]+', ' ', s)
    return s.strip()
def key(name):
    n = os.path.splitext(os.path.basename(name))[0].lower()
    ks = set()
    for m in re.finditer(r'(l|lec|lecture|ps|pset|prob|problem|exams?|lnote?s?|part|chunk|unit)\s*0*(\d+)', n):
        p = m.group(1)
        p = {'lecture':'lec','pset':'ps','problem':'prob','lnote':'lnotes','exam':'exams'}.get(p, p)
        ks.add('%s%s' % (p, int(m.group(2))))
    return tuple(sorted(ks))

SOURCES = ['C:/Users/27063/Desktop/课程文件', 'D:/gh-publish', 'C:/Users/27063/Documents']
done_names, done_keys = set(), set()
for root in SOURCES:
    if not os.path.isdir(root): continue
    for dp, dn, fn in os.walk(root):
        if '.reasonix' in dp: continue
        for f in fn:
            if f.endswith('.bilingual.md'):
                s = re.sub(r'\.bilingual$', '', os.path.splitext(f)[0])
                done_names.add(norm(s)); done_keys.update(key(s))

raw = open(os.path.expanduser('~/.dsh/tools/win.gap'), encoding='utf-8').read()
W = json.loads(raw.split('GAPJSON:')[1].strip().splitlines()[0])[0]
raw2 = open(os.path.expanduser('~/.dsh/tools/lin.gap2'), encoding='utf-8').read()
L = json.loads(raw2.split('GAPJSON:')[1].strip().splitlines()[0])[0]

todo = [(p, 'WIN') for p in W['pdf_gap']] + [(p, 'LNX') for p in L['pdf_gap']]
real = []
for p, tag in todo:
    if re.search(r'线性代数导论/' + BS + r'd+-' + BS + r'd+|progress_table|06-代码|扫描件|_双语详解|latex_build', p.replace(os.sep, '/')):
        continue
    base = os.path.splitext(os.path.basename(p))[0]
    if norm(base) in done_names: continue
    ks = set(key(base))
    hit = bool(ks and (ks & done_keys))
    real.append((p, tag, hit))
still = [x for x in real if not x[2]]
covered = [x for x in real if x[2]]
print('已翻名单（三源合并）%d 个 stem' % len(done_names))
print('TODO 候选中：判定仍缺 %d 份，另 %d 份被编号键判定为已翻（需人工复核）' % (len(still), len(covered)))
print()
c = collections.Counter(os.path.dirname(p).split('课程文件')[-1].split('gh-publish')[-1] or p for p, t, h in still)
for k, v in c.most_common(20):
    print('  %-58s %d' % (k[-58:], v))
print()
print('--- 被编号键判定为已翻（可能是假阴性，需看具体）---')
for p, t, h in covered[:15]:
    print('  [%s] %s' % (t, p.split('课程文件')[-1].split('gh-publish')[-1]))
