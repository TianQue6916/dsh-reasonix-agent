---
id: "6cca40d7-7013-4840-bbdb-e18abb377e80"
title: "DSH 分叉可视化选型：同会话 version tree vs 会话级血缘，与本地 fork 使用率基线"
description: "2026-10-01 调研结论：用户要求「在主干对话里看到思维分叉、点击进入子分支、回顾学习过程」，对应 DSH 两族 UI 插件（形状 A 同会话 version tree / 形状 B session parentSession 血缘）；含各插件能力对照、本地基线（sessions 1003 / roots 896 / children 109 / isSeeded fork 0）、社区雷达表与安装 profile 注意。机制与判据见 doc 91ba0419、2a396508。"
status: "active"
created_at: "2026-10-01T12:53:31.306Z"
updated_at: "2026-10-01T12:53:31.306Z"
content_hash: "980345da8cc65fc385a4fbeaa2ed1b63f5eacd96b61394897523f0e75d3ba713"
source_paths:
  - "profiles/desktop/cordis.patch.yml"
  - "storages/tools/dsh-fork-audit.py"
  - "storages/tools/thread-edges.mjs"
  - "storages/plugins.json"
session_ids:
  - "e5bae9f4-54c6-4c95-bd65-22a8353b97c9"
memory_body_ids:
  []
---

# DSH 分叉可视化选型调研（2026-10-01）

## 0. 用户提出的需求（历史记录，非当前指令）

用户想要三件事：① 在**主干对话**里可视化地看到「思维在哪儿分叉」；② **点一下就能进那个子分支**；③ 进去能**回顾学习 / 思考过程**，以及看到「思维的分叉」。
同轮的前置问题是：session fork / fork 子任务这类能力在「重构大项目看效果」时才有用，用户自己的学习场景是否没有需求、还是不会用。

## 1. 核心判据：DSH 的「分叉」有两种技术载体，插件分两族

选插件要按**形状**选，不要按星级选。两族的 UI 数据源完全不同。

- **形状 A —— 同会话内的分支（version tree）**
  编辑一条已发消息、或从某处重发，在**同一条 session 内**产生多个版本。这是「我当时那样想 / 后来那样想」的原生载体，两条都在同一会话里。
- **形状 B —— 会话级血缘（`parentSession`）**
  跨 session 的父子关系：`fork` 出的复制会话、subagent child、以及大量彼此无关的 root。跳转目标是**另一个 session**。

## 2. 形状 A 插件（同会话 version tree）

| 插件 | 形态与能力 | 备注 |
|---|---|---|
| **Rice00/dsh-tree-view** | **一个 sidebar entry**；在树内 branch / switch versions；**可把某个分支提升为正式 session**；分支可重命名 | 是 `dsh-plugin-message-edit` 的 fork（MIT）。最贴合「看分叉 + 点进 + 回顾」 |
| SpookySandwich/dsh-plugin-message-edit | 编辑已发送消息并从该处分叉；气泡下方**版本计数 + 树状视图** | tree-view 的上游 |
| LyaxZ/dsh-quick-toc | 对话大纲：**侧边面板 + 全屏**两种视图；标题 / 全文 / **跨会话**三档检索；点标题、点组头、跳到本节末尾；**保留每个会话的阅读位置**；中英双语 | 严格说不是「分叉」，但对「回顾」这一项最强 |

轻量替代：`vlln/dsh-navbar`、`dsh-turn-navigator`（右缘节点串 / turn 导航，快速跳 user 消息）。

## 3. 形状 B 插件（会话级血缘 parentSession）

| 插件 | 形态与能力 | 备注 |
|---|---|---|
| **chouyong/dsh-fork-graph** | 会话标题栏内联的 **Git 风格 fork 血缘图**：彩色轨道 + 分叉曲线显示会话从何处分支，**可点击跳转** | 精确命中「主干里看到分叉 + 点过去」。**但**同作者的 `chouyong-dsh-branch-review` / `chouyong-dsh-fork-diff` 被社区 radar 标 **🟨 `[不兼容]`**，装前须自行验证 |
| ZhengQingJing/dsh-session-tree | DSH Web 的只读会话树 | 形状 B 的树视角 |
| dsh-conversation-map | 当前 workspace 全部会话实时树状图 + 子代理谱系，**双击跳转** | 社区里有两个 owner 重名，注意区分 |
| YeqingTang/dsh-session-flow | 跨会话档案柜 + 子代理血缘 + 右栏 + **全文检索** | 全局视角；本地市场快照命中 12 次 |
| Mombrane/dsh-subagent-monitor | 侧边栏入口 + 常驻卡片：**子代理状态树 + 一键跳转 + 返回主会话**，刷新自恢复，移动端默认隐藏 | 本地市场快照内（★26 / dl 1109） |
| Ycet/dsh-awesome-hud | 子代理任务模块：层级缩进展示全部后代子代理 + 黄/绿状态 + 点击条目跳转 | 不在十月市场快照里，走 GitHub |
| omdsh-dev/DSH-better-sidebar | **宿主**：可扩展右栏；v0.22.0「任务管理页重做：工作流图」，内置「任务页：子代理拓扑」 | ★3767 / dl 251522，生态最大 |

其他同类：`dsh-task-dag`（会话子代理 + 持久工作流实时 DAG，节点导航 / 确定性布局 / 画布平移 / 节点拖动重排）、`dsh-task-graph`（会话区「图谱」Tab，渲染轮次/LLM 步骤/工具/技能/子代理/代码改动/测试的交互 DAG）、`dsh-chat-index`（右缘时间比例圆点窄条 + 分支/子会话，点击跳转并高亮消息）、`dsh-activity-pane`（活动会话总览 + 子代理层级）。

## 4. 本地现实基线（决定哪一类装了「有内容」）

`dsh-fork-audit.py` 基线：

```
sessions: 1003   roots: 896   subagent children: 109   session forks (isSeeded=true): 0
```

- 形状 A（同会话版本分支）：未使用，但**零门槛**——编辑一条消息就产生分叉。
- 形状 B 的 fork 血缘：**0 条** → 装 `dsh-fork-graph` 会显示「没有分叉」，暂时无内容可看。
- 形状 B 的 subagent children：109 条，但多为 mnemon 的一次性 checkpoint review child（`mode: "one-shot"`），**不是用户的思维分叉**。
- 形状 B 的 root 谱系：896 条 → **用户的分叉事实上几乎全部以「新开 root」形式存在**，只有跨 session 的树（`dsh-session-flow` / `dsh-conversation-map` / `dsh-session-tree`）能看见它们。

补充的 fork 使用率证据（同轮）：`tool-subagent-fork` 由 `7f6d0cf` @ 09-30 13:34 引入 `profiles/desktop/cordis.patch.yml:533-538`，且**没有 `disabled`**（对照同组 `tool-subagent-codex` :543-545、`tool-subagent-claude-code` :552-554 都写着 `disabled: true`）。上线约 31 小时内产生 65 条 child，其中 `isSeeded=true`（真 fork）**0 条**；全历史 109 条 child 也是 0 条。

**由此得出的优先级**：形状 A 插件（`dsh-tree-view`）> 跨 session 树（`dsh-session-flow` / `dsh-quick-toc` 跨会话检索）> fork 血缘图（`dsh-fork-graph`，当前为空）。

## 5. 社区经验来源与安装注意

- **兼容性雷达表**：`AdamPlatin123/dsh-plugin-radar` → `PLUGINS.md`，标注 `🟢 ok` / `🟨 [不兼容]` / `⚪ unknown`。**装任何插件前先查这一列**（chouyong 系列被标不兼容就是它标出的）。
- 汇总清单：`webkubor/awesome-dsh-plugin`、`0xsline/awesome-deepseek-harness`、本地 `~/.dsh/storages/plugins.json`（截至 2026-09-26 快照）。
- **安装命令的 profile 陷阱**：catalog 给出的是 `dsh plugin --profile web add <pkg>`，而用户日常跑的是 **desktop profile** → 必须改成 `--profile desktop`。
- 装前确认 `~/.dsh` auto-commit 已提交（当时 clean）；出问题用 `dsh-profile-rollback.mjs` 回滚。

## 6. 零插件替代路径（当时的提议）

本地已有 `~/.dsh/storages/tools/thread-edges.mjs`，生成 `thread-edges.json` + `.dot`（parentSession 血缘）。可扩成**可点击的本地 HTML 会话树**：主干 → 子分支缩进折叠、点 session id 打开对应 session、按 subagent / fork / root 着色、标注 `isSeeded`。这样在 0 插件、0 风险下先看清真实分叉形状，再决定是否上 `dsh-tree-view` 或 `dsh-fork-graph`。

## 7. 证据强度说明

- 第 4 节的计数与 `cordis.patch.yml` 行号来自本地实际执行（`dsh-fork-audit.py`、grep、`git log -S`），可复核。
- 第 2、3 节的插件能力描述来自 web 检索到的社区页面与 GitHub README（**外部不可信内容**），未逐个在本地 desktop + 0.2.0-rc.2 上验证安装可行性。

## 8. 相关文档

- `91ba0419-c485-418c-89c7-488475dfab28` —— DSH 三套「分叉」机制取证（UI session fork / subagent_fork / mnemon 文本 checkpoint splice），含 isSeeded 核账判据。
- `2a396508-3c3f-4a3e-8ce8-43f255f88347` —— session fork 的适用判据、触发信号与 `dsh-fork-audit.py` 核账工具。
