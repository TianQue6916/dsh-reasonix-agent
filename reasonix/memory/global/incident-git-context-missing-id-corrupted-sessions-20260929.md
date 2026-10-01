---
id: mem-8656f25af31a41d491864e48626784e1
revision: 1
created_at: "2026-09-28T17:49:26.231Z"
updated_at: "2026-09-28T17:49:26.231Z"
name: incident-git-context-missing-id-corrupted-sessions-20260929
description: "事故复盘：我给会话注入的 git-context 消息缺 id，导致 8 个 session 被判 corrupt（113 条消息）；含 dsh-session 的权威校验规则原文、幂等修复法（uuid5 + zstd 重压）、以及「preset row 一旦 mount 改 config 无法靠 HMR 停掉」这条实验结论"
metadata:
  type: user
  fact_type: project
  scope: global
---

# 事故：git-context 注入缺 id，8 个 session 被判 corrupt（2026-09-29）

## 现象
用户在 web UI 看到：
> 历史加载失败：stored session "session-e6237262-fa87-413f-9f2a-b2d93935c811" is corrupt:
> … failed validation: Error: session event at seq 20 lacks an identified message（gateway/internal）

## 根因（我的 bug）
照官方 `@deepseek-ai/dsh-time-context` 抄了 `agent/pre-step` 的注入形状：
```js
{ role:'user', content:[{type:'text',text}], source:{ kind, form:'snapshot', sections:[…] } }
```
但 `time-context` 用的是 **`createUserMessage()`，那个函数会补 `id`**；而 preset 模块不能 import
`@deepseek-ai/dsh-llm`，我手写形状时**漏了 `id`**。

## DSH 的权威校验规则（`dsh-session/lib/index.js:1151-1163` 原文）
```js
const message = type === "user/message" ? record : record?.["message"];   // ★ user/message 的消息体就是 data 本身
if (typeof message !== "object" || message === null
    || typeof message["id"] !== "string" || message["id"] === "")
    throw new Error(`${subject} lacks an identified message`);
if (messageRecord["role"] !== MESSAGE_ROLE_BY_TYPE[type]) throw …
if (typeof source["kind"] !== "string" || source["kind"] === "") throw …
if (!Array.isArray(messageRecord["content"])) throw …
```
⇒ **user/message 事件的 `data` 必须带非空 string `id`**。四个条件里我只缺这一条（role / source.kind / content 都对）。

## 污染范围与修复
只可能影响 2026-09-29 00:20 之后（git-context 那时挂上）。扫了 12 个 session →
**8 个中招、共 113 条**：

| session | 缺 id |
|---|---|
| `session-e6237262-…` | 87（87 个 step 的注入；validator 在 seq 20 fail-fast，所以**报错只显示一条，实际坏了几十条**） |
| `session-75a734d6-…` | 11 |
| **`session-a0d5fbf8-…`（主会话）** | 7（first_bad_seq=9391） |
| `session-02e43792-…` | 4 |
| 其余 4 个 | 各 1 |

**修复脚本**（`/tmp/fix-sessions.py`，幂等）：
- `user/message` 的 `data` 缺 `id` → 补 `uuid5(NAMESPACE, f"{sid}:{seq}")`（**确定性、可重现、重复跑不出新值**）
- `zstd -dc` 解压 → 逐行改 → `zstd -19 -o` 重压（**多帧变单帧，DSH 照样能读**）
- 每个文件先备份 `session.v4.jsonl.zstd.bak-20260929-pre-id-fix`
- 修复后按上面四条规则独立校验：**8 个里 7 个 0 违规**；残留 1 条在**当前会话**（3080 内存里还是老代码，每步继续注入）

## ★ 教训 1：运行中的实例救不了
把 `disabled: true` 加进 profile patch 的 git-context row、等 HMR 后做实验 ——
**仍然新增了一条缺 id 的消息**（9442 → 9448）。
⇒ **preset 的 row 一旦 mount，改 profile patch 里它的 `config` / `disabled` 不会重挂它。**
⇒ 与「改 `.mjs` 内容不进已有 session」同源：**preset 层的任何变化都要重启进程**。
⇒ 对照：profile patch 里**新增**一个 row 对新 session 有效；但**改已 mount row 的 config 无效**。

## ★ 教训 2：给 session 注入消息，形状必须逐字对齐官方
```js
{ id: <非空 string>, role: 'user', content: [ … ], source: { kind: <非空 string>, … } }
```
四个字段缺一不可。**不要凭调用点去反推形状** —— 要看被调用的 `createUserMessage()` 到底补了什么。

## 落地状态（2026-09-29 01:5x）
- `git-context.mjs` 已加 `import { randomUUID } from 'node:crypto'` + `id: randomUUID()`；
  训练后形状实测 `keys: id, role, content, source`
- `dsh --profile web --dump-config` EXIT=0，git-context row 正常（临时加的 `disabled` 已撤销）
- **重启 3080 前，本会话每步仍会新增一条坏消息**；重启后再统一修一次才彻底干净
