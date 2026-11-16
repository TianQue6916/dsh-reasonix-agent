import json,subprocess,urllib.parse,time
def s(q):
    url="https://api.github.com/search/repositories?q="+urllib.parse.quote(q)+"&per_page=10"
    p=subprocess.run(["curl","-sS","-m","25","-H","Accept: application/vnd.github+json",url],capture_output=True,text=True,encoding="utf-8",errors="replace")
    try: j=json.loads(p.stdout)
    except Exception: return {"q":q,"err":p.stdout[:150]}
    it=j.get("items",[])
    return {"q":q,"total":j.get("total_count"),"mine":[x["full_name"] for x in it if x["owner"]["login"]=="TianQue6916"],
            "top":[f'{x["full_name"]}({x["stargazers_count"]})' for x in it[:5]]}
for q in ["probabilistic user:TianQue6916",
          "topic:llm-agent user:TianQue6916",
          "topic:engineering-notes",
          "convex optimization boyd solutions user:TianQue6916"]:
    print(json.dumps(s(q),ensure_ascii=False)[:600]); print()
    time.sleep(7)
p=subprocess.run(["curl","-sS","-m","20","-H","Accept: application/vnd.github+json",
  "https://api.github.com/search/code?q=repo:TianQue6916/diary+README"],capture_output=True,text=True,encoding="utf-8",errors="replace")
print("ANON CODE SEARCH ->",p.stdout[:300])
