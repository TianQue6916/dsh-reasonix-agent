---
id: "135c4e3d-6267-4bc6-a314-9c015bfdefde"
title: "learn-translate v4.2.2 / v4.3：人-AI 讨论协议与讲解用图标准（2026-10-22）"
description: "learn-translate 技能 v4.2.2/v4.3 两处新增产物的可复用规范：人-AI 讨论协议（角色四档、入口/产物三样、防 sycophancy、跨模型对撞）落进 references/learning-engine.md；讲解用图标准（coherence/signaling/contiguity/一图一主张/caption 五条可判定判据 + 数学图专规 + 色盲调色板 + 黑白打印约束）新建 references/figures.md 并升为铁律 31。前序：57cf1803（v4.2.1）。"
status: "active"
created_at: "2026-10-22T15:21:24.006Z"
updated_at: "2026-10-22T15:21:24.006Z"
content_hash: "cda1eb716b4d7e85fe606628f4a23fa1091daabb7c93c4f564297c0e9c420b87"
source_paths:
  - "ai-skills/learn-translate/SKILL.md"
  - "ai-skills/learn-translate/references/figures.md"
  - "ai-skills/learn-translate/references/learning-engine.md"
  - "ai-skills/learn-translate/references/learning-science.md"
  - "ai-skills/learn-translate/references/changelog.md"
session_ids:
  - "705aea02-b136-46a9-8d16-91fc0f245c0e"
memory_body_ids:
  []
---

# learn-translate v4.2.2 / v4.3（2026-10-22）

前序文档：`57cf1803-fda1-47b9-bfcd-405433de6b59`（v4.2.1 误引纠正 + 学习模式配额）、`d5c14916-1991-4821-a1bb-a6652c688941`（v4.1/v4.2 证据分级）、`bc0d557c-88c3-43cd-9ba6-ff27a80548c5`（v4.0 学习引擎架构）。

本档只记两处新增产物，不重复 v4.0→v4.2.1 已有的四问锚点、资料分级 A>B>C、证据分级体系。

## 一、人-AI 讨论协议（v4.2.2）

触发：用户指出「核心就是我的脑袋和 ai，我遇到的难问题都会和你讨论」——关系定位从「学习工具 + 使用者」改为「推理引擎 + 外部裁判」。用户明确同意「这些你可以计入记忆」并要求落进技能。

落点：`references/learning-engine.md` 末节（该文件 179 行），`SKILL.md` 按需读取表加入口，**默认角色 = 审稿人**。

### 入口：带「你的版本」来问（三样）

1. 当前版本（哪怕错、半截）
2. 卡在哪一步（例：「推到第 3 步，不确定能否交换极限」）
3. 试过什么（例：「用反证试过，卡在构造」）

理由：带版本的提问才构成**带反馈的自测**；不带版本时 AI 只能给「我的答案」，那是输入不是用户的知识。

### 角色四档（由用户显式指定，不靠 AI 自觉）

| 指令 | 行为 | 使用时机 |
|---|---|---|
| **审稿人（默认）** | 只挑错、给反例、指缺口，不给完整答案 | 用户已有版本 |
| 对手 | 站反面，构造最强反驳 | 自认想通了、要验伪 |
| 扫描器 | 按 TOC / PSet 清单找「从未遇到过的」 | 补覆盖偏差 |
| 同伴 | 一起推，允许给中间步骤 | 完全空白领域或时间紧 |

### 产物：每次结束留三样

锚点卡（四问）+ 卡点 + **「如果我要推翻它，从哪里下手」**。第三样是对抗种子兼下次复习钩子；缺它则知识是「被说服的」而非「被审查过的」。

### 两条必须结构性防的失效

1. **AI 会顺着用户说**（长对话中倾向同意框架、把模糊说法补成完整理论）。对策不靠自觉，靠结构：结论标注来源级别（A 一手 / B 教材 / C 社区 / `[判断]`）；定期抽一条旧结论命令 AI「现在试着推翻它」；推导必须用户能独立复核，否则标 `[未核实]`。
2. **用户的知识会长成 AI 的形状**（AI 的偏差——偏爱整洁因果链、把历史讲成必然——会静默传染）。廉价解法：主力机 dsh 独立推一遍再对撞。

```
dsh-remote -m deepseek-v4.1-flash -e max "独立推导：<问题>。不要参考任何既有答案，给出你的完整推导与结论。"
```

两套独立推导的分歧点即真问题——**分歧点信息量比共识点大一个数量级**；每周一次即可。

### AI 自身三条短板（已写进技能）

看不到纸面推演（用户不写出来就无法裁判）；上下文会被压缩（故「落盘」是记性补丁不是仪式）；只能判断「这段写对了没有」，不能判断「你会了没有」（前者是后者的必要非充分条件）。

## 二、讲解用图标准（v4.3）

触发：用户「记得在技能里面写明，帮助理解的图像也有很高要求，具体的可以参照社区经验」。先做 web 检索取证（learning-wiki 的 coherence / contiguity / signaling / seductive-details 条目、CUD 调色板、Tufte 失败模式清单），再写规范。

落点：新建 `references/figures.md`（73 行）+ **铁律 31** + 契约第 16 条；`SKILL.md` 路由表把两类图拆开：

| 图 | 走哪 |
|---|---|
| 原书插图（保留 / bbox 裁切） | `image-pipeline.md` + 铁律 26 |
| 帮助理解的图（讲透概念时自创） | `figures.md` + 铁律 31（新） |

### 五条硬标准，每条都能当场判对错

| # | 标准 | 判据 |
|---|---|---|
| 1 | coherence | 指图上任一元素问「删掉它读者会失去什么信息」——答不出就删 |
| 2 | signaling | 遮住标题只看图，还能指出重点吗？不能就加箭头/高亮/编号 |
| 3 | contiguity | 有「编号①②③ + 远处对照表」即不合格，改贴标注 |
| 4 | 一图一主张 | 能用一句主张概括吗？不能就拆帧（帧间只变一个量） |
| 5 | caption = 主张句 | 图注抽出应**可被反驳**；「某某示意图」不合格 |

### 两条针对本用户工作流的硬约束

- 用户打印讲义 ⇒ 线型（实/虚/点划）与标记形状承担区分，颜色只作辅助，**黑白打印必须可分辨**
- 色盲友好调色板直接给色值：Okabe-Ito；Paul Tol high-contrast `#DDAA33 / #BB5566 / #004488`；CUDO accent `#FF4B00 / #F6AA00 / #03AF7A / #005AFF / #4DC4FF`；禁止红绿对比作唯一区分

### 数学图专规 + 交付规范

截断轴必标 break（Tufte 列的头号失败模式：spreadsheet 自动缩放）；多子图共享 min/max；离散量不画光滑曲线；误差与样本数必须画；对数轴须标注。交付：源码必须入库 `assets/src/*.py|.html|.tex`，禁只交裸 PNG；文件名写主张（`<概念>-<它说明什么>.svg`）。

### 证据级别（沿用 `learning-science.md` 体系）

多媒体原则整体 **[MA]**；coherence **[EXP]**（Mayer et al. 2001，三实验，加入无关材料降低理解）；seductive details **[EXP] 效应小**（诚实标注）；contiguity/signaling 属效应较大的几条，对新手 + 复杂材料最大；Tufte 清单与调色板为 **[D]/[OBS]** 工程规范，但零代价、方向明确。

出处（均在 checkpoint 内取证）：learning-wiki 的 `claims/coherence-principle-irrelevant-material-hurts-learning.md`、`principles/contiguity.md`、`principles/signaling.md`、`claims/seductive-details-effect.md`；`sksat/bambu-rs` 的 color-universal-design SKILL（CUD 色值）；`DailyForkCast/osint-foresight` 的 DATA_VISUALIZATION_BEST_PRACTICES_MASTER（Tufte 失败模式）。

## 三、验收与状态

- `SKILL.md` **174 行**；references **20 个**（+1 个 `.bak`）；`changelog.md` 有完整 v4.3 段
- 三端 sha 一致：`SKILL.md` `379dd4a64b` / `figures.md` `dfbe5f3663`（三端 = `ai-skills/learn-translate`、`AppData/Roaming/reasonix/skills/`、`.reasonix/skills/`，实为 2 副本 + 1 junction）
- 项目记忆里的版本索引 fact 已更新到 v4.3（此前 v4.2.2 时为 `3f1bda3971` / `0cf01b3e44`）

## 四、过程教训

1. **写入失败：python stdin heredoc 内嵌含引号的中文串** → `SyntaxError: invalid syntax. Perhaps you forgot a comma?`（event 801）。长段中文 Markdown 不能用 python 管道 heredoc 传，改用文件式写入或分段 sed 追加。
2. **路由不清会混标准**：v4.2 前「原书插图」与「自创讲解图」共用 `image-pipeline.md`，导致图标准无处安放；拆成两条路由后每条判据才有落点。
3. **证据落地顺序**：用户提「参照社区经验」时先检索取证再写规范，避免把印象写成标准（与 v4.2.1 那次「0.73 vs 0.39」二手误引同类）。
