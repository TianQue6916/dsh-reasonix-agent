#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ds_distill — DeepSeek 会话 / 本地讲义 → 学科学习者档案（per-subject Memory Space）的收口工具。

两个子命令：

  plan   扫描 pages/DS_*.md，按学科关键词归类，为每个受影响的学科生成
         `~/.dsh/_distill/prompts/<slug>.md`（给 subagent 的完整提炼指令）与
         `~/.dsh/_distill/plan.json`（清单：学科 → 素材文件 + 上次提炼时间）
  import 读 subagent 产出的 `<slug>.json`，转成 mnemon draft，写入该学科的 Memory Space
         （`mnemon import --store <bodyId>`）

数据流：
  DeepSeek 网页版 → bulk_fetch.cjs → deepseek_data/raw/ → render_ds_pages.py → pages/DS_*.md
                                                                              ↓ ds_distill plan
                                                              subagent 读页面 → _distill/<slug>.json
                                                                              ↓ ds_distill import
                                                                    mnemon store <bodyId>/mnemon.db

用法:
  python ds_distill.py plan                        # 全量扫（只看未提炼过或页面变新的）
  python ds_distill.py plan --all                  # 忽略时间戳，全部重新生成 prompt
  python ds_distill.py import math-analysis        # 写入该学科 space
  python ds_distill.py import math-analysis --dry-run
"""
import argparse
import datetime
import json
import os
import re
import shutil
import subprocess
import sys

HOME = os.path.expanduser("~")
WS = os.path.join(HOME, ".reasonix", "global-workspace")
PAGES = os.path.join(WS, "pages")
OUT = os.path.join(HOME, ".dsh", "_distill")
PROMPTS = os.path.join(OUT, "prompts")
PLAN_JSON = os.path.join(OUT, "plan.json")
MNEMON = shutil.which("mnemon.cmd") or shutil.which("mnemon") or "mnemon"

MAXB, TAGB = 7500, 100

# slug → (空间名, bodyId, 标题关键词, 补充素材说明)
SUBJECTS = {
    "math-analysis": ("学科档案 · 实分析与数学分析", "dff27046-4c69-4680-a26a-3e8968a34526",
                      ["实分析", "证明1大于0", "三角不等式", "数学分析"],
                      "另读 `.reasonix/global-workspace/18.100B-PS1-*.md`、`PS1-无穷大关系定义-*.md`、`L01 - Introduction to Real Numbers (双语).md`、`Desktop/课程文件/100b实分析`"),
    "linear-algebra": ("学科档案 · 线性代数", "346a7cab-e28b-4ec1-8049-4284a8905576",
                       ["线性代数", "雅可比"],
                       "另读 `strang_part001_translation.md`、`strang_section_*.md`、`TBB-AllChapters-*.bilingual.md`"),
    "probability": ("学科档案 · 概率论与统计", "c0212d7a-4d69-4585-854f-58399ae345b4",
                    ["概率", "统计", "患癌", "六门非前十", "患病"],
                    "补充素材：`Desktop/课程文件` 下与 6.431/概率导论相关的讲义"),
    "discrete-math": ("学科档案 · 离散数学与组合", "a14c6b9f-344f-4ca3-9206-76972cd6f049",
                      ["离散", "六度分隔", "最优子结构", "复杂度算法"],
                      "补充素材：6.042J 讲义与题解"),
    "algorithms": ("学科档案 · 算法与数据结构", "19022172-954f-4d8b-9109-06868dc84f68",
                   ["算法导论", "算法", "dijkstra", "排序", "图论"],
                   "另读 `Desktop/课程文件/006算法导论`、`D:/算法导论学习文件`"),
    "systems": ("学科档案 · 计算机系统（CSAPP）", "ac3a0d13-7899-43b4-acb4-f00637e47a5c",
                ["csapp", "浮点数", "补码", "计算机技术问题"],
                "只取 `计算机技术问题` 中与系统底层相关的段落"),
    "signals": ("学科档案 · 信号与系统", "80ba2d8b-da77-4ef1-951c-c901baf8dfb7",
                ["信号与系统", "卷积"],
                ""),
    "circuits": ("学科档案 · 数字电路与逻辑设计", "e92be240-f363-4a2e-88de-a885b51a37da",
                 ["数电", "计数器", "卡诺", "Logisim", "CMOS", "进制"],
                 ""),
    "english-academic": ("学科档案 · 学术英语与双语翻译", "dfc4423f-e242-44af-9515-ec655fda1cf3",
                         ["英语", "翻译", "语法", "表达", "含义解释"],
                         "另读 `translator_notes.md`"),
    "python-toolchain": ("学科档案 · Python 与工程工具链", "b7de1e15-0a64-49bb-ab1a-846eab0712b9",
                         ["Python", "Miniconda", "conda", "GitHub", "dsh支持系统", "端口占用"],
                         "只取 `计算机技术问题` 中 Python/环境/依赖相关段落"),
    "calculus": ("学科档案 · 高等数学与微积分", "f5d72dc4-b11f-4a33-a6f6-85e6e3ffa538",
                 ["高等数学", "高数", "求极限", "微积分"],
                 ""),
    "physics": ("学科档案 · 物理", "61c2edfb-0cb3-4075-a6dc-3878f5b92ad8",
                ["物理"], ""),
    "ml-foundations": ("学科档案 · 机器学习与 AI 基础", "95206baa-7034-46ce-a1b3-e6e684adc361",
                       ["机器学习", "AGI", "神经网络", "深度学习"],
                       "补充素材：`Desktop/课程文件/data lerning`"),
    "academic-planning": ("学科档案 · 学业规划与元认知", "7e7f23b3-9b95-4f8b-a939-62eadddd10a5",
                          ["未来规划", "十年后", "宁夏大学定位", "暑期", "计划"],
                          "另读 `方舟架构方案-*.md`、`第二个天阙-*.md`、`张宇程暑期*-最终版.md`"),
}

TYPE_CATEGORY = {
    "提问模式": "preference", "反复错误": "preference",
    "困惑": "context", "层次": "context", "待验证": "context",
    "解法": "fact", "已掌握": "fact", "指针": "fact",
    "规划结构": "context", "改口记录": "context", "学习方法论": "fact",
    "能力边界": "context", "约束": "context", "术语偏好": "preference",
}


def blen(s):
    return len(s.encode("utf-8"))


def cutb(s, maxb):
    if blen(s) <= maxb:
        return s
    b = s.encode("utf-8")[:maxb]
    while b and (b[-1] & 0xC0) == 0x80:
        b = b[:-1]
    return b.decode("utf-8", "ignore")


def classify(fname):
    stem = fname[:-3] if fname.endswith(".md") else fname
    hits = []
    for slug, (_, _, kws, _) in SUBJECTS.items():
        if any(k in stem for k in kws):
            hits.append(slug)
    return hits


def cmd_plan(a):
    os.makedirs(PROMPTS, exist_ok=True)
    prev = {}
    if os.path.exists(PLAN_JSON):
        prev = json.load(open(PLAN_JSON, encoding="utf-8")).get("subjects", {})

    by_subject = {}
    for f in sorted(os.listdir(PAGES)):
        if not (f.startswith("DS_") and f.endswith(".md")):
            continue
        p = os.path.join(PAGES, f)
        for slug in classify(f):
            by_subject.setdefault(slug, []).append(p)

    plan = {"generated_at": datetime.datetime.now().isoformat(timespec="seconds"), "subjects": {}}
    made = 0
    for slug, files in sorted(by_subject.items()):
        name, body_id, kws, extra = SUBJECTS[slug]
        newest = max(os.path.getmtime(f) for f in files)
        old = prev.get(slug, {}).get("newest_mtime", 0)
        stale = a.all or newest > old or not os.path.exists(os.path.join(PROMPTS, slug + ".md"))
        plan["subjects"][slug] = {"name": name, "body_id": body_id, "newest_mtime": newest,
                                  "files": [os.path.relpath(f, HOME).replace("\\", "/") for f in files],
                                  "materials": extra}
        if not stale:
            continue
        made += 1
        rel = "\n".join("%d. `%s`" % (i + 1, f) for i, f in enumerate(files))
        prompt = f"""你在为一位中文用户（宁夏大学智能科学与技术本科生，构建主义研究式学习者，要求「术语不翻译」）提炼「{name}」方向的**学习者档案**。
这不是知识库，而是关于「这个人如何学这门学科」的结构化证据。

## 素材（只读，不要修改任何原文件）

{rel}
{("- 补充：" + extra) if extra else ""}

## 提炼维度（每条 insight 必须归入其中一类）

- `提问模式` 他怎么问（先要直觉还是先要证明、爱给反例、爱追问边界条件……）
- `困惑` 具体卡在哪一步，保留**原话片段**（20-60 字）与卡点位置
- `解法` 怎么被打通的 + 来源（对话 / 教材页码 / 实验）
- `层次` 取值 `L0` 见过结论 / `L1` 会用 / `L2` 能复现证明 / `L3` 能讲清并指出教材简化 / `L4` 能迁移到新问题
- `已掌握` 有证据已内化（能独立复现、闭卷做对）
- `待验证` 当时接受但未验证的断言（防止把错误当前提）
- `指针` 值得回看的原文位置

## 纪律

1. 不准调用 `subagent` / `subagent_fork` / `workflow`；2. 不准加载任何 skill；
3. 只读上面列出的文件，不写不改既有文件；4. 无证据不写，不要复述教材；5. 大文件按 `### ` 分段读。

## 输出

写到 `C:\\Users\\27063\\.dsh\\_distill\\{slug}.json`（UTF-8 无 BOM）：

```json
{{"subject":"{slug}","generated_at":"<ISO8601>","sources":["..."],
 "insights":[{{"type":"困惑","content":"≤120 字","tags":["{kws[0]}","知识点"],"importance":4,"evidence":"DS_xxx.md §..."}}]}}
```

`tags` 2-4 个，第一个固定 `{kws[0]}`；术语保留英文原文；`importance` 1-5（4-5 只给里程碑判断）。
目标 20-45 条，覆盖 ≥5 个知识点。完成后只回一句话：条数 + 知识点列表。
"""
        open(os.path.join(PROMPTS, slug + ".md"), "w", encoding="utf-8", newline="\n").write(prompt)

    json.dump(plan, open(PLAN_JSON, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("学科 %d 个，本轮生成 prompt %d 个 → %s" % (len(by_subject), made, PROMPTS))
    for slug in sorted(by_subject):
        print("  %-18s %2d 个素材文件  %s" % (slug, len(by_subject[slug]),
                                             "" if os.path.exists(os.path.join(PROMPTS, slug + ".md")) else "(prompt 已存在，未重写)"))


def cmd_import(a):
    p = os.path.join(OUT, a.slug + ".json")
    if not os.path.exists(p):
        sys.exit("找不到 %s（先跑 plan 并派 subagent）" % p)
    data = json.load(open(p, encoding="utf-8"))
    name, body_id, kws, _ = SUBJECTS[a.slug]
    ins, skipped = [], 0
    for it in data.get("insights", []):
        t = it.get("type", "")
        content = cutb(it.get("content", "").strip(), MAXB)
        if not content:
            skipped += 1
            continue
        tags = [cutb(str(x), TAGB) for x in it.get("tags", [])][:6]
        if t and t not in tags:
            tags.append(cutb(t, TAGB))
        ins.append({"content": content,
                    "category": TYPE_CATEGORY.get(t, "fact"),
                    "importance": int(it.get("importance", 3)),
                    "tags": tags,
                    "source": "agent"})
    if not ins:
        sys.exit("没有可用 insight")
    draft = os.path.join(OUT, "_draft-%s.json" % a.slug)
    json.dump({"schema_version": "1", "insights": ins}, open(draft, "w", encoding="utf-8"),
              ensure_ascii=False)
    cmd = [MNEMON, "import", draft, "--store", body_id]
    if a.dry_run:
        cmd.append("--dry-run")
    print("→ %s  (%d 条%s)" % (name, len(ins), "，dry-run" if a.dry_run else ""))
    r = subprocess.run(cmd, capture_output=True, text=True)
    out = (r.stdout or "") + (r.stderr or "")
    print("rc=%d" % r.returncode)
    print(out[-1500:])


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    p1 = sub.add_parser("plan")
    p1.add_argument("--all", action="store_true")
    p2 = sub.add_parser("import")
    p2.add_argument("slug", choices=sorted(SUBJECTS))
    p2.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    if a.cmd == "plan":
        cmd_plan(a)
    else:
        cmd_import(a)


if __name__ == "__main__":
    main()
