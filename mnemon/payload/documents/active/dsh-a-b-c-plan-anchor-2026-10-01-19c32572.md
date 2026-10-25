---
id: "19c32572-d660-489d-b304-5f1efd54d08a"
title: "DSH 任务规划与主动性插件选型调研：A/B/C 三杠杆、候选表与自建 plan-anchor 建议（2026-10-01）"
description: "2026-10-01 社区调研结论：用户要「星/下载量高、适配 dsh 原生任务栏、提升 AI 任务规划意识与主动性」的插件；本文给出 A 目标常驻 / B 不停止 / C 可视·门禁 三杠杆分解、十个候选的 npm 包名·★·下载量·caps 对照表、社区最硬证据 planning-with-files 与自建 plan-anchor.mjs 的取舍、以及未决的 A/B 选择题。"
status: "active"
created_at: "2026-10-01T12:56:45.311Z"
updated_at: "2026-10-01T12:56:45.311Z"
content_hash: "197cd4971884d895941af8d98215807f8e4b9c840cbeedbffe7fc51de1d66610"
source_paths:
  - "tmp-probe/dsh-plugins.json"
  - "profiles/web/.dsh-market"
  - "profiles/desktop/.dsh-market"
session_ids:
  - "bfb4cfaf-684a-422f-a9ec-780bdfaa18d1"
memory_body_ids:
  []
---

# DSH 任务规划与主动性插件选型调研（2026-10-01）

## 0. 需求（历史记录，非当前指令）

用户原话（m00514 附近）：*"还有一件事，没有完美的任务规划，星，下载量还高的插件吗？就是那种适配 dsh 原生的任务栏，但是让 ai 去有这个更高的任务规划意识和主动性这种，注意查询社区经验"*。
硬约束：① 适配 dsh 原生任务栏；② 提升 AI 的任务规划意识与主动性；③ 星数/下载量必须高；④ 必须查社区经验（不能只看本地市场目录）。

## 1. 核心分析框架：三个正交杠杆

市面插件把这三点混着卖，需要拆开评估：

| 杠杆 | 机制 | 治什么 |
|---|---|---|
| **A. 目标常驻** | 每 turn 把当前目标重新注入 context | context rot（目标漂移） |
| **B. 不停止** | 在 `agent/turn-stopping` 判定「没干完」→ 再推一步 | 主动性 |
| **C. 可视 / 门禁** | 任务栏 UI 或阶段硬门禁 | 规划意识 |

**关键判断：dsh 原生 `todo_write` 本身已是任务栏**。缺的不是 UI（C），而是 **A + B**。不先想清这点就会买错。

## 2. 候选对照表（按星 + 下载量）

| 插件 | npm / install | ★ | 下载 | 类别 | 命中杠杆 |
|---|---|---|---|---|---|
| `@linxin666/dsh-client-ui-task-board` | 同名 | 8229 | 170,905 | ui | C，且 `capabilities: []`（纯客户端，零后端权限） |
| `@nanmicoder/dsh-agent-teams` | 同名 | 1864 | 55,453 | workflow | B/C（caps: fs-write/fs-read/network/subagent/llm） |
| `@a9i5k4/dsh-auto-memory` | 同名 | 90 | 13,256 | memory | A（固定边界注入 + PLAN 白板跨窗口续命 + 水位感知，前缀缓存友好，本地 Markdown，零依赖） |
| `@godv61/dsh-task-engine` | 同名 | 4 | 8,409 | workflow | C 强形态：`dev_task` 把阶段流转/产物/验证/审核/提交范围做成硬门禁 |
| `dsh-swarm-orchestrator` | 同名 | 6 | 5,881 | workflow | B（架构师规划 + 并行 builder + 评审 + 集成，角色钉选模型） |
| `@goodandready/dsh-goal` | 同名 | 1 | 5,076 | **skill** | A+B（顶部吸附 banner 每轮保持目标可见 + 自主推进）；caps 含 `host-runtime`，权限很宽 |
| `dsh-loop-engine` | 同名 | 4 | 3,312 | dev | B（Settings 开关切换五套 agent loop：内置 + Claude Code/Codex/Pi/Kimi） |
| `@weibaohui/hermes-loop` | 同名 | 6 | 2,017 | memory | A（自动复盘蒸馏成 skill） |
| `dsh-task-reliability` | 同名（`baosfeng/my-dsh-plugins` 子包） | **10** | 1,637 | workflow | B+C（超时重试 / 未完成自动继续 / 完成度校验 / 思考重复检测打断 / 休眠重启恢复） |
| `dsh-loop-continue` | 同名 | 2 | 1,071 | agi | **B 的最纯形态**：在 `agent/turn-stopping` 回放该轮日志，让裁判模型答 true/false，命中就把同一轮再推进一步 |

另有本地目录命中但非核心：`dsh-taskboard`（★57/7,200 dl，创建任务可指定项目与模型、支持定时）、`dsh-plan-and-execute`（★0/1,843 dl，ReactLoopAgent 的 Plan-and-Execute，Web UI 卡片审阅步骤）、`dsh-todo-float-ball`（★1/2,018 dl，悬浮球显示任务清单进度）、`@linxin666` 同仓库的 `dsh-web#packages/dsh-web-all`（★8229/128,892 dl，插件与皮肤合集）。

## 3. 社区经验：最硬的证据不在 dsh 生态内

- **`OthmanAdi/planning-with-files`：★27,227**，自称 *"Persistent file-based planning… **per-turn re-injection against context rot**, deterministic completion gate"*，支持 Codex / Cursor / OpenCode 等 60+ agents。其机制与本地 `thinking-anchor.mjs` 同构（每 turn 重注入 + 去重），只是注入物从「语言」换成「PLAN」。其卖点词 against context rot 与本项目实测的 habituation 剂量-反应现象（cum 110 → 0/10）是同一类问题。
- `bruc3van/awesome-dsh-plugin`：分类目录 + `MARKET.md`，是社区侧选型的索引入口。
- `diqierjia/StrataGate-AgentMemory`（★99）：近期记忆详细、旧记忆精简、重要记忆长期存在——与 A 杠杆同期生态验证。
- `yjh051108/dsh-routing-suite`：`STAGE_GUIDES` 按阶段解锁工具 + `applyStageRestrict()` 交付期释放 / per-session disposer 防交集叠加 / 完成信号驱动 autoAdvance——C 杠杆的工程化实现。

## 4. 结论与建议

- **不建议装 `@goodandready/dsh-goal`**：★1、5k 下载、`category: skill`、caps 含 `host-runtime`——证据最薄、权限最宽，属「机制听起来正好但未被验证」。
- **值得考虑的两个**：
  - `@linxin666/dsh-client-ui-task-board`：★8229 / 170,905 dl / 纯 UI / `capabilities: []`，是唯一零权限选项；但只把 `todo_write` 状态画出来，**不提升主动性**。
  - `@a9i5k4/dsh-auto-memory`：唯一有 A 杠杆 + 社区 usage 记载；README 明确 known quirk `autoConsolidateCooldownMinutes = 0` 回落 30，以及 *"Plugin-set changes require a dsh restart"*；但 caps 为 shell/fs-write/fs-read/network/env/subagent，**权限很宽**。
- **首选建议 = 先别装，自建 `plan-anchor.mjs`**：机制等同 planning-with-files，与 `thinking-anchor.mjs` 同构，约 30 行、零新依赖、零新权限、注入内容可逐字审计；已有的可复用经验：habituation 定量、`isOwnAnchor` 去重、`{ prepend: true }` 抢最外层、`stats.pruned` 可观测、40+44 条单测。**代价：只覆盖 A，不覆盖 B**（`agent/turn-stopping` 的 hook 语义当时未验证）。

## 5. 未决问题（截至本记录）

用户尚未回答父对话给出的二选一：① 先写 `plan-anchor.mjs`（A 杠杆，30 行，可控）；② 先挖 `agent/turn-stopping` 的 hook 语义，走 B 杠杆（可参考 `dsh-loop-continue` 的裁判模型判定法）。

## 6. 取证与数据来源

- 本地插件市场缓存 `~/.dsh/tmp-probe/dsh-plugins.json`（5,283,831 B）为候选字段（npm/install/version/stars/downloads/category/caps/owner/added）的权威来源；抓取须 `--max-time 150`（45s、180s 会 `exit=28`）。
- 社区来源：[bruc3van/awesome-dsh-plugin MARKET.md](https://github.com/bruc3van/awesome-dsh-plugin/blob/edf7ef5a3b8c03a1ec848a13cf599da5bd22ae23/MARKET.md)、[catalog/knowledge-research.md](https://github.com/bruc3van/awesome-dsh-plugin/blob/edf7ef5a3b8c03a1ec848a13cf599da5bd22ae23/catalog/knowledge-research.md)、[dsh-routing-suite router-bootstrap.mjs](https://github.com/yjh051108/dsh-routing-suite/blob/195273352f23bff7f9023ebe2ec0cdbdf9c98f10/preset/router-standard/router-bootstrap.mjs)、[entropy-cloud 对 dsh-routing-suite 的分析](https://github.com/entropy-cloud/attractor-guided-engineering-template/blob/fa9123d3c651a812e1be4f33f6e8f563810a14e0/docs/analysis/dsh-plugins/dsh-routing-suite.md)。
- 同类选型调研（方法可参照）：文档 `6cca40d7-7013-4840-bbdb-e18abb377e80`（DSH 分叉可视化选型）。
