---
id: "a7db1165-9b9d-49e9-9935-d79b5654167f"
title: "bilingual-ocw-translator v3.7：以 Linux v3.6 为底座的三端技能收敛与同步根因"
description: "2026-09-30 把 bilingual-ocw-translator 技能按用户要求「Linux 版更好就融合」收敛为 v3.7 的完整 rationale 与证据：Linux v3.6 为 canonical 底座、2275→697 行 + references 8 件 1709 行、26 条铁律零删除与内容守恒校验法、三端 sha256 一致性判据、以及根因分析（.reasonix/skills 是真实目录而 memory 是 junction；cron 已停用、sync_dsh.py 不含 reasonix/skills → 需要手动三端分发）。"
status: "active"
created_at: "2026-09-30T13:55:47.707Z"
updated_at: "2026-09-30T13:55:47.707Z"
content_hash: "3d3e2f3d7ca7263e910c862b2203fb0556c85b603e128a77610c709c402905ed"
source_paths:
  - ".reasonix/skills/bilingual-ocw-translator/SKILL.md"
  - ".reasonix/skills/bilingual-ocw-translator/HISTORY.md"
  - ".reasonix/skills/bilingual-ocw-translator/references/changelog.md"
  - ".dsh/storages/tools/sync_dsh.py"
session_ids:
  - "f3b25073-6d50-4cfe-98df-cf6112bcc0e6"
memory_body_ids:
  []
---

# bilingual-ocw-translator v3.7：三端收敛与同步根因

**日期**：2026-09-30（约 21:00–21:55）　**起因**：用户拍板「Linux 那边更好，可以再融合一下修改一下这个技能」

**技能三端位置**
- dsh 侧：`C:\Users\27063\.reasonix\skills\bilingual-ocw-translator\`（dsh 经 symlink 读，动手前冻结在 v3.2）
- Desktop/Roaming 侧：`C:\Users\27063\AppData\Roaming\reasonix\skills\bilingual-ocw-translator\`（v3.6，2275 行底座）
- Linux 侧：`/home/tianque/.reasonix/skills/bilingual-ocw-translator/`（v3.6，Linux 版为严格超集）

## 结论：Linux 版为 canonical

比对 HISTORY.md：`.reasonix` 侧 219 行 / Linux 侧 248 行，规范化（去不可见字符 + 统一行尾）后做章节标题差集 —— Linux 独有 `## v3.4（2026-09-23）视觉核对流水线成为必做环节` 与 `## v3.6（2026-09-23）图像流水线`，Windows 侧无独有章节，即 **Linux 是严格超集**。故融合时以 Linux v3.6 为底座，叠加 dsh 侧改动产出 **v3.7**。

HISTORY 收敛：Linux 内容 + 追加 v3.7 版本行（插入于第 173 行），最终 250 行。

## v3.7 成品结构

| 项 | 结果 |
|---|---|
| 主文档 `SKILL.md` | 2275 → **697 行** |
| `references/` | **8 文件 / 1709 行**（第 3/4/5/6/8/9/10 章 + 版本沿革），progressive disclosure 按需加载 |
| 铁律 | **26 条全留在主文档**（含 24 扫描版视觉核对、25 替换式改稿公式边界、26 插图不得丢弃） |
| 新增 | 「🎯 核心契约」12 条一览（模型/通道、双语格式、密度、数学格式、审计即修复、wiki 先行、全资源搜索、写注、扫描版视觉核对、插图不丢、公式边界、交付自检） |
| frontmatter | description 改触发式措辞（补「凡是需要翻译讲义…都用这个技能」），版本标 v3.7 |

拆分后的 references 文件：`notes-guide.md / format.md / toolchain.md / prompts.md / ps-workflow.md / vision-check.md / image-pipeline.md / changelog.md`。
v3.6 的坑一条没丢，随章节进 references：§8.9 渲染四道坑、§9.4 订正副作用、§9.8 图像层核对、§10.2.5 图内文字决策树、`max_tokens ≥16384`、`pdfimages` 只能出整页 JPEG。

## 两个通用技法（可复用）

1. **内容守恒校验**（拆分大文档时防止静默丢内容）：脚本剥掉跨引用行后逐行比对底座正文，结论为 97% 正文行一字未动，余下差异只是 `第 N 章` → `references/x.md` 的指针改写。首次跑出的 ❌ 是章节范围表把第 10 章算成空区间，修正区间后加该校验即通过。
2. **fence 感知的 Markdown 结构校验**：裸计 `^# ` 会把 code fence 里的 shell 注释当成 H1（曾误报 toolchain.md H1=13、vision-check.md H1=7），改用忽略 fenced code block 的计数后所有文件真 H1 = 1（主文档 12 节）。全文件粗体配对 parity 异常行 = 0。
   另修掉一个真实缺陷：references 文件曾出现双 H1（前置「按需加载章节」提示 + 原章标题），保留提示即需确认其不是 H1。

## 三端一致性判据

以 **sha256 全等**为唯一可信判据，三端 10 个文件全部 ✅：
`SKILL.md` `f41eb970…`、`HISTORY.md` `f9974965…`，以及 references × 8。

registry 实测：`skill_search("ocw translator")` 只出 v3.7 一个入口；`skill_search("notes-guide")` 无命中 —— 证明 `references/*.md` 未被 provider 误认成独立 skill。另核实两个停用技能（`bilingual-translator`、`ocw-lecture-translator`）三端皆已不存在。

技能总数：`.reasonix` 98 / Roaming 97 / Linux 97；两者相对 `.reasonix` 都只缺 `ai-vibe-writing-skills`（此差异在本次动手前就存在，非本次产生）。

## 根因 1：skills 分叉来自 junction 的缺失

`C:\Users\27063\.reasonix` 下链接实况（`readlink` 逐个探）：
- `memory` → **JUNCTION** 到 `C:\Users\27063\AppData\Roaming\reasonix\memory`（2026-09-27 建；`dir` 输出 `<JUNCTION>`）
- `skills`、`projects`、`archive`、`sessions`、`global-workspace`、`mind-transcripts` → 均为**真实目录**，各自独立

因此 memory 天然共享（cp 到 Roaming 会报 "are the same file"），skills 却是两条谱系：dsh 走 `.reasonix/skills`、Desktop 走 Roaming —— 这就是同一技能分成 v3.2/v3.6 的根本原因。**治本建议（待用户点头）**：把 `.reasonix/skills` 也做成指向 `AppData\Roaming\reasonix\skills` 的 junction，照 memory 的做法；代价是先处理多出的 `ai-vibe-writing-skills`。

## 根因 2：skills 已无自动同步通道

- reasonix 的 cron 已被注释停用：`# [2026-09-30 停用：改用 dsh 同步] 30 8,12,21 * * * .../sync_cron.sh`（原定 08:30/12:30/21:30 跑）
- 新机制 `~/.dsh/storages/tools/sync_dsh.py`（2026-09-30 用户拍板，reasonix 版的「同源弟弟」，复用同一 Syncer）**只覆盖 `~/.dsh` ↔ `C:\Users\27063\.dsh`**，不含 `~/.reasonix/skills`
- 且该 Syncer 有已知局限：冲突判定为「size 相同即视为相同」，**改动前后字节数完全一致的编辑不会传播**（如状态文件 zh→en 是等长），要传需先改变文件大小；冲突时双方都保留为 `<name>.conflict.<host>.<hash>.bak`，绝不覆盖
- 结论：本次三端分发是**手动 scp/cp**，下次改技能不会有东西自动传。兜底方案二选一：恢复 skills 定时同步，或在 dsh 侧挂 job 跑 `sync_reasonix.py --sync`

## 时序事故与备份残留

21:30 那轮同步（实际 21:41–21:48）撞上了拆分的中间状态，产生 conflict 副本：
- `.reasonix` 侧 `SKILL.md.conflict.linux.7c958398fb.bak`（160KB，Linux v3.6 原文）、`SKILL.md.conflict.linux.6137f42998.bak`（21:25，废弃中间态）；`HISTORY.md.conflict.linux.2f6e6f4cb2.bak`
- Linux 侧 `SKILL.md.conflict.win.df9f53e4df.bak`（= 废弃的 v3.4 fork）、`HISTORY.md.conflict.win.d3df932386.bak`
- 还有 `SKILL.md.bak-20260930-pre-v37-merge`（三端皆有，160KB 底座）与 `.reasonix` 侧 `HISTORY.md.bak-20260930-pre-converge`
内容无损，留作回滚点。教训：**跨机同步与大规模改写不要同时进行**，否则同步会把中间状态固化成 conflict 副本。

## 相关文档

- `9d269862-e4bf-4c97-8fbd-58a4519289b7` —— 本技能 v3.3 重构（MUSE 口径 + progressive disclosure 起点），v3.7 是它的后续收敛
- `1c10152c-903f-48df-b23e-2f44c6c126f1` —— dsh 记忆三层分工，与 triple-end 目录/junction 语义相邻

（源路径均为上列三端技能目录内的 `SKILL.md` / `HISTORY.md` / `references/*.md`。）
