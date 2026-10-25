---
id: "92483da9-498b-4f7f-a830-e76b3df7fc66"
title: "dsh「对话/上下文」tab 白屏根因调查：conversation.view slot 渲染异常与 source.kind 无判空（2026-10）"
description: "2026-10-07 dsh Desktop 会话主视图整块白屏的取证：证伪 archiveFloor/compaction 假设，定位到 renderer 抛 TypeError: Cannot read properties of null (reading 'kind')（conversation.view slot entry + session-controller event feed 双处同错，ErrorBoundary 兜底导致区域不绘制），列出 core 侧 3 处无判空读 .kind 的行号、数据层实测干净的证据、社区同型 issue yjh051108/dsh-agi-harness #16（undefined vs null 差异）、dsh-context 0.64.0 升级判断与可逆二分法定位步骤。"
status: "active"
created_at: "2026-10-07T04:01:49.252Z"
updated_at: "2026-10-07T04:01:49.252Z"
content_hash: "470c4000dbdb56afbc284061299f28b5b05dbe670280d952687a6647c6785159"
source_paths:
  - ".dsh/profiles/node_modules/@deepseek-ai/dsh-api-session-controller/lib/client.js"
  - ".dsh/profiles/node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js"
  - ".dsh/profiles/desktop/cordis.patch.yml"
  - ".dsh/logs/host-stdio.log"
session_ids:
  - "1c2aae50-de5b-4858-ac18-08a67ed01eee"
memory_body_ids:
  []
---

# dsh `conversation.view` 白屏根因调查（2026-10-07）

## 现象
- dsh Desktop 会话主视图（`conversation.view` slot）整块空白，重启无效；复现会话 `session-856644af-a8fd-49ad-9994-41eef8a72ea1`（标题「读取母亲手术工作保障会话并草拟」，2 轮 / 36 步）。

## 已证伪的旧假设
- 曾判断为 compaction / `archiveFloor` 归档历史（"96.6% 历史归档"）所致。实测该会话 `archiveFloor = None`（从未归档）、`surface = 208` 项、`archived = 0`、`requests = 35`、`sessionStats = {turns: 2, steps: 36}` ⇒ **与 compaction、archiveFloor 无关**。

## 真正原因（有 crash log 原文）
不是数据损坏，是 renderer 抛 JavaScript 异常把整块内容区打空。
- crash log：`C:\Users\27063\AppData\Roaming\@deepseek-ai\dsh-desktop\logs\crash-2026-10-06T16-14-06-734Z-renderer.log`（时间 `2026-10-06T16:14:06.734Z` = 10-07 00:14 CST，用户首次报障时）
- 错误原文：
  - `dsh-app://app/assets/index-5SrrfWpU.js:56` — `[session-controller] event feed subscriber failed: TypeError: Cannot read properties of null (reading 'kind')`
  - `dsh-app://app/plugins/...&rev=417de29086b0:23887` — `slot entry crashed in 'conversation.view': TypeError: Cannot read properties of null (reading 'kind')`
- 计数：`reading 'kind'` ×9、`slot entry crashed in 'conversation.view'` ×3、`event feed subscriber failed` ×3。

机制：
- `conversation.view` slot 上挂 6 个 entry：官方 `chat`、官方 `trajectory`、`dsh-context`（上下文）、`dsh-mnemon`（记忆）、`dsh-plugin-message-edit`（版本）、`@mingozhou/dsh-replay`（Replay）。
- 某 entry 在渲染时读取**值为 null 的对象**的 `.kind` 抛错；core 外层有 ErrorBoundary（`client.js:13021 ContextView = ErrorBoundary(ContextViewBody)`），它兜住异常保证不白屏，代价是**该区域直接不绘制**。
- 同时 `session-controller` 的 event feed 订阅器抛同一错 ⇒ **同一份「带 null 的数据」被两处消费**。
- 重启无效：每次渲染到同一份数据必然重演，不是内存/缓存里的脏状态。

## core 侧「无判空读 .kind」刀口（均在 `~/.dsh/profiles/node_modules/@deepseek-ai/`）
- `dsh-api-session-controller/lib/client.js:2184` — `if (source.kind !== "user" || !("rpcId" in source)) continue;`
- `dsh-api-session-controller/lib/client.js:2197` — `if (source.kind !== "user" || !("rpcId" in source)) return;`
- `dsh-client-ui-conversation/lib/client.js:15381` — `rows.filter(({ source }) => source.kind !== "user" || ...)`

全是 `source` 未判空。

数据层实测干净：全量解压 `session.v4.jsonl.zstd`（856644af → 592 行；a0d5fbf8 → 31,388 行），0 个坏 JSON、0 行字面 `null`、`data.source == null` **0 条** ⇒ **null 是 UI 侧构造消息对象时产生的，不在日志里**。

## 社区同型 issue
- **最强命中**：`yjh051108/dsh-agi-harness` #16（open）「闭环会话第 2 轮必崩」。根因链：
  1. `plugins/dsh-engram-relay/src/relay.ts:482`（`agent/pre-step` 每轮记忆注入）手拼 `{ role: 'user', content: [...] }`，**漏了 `id` + `source`**（同文件 244 / 649 行的 `createUserMessage(...)` 是规范写法）；
  2. harness `packages/context/session-reference/src/index.ts:159` 读 `message.source.kind` 无判空；
  3. `agent-loop/src/agent.ts:313-326` 把非 LLM 错误压平成 `{ message, code: 'UNKNOWN' }` → WebUI 红条。
  CDP `setPauseOnExceptions` 抓到的暂停帧上，该消息为 `keys:["role","content"]`。
  - **差别**：该 issue 报的是 `undefined`（字段整个缺失），本机是 `null`（字段存在但值为 null）⇒ **不能直接照搬它的修法**。
- `dsh-context` 兼容史（同型「内核版本一动 client 就崩」）：#42 closed（accesses `remote.session` without declaring injection）、#89 closed（内核 0.1.7-rc.1 `sidebar.footer.action` 槽位 React#130 / OverviewButton undefined）、#45 closed（guard finalized chat snapshot across DSH host versions）、#106 closed（ignore stale detail reads after refold）。

## 升级判断
本机 `dsh-context` 0.63.0，npm latest 0.64.0（2026-10-05）。0.64.0 改动为「Insights 面板提升为 sidebar 一级页 + Trend 卡片 UI 精简」，修复仅一条 hover 卡顿（#116），**无 slot / conversation.view / kind / 崩溃相关修复** ⇒ 升级大概率不解决该白屏，不建议盲目升。

## 建议的定位动作（可逆二分法）
`conversation.view` 的第三方注册者只有 4 个，逐个 disable 做二分，每轮重启 App：
1. `dsh-mnemon`（记忆注入 —— 嫌疑最大，对应 #16 的角色）
2. `dsh-plugin-message-edit`（版本 tab，1.2.0，10-01 新装；其 DSH 0.2 boot 崩溃另有独立修复记录）
3. `@mingozhou/dsh-replay`（Replay tab）
4. `dsh-context`（上下文 tab，0.63.0）

改动位置：`~/.dsh/profiles/desktop/cordis.patch.yml`，只翻 `enabled` 开关，随时可翻回；**必须重启 App 生效**（node_modules 的 client bundle 不走 HMR）。

## 本机相关插件版本（2026-10 快照）
`dsh-context` 0.63.0 / `dsh-mnemon` 0.5.21 / `dsh-quick-toc` 0.8.2 / `@mingozhou/dsh-replay` 0.4.1 / `dsh-plugin-message-edit` 1.2.0 / `dsh-better-sidebar` 0.24.1 / `billion-context` 0.1.186 / `dshmarket` 1.66.8。

## 状态
截至该 checkpoint，结论仍属「疑似崩溃点定位」，**尚未用二分法验证**；已向用户确认两件事：(1) 是否立即开跑二分法；(2) 10:50 重启后白屏是否仍复现（若半天未犯，触发条件可能与特定会话数据形态绑定，二分应针对该会话做）。

## 相关文档
- `dsh-plugin-message-edit` 1.2.0 在 DSH 0.2 的 boot 崩溃修复：文档 `90e783dd-3e30-406f-9225-1c21e25b71f5`（同一插件，但故障面是 boot 而非渲染）。
