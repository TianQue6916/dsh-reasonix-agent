import yaml,subprocess,json,base64,sys,time
D=r'C:/Users/27063/.dsh/tmp_audit'
tok=yaml.safe_load(open(r'C:/Users/27063/.dsh/.credentials.yaml',encoding='utf-8'))['records']['dsh-mnemon/github']['payload']['accessToken']
repos={r['name']:r for r in json.load(open(D+'/tmp_repos.json',encoding='utf-8'))}
CC=json.load(open(D+'/ccby.json',encoding='utf-8'))['body']
MIT=json.load(open(D+'/mit.json',encoding='utf-8'))['body']

CC_HEAD = """本仓库中由仓库作者原创的内容 —— 中文批注、双语翻译、索引、目录整理、脚本 ——
采用 Creative Commons Attribution 4.0 International (CC BY 4.0) 授权，许可证全文见下。

第三方材料（教材原文与扫描件、课程讲义/幻灯片、视频与字幕、习题解答中引用原文的部分）
版权归原作者与出版方所有，**不在本许可证覆盖范围内**，详见 NOTICE。

Original content in this repository — 中文批注, bilingual translations, indexes,
directory organisation and scripts — is licensed under CC BY 4.0 (full text below).
Third-party material (textbook text and scans, lecture slides, videos, subtitles)
remains the copyright of its authors and publishers and is NOT covered by this
license. See NOTICE.

Copyright (c) 2026 TianQue6916
https://github.com/TianQue6916

=======================================================================

"""
MIT_HEAD = """Copyright (c) 2026 TianQue6916

Third-party dependencies bundled in this repository (if any) remain under their own
licenses. Configuration and log material mirrors local tool state for reference only.

"""
NOTICE = """# NOTICE — third-party material

This repository mixes two kinds of files.

## 1. Original work (CC BY 4.0 / MIT, see LICENSE)

- 中文批注、双语翻译、术语对照（`.bilingual.md` 系列）
- 目录结构、索引、进度表、组织方式
- 仓库作者的脚本与配置

## 2. Third-party material — NOT licensed by this repository

| 类型 | 版权归属 | 说明 |
|---|---|---|
| 教材原文 / PDF / 扫描件 | 作者与出版方 | 仅供个人学习，请购买正版 |
| 课程讲义、幻灯片、作业与考试原件 | 开课院校与授课教师 | 依各课程的使用条款 |
| 视频、字幕 | 原发布者 | 字幕为学习用转录 |

如果你要复用本仓库的内容：**只复用第 1 类**；第 2 类请回到原始出处获取授权。

Contact: https://github.com/TianQue6916
"""
GROUP = {
 "cc": ["Introduction-to-Probability-6.041","Introduction-to-Real-Analysis-18.100B",
        "Design-and-Analysis-of-Algorithms-6.046J","Convex-Optimization-EE364a",
        "Computer-Networking-CS144","Information-Theory","Mathematics-for-Computer-Science",
        "Computer-Systems-A-Programmer-s-Perspective","Introduction-to-Algorithms",
        "Introduction-to-Linear-Algebra","Linear-Algebra-and-Learning-from-Data",
        "Introduction-to-Algorithms-codetry","diary"],
 "mit": ["tool-box","Structured-Pseudocode-mind-language","dsh-reasonix-agent"],
}
def api(method,url,body=None,tmo="60"):
    cmd=["curl","-sS","-m",tmo,"-X",method,"-H","Authorization: Bearer "+tok,
         "-H","Accept: application/vnd.github+json","-o","-","-w","\n@@%{http_code}",url]
    if body is not None: cmd+=["-H","Content-Type: application/json","-d",json.dumps(body,ensure_ascii=False)]
    p=subprocess.run(cmd,capture_output=True,text=True,encoding="utf-8",errors="replace")
    o=p.stdout; return (o.rsplit("@@",1)[-1].strip() if "@@" in o else "ERR")
def put_file(n,fname,content,msg):
    br=repos[n]['default_branch']; base=f"https://api.github.com/repos/TianQue6916/{n}"
    c=api("GET",f"{base}/contents/{fname}?ref={br}")
    sha=None
    if c=="200":
        o=api("GET",f"{base}/contents/{fname}?ref={br}")
        # 重新取 body 拿 sha
        p=subprocess.run(["curl","-sS","-m","60","-H","Authorization: Bearer "+tok,
                          "-H","Accept: application/vnd.github+json",f"{base}/contents/{fname}?ref={br}"],
                         capture_output=True,text=True,encoding="utf-8",errors="replace")
        try: sha=json.loads(p.stdout)["sha"]
        except Exception: pass
    payload={"message":msg,"content":base64.b64encode(content.encode()).decode(),"branch":br}
    if sha: payload["sha"]=sha
    return api("PUT",f"{base}/contents/{fname}",payload,"90")

only=sys.argv[1] if len(sys.argv)>1 else None
for g,names in GROUP.items():
    for n in names:
        if only and only!=n: continue
        t0=time.time()
        if g=="cc":
            a=put_file(n,"LICENSE",CC_HEAD+CC,"docs: add CC BY 4.0 license for original notes (third-party material excluded, see NOTICE)")
            b=put_file(n,"NOTICE",NOTICE,"docs: add NOTICE separating original work from third-party material")
        else:
            a=put_file(n,"LICENSE",MIT_HEAD+MIT,"docs: add MIT license")
            b="-"
        print(f"{n:42} LICENSE={a} NOTICE={b}  {time.time()-t0:.1f}s", flush=True)
