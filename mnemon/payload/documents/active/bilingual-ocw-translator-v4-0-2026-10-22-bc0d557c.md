---
id: "bc0d557c-88c3-43cd-9ba6-ff27a80548c5"
title: "bilingual-ocw-translator v4.0「方舟学习引擎」：从翻译技能到学习引擎的架构与落地（2026-10-22）"
description: "技能 bilingual-ocw-translator 由 v3.7 翻译工具升级为 v4.0 双形态学习引擎：四问锚点（本质/公式/现实承重含消失测试/四层拓展）、资料分级 A>B>C、铁律 26→30、references 16→18；含三端 junction 同步拓扑、sha256 验收、备份回滚、heredoc 8KB 截断教训与两项待拍板。"
status: "active"
created_at: "2026-10-22T14:21:19.846Z"
updated_at: "2026-10-22T14:21:19.846Z"
content_hash: "d545457958cdcd3eae702f05a663864a6d17781092fed0a17bdac573884c2d5c"
source_paths:
  - "ai-skills/bilingual-ocw-translator/SKILL.md"
  - "ai-skills/bilingual-ocw-translator/references/learning-engine.md"
  - "ai-skills/bilingual-ocw-translator/references/sources.md"
  - "ai-skills/bilingual-ocw-translator/references/changelog.md"
session_ids:
  - "c6ab3a9a-f2a3-418d-b707-734c90b5cd34"
memory_body_ids:
  []
---

# bilingual-ocw-translator v4.0「方舟学习引擎」

## 动机（用户拍板，原话要点）

目标不再只是翻译，而是「大一统理论与第一性原理」的具体实现：压缩即智能；每学一处必须①查资料、②想清「现实世界什么功能由它实现」、③大量拓展进阶。社区经验被认为是重要来源。

**关键约束：技能名不改**（`bilingual-ocw-translator`），保住用户每天敲的 `/bilingual-ocw-translator` 入口；改的是目标与内容，不是调用名。

## 架构：双形态

| | 形态 A 翻译 | 形态 B 学习（新增主线） |
|---|---|---|
| 输入 | PDF / DOCX / 讲义 / 习题集 / 字幕 | 一个问题、概念或定理 |
| 产出 | 行内双语 Markdown | 锚点卡 + 讲解 + 复习队列 |
| 流程 | 原 8 步，逐字不动 | 定锚 → 取料 → 四问 → 验证 → 落盘 |

翻译降级为「学习引擎的一种形态」，原翻译流水线（含 v3.3 习题详解、v3.4 视觉核对、v3.5 公式体检、v3.6 图像流水线）零改动保留。

## 四问锚点（核心方法，已写进 `references/learning-engine.md`，125 行）

- **Q1 本质**：一句**可判真假**的话。判据是能被构造反例，否则只是复述定义。
- **Q2 公式**：最小充分形式 + 每个符号的**现实所指** + 指出哪个符号一变结论就崩。
- **Q3 现实承重**：固定句式 `X 承重于 <系统> 的 <功能>`，配**消失测试**——假设它不存在，哪个系统在哪一步崩、退化成什么复杂度/带宽/错误。合格三条：具体到组件、有定量退化、可被 profiler 或报错观测。
  - 伪承重黑名单：「很重要」「用于 AI」「像大脑一样」这类。
  - **`[未定位]` 纪律**：定位不到就写待查方向，**禁止编造场景**；编一个听起来合理的场景，危害比承认未定位大一个数量级。
- **Q4 拓展进阶**：L1 上游公理 / L2 平行结构 / L3 源码 `文件:行` / L4 arXiv 前沿，每条必须可点开；**一次会话至少产出 2 条 L3/L4**，标 P1–P4 优先级（`sources.md` 检索式含 `filename:` / `path:`）。

同一文件还含：消失测试题库、锚点卡模板、间隔重复节奏 D+1/3/7/21、反面清单。

## 资料层（社区经验的落法，`references/sources.md`，67 行）

- 检索顺序：PocketWiki + 离线 ZIM → 本地盘区 → 一手社区源 → 网络。
- 来源分级 **A 一手 > B 二手 > C 三手**；C 级（博客 / B站 / 知乎）**只许用来找入口和「哪里容易错」**，结论必须回 A 核对。
- 手法：issues / errata / CHANGELOG 优先；awesome-list 只当地图；论文三段扫描法；「看不懂就找实现——跑一遍 > 读十遍」。

## 铁律与 references 变更

- 铁律 **26 → 30**，新增学习类：**27** 四问必答、**28** 拓展必给坐标、**29** 来源分级、**30 不越级 + 挂载点**（禁甩群论 / 环论 / 拓扑 / 非标准分析）。
- references **16 → 18**：+`learning-engine.md`、+`sources.md`；版本沿革移入 `references/changelog.md`（v3.1–v3.7）。**原 16 个 refs 与 26 条铁律零删除、零改写**，只重排 + 追加。

## 三端同步拓扑（重要事实，纠正了「三处手动推」的直觉）

- dsh 读 `~/.dsh/skills`，它是 **junction** → `C:/Users/27063/ai-skills`。
- `C:/Users/27063/.reasonix/skills/...` 与 ai-skills 那份是**同一个文件**（`cp` 报 "are the same file"）。
- ⇒ 真副本只有 **2 个**：`C:/Users/27063/ai-skills/bilingual-ocw-translator` 与 `C:/Users/27063/AppData/Roaming/reasonix/skills/bilingual-ocw-translator`。
- 技能生效方式：开新会话（`~/.dsh/cache/skills` 里没有本技能 cache）。

## 验收与回滚

- 验收：三端 sha256 一致（`SKILL.md` = `67c755b730ee…`，learning-engine `5cb5f6fad9cc`，sources `55e61eb1663b`，changelog `08ee8935b924`）；YAML frontmatter 解析通过（name/description，desc 428 字符）；铁律编号 1–30 齐；主文档 107 → 149 行 / 15559 bytes。
- 回滚：同目录 `SKILL.md.bak-20261022-pre-v40-ark`。

## 踩坑与教训

- **shell heredoc 单次写 >8 KB 中文会被截断**：主文档首次写到第 148 行断在半句，靠回读 + 回填救回。长文件一律分段写，并用 `wc -l` / `tail` 验证。

## 待用户拍板（未执行）

1. 主文档 107 → 149 行变长（增量全在学习层，翻译层已压缩重复叙述）。若需更短，可砍「⚡ 快速上手」表 24 行（与「按需读取」表重叠）；建议保留，它是开口时的第一跳。
2. 是否建独立入口 `ark-learning`。未建，理由：技能路由靠 `description` 不靠名字，双入口会让 `skill_search` 重复命中、噪声变大。若需要纯学习命令，可加 20 行瘦入口转发到同一份 references。
