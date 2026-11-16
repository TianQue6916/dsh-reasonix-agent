import yaml,subprocess,json,os
d=yaml.safe_load(open(r'C:/Users/27063/.dsh/.credentials.yaml',encoding='utf-8'))
tok=d['records']['dsh-mnemon/github']['payload']['accessToken']
repos=json.load(open(r'C:/Users/27063/.dsh/tmp_repos.json',encoding='utf-8'))
outdir=r'C:/Users/27063/.dsh/tmp_audit/repo_meta'; os.makedirs(outdir,exist_ok=True)
for r in repos:
    n=r["name"]; b=r["default_branch"]
    p=subprocess.run(["curl","-sS","-m","60","-H","Authorization: Bearer "+tok,
                      "-H","Accept: application/vnd.github+json",
                      f"https://api.github.com/repos/TianQue6916/{n}/git/trees/{b}?recursive=1"],
                     capture_output=True,text=True,encoding="utf-8",errors="replace")
    try: j=json.loads(p.stdout)
    except Exception:
        print("FAIL",n,p.stdout[:80]); continue
    paths=[t["path"] for t in j.get("tree",[]) if t["type"]=="blob"]
    top=sorted({x.split("/")[0] for x in paths})
    lvl2=sorted({"/".join(x.split("/")[:2]) for x in paths if x.count("/")>=1})[:40]
    json.dump({"name":n,"files":len(paths),"top":top,"lvl2":lvl2,"sample":paths[:60]},
              open(os.path.join(outdir,n+".json"),"w",encoding="utf-8"),ensure_ascii=False,indent=1)
    print(f"{n[:34]:35} files={len(paths):>5} top={len(top)}")
