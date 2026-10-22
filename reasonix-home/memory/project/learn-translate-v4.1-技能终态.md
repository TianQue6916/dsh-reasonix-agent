---
id: mem-e8fc70074703ce3cce513ed01f2f00a2
revision: 1
created_at: "2026-10-22T14:25:21.679Z"
updated_at: "2026-10-22T14:25:21.679Z"
name: learn-translate-v4.1-技能终态
description: "技能改名 learn-translate（原 bilingual-ocw-translator）v4.1：双形态、四问锚点、30 铁律、18 references；三端实为 2 副本"
metadata:
  type: user
  fact_type: project
  scope: project
---

## 终态（2026-10-22，取代 fact `bilingual-ocw-translator-v4.0-方舟学习引擎` 的命名）

技能**改名 `learn-translate`**（用户拍板「新的技能名为 learn-translate 算了」），入口 `/learn-translate`；旧名 `bilingual-ocw-translator` 退役、不保留别名（避免 skill_search 双命中）。

### 位置与三端（2026-10-22 实测，重要）
- dsh 读 `~/.dsh/skills` → **junction → `C:\Users\27063\ai-skills`**
- `C:\Users\27063\.reasonix\skills\learn-translate` 与 `ai-skills\learn-translate` **inode 相同**（1688849861280329，非 symlink/非 hardlink 列表可查，实测改名后两侧同名同步变化）⇒ 算**同一份**
- 真副本只有 **2 个**：`ai-skills`（=.reasonix）+ `AppData\Roaming\reasonix\skills\learn-translate`
- 三端 SKILL.md sha256 一致；`skill_search("learn-translate")` **当场命中，无需重启 dsh**（provider 实时扫目录）
- 备份：`ai-skills/learn-translate/SKILL.md.bak-20261022-pre-v40-ark`（v3.7 原版）

### v4.1 内容（160 行 / 16,934 B）
- 形态 A 翻译（原 8 步流水线逐字不动）+ 形态 B 学习（5 步：定锚 → 取料 → 四问 → 验证 → 落盘）
- **四问锚点**：Q1 本质（可判真假的一句）· Q2 公式（最小充分形式 + 符号现实化）· Q3 **现实承重**（`X 承重于 <系统> 的 <功能>` + **消失测试** + 合格三条 + 伪承重黑名单 + `[未定位]` 纪律）· Q4 拓展（L1 上游 / L2 平行 / L3 实现 `文件:行` / L4 arXiv，P1-P4）
- 资料层：检索顺序 PocketWiki+ZIM → 本地盘区 → 一手社区源 → 网络；分级 **A 一手 > B 二手 > C 三手**
- 核心契约 15 条 / 铁律 **30 条**（27 四问必答 / 28 拓展必给坐标 / 29 来源分级 / 30 不越级+挂载点）
- references **18 个**：新增 `learning-engine.md`（125 行）、`sources.md`（67 行）
- 新增「🧩 与相邻技能的边界」表：course-summarizer（整书 / 全局）、learning-method（名词）、tool-offline-wiki（工具）、thinking-modes（输出风格）各管一段，本技能管**单点四问**
- description 压缩 468 → 342 字符（去掉自名冗余，触发词全保留）

### v4.1 修正的三处旧病
1. 铁律 21 原写「Reasonix 不派任何子代理」（Reasonix 时代措辞）→ 改「宿主内建子代理一律不用（Reasonix / dsh 同规），全转主力机 `dsh-remote`」
2. 输出路径原来只有小电脑 Linux 路径（`/home/tianque/桌面/...`），主力机实际在用却没写 → `§A2` 加主力机表
3. 锚点卡原先无落盘路径 → 定为 `C:/Users/27063/Desktop/课程文件/锚点卡/<课程>/<概念>.md`，Anki tsv `_anki/<课程>.tsv`（Desktop 实测只有 `工具箱/程序/课程文件` 三个目录，**没有** `课程笔记`，故落在课程文件树内，随课程 repo 一起备份）

### 踩坑
单次 shell heredoc 写 >8 KB 中文会截断（v4.0 主文档断在第 148 行半句）。长文件一律分段写（每段 ≤3 KB）+ `wc -l`/`tail`/grep 锚点验证；含反斜杠路径的 python 三引号用 `r"""..."""` 否则 `\U` 转义报错。
