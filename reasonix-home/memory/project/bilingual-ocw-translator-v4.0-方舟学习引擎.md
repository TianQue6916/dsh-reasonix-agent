---
id: mem-244b6ce868a21f6d964bfbf4d76213fb
revision: 1
created_at: "2026-10-22T14:19:53.393Z"
updated_at: "2026-10-22T14:19:53.393Z"
name: bilingual-ocw-translator-v4.0-方舟学习引擎
description: "翻译技能升级为「方舟学习引擎 v4.0」：四问锚点（本质/公式/现实承重+消失测试/拓展四层）+ 资料分级 A/B/C + 铁律 27-30"
metadata:
  type: user
  fact_type: project
  scope: project
---

## 终态（2026-10-22，用户拍板：目标不再只是翻译）

技能**名与目录不变**（`bilingual-ocw-translator`，保住 `/bilingual-ocw-translator` 入口与肌肉记忆），目标升为「大一统理论与第一性原理——方舟计划」的可执行实现。

### 结构（SKILL.md 149 行 / 15,559 B，sha256 前 12 位 `67c755b730ee`）
- 「一个技能，两种形态」：**A 翻译**（原 8 步流水线逐字不动）/ **B 学习**（v4.0 新主线，5 步：定锚 → 取料 → 四问 → 验证 → 落盘）
- **四问锚点**：Q1 本质（一句可判真假的话）· Q2 公式（最小充分形式 + 符号现实化 + 敏感性）· Q3 **现实承重**（句式 `<概念> 承重于 <系统> 的 <功能>` + **消失测试**三步 + 合格三条 + 伪承重黑名单 + `[未定位]` 纪律）· Q4 拓展（L1 上游 / L2 平行 / L3 实现 `文件:行` / L4 前沿 arXiv，P1-P4 优先级）
- **资料层**：检索顺序 PocketWiki+ZIM → 本地盘区 → 一手社区源 → 网络；来源分级 **A 一手 > B 二手 > C 三手**（C 只找入口）；七条社区手法（issues/errata/CHANGELOG 优先、awesome-list 只当地图、论文三段扫描、`filename:`/`path:` 检索式、看不懂就找实现）
- 核心契约 12 → **15 条**（新增 13 四问 / 14 来源分级 / 15 不越级）；铁律 26 → **30 条**（新增学习类 27 四问必答 / 28 拓展必给坐标 / 29 来源分级 / 30 不越级+挂载点）
- references **16 → 18**：新增 `learning-engine.md`（125 行，sha `5cb5f6fad9cc`）、`sources.md`（67 行，sha `55e61eb1663b`）；`changelog.md` 加 v4.0 段（sha `08ee8935b924`）。原 16 个 refs 与 26 条铁律**零删除零改写**

### 三端（实测 2026-10-22）
- dsh 读 `~/.dsh/skills` **junction → `C:\Users\27063\ai-skills`**
- ⚠️ `C:\Users\27063\.reasonix\skills\bilingual-ocw-translator` 与 ai-skills 目录是**同一份文件**（cp 报 "are the same file"）⇒ 实际只有 **2 个真副本**：ai-skills（=.reasonix）+ `AppData\Roaming\reasonix\skills`。三端 sha256 已校验一致
- 备份：`SKILL.md.bak-20261022-pre-v40-ark`（ai-skills）

### 踩坑（重要）
**单次 shell heredoc 写 >8 KB 中文会被截断** —— 本次主文档写到第 148 行断在半句，靠 `python` 回读 + 回填修好。长文件一律**分段写（每段 ≤3 KB）+ 写完 `wc -l` / `tail` / grep 锚点验证**。

### 回滚
`cp SKILL.md.bak-20261022-pre-v40-ark SKILL.md` + 删两个新 refs + changelog 删 v4.0 段，再同步 Roaming 端。

### 生效条件
dsh 启动时扫 skills 目录（`~/.dsh/cache/skills` 无本技能 cache）⇒ **开新会话即生效**；若 description 未变，重启 dsh 进程。
