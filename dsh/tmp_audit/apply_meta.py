#!/usr/bin/env python3
"""把 drafts/*.json 推到 GitHub：description / topics / llms.txt。
默认 dry-run，只打印改动；传 --apply 才真写。
"""
import yaml,subprocess,json,base64,re,sys,os,glob
D=r'C:/Users/27063/.dsh/tmp_audit'
tok=yaml.safe_load(open(r'C:/Users/27063/.dsh/.credentials.yaml',encoding='utf-8'))['records']['dsh-mnemon/github']['payload']['accessToken']
repos={r['name']:r for r in json.load(open(D+'/tmp_repos.json',encoding='utf-8'))}
APPLY='--apply' in sys.argv
TOKRE=re.compile(r'^[a-z0-9][a-z0-9-]{0,49}$')

def api(method,url,body=None):
    cmd=["curl","-sS","-m","40","-X",method,"-H","Authorization: Bearer "+tok,
         "-H","Accept: application/vnd.github+json","-o","-","-w","\n@@%{http_code}",url]
    if body is not None: cmd+=["-H","Content-Type: application/json","-d",json.dumps(body,ensure_ascii=False)]
    p=subprocess.run(cmd,capture_output=True,text=True,encoding="utf-8",errors="replace")
    o=p.stdout; code=o.rsplit("@@",1)[-1].strip() if "@@" in o else "ERR"
    return code,o.rsplit("\n@@",1)[0]

ok=[];bad=[]
for f in sorted(glob.glob(D+'/drafts/*.json')):
    d=json.load(open(f,encoding='utf-8'))
    n=d.get('name'); err=[]
    if n not in repos: err.append('name 不在仓库列表')
    if os.path.basename(f)[:-5]!=n: err.append('文件名与 name 不一致')
    desc=d.get('description') or ''
    if not (20<=len(desc)<=350): err.append(f'description 长度 {len(desc)} 越界')
    tp=d.get('topics') or []
    if not (3<=len(tp)<=6): err.append(f'topics 数 {len(tp)} 越界')
    for t in tp:
        if not TOKRE.match(t): err.append(f'非法 topic: {t!r}')
    if len(set(tp))!=len(tp): err.append('topics 有重复')
    if not (d.get('llms_txt') or '').strip(): err.append('llms_txt 空')
    if not (d.get('evidence') or '').strip(): err.append('evidence 空')
    if err: bad.append((n,err)); continue
    ok.append(d)

print(f"=== 校验：通过 {len(ok)} / 失败 {len(bad)} ===")
for n,e in bad: print("  BAD",n,e)
print()
for d in ok:
    n=d['name']; old=(repos[n].get('description') or '')
    print(f"--- {n}  [{len(d['description'])}ch] topics={d['topics']}")
    print(f"    旧: {old}")
    print(f"    新: {d['description']}")
print()
if not APPLY:
    print("(dry-run，加 --apply 才推送)"); sys.exit(0)

# 推送
res=[]
for d in ok:
    n=d['name']; br=repos[n]['default_branch']; base=f"https://api.github.com/repos/TianQue6916/{n}"
    c1,_=api("PATCH",base,{"description":d['description']})
    c2,_=api("PUT",base+"/topics",{"names":d['topics']})
    # llms.txt：先查是否已存在
    cs,body=api("GET",base+"/contents/llms.txt?ref="+br)
    sha=None
    if cs=="200":
        try: sha=json.loads(body)["sha"]
        except Exception: pass
    payload={"message":"docs: add llms.txt for AI/agent indexing","content":base64.b64encode(d['llms_txt'].encode()).decode(),"branch":br}
    if sha: payload["sha"]=sha
    c3,_=api("PUT",base+"/contents/llms.txt",payload)
    res.append((n,c1,c2,c3))
for r in res: print(f"push {r[0]:40} desc={r[1]} topics={r[2]} llms={r[3]}")
