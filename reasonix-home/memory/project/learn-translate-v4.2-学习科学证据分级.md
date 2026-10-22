---
id: mem-267f81a6edc53bd3052ed401e61e9ff1
revision: 1
created_at: "2026-10-22T14:32:15.282Z"
updated_at: "2026-10-22T14:32:15.282Z"
name: learn-translate-v4.2-学习科学证据分级
description: "learn-translate v4.2 补学习科学证据分级：九条学习法逐条标 [MA]/[D]，费曼无一手来源、学习风格无证据、Anki 只是调度工具"
metadata:
  type: user
  fact_type: project
  scope: project
---

## 触发（2026-10-22）

用户问「社区学习经验是否有融入?」→ 自查结论：**只融了一半**。v4.0/v4.1 融入的是**检索手法**（issues/errata/CHANGELOG 优先、awesome-list 只当地图、论文三段扫描、`filename:`/`path:` 检索式、看不懂就找实现），属于「怎么找资料」；而**学习法本身有多少证据**一条都没标，等于把社区口传当理由。已补 `references/learning-science.md`（57 行，技能第 19 个 reference）。

## 证据分级（记号借鉴 `GarethManning/education-agent-skills` 的 `evidence_strength` 字段）

[MA] meta-analysis > [RCT] > [EXP] 受控认知实验 > [CS] 经典奠基 > [OBS] 观察 > **[D] 社区口传（不得作为理由）**

## 九条学习法的判定（yaml 已落进技能，此处存摘要）

| 学习法 | 级别 | 关键一手来源 | 落地 |
|---|---|---|---|
| retrieval practice | [MA] | Roediger & Karpicke 2006；Rowland 2014：带反馈 g≈0.73 vs 不带 g≈0.39 | 复习只测本质+消失测试，**必须给反馈** |
| spaced repetition | [MA] | Cepeda et al. 2006（**254 项研究**），最优间隔随保持期增长 | D+1/3/7/21 是**启发式不是定律** |
| desirable difficulties | [EXP] | Bjork 1994 | 允许闭卷自推的卡顿 |
| interleaving | [EXP]（数学有争议） | Rohrer 系列 | 默认交错，需内化单一模板时按块并说明取舍 |
| Feynman technique | **[D]** | 无一手学术文献，常误挂费曼本人 | 外壳可留，理由重挂 retrieval practice + self-explanation |
| Zettelkasten | [D]→[OBS] | Luhmann 卡片盒 + Ahrens 书，无对照实验 | 只当检索辅助，不当记忆法 |
| Ebbinghaus 遗忘曲线 | [CS] 有硬伤 | n=1（他自己）+ 无意义音节 | 不套概念学习；只借"间隔优于集中" |
| learning styles | [MA] 无证据 | Pashler et al. 2008（89.1% 教师仍相信） | **禁用句式**「你是视觉型学习者」 |
| SM-2 / Anki | [D] 工程实践 | Wozniak 1987 实现 / 1990 硕士论文 | 当调度工具，不当学习理论 |

## 连带修正

`learning-engine.md` 间隔段改「启发式 + 必须给反馈」；铁律 29 扩到「学习法主张同样分级」；核心契约 14 同步；SKILL.md 快速上手 / 按需读取各加 `learning-science.md` 入口；`sources.md` 加第 8 节（检索手法 vs 学习法证据是两个层次）+ 两个可直接抄的社区范本（`education-agent-skills`、`Learning-Design-Alliance/learning-wiki` 的 `claims/*.md` 一条主张一个文件）。

## 认知教训

**「社区经验」有两个层次**：检索手法（工程共识，见效快）与主张的证据强弱（能被反例杀死）。只做前者 = 把 C 级当 A 级用，正是铁律 29 要防的事。同理：本技能的四问本身也是**工程假设**，标 [D]/[待证]，不是研究结论。
