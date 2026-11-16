import json,subprocess,urllib.parse,time
def s(q,per=100):
    url="https://api.github.com/search/repositories?q="+urllib.parse.quote(q)+"&per_page=%d&sort=stars&order=desc"%per
    p=subprocess.run(["curl","-sS","-m","30","-H","Accept: application/vnd.github+json",url],capture_output=True,text=True,encoding="utf-8",errors="replace")
    j=json.loads(p.stdout)
    if "items" not in j: return {"q":q,"msg":j.get("message")}
    it=j["items"]
    mine=[i for i,x in enumerate(it) if x["owner"]["login"]=="TianQue6916"]
    return {"q":q,"total":j.get("total_count"),"showed":len(it),
            "my_rank":mine,
            "stars_at_cut":it[-1]["stargazers_count"] if it else None,
            "top5_desc":[(x["full_name"],x["stargazers_count"],(x["description"] or "")[:60]) for x in it[:3]]}
for q in ["6.041 probabilistic systems in:readme",
          "convex optimization boyd in:readme"]:
    print(json.dumps(s(q),ensure_ascii=False)[:900]); print(); time.sleep(12)
