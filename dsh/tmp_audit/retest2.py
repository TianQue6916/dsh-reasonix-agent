import yaml,subprocess,json,urllib.parse,time
tok=yaml.safe_load(open(r'C:/Users/27063/.dsh/.credentials.yaml',encoding='utf-8'))['records']['dsh-mnemon/github']['payload']['accessToken']
def s(q,per=30):
    url=f"https://api.github.com/search/repositories?q={urllib.parse.quote(q)}&per_page={per}&sort=stars&order=desc"
    p=subprocess.run(["curl","-sS","-m","60","-H","Authorization: Bearer "+tok,"-H","Accept: application/vnd.github+json",url],
                     capture_output=True,text=True,encoding="utf-8",errors="replace")
    try: j=json.loads(p.stdout)
    except Exception: return {"q":q,"raw":p.stdout[:100]}
    if "items" not in j: return {"q":q,"msg":j.get("message")}
    it=j["items"]
    return {"q":q,"total":j.get("total_count"),
            "my_rank":[i for i,x in enumerate(it) if x["owner"]["login"]=="TianQue6916"],
            "mine":[x["name"] for x in it if x["owner"]["login"]=="TianQue6916"]}
for q in ["topic:mit-6-041","topic:mit-18-100b","topic:ee364a","topic:mit-6-046j"]:
    print(json.dumps(s(q),ensure_ascii=False)[:380]); print(); time.sleep(6)
