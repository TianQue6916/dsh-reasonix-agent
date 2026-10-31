# -*- coding: utf-8 -*-
import json, os, re
def load(p):
    raw=open(p,encoding='utf-8').read()
    return json.loads(raw.split('GAPJSON:')[1].strip().splitlines()[0])
W=load(r'C:/Users/27063/.dsh/tools/win.gap')[0]; L=load(r'C:/Users/27063/.dsh/tools/lin.gap')[0]
def norm(s):
    s=s.lower(); s=re.sub(r'[\s_\-]+',' ',s)
    return re.sub(r'\b(part|chunk|lec|lecture|ps|prob)\s*0*(\d+)', lambda m:m.group(1)+str(int(m.group(2))), s)
wp={norm(os.path.splitext(os.path.basename(p))[0]):p for p in W['pdf_gap']}
lp={norm(os.path.splitext(os.path.basename(p))[0]):p for p in L['pdf_gap']}
both=sorted([wp[k] for k in wp if k in lp], key=lambda p: os.path.dirname(p))
print('=== 两机都未翻 %d ==='%len(both))
for p in both:
    print(' ', p.replace('C:/Users/27063/Desktop/课程文件','WIN').replace(os.sep,'/'))
