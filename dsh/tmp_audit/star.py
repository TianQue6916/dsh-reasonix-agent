import yaml,subprocess,json
d=yaml.safe_load(open(r'C:/Users/27063/.dsh/.credentials.yaml',encoding='utf-8'))
tok=d['records']['dsh-mnemon']['github']['payload']['accessToken']
def call(method,url,body=None):
    cmd=["curl","-sS","-m","25","-X",method,"-H","Authorization: Bearer "+tok,
         "-H","Accept: application/vnd.github+json","-H","X-GitHub-Api-Version: 2022-11-28",
         "-o","-","-w","\n@@%{http_code}",url]
    if body: cmd+=["-d",json.dumps(body)]
    p=subprocess.run(cmd,capture_output=True,text=True,encoding="utf-8",errors="replace")
    o=p.stdout; code=o.rsplit("@@",1)[-1].strip() if "@@" in o else "ERR"
    return code
print("whoami:",call("GET","https://api.github.com/user"))
targets=[("idosal","git-mcp"),("coderamp-labs","gitingest"),
         ("Void-LifeStream","github-discoverability-audit")]
for o,r in targets:
    c=call("PUT",f"https://api.github.com/user/starred/{o}/{r}",{})
    print(f"star {o}/{r} -> {c} (204=ok/new, 304=already)")
