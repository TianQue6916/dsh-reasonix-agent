import yaml,subprocess,json,base64
D=r'C:/Users/27063/.dsh/tmp_audit'
tok=yaml.safe_load(open(r'C:/Users/27063/.dsh/.credentials.yaml',encoding='utf-8'))['records']['dsh-mnemon/github']['payload']['accessToken']
def api(method,url,body=None):
    cmd=["curl","-sS","-m","60","-X",method,"-H","Authorization: Bearer "+tok,
         "-H","Accept: application/vnd.github+json","-o","-","-w","\n@@%{http_code}",url]
    if body is not None: cmd+=["-H","Content-Type: application/json","-d",json.dumps(body,ensure_ascii=False)]
    p=subprocess.run(cmd,capture_output=True,text=True,encoding="utf-8",errors="replace")
    o=p.stdout; return (o.rsplit("@@",1)[-1].strip() if "@@" in o else "ERR"), o.rsplit("\n@@",1)[0]

# 1) archive desktop-tutorial
c,_=api("PATCH","https://api.github.com/repos/TianQue6916/desktop-tutorial",
        {"archived":True,"description":"desktop-tutorial — archived: empty placeholder repo created automatically by GitHub Desktop; nothing to search"})
print("archive desktop-tutorial ->",c)

# 2) fix CS144 README
rd=json.load(open(D+'/readmes.json',encoding='utf-8'))['Computer-Networking-CS144']['text']
new=rd.replace("05-教材/          《Computer Networking: A Top-Down Approach》相关材料",
               "05-教材/          Peterson & Davie《Computer Networking: A Systems Approach》v6.1")
assert new!=rd, "替换未命中"
c2,b2=api("GET","https://api.github.com/repos/TianQue6916/Computer-Networking-CS144/contents/README.md")
sha=json.loads(b2)["sha"] if c2=="200" else None
payload={"message":"docs: fix textbook name (A Systems Approach, Peterson & Davie v6.1 — not Top-Down)",
         "content":base64.b64encode(new.encode()).decode(),"branch":"main"}
if sha: payload["sha"]=sha
c3,_=api("PUT","https://api.github.com/repos/TianQue6916/Computer-Networking-CS144/contents/README.md",payload)
print("CS144 README fix ->",c3)
print("--- 改动行 ---")
print([l for l in new.splitlines() if "05-教材" in l])
