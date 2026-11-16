import json,subprocess,urllib.parse
def s(q,sort="best match"):
    url="https://api.github.com/search/repositories?q="+urllib.parse.quote(q)+"&per_page=10"
    p=subprocess.run(["curl","-sS","-m","25","-H","Accept: application/vnd.github+json",url],
                     capture_output=True,text=True,encoding="utf-8",errors="replace")
    try: j=json.loads(p.stdout)
    except Exception: return {"q":q,"err":p.stdout[:200]}
    items=j.get("items",[])
    return {"q":q,"total":j.get("total_count"),"top":[(i["full_name"],i["stargazers_count"]) for i in items],
            "mine":[x["full_name"] for x in items if x["owner"]["login"]=="TianQue6916"]}
qs=["6.041 probabilistic systems in:readme",
    "dsh agent harness in:readme",
    "6.041 probabilistic systems user:TianQue6916"]
for q in qs:
    r=s(q); print(json.dumps(r,ensure_ascii=False)[:900]); print()
