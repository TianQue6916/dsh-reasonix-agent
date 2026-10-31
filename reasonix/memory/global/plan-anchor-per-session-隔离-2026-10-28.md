---
id: mem-6207679a318b568532dcf9ad35cbc485
revision: 2
created_at: "2026-10-28T11:18:50.281Z"
updated_at: "2026-10-28T11:48:21.601Z"
name: plan-anchor-per-session-隔离-2026-10-28
description: "plan-anchor per-session 规划文件的边界、subagents=own、isSubagent 恒 undefined 的坑、验收判据"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 事实

`plan-anchor.mjs` 注入 **per-session 规划文件** `$DSH_HOME/plans/<session-id>.md`；全局 `$DSH_HOME/PLAN.md` **不再自动注入**。

配置（`profiles/{desktop,web}/cordis.patch.yml` 的 `id: plan-anchor` 段）：
- `perSession: true`
- `subagents: own` —— **2026-10-28 用户拍板**：每个会话（**含子 agent**）各建一份独立文件。
  原话「每次新开一个会话都要自动建立一个全新的、不可被替代的任务模板，就是这个 plan.md」。

## 生效条件（最容易踩的坑）

`.agent-presets/**/*.mjs` **不参与 HMR**，必须**重启 dsh 进程**。
但 **patch 本身是 live**（`profiles/{desktop,web}/package.json` 的 `"patchReload": "live"`）——
改 `subagents`/`perSession` 这类 config 只需**开新会话**，不必重启。
判据：注入包裹 `file=` 是 `plans\<session-id>.md` 而不是 `PLAN.md`。

## ⚠️ isSubagent 恒 undefined（配置说谎的根源）

`planOwnerId()` 用 `agent?.isSubagent === true` 判子 agent，但**该字段在本版本恒为 `undefined`**
⇒ `'parent'` 与 `'none'` 两个分支**从未生效过**，实际行为一直是 `'own'`。
同一坑的另一处：`concurrency-discipline.mjs:82`（那里 `skipSubagents` 也因此从没生效）。
2026-10-28 已把默认值改成 `'own'` 并写进代码注释；要真正实现 `'parent'`，得先找到真实存在的子 agent 判据字段。

## 验收判据（可复现）

- **正向**：`render()` 的 payload 含文件路径（含 session id）⇒ 各会话 payload sha256 两两不同。
- **时序**：写任一会话的 plan 文件，其它会话 payload **字节级不变**；撤销写入后完全恢复。
- 实测 2026-10-28：9 个文件（4 root + 5 子 agent），正向 9/9 唯一，时序 5/5 不变。
- 单测：`planOwnerId` 对 own/parent/默认 × root/子agent 五种组合 5/5 PASS。

## 「模型不愿主动规划」是伪命题

根因**不是**主动性，是**注入内容不像它的任务**：旧版 head 30 行 = 铁律 + relay（纯行为守则，零任务信息），
主体 324 KB 被 `truncated=yes` 挡在窗外。换成 790 B 自己的空骨架 + `LEAD_AUTOCREATED` 点名 + `truncated=no` 后，
**重启后 5/7 会话在第一步就填了骨架**，且写成可判定条件（例：`titleProvider = session-title-all-prompts-llm` 且 `maxTokens = 4096`）。
⇒ 空 plan 哨兵 / 周期性提醒这类压力机制**没有证据支撑，不要加**。

## 约束

- 规划文件必须 **≤ 30 行**：注入窗口固定 `headLines: 30`，超了尾部被截且 `truncated=yes`（实测写到 33 行时「卡住的点」段丢失）。
- 文件由 `ensureSessionPlan` 用 `flag: 'wx'` 独占创建，**绝不覆盖**已有内容（覆盖 = 静默丢用户的任务笔记）。
