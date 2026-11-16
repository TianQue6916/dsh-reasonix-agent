import yaml,subprocess,json,base64,time
D=r'C:/Users/27063/.dsh/tmp_audit'
tok=yaml.safe_load(open(r'C:/Users/27063/.dsh/.credentials.yaml',encoding='utf-8'))['records']['dsh-mnemon/github']['payload']['accessToken']
repos={r['name']:r for r in json.load(open(D+'/tmp_repos.json',encoding='utf-8'))}
CC=json.load(open(D+'/ccby.json',encoding='utf-8'))['body']
MIT=json.load(open(D+'/mit.json',encoding='utf-8'))['body'].replace('[year]','2026').replace('[fullname]','TianQue6916')
CC_G=["Introduction-to-Probability-6.041","Introduction-to-Real-Analysis-18.100B",
 "Design-and-Analysis-of-Algorithms-6.046J","Convex-Optimization-EE364a","Computer-Networking-CS144",
 "Information-Theory","Mathematics-for-Computer-Science","Computer-Systems-A-Programmer-s-Perspective",
 "Introduction-to-Algorithms","Introduction-to-Linear-Algebra","Linear-Algebra-and-Learning-from-Data",
 "Introduction-to-Algorithms-codetry","diary"]
MIT_G=["tool-box","Structured-Pseudocode-mind-language","dsh-reasonix-agent"]
def api(method,url,body=None):
    cmd=["curl","-sS","-m","60","-X",method,"-H","Authorization: Bearer "+tok,
         "-H","Accept: application/vnd.github+json","-o","-","-w","\n@@%{http_code}",url]
    if body is not None: cmd+=["-H","Content-Type: application/json","-d",json.dumps(body,ensure_ascii=False)]
    p=subprocess.run(cmd,capture_output=True,text=True,encoding="utf-8",errors="replace")
    o=p.stdout; return (o.rsplit("@@",1)[-1].strip() if "@@" in o else "ERR"), o.rsplit("\n@@",1)[0]
for n,body,msg in [(n,CC,"docs: LICENSE plain CC BY 4.0 text (split of original/third-party moved to NOTICE)") for n in CC_G]+\
                  [(n,MIT,"docs: LICENSE plain MIT text") for n in MIT_G]:
    br=repos[n]['default_branch']; base=f"https://api.github.com/repos/TianQue6916/{n}"
    c,b=api("GET",f"{base}/contents/LICENSE?ref={br}")
    sha=None
    if c=="200":
        try: sha=json.loads(b)["sha"]
        except Exception: pass
    payload={"message":msg,"content":base64.b64encode(body.encode()).decode(),"branch":br}
    if sha: payload["sha"]=sha
    c2,_=api("PUT",f"{base}/contents/LICENSE",payload)
    print(f"{n:42} {c2}", flush=True); time.sleep(0.5)
