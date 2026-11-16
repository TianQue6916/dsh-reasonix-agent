import json,subprocess,urllib.parse,time
def s(q):
    url="https://api.github.com/search/repositories?q="+urllib.parse.quote(q)+"&per_page=5"
    p=subprocess.run(["curl","-sS","-m","25","-H","Accept: application/vnd.github+json",url],capture_output=True,text=True,encoding="utf-8",errors="replace")
    try: j=json.loads(p.stdout)
    except Exception: return {"q":q,"raw":p.stdout[:150]}
    if "items" not in j: return {"q":q,"msg":j.get("message"),"total":j.get("total_count")}
    it=j["items"]
    return {"q":q,"total":j.get("total_count"),
            "mine":[x["full_name"] for x in it if x["owner"]["login"]=="TianQue6916"],
            "top":[f'{x["full_name"]}({x["stargazers_count"]})' for x in it[:3]]}
tests=["recitation user:TianQue6916",        # README-only 词（description 无）
       "Athena Scientific user:TianQue6916", # README-only
       "topic:llm-agent",                    # 竞争度
       "topic:knowledge-base"]               # 竞争度
for q in tests:
    print(json.dumps(s(q),ensure_ascii=False)[:500]); print(); time.sleep(8)
