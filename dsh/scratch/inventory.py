import subprocess, json, glob, os, datetime, sys
Z = r'D:\miniconda\Library\bin\zstd.exe'
CUT = datetime.datetime(2026, 9, 24).timestamp()

def first_user(raw):
    for line in raw.split(b'\n'):
        line=line.strip()
        if not line: continue
        try: j=json.loads(line)
        except: continue
        if j.get('type')=='user/message':
            d=j.get('data',{}); c=d.get('content')
            if isinstance(c,list):
                t=' '.join(x.get('text','') for x in c if isinstance(x,dict) and x.get('type')=='text')
            else: t=str(c)
            t=t.strip()
            if t: return t
        if j.get('type')=='session':
            pass
    return ''

rows=[]
for f in glob.glob('C:/Users/27063/.dsh/sessions/*/*/session.v4.jsonl.zstd'):
    try: mt=os.path.getmtime(f)
    except: continue
    if mt < CUT: continue
    nf=f.replace(chr(92),'/')
    slug=nf.split('/sessions/')[1].split('/')[0]
    if 'system32' in slug.lower(): continue
    rows.append((mt, slug, f))

rows.sort(reverse=True)
print("交互型会话（>=09-24, 排除 system32）: %d\n" % len(rows))
for mt, slug, f in rows[:40]:
    raw = subprocess.run([Z,'-d','-c',f.replace('/c/','C:/')], capture_output=True).stdout
    u = first_user(raw)
    ts = datetime.datetime.fromtimestamp(mt).strftime('%m-%d %H:%M')
    print("%s | %-42s | %s" % (ts, slug[:42], u[:150].replace('\n',' ')))
