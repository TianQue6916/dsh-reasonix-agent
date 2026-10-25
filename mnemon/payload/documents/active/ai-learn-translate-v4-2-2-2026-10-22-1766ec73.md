---
id: "1766ec73-bc5f-421d-9e69-74d6b976f007"
title: "人-AI 讨论协议（审稿人模式）与学习模式校准 — learn-translate v4.2.2（2026-10-22）"
description: "learn-translate v4.2.2 新增「人-AI 讨论协议」操作流程：入口三样 / 角色四档（默认审稿人）/ 产物三样 / 防 sycophancy 三策 / dsh-remote 跨模型对撞；并记录用户对学习建议的三条禁忌（不得先诊断他未做输出/复习/白纸复现，不得推荐 Anki 抽卡或重排日程）与「检索-重建型」薄层设计。前序文档：57cf1803（v4.2.1 证据修订）、d5c14916（v4.1/v4.2 证据分级）。"
status: "active"
created_at: "2026-10-22T14:56:00.085Z"
updated_at: "2026-10-22T14:56:00.085Z"
content_hash: "58ba3d22c3187ce143a8e1445bbb86a8d82552a1fa19ec1b705f3803091ee40f"
source_paths:
  - "ai-skills/learn-translate/SKILL.md"
  - "ai-skills/learn-translate/references/learning-engine.md"
  - "ai-skills/learn-translate/references/learning-science.md"
  - "ai-skills/learn-translate/references/sources.md"
  - "ai-skills/learn-translate/references/changelog.md"
session_ids:
  - "6a26ac40-3fde-4401-9cdd-a574246618ef"
memory_body_ids:
  []
---

# 人-AI 讨论协议 v4.2.2 与学习模式校准

> 2026-10-22 会话产物。前序：`57cf1803-fda1-47b9-bfcd-405433de6b59`（v4.2.1 误引纠正与七条配额）、`d5c14916-1991-4821-a1bb-a6652c688941`（v4.1/v4.2 证据分级）。

## 1. 触发：一次被用户逐条驳回的建议

用户问「我现在的学习模式你是否有好的建议，注意社区经验」。助手给出七条配额（闭卷产出块、按目标天数反推复习间隔、白纸复现、6.431 与实分析物理隔离、CS144 提前留 checkpoint 4 缓冲、卡点每周重攻 3 个、笔记标题写断言句）。用户逐条反驳：

- 「思考与学习进阶与学习现在应用的工业、商业化算法不算输出吗」——生成性输出本就是主轴；
- 「没有复习，我的复习就是学习新知识遇到以前学过的，越重要的越常用的遇到的越多」——**伴随式复习（retrieval by use）**；
- 「所谓的白纸复现，更是我的家常便饭」；
- 「日程，我自有计划：每周一三五数学，二四六计算机，周末小副科」。

**结论：先诊断“他没做某事”、再给建议，是错误顺序。** 正确顺序是**先问机制，再定位缺口**。

## 2. 三条建议禁忌（用户校级约束）

1. 不得把「输入多」诊断为「输出少」——生成性输出（推导、设计、接工业算法）已存在且是主轴；
2. 不得推荐 Anki 式卡片抽卡、不得重排其日程（一三五数学 / 二四六 CS / 周末副科 是既定周期）；
3. 不得假设他「没在复现/没在自查」——白纸复现是日常动作，缺的是**对照**而非动作。

## 3. 诊断命名与薄层（`[判断]` 级，非 RCT）

**检索-重建型**：大脑只存骨架与索引，细节按需从公理重建。对研究极优（跨课程连接强），对覆盖型考试有结构性弱点（考“非常用项 + 限时提取”）。

伴随式复习的唯一结构洞：**只能复习你会遇到的东西**，而“会不会遇到”由工作流决定、不由重要性决定 ⇒ 漏掉的是低频但必考项（6.431 冷门变换与条件期望变形、CS144 零窗口/乱序重叠/RST 等边界）。

不改造主循环，只并挂薄层（合计 < 2 小时/月）：

| 薄层 | 频率 | 耗时 | 作用 |
|---|---|---|---|
| 盲区扫描 | 每两周 | 20 min | 用 TOC + PSet 清单 + 教材索引，只圈“从未主动遇到过”的条目；不复习、不记忆，只产清单 |
| 外部裁判 | 每两周 | 一次 PSet / lab | 官方解答、acceptance test、RFC 一致性要求，或 AI 以对抗方式挑推导 |
| 限时提取 | 每月 | 25 min | 从盲区清单随机抽 3 个，闭卷写「本质 + 承重 + 反例」 |

## 4. 人-AI 讨论协议（已落技能）

对话定位：用户的推理引擎 + 一个外部裁判。协议分四段：

**入口三样**（提问时带）：① 我的当前版本（哪怕是错的/半截的）② 卡在哪一步 ③ 试过什么。目的是让讨论成为带反馈的自测，而不是单向输入。

**角色四档**（由用户显式指定，默认第一档）：

| 指令 | 行为 | 场景 |
|---|---|---|
| 审稿人（默认） | 只挑错、给反例、指缺口，不给完整答案 | 用户已有版本 |
| 对手 | 站反面构造最强反驳 | 自认想通、需验伪 |
| 扫描器 | 按 TOC / PSet 清单找“从未遇到过”的 | 补覆盖偏差 |
| 同伴 | 一起推，允许给中间步骤 | 空白领域或时间紧 |

**产物三样**：四问锚点卡 + 卡点 + **「如果要推翻它，从哪里下手」**。第三样是核心，缺它则知识是“被说服的”而非“被审查过的”。

**防 sycophancy 三策**（结构性，不依赖 AI 自觉）：
1. 每条结论标来源级别 A 一手 / B 教材 / C 社区 / `[判断]`；
2. 定期抽一条旧结论命令 AI 当场尝试推翻（自攻通常比被问出来更彻底）；
3. 推导必须可独立复核（能自己证/跑一遍），否则标 `[未核实]`。

**跨模型对撞**（每周一次）：

```
dsh-remote -m deepseek-v4.1-flash -e max "独立推导：<问题>。不要参考任何既有答案，给出你的完整推导与结论。"
```

两套独立推导的分歧点比共识点信息量大一个数量级。

**AI 方短板**：看不到纸面推演（不写进对话就无法裁判）；上下文会压缩（落盘是记忆补丁）；只能判断“这段写对了没有”，不能判断“你会了没有”。

## 5. 证据锚点（本轮已核到 DOI 级）

- 自测效应：Rowland 2014, *Psych. Bull.* 140(6), DOI `10.1037/a0037559`，g = 0.50, 95% CI [0.42, 0.58]；带反馈更强（但“0.73 vs 0.39”已判定为二手混引——0.73 疑为 Hattie 2009 的 feedback 效应量，量纲不同，已撤回）。
- 课堂场景：Yang et al. 2021, *Psych. Bull.* 147(4):399–435（222 项研究 / 48,478 名学生）。
- 间隔：Cepeda et al. 2006，最优间隔 ≈ 保持期的 10–20%，平均 d ≈ 0.42（254 项研究）。
- 效用分级：Dunlosky et al. 2013, *PSPI* 14(1):4–58（practice testing + distributed practice = high utility）。
- 学习风格匹配无证据：Pashler et al. 2008（但 89.1% 教师仍相信）。
- 交错练习：Rohrer, Dedrick & Stershic, DOI `10.1037/edu0000001`（cluster RCT）；当题型高度可区分时 blocked 反而更好，新手在任何策略之前交错会超载工作记忆 ⇒ 采用**晚交错、按需交错**。**注**：“检索-重建型”二分与“伴随式复习利研究不利考试”均为 `[判断]`，无直接 RCT，可被用户反驳。

## 6. 落盘状态

- 技能 `learn-translate` v4.2.2：`references/learning-engine.md` 179 行，末节新增「人-AI 讨论协议」；`SKILL.md` 按需读取表加入口，默认角色审稿人。
- 三端 sha 一致：`SKILL.md` `3f1bda3971`，`learning-engine.md` `0cf01b3e44`（`ai-skills` / `AppData\Roaming\reasonix` / `.reasonix\skills`）。
- 记忆落盘：global 记 `人-AI讨论协议-审稿人角色与防sycophancy`、`用户学习模式-检索重建型与伴随式复习`；project 记 `learn-translate-版本索引与三端状态`（均为 reasonix memory 文件，非本 Document 层）。

## 源路径

- `C:/Users/27063/ai-skills/learn-translate/SKILL.md`
- `C:/Users/27063/ai-skills/learn-translate/references/learning-engine.md`
- `C:/Users/27063/ai-skills/learn-translate/references/learning-science.md`
- `C:/Users/27063/ai-skills/learn-translate/references/sources.md`
- `C:/Users/27063/ai-skills/learn-translate/references/changelog.md`
