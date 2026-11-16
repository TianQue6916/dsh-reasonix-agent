import yaml,subprocess,json,glob,base64,os
D=r'C:/Users/27063/.dsh/tmp_audit'
tok=yaml.safe_load(open(r'C:/Users/27063/.dsh/.credentials.yaml',encoding='utf-8'))['records']['dsh-mnemon/github']['payload']['accessToken']
drafts={json.load(open(f,encoding='utf-8'))['name']:json.load(open(f,encoding='utf-8')) for f in glob.glob(D+'/drafts/*.json')}
COURSES=["Introduction-to-Probability-6.041","Introduction-to-Real-Analysis-18.100B",
 "Design-and-Analysis-of-Algorithms-6.046J","Convex-Optimization-EE364a",
 "Computer-Networking-CS144","Information-Theory","Mathematics-for-Computer-Science",
 "Computer-Systems-A-Programmer-s-Perspective","Introduction-to-Algorithms",
 "Introduction-to-Linear-Algebra","Linear-Algebra-and-Learning-from-Data",
 "Introduction-to-Algorithms-codetry"]
TOOLS=["dsh-reasonix-agent","Structured-Pseudocode-mind-language","tool-box","diary","desktop-tutorial"]
def row(n):
    d=drafts[n]
    return f"| [`{n}`](https://github.com/TianQue6916/{n}) | {d['description']} |"
L=["# TianQue6916","",
"> Undergraduate in Intelligent Science & Technology (Ningxia University). These repos are",
"> my working knowledge base: MIT/Stanford course material re-annotated bilingually (English",
"> source + 中文批注), plus the agent tooling I build to maintain it. Everything here is meant",
"> to be read by both humans and AI agents — each repo has an `llms.txt` at its root.","",
"## Course material","",
"| Repo | What is actually inside |","|---|---|"]
L+= [row(n) for n in COURSES]
L+= ["","## Agent tooling & automation","","| Repo | What is actually inside |","|---|---|"]
L+= [row(n) for n in TOOLS]
L+= ["","## For AI agents / LLM crawlers","",
"GitHub disallows `/*/tree/` and `/*/raw/` to GPTBot, ClaudeBot, PerplexityBot and friends,",
"so directory layouts are invisible to crawlers. Each repo therefore ships an `llms.txt`",
"(llmstxt.org format) stating what is really inside, with real paths.","",
"- Docs via MCP: `https://gitmcp.io/TianQue6916/<repo>` — GitMCP reads `llms.txt` first, then `README.md`.",
"- Repo search on GitHub indexes only **name, description and topics** — not README body.",
"  The one-line descriptions above are written to be the search surface; the READMEs carry the detail.","",
"## Notes","",
"- Contents are personal study material. Textbooks and scans remain the copyright of their",
"  authors and publishers; buy the originals. Bilingual notes and translations are mine.",
"- Repository descriptions are deliberately keyword-dense: they are the only field GitHub",
"  search actually reads.",""]
md="\n".join(L)
open(D+'/profile_readme.md','w',encoding='utf-8').write(md)
print("bytes:",len(md.encode()))

def api(method,url,body=None):
    cmd=["curl","-sS","-m","40","-X",method,"-H","Authorization: Bearer "+tok,
         "-H","Accept: application/vnd.github+json","-o","-","-w","\n@@%{http_code}",url]
    if body is not None: cmd+=["-H","Content-Type: application/json","-d",json.dumps(body,ensure_ascii=False)]
    p=subprocess.run(cmd,capture_output=True,text=True,encoding="utf-8",errors="replace")
    o=p.stdout; return (o.rsplit("@@",1)[-1].strip() if "@@" in o else "ERR"), o.rsplit("\n@@",1)[0]

c,b=api("GET","https://api.github.com/repos/TianQue6916/TianQue6916")
if c=="404":
    c,b=api("POST","https://api.github.com/user/repos",{"name":"TianQue6916","description":
      "Profile README — index of course material + agent tooling, written for humans and LLM crawlers",
      "auto_init":True,"has_issues":False,"has_wiki":False})
    print("create repo:",c)
else: print("repo exists:",c)
c2,b2=api("GET","https://api.github.com/repos/TianQue6916/TianQue6916/contents/README.md")
sha=None
if c2=="200":
    try: sha=json.loads(b2)["sha"]
    except Exception: pass
payload={"message":"docs: index of course material + agent tooling, for humans and LLM crawlers",
         "content":base64.b64encode(md.encode()).decode()}
if sha: payload["sha"]=sha
c3,_=api("PUT","https://api.github.com/repos/TianQue6916/TianQue6916/contents/README.md",payload)
print("README push:",c3)
