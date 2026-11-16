import json,subprocess,urllib.parse,time
def s(q):
    url="https://api.github.com/search/repositories?q="+urllib.parse.quote(q)+"&per_page=10"
    p=subprocess.run(["curl","-sS","-m","25","-H","Accept: application/vnd.github+json",url],capture_output=True,text=True,encoding="utf-8",errors="replace")
    try: j=json.loads(p.stdout)
    except Exception: return {"q":q,"raw":p.stdout[:150]}
    if "items" not in j: return {"q":q,"msg":j.get("message")}
    return {"q":q,"total":j.get("total_count"),"mine":sorted(x["full_name"].split("/")[1] for x in j["items"] if x["owner"]["login"]=="TianQue6916")}
for q in ["recitation in:readme user:TianQue6916",
          "bilingual in:readme user:TianQue6916",
          "bilingual user:TianQue6916",
          "notes user:TianQue6916"]:
    print(json.dumps(s(q),ensure_ascii=False)[:700]); print(); time.sleep(8)
