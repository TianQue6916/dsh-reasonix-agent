import json,subprocess,sys
d=json.load(open("C:/Users/27063/.dsh/tmp_repos.json",encoding="utf-8"))
def get(url):
    r=subprocess.run(["curl","-sS","-m","15","-L","-o","-","-w","\n@@%{http_code}",url],
                     capture_output=True,text=True,encoding="utf-8",errors="replace")
    out=r.stdout
    if "@@" not in out: return ("ERR",out[:200])
    code=out.rsplit("\n@@",1)[-1].strip()
    body=out.rsplit("\n@@",1)[0]
    return (code,body)
res=[]
for r in d:
    n=r["name"]; b=r["default_branch"]
    found=None
    for fn in ["README.md","readme.md","Readme.md","README.rst","README.txt"]:
        c,body=get("https://raw.githubusercontent.com/TianQue6916/%s/%s/%s"%(n,b,fn))
        if c=="200":
            found=(fn,len(body),body); break
    dc,db=get("https://deepwiki.com/TianQue6916/%s"%n)
    title=""
    if isinstance(db,str) and "<title>" in db:
        title=db.split("<title>")[1].split("</title>")[0][:70]
    res.append({"name":n,"readme":found[0] if found else "NONE","bytes":found[1] if found else 0,
                "deepwiki":dc,"title":title,"body":found[2] if found else ""})
json.dump(res,open("C:/Users/27063/.dsh/tmp_audit/readme_probe.json","w",encoding="utf-8"),ensure_ascii=False,indent=1)
for x in res:
    print("%-33s readme=%-9s %7dB  deepwiki=%-4s %s"%(x["name"][:32],x["readme"],x["bytes"],x["deepwiki"],x["title"]))
