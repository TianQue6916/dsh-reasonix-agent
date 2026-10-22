# 资料层：一手优先 + 社区经验（v4.0 新增）

> 本文件是 SKILL.md「📡 资料层」的展开。**任何「讲透」之前先过这一层**——凭印象讲是最大的作弊。

## 1. 固定检索顺序（不要跳步）

1. **本机 PocketWiki + 离线 ZIM**（已有知识先耗尽，零成本零延迟）
2. **课程仓库 + 本地盘区**（讲义 / 教材 PDF / 字幕 / 往期笔记）
3. **一手社区源**（官方 docs、源码、论文、errata、awesome-list）——主力机 dsh 可代跑检索与摘要
4. **网络搜索**（`web_search`，三源聚合）
5. 以上全空 → 标 `[未核实]`，把检索式写进待查，**不要用记忆补洞**

## 2. 本机可用源（真实地址，勿猜）

| 源 | 位置 / 地址 | 用途 |
|---|---|---|
| PocketWiki + 离线 Wikipedia | `100.79.96.82:8810`（Linux 侧） | 术语、概念、年表的第一站 |
| 课程视频与字幕 | `/media/OS/课程文件/{实分析,算法导论6.006,概率导论,算法进阶}` | 老师讲法、口述直觉 |
| 课程讲义/笔记 repo（约 20 个 git repo） | `/media/OS/linux-home/课程资料` | 往期笔记与习题 |
| `web_search` provider | `local-wiki-github`，rank `github(0) > deepseek(1) > wiki(2)` | 找 GitHub 仓库与官方文档 |
| 主力机 dsh | `dsh-remote -m deepseek-v4.1-flash -e <off/low/high/max>` | 大批量检索、摘要、交叉核对 |

⚠️ 本机 CLI 不走 system proxy，`curl` 打外网域名常 `http_code=000`；需要真联网时走浏览器（Edge headless）或 `web_search`，别浪费时间在 curl 上重试。

## 3. 一手源清单（按学科，写进锚点卡时直接引用）

| 学科 / 主题 | A 级一手源 |
|---|---|
| 数学与理论 CS | arXiv（`arxiv.org/abs/<id>`）、作者主页讲义与 PSet/solution、教材官方 errata、MIT OCW 课程页（notes + assignments + solutions） |
| 系统 / 网络 / 体系结构 | 源码本体（`linux/`、`glibc`、`redis`、`sqlite`）、RFC 文本、ISA manual、commit message 与 `git blame` |
| 算法 | CLRS 官方 errata、竞赛/评测题解（Codeforces / OJ）、原论文（Dijkstra 1959、Hoare 1961 一类） |
| 概率 / 信息论 | Bertsekas 官网补充题解、Cover & Thomas 勘误、原始论文 |
| 线代 / 优化 | Strang 官网讲义与习题解、Boyd 公开 PDF 与 CVX 示例 |
| 工具与工程 | 官方文档（不是二手教程）、`CHANGELOG`、`issues` 里的 maintainer 回复 |

## 4. 来源分级（每条补充内容都要标，铁律 29）

| 级 | 包含 | 能用来做什么 | 判据 |
|---|---|---|---|
| **A 一手** | 论文原文、源码与 commit、官方文档、标准（RFC / ISA manual）、教材 errata、作者本人讲义与 PSet solution | 可以直接支撑结论 | 作者即原始产出者，可被独立复核，有版本与勘误机制 |
| **B 二手** | 教科书、综述、他人课程讲义与笔记 | 用来建立结构、找术语、定位章节 | 有转述、有简化，可能有错 |
| **C 三手** | 博客、视频、论坛、知乎、B站、AI 生成内容 | **只用于找入口、术语、直觉、"哪里容易错"** | 结论必须回 A 核对，否则标 `[未核实]` |

**一条硬规矩**：C 级内容永远不能作为「这条定理成立」的依据；它最多告诉你「去读哪一篇 A 级」。

## 5. 社区经验手法（可直接照做）

- **先看官方仓库的元信息**：`issues`（别人踩过的坑）→ `errata`（作者自己承认的错）→ `CHANGELOG`（行为何时变了）。三者常比任何教程更新更准。
- **awesome-list 只当地图**：`awesome-<topic>` 用来知道这个领域**真实存在**哪些实现、课程、书；不要把它当结论。
- **论文三段扫描法**：abstract → 所有图和图注 → conclusion。三段读不出「它在攻击什么问题」就换一篇，不要硬读证明。
- **检索式写法**：`filename:` / `path:` 限定 GitHub，`site:` 限定来源，引号锁精确短语；把「X 是什么」改成「为什么 X 在 Y 条件下必须满足 Z」——后者能命中真正的讨论。
- **提 issue 前的自检**：最小复现 + 版本号 + 我已排除的可能。社区回答质量与你问题的精度成正比。
- **教材读法**：目录 → 每章引言（作者自述要解决什么问题）→ 每章总结，三段定完再决定读哪一节正文。这是 `course-summarizer` 的「设计问题驱动」在地基层的用法。
- **看不懂就找实现**：跑一遍 > 读十遍。同概念的可运行玩具实现（几十行）比任何解释都快。

## 6. 降级链（查不到时按顺序降，不许硬编）

`A 级原文` → `作者主页 / 官方文档` → `B 级教材对应章` → `L3 实现源码` → `社区提问（Stack Exchange / issue）` → 标 `[未核实] + 检索式` 并写明下次怎么查。

## 7. 记录格式（进锚点卡或笔记末尾）

```
资料记录
- [A] Bertsekas & Tsitsiklis, Introduction to Probability, §1.2  —— 概率空间三公理定义（2026-10-22 核对）
- [L3] linux/mm/memory.c:2621  do_wp_page()  —— 写时复制的实际触发点
- [C] 某 B 站视频 —— 只用于建立「页表是什么」的第一印象，结论未采信
```

## 8. 学习法主张的证据（v4.2 新增，与检索手法分开）

本文件前面七节讲的是**怎么找资料**（检索手法）。**「某个学习法到底有没有证据」是另一件事**，见 `references/learning-science.md`。
一句话区分：**检索手法错了浪费时间；学习法证据错了会浪费一整年。**

可直接抄的两个社区范本（2026-10-22 核对存在）：

| repo | 值得抄什么 |
|---|---|
| `GarethManning/education-agent-skills` → `skills/memory-learning-science/spaced-practice-scheduler/SKILL.md` | 把 `evidence_strength` / `evidence_sources` 做成 skill 的一等字段，而不是散在正文里说「研究表明」 |
| `Learning-Design-Alliance/learning-wiki` → `claims/*.md` | 一条主张一个文件（如 `learning-styles-matching-does-not-improve-learning.md`），每条挂来源与反例；主张必须可被反例杀死 |
