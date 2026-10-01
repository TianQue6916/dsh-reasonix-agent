---
id: mem-468074cffecb76f0bcb0add74aa123a6
revision: 1
created_at: "2026-09-29T18:10:01.684Z"
updated_at: "2026-09-29T18:10:01.684Z"
name: dsh-mnemon-subagent-empty-catalog-and-language
description: "dsh-mnemon subagent 拿到空 tool catalog 的真因与修法（tool-bootstrap 收窄 + persona 覆盖）"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 症状
`memory subagent completed without recording its result`（`dsh-mnemon/lib/index.js:4575`），`idleReviewMs: 30000` 时每 30 秒一次；UI 里点"确认存入记忆"也必然失败。

## 真因（2026-09-29/30，实机取证）
subagent 的 LLM 请求**一个 tool 都没有**，所以模型只能把 tool-call 语法当纯文本吐出来，`stopReason=completed` 却零 receipt。

证据链：
1. 失败 subagent 的 session（`.../874ccdcd-c85e-4ef5-a003-1e1ef4e203dc/session.v4.jsonl.zstd`）只有 19 行、1 step、**0 个 tool/call**；它的 `request/header` 全场 **249 字符、没有 `tools` 字段**。
2. 唯一那条 `assistant/message` 的 content 是 `{"type":"text","text":"<｜｜DSML｜｜ calls>\n<｜｜DSML｜｜ invoke name=\"mnemon_memory_bodies\">\n\n</｜｜DSML｜｜ invoke>\n</｜｜DSML｜｜ calls>"}` —— 模型"知道"工具名只是因为 dsh-mnemon 的 persona 里念到了它。
3. 根因在 `~/.dsh/.agent-presets/anchored-standard/tool-bootstrap.mjs` 的 `system-prompt/assemble`：**promoted 分支同样收窄**
   `keep = bootstrapTools + RESIDENT_DISCOVERY_TOOLS + unlockedFor(session)`，
   而 subagent 的 `toolFilter.allow` 是 `[mnemon_memory_bodies, mnemon_recall, ..., mnemon_subagent_result]`，
   与 `{bash, str_replace_editor, dev_tool_search, skill_search, skill_load}` 求交 = **∅**。

## 关键纠正
`tool-bootstrap.config.includeSubagents: false` **不够**（我上一轮的错误结论）。它只让 child 走 promoted 分支，而 promoted 分支也收窄；subagent 又不可能自己跑 `dev_tool_search` 去解锁。两者都通向空集。

## 真正的修法（已落地）
在 `system-prompt/assemble` 里、`promotion.status()` 之前加 bypass：
```js
const header = context.agent?.session?.header
const depth = header?.delegationDepth ?? 0
if (depth > 0 || header?.origin === 'subagent') return assembled
```
理由：child 的 catalog 已经由 `toolFilter.allow` 精确限定；bootstrap 的"首请求锚定"针对的是用户在看的对话，对 child 无意义。

## 自测
`~/.dsh/storages/tools/test-preset-plugins.mjs`（node，无需重启）用 fake ctx 直接驱动两个 preset 插件：child 的 3 个 mnemon 工具完整保留、root 仍收窄到 `[bash, str_replace_editor]`、契约追加幂等、原 persona（含 `mnemon_subagent_result` 完成协议）保留。

## 同批修的另一处
subagent 的 thinking 是英文：`dsh-subagent/lib/index.js:517` 往**同一个** section 名 `deployment:persona-prefix`（= `PERSONA_PREFIX_SECTION`，`dsh-system-prompt:55`）写 per-child persona，把 preset persona 顶掉，而 dsh-mnemon 传了 `persona: completionPersona`。新增 `subagent-language.mjs` 在 assemble 后**追加**契约（不能替换——那个 persona 里的完成协议是必需的）。抽样 25 个 session：12/12 subagent `cjk=0`，root 多为中文。
