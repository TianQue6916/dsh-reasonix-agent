import re,sys

ROW=re.compile(r'^          - id: (\S+)\s*$')

def seg(lines, id_line):
    s=None
    for i in range(id_line,len(lines)):
        if lines[i].rstrip()=='        plugins:': s=i+1; break
    e=len(lines)
    for i in range(s,len(lines)):
        if lines[i].strip()=='' : continue
        if len(lines[i])-len(lines[i].lstrip())<=4: e=i; break
    return s,e

def rowmap(lines,s,e):
    m={}
    idx=[i for i in range(s,e) if ROW.match(lines[i])]
    for k,i in enumerate(idx):
        name=ROW.match(lines[i]).group(1)
        body=[lines[i]]
        j=i+1
        while j<e:
            l=lines[j]
            if l.strip()=='':
                # 空行：仅当其后仍是本 row 的更深缩进行才保留
                k2=j+1
                while k2<e and lines[k2].strip()=='': k2+=1
                if k2<e and len(lines[k2])-len(lines[k2].lstrip())>10:
                    body.append(l); j+=1; continue
                break
            if len(l)-len(l.lstrip())>10:
                body.append(l); j+=1
            else: break
        # 去尾部空行
        while body and body[-1].strip()=='': body.pop()
        m[name]=body
    return m

def do(path, target_line, source_line, anchors, only):
    L=open(path,encoding='utf-8').read().split('\n')
    ts,te=seg(L,target_line); ss,se=seg(L,source_line)
    src=rowmap(L,ss,se); tgt=rowmap(L,ts,te)
    plan=[]
    for (names, anchor_text) in anchors:
        blk=[]
        for n in names:
            if n not in src: raise SystemExit(f'{path}: source missing {n}')
            if n in tgt: raise SystemExit(f'{path}: target already has {n}')
            blk.append(f'          # ↳ 2026-11-17 从 preset-anchored-standard 补齐（learn 原先缺这一行；row 本体逐字复制）')
            blk.extend(src[n]); blk.append('')
        # 找锚点行（target 段内首次出现）
        if anchor_text is None:
            pos=ts; pos_anchor='<plugins head>'
        else:
            cand=[i for i in range(ts,te) if L[i].startswith(anchor_text)]
            if not cand: raise SystemExit(f'{path}: anchor not found {anchor_text!r}')
            pos=cand[0]; pos_anchor=L[pos].strip()[:40]
        plan.append((pos,blk,pos_anchor,[n for n,_ in [ (x,0) for x in names ]]))
    # 从后往前插入
    plan.sort(key=lambda x:-x[0])
    for pos,blk,pa,names in plan:
        if pos>0 and L[pos-1].strip()!='': blk=['']+blk
        L[pos:pos]=blk
    open(path,'w',encoding='utf-8').write('\n'.join(L))
    for pos,blk,pa,names in sorted(plan):
        print(f'  insert @{pos+1} before "{pa}" <- {names}')

if __name__=='__main__':
    mode=sys.argv[1]
    if mode=='dry':
        for path,tl,sl in [('web/cordis.patch.yml',765,13),('desktop/cordis.patch.yml',834,36)]:
            L=open(path,encoding='utf-8').read().split('\n')
            ts,te=seg(L,tl); ss,se=seg(L,sl)
            print(f'== {path}')
            print('  source rows:',', '.join(rowmap(L,ss,se).keys()))
            print('  target rows:',', '.join(rowmap(L,ts,te).keys()))
