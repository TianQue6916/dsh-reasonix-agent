# -*- coding: utf-8 -*-
import json, os, re, collections
def load(p):
    raw=open(p,encoding='utf-8').read()
    return json.loads(raw.split('GAPJSON:')[1].strip().splitlines()[0])
W=load(r'C:/Users/27063/.dsh/tools/win.gap')[0]; L=load(r'C:/Users/27063/.dsh/tools/lin.gap2')[0]
def key(name):
    n=os.path.splitext(os.path.basename(name))[0].lower()
    ks=set()
    for m in re.finditer(r'(l|lec|lecture|ps|pset|prob|problem|exams?|lnote?s?|part|chunk|unit)\s*0*(\d+)', n):
        p=m.group(1); p={'lecture':'lec','pset':'ps','problem':'prob','lnote':'lnotes','exam':'exams'}.get(p,p)
        ks.add('%s%s'%(p,int(m.group(2))))
    return tuple(sorted(ks)) or (re.sub(r'[\s_\-]+',' ',n),)
seen={}
for tag,rec in (('WIN',W),('LNX',L)):
    for p in rec['pdf_gap']:
        b=os.path.basename(p)
        if re.search(r'线性代数导论/\d+-\d+|progress_table|06-代码|扫描件|_双语详解|latex_build', p.replace(os.sep,'/')): continue
        k=key(b)
        seen.setdefault(k,[]).append((tag,b))
print('去重后唯一 PDF 缺口:', len(seen))
c=collections.Counter()
for k,v in seen.items():
    tags=set(t for t,_ in v)
    c['两机都有' if len(tags)>1 else list(tags)[0]]+=1
print(dict(c))
for k,v in sorted(seen.items()):
    print('  ', k, '|', ' + '.join('%s:%s'%(t,b) for t,b in v))
