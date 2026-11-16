---
id: mem-d58e77e99204f7b39687cb8912264387
revision: 1
created_at: "2026-11-16T08:32:25.039Z"
updated_at: "2026-11-16T08:32:25.039Z"
name: dsh-skills-根目录拓扑与裁剪-20261116
description: "dsh skills 的三处根目录拓扑、技能被同步「复活」的机制、2026-11-16 裁剪 83→33 的结果，以及中文路径必须关 quotepath 的坑"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 拓扑（2026-11-16 实测，改完）

Windows：
```
C:\Users\27063\ai-skills                  唯一真身，33 个技能（裁剪后）
C:\Users\27063\.dsh\skills       Junction ─┘
C:\Users\27063\.reasonix\skills  Junction ─┘
%APPDATA%\reasonix\skills.legacy-20261116  ← 11 月初搬家前的旧真身（101 项），已留档
```
Linux（`/home/tianque`）：
```
~/.dsh/skills     真身，33 个技能
~/.reasonix/skills -> ~/.dsh/skills
~/ai-skills.legacy-20261116   ← 10-23 旧副本（97 项），已留档
~/ai-skills-pruned-20261001-1431  ← 10-01 那次整理的剪枝留档
```

## 为什么「整理过了技能还是很多」

2026-08-16 / 10-01 那两次整理做的是**新建合并版**，原料没删：
`academic-writing`（5 合 1）的原料 4 个都还在；`thinking-modes`（caveman/grill-me/zoom-out 合 1）三个原料都在。
10-01 又批量导入 28 个 400~500 B 的领域卡（python/rust/docker/kubernetes…）+ 3 个外部合集索引
（antigravity-awesome-skills 自称 1493 个技能，本机一个没有）+ 17 个散落 .md。

## 技能复活机制（同步器语义）

`sync_reasonix.py` 的同步核心是**纯并集**：`all_rel = set(lfiles) | set(wfiles)`，
一方独有 ⇒ 复制到另一方；**删除永远不传播**；且 `lsize == wsize` 直接判 same（不比内容）。
⇒ 只在一台机器删/合并技能，下一轮就被对端补回来。
⇒ 纪律：**删技能必须双机同时做**，或两侧同名目录一起改名留档。
⇒ 历史证据：11-02～11-16 之间 `sync_dsh.py` 的 `EXTRA_PAIRS` 一直指着搬家前的
`%APPDATA%\reasonix\skills`，那半个月双机搬的全是旧副本 —— 用户在 Linux 上看到的
「整理掉的技能又出现」就是它。

## 裁剪结果（方案 B，用户「可以」）

83 个技能目录 → **33 个**，退役 50 个 + 17 个散落 .md，双机同时执行，
留档在 `~/.dsh/.retired/skills-20261116/`（`_loose-md/` 放散落 md）。
退役族：28 个领域卡空壳、3 个外部合集索引、caveman/grill-me/zoom-out（被 thinking-modes 取代）、
bilingual-translator + ocw-lecture-translator（无 SKILL.md 的僵尸）、`.archive-shadowed-20260804`、
AIGC 六合一留 aigc、docx 留 detailed-docx、ppt 三兄弟留 ppt-master、
academic 三兄弟留 academic-paper-composer、webapp-testing 留 playwright-automation。
双机技能名集合 `diff` 完全一致（各 33）。

## 顺带踩到的坑：中文路径 + git

`core.quotepath` 默认 true ⇒ git 把非 ASCII 路径输出成 `"skills/\345\205\203..."`（带引号 + 八进制）。
拿去做 `git add` 一个都匹配不上、拿去做域分类首字符是 `"` 就全归 misc。
已给三处加 `-c core.quotepath=false`：`dsh-autocommit.ps1`、`dsh_autocommit.sh`、`.git/hooks/pre-commit`。
症状：157 个改动只提交 3 个；纯 toolkit 的 80 文件批次被判「toolkit misc 混域」拒绝。
