import json,subprocess,base64,os
d=json.load(open("C:/Users/27063/.dsh/tmp_repos.json",encoding="utf-8"))
out={}
for r in d:
    n=r["name"]
    p=subprocess.run(["curl","-sS","-m","20","-H","Accept: application/vnd.github+json",
                      "https://api.github.com/repos/TianQue6916/%s/readme"%n],
                     capture_output=True,text=True,encoding="utf-8",errors="replace")
    try:
        j=json.loads(p.stdout)
    except Exception as e:
        out[n]={"err":p.stdout[:120]}; continue
    if "content" in j:
        txt=base64.b64decode(j["content"]).decode("utf-8","replace")
        out[n]={"path":j["path"],"bytes":len(txt),"text":txt}
    else:
        out[n]={"path":None,"msg":j.get("message")}
json.dump(out,open("C:/Users/27063/.dsh/tmp_audit/readmes.json","w",encoding="utf-8"),ensure_ascii=False,indent=1)
for n,v in out.items():
    print("%-33s %-12s %6sB"%(n[:32],v.get("path"),v.get("bytes",-1)))
