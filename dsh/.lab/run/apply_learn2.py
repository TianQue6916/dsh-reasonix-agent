import re,sys

ROW=re.compile(r'^          - id: (\S+)$')

def rd(p):
    return open(p,'rb').read().decode('utf-8').split('\n')

def body_line(l): return l[:-1] if l.endswith('\r') else l

def seg(L, id_line):
    s=None
    for i in range(id_line,len(L)):
        if body_line(L[i]).rstrip()=='        plugins:': s=i+1; break
    e=len(L)
    for i in range(s,len(L)):
        b=body_line(L[i])
        if b.strip()=='': continue
        if len(b)-len(b.lstrip())<=4: e=i; break
    return s,e

def rowmap(L,s,e):
    m={}
    for i in range(s,e):
        mt=ROW.match(body_line(L[i]))
        if not mt: continue
        name=mt.group(1); body=[L[i]]; j=i+1
        while j<e:
            b=body_line(L[j])
            if b.strip()=='':
                k2=j+1
                while k2<e and body_line(L[k2]).strip()=='': k2+=1
                if k2<e and len(body_line(L[k2]))-len(body_line(L[k2]).lstrip())>10:
                    body.append(L[j]); j+=1; continue
                break
            if len(b)-len(b.lstrip())>10: body.append(L[j]); j+=1
            else: break
        while body and body_line(body[-1]).strip()=='': body.pop()
        m[name]=body
    return m

def do(path, target_line, source_line, anchors):
    L=rd(path)
    ts,te=seg(L,target_line); ss,se=seg(L,source_line)
    src=rowmap(L,ss,se); tgt=rowmap(L,ts,te)
    plan=[]
    for names,anchor in anchors:
        blk=[]
        for n in names:
            if n not in src: raise SystemExit(f'{path}: src missing {n}')
            if n in tgt: raise SystemExit(f'{path}: tgt already has {n}')
            blk.append('          # \u21b3 2026-11-17 从 preset-anchored-standard 补齐（learn 原先缺这一行；row 本体逐字复制）')
            blk.extend(src[n]); blk.append('')
        if anchor is None: pos=ts
        else:
            cand=[i for i in range(ts,te) if body_line(L[i]).startswith(anchor)]
            if not cand: raise SystemExit(f'{path}: anchor not found {anchor!r}')
            pos=cand[0]
        if pos>0 and body_line(L[pos-1]).strip()!='': blk=['']+blk
        # 行尾风格：以插入点前一行与后一行中多数为准
        near=[body_line(x) for x in (L[pos-1] if pos>0 else '', L[pos] if pos<len(L) else '')]
        crlf = L[pos-1].endswith('\r') if pos>0 else L[pos].endswith('\r')
        blk=[x+'\r' if crlf else x for x in blk]
        plan.append((pos,blk,[n for n,_ in [(a,0) for a in names]]))
    for pos,blk,names in sorted(plan,key=lambda x:-x[0]):
        L[pos:pos]=blk
    open(path,'wb').write('\n'.join(L).encode('utf-8'))
    for pos,blk,names in sorted(plan):
        print(f'  insert @{pos+1} <- {names} (crlf={blk[0].endswith(chr(13))})')

if __name__=='__main__':
    web=[(['host-log-tee'],None),
         (['concurrency-discipline','session-age-warn','plan-anchor'],'          # \u2500\u2500 thinking-language anchor'),
         (['subagent-language'],'          # \u2500\u2500 设备环境'),
         (['git-context','tool-goal','planning'],'          # \u2500\u2500 compaction')]
    desk=[(['host-log-tee'],None),
          (['concurrency-discipline','session-age-warn','plan-anchor'],'          # \u2500\u2500 thinking-language anchor'),
          (['subagent-language'],'          # \u2500\u2500 identity'),
          (['git-context','tool-goal','planning'],'          # \u2500\u2500 compaction')]
    print('WEB');     do('web/cordis.patch.yml',765,13,web)
    print('DESKTOP'); do('desktop/cordis.patch.yml',834,36,desk)
