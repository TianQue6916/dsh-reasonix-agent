---
id: mem-93a11aea1863bcdb1de0326db2422f6f
revision: 1
created_at: "2026-10-28T09:08:06.430Z"
updated_at: "2026-10-28T09:08:06.430Z"
name: dsh-concurrency-discipline-waterfall-veto-bug-20261028
description: "concurrency-discipline 不调 next() 否决整条 agent/pre-step 链，导致 plan-anchor/thinking-anchor/git-context 注入全部消失（2026-10-28 已修）"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 根因（2026-10-28 17:00 实测定位并修复）

`~/.dsh/.agent-presets/anchored-standard/concurrency-discipline.mjs` 的 `agent/pre-step` handler 签名写错：

```js
// 错的（原来）
ctx.on('agent/pre-step', async (decision, sessionId, agent) => { ... }, { prepend: true })
// 对的（已改）
ctx.on('agent/pre-step', async (payload, next) => { const decision = await next(); ... }, { prepend: true })
```

**两个 bug 叠加**：

1. **不调用 `next()` ⇒ 否决整条内层链**。cordis `waterfall` 的语义（`cordis/lib/index.js:317-325` 原文：`a listener that does not call next() vetoes the rest of the chain, including the built-in behavior`）。本行用 `prepend: true` 抢到最外层后，root session 的 `plan-anchor` / `thinking-anchor` / `git-context` / `context-gate` / `runtime-context` **全部消失**，只剩它自己的注入。
2. **形参错位**：第二个参数拿到的是 `next` 函数而不是 `sessionId`，第三个是 `undefined` ⇒ `agent?.isSubagent` 恒为 undefined ⇒ `skipSubagents` 从来没生效过。

## 症状与判据

- root session（depth=0）新建后 `user/message` 的 `source.kind` 只剩 `dsh-mnemon` / `runtime-context` / `concurrency-discipline`，**plan-anchor=0 thinking-anchor=0 git-context=0**。
- subagent（depth=1）反而正常 —— 因为它在旧实例上挂着。
- 分界时间：**16:01:33**（`session-5f807f79` 起）。16:00:38 之前创建的 session 全部正常。
- 验证命令：解压 `~/.dsh/sessions/--C-Users-27063--/<sid>/session.v4.jsonl.zstd`，数 `user/message` 的 `source.kind`。

## 回归测试方法（可复用）

用 cordis 直接跑 waterfall，不启动 dsh：

```js
const { Context } = require('C:/Users/27063/.dsh/profiles/node_modules/@deepseek-ai/cordis/lib/index.js');
const ctx = new Context();
for (const n of ['context-gate','concurrency-discipline','plan-anchor','thinking-anchor'])
  (await import('file:///.../'+n+'.mjs')).apply(ctx, cfg[n]);
await ctx.waterfall('agent/pre-step', { messages:[...], turn:1, step:1, signal:{}, agent },
  () => Promise.resolve({ kind:'enter', messages:[...] }));
// 检查返回的 messages 里 source.kind 是否包含 plan-anchor / thinking-anchor
```

## 教训

**任何 `agent/pre-step` / 其它 waterfall 钩子的 handler，签名必须是 `(payload, next)` 且必须 `await next()`**。`{ prepend: true }` 只影响外层位置，不豁免这条契约 —— 一旦不调 `next()`，它就是整条链的终点。
