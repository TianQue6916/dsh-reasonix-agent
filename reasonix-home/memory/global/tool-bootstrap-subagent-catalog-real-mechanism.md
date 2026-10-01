---
id: mem-7d23d2fffe6907fdb6d3ea07d6433f58
revision: 1
created_at: "2026-09-29T19:06:07.679Z"
updated_at: "2026-09-29T19:06:07.679Z"
name: tool-bootstrap-subagent-catalog-real-mechanism
description: "tool-bootstrap 对 subagent 的真实机制（keepTools 的 missingAllowsFullCatalog）+ includeSubagents 是加重不是修复"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 机制（比我先前写的更具体，2026-09-30 用 `keepTools` 源码 + 实机 session 复核）

`~/.dsh/.agent-presets/anchored-standard/tool-bootstrap.mjs` 的 `system-prompt/assemble` 里，`keepTools(assembled, keep, missingAllowsFullCatalog)` 的真实行为是：

```js
const missing = [...keep].filter((n) => !available.has(n))
if (missing.length > 0) { warnOnce(...); if (missingAllowsFullCatalog) return assembled }
return { ...assembled, tools: assembled.tools.filter((t) => keep.has(t.name)) }
```

于是对 subagent（catalog 由 `toolFilter.allow` 收窄成纯 mnemon 工具）：
- **未 promoted**（controlled phase，`missingAllowsFullCatalog = true`）→ keep `[bash, str_replace_editor]` 在 subagent 的 catalog 里**不存在** → missing 非空 → **返回完整 catalog** ✅
- **promoted**（`missingAllowsFullCatalog = false`）→ keep `= bootstrapTools + RESIDENT_DISCOVERY_TOOLS + unlocked` → 交集为空 → **得到空 catalog** ❌

**所以 `tool-bootstrap.config.includeSubagents: false` 不是修复而是加重**：`compaction-epoch.mjs` 对 `!includeSubagents && delegationDepth>0` 直接返回 `{promoted:true}`，于是 subagent 被强制走 promoted 分支 → 必然空集。（我 2026-09-29 02:30 的改动属于这一类误判。）

## 最终修法（已落地并实机验证）
`system-prompt/assemble` 开头、`promotion.status()` 之前 bypass：
```js
const header = context.agent?.session?.header
const depth = header?.delegationDepth ?? 0
if (depth > 0 || header?.origin === 'subagent') return assembled
```

## 实机证据（判据要取**第一个** request/header，不是最后一个）
- 失败样本：`05554f8f`(12:57) / `8c9ca6b8`(11:13) / `874ccdcd`(10:02) / `13189afd`(02:31) —— header#1 **无 `tools` 键**
- 成功样本：`720698d1`(19:12) —— header#1 `tools=4`（`mnemon_document_create/document_search/runtime_memory/subagent_result`），header#2 无 tools（**所以取最后一个 header 会误判**）
- 修复后新建 child `66b3b4ab`(03:04:43，新进程)：header **50706 字符、58 个工具**
- 判据脚本：`~/.dsh/storages/tools/verify-subagent-fix.py --all`（同时查 catalog 与 thinking 语言），另有 `test-preset-plugins.mjs` 做无重启单测

## 未闭环项（当时的）
真实 mnemon `write` operation（用户点「确认存入记忆」）尚未在新进程下实机跑过；idle review 在 goal 处于 active 时不会触发（会话每轮都有 turn，`DEFAULT_IDLE_REVIEW.minIntervalMs = 300000` 只是下界，真正的门是"会话必须真的 idle"）。
