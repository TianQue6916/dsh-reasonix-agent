import json,subprocess,urllib.parse,time
def s(q):
    url="https://api.github.com/search/repositories?q="+urllib.parse.quote(q)+"&per_page=10"
    p=subprocess.run(["curl","-sS","-m","45","-H","Accept: application/vnd.github+json",url],capture_output=True,text=True,encoding="utf-8",errors="replace")
    try: j=json.loads(p.stdout)
    except Exception: return {"q":q,"raw":p.stdout[:100]}
    if "items" not in j: return {"q":q,"msg":j.get("message")}
    it=j["items"]
    return {"q":q,"total":j.get("total_count"),
            "mine":[(i,x["full_name"]) for i,x in enumerate(it) if x["owner"]["login"]=="TianQue6916"],
            "order":[f'{x["full_name"]}({x["stargazers_count"]})' for x in it[:6]]}
for q in ["topic:agent-harness","topic:dsh","topic:reasonix","topic:engineering-notes"]:
    print(json.dumps(s(q),ensure_ascii=False)[:600]); print(); time.sleep(9)
