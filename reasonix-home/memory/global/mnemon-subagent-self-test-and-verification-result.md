---
id: mem-694c58fc467d72bdf62763f09ed9ef8d
revision: 1
created_at: "2026-09-29T19:08:10.076Z"
updated_at: "2026-09-29T19:08:10.076Z"
name: mnemon-subagent-self-test-and-verification-result
description: "如何自测触发真实 mnemon subagent（mnemon_document_manage archive）+ 两处修复的实机验证结果"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 可自测触发真实 mnemon subagent 的方法（重要）
MCP 工具里**唯一**能自己触发 mnemon subagent 的是 **`mnemon_document_manage(action="archive", id=...)`**：
`coordinator.archiveDocument` → `archiveDocumentLocked`（`dsh-mnemon/lib/index.js:4015`）→
`this.delegate(parent, "document-archive", ..., "spawn", DOCUMENT_ARCHIVE_PERSONA)` ← 真的 spawn。
（`mnemon_remember` 走 `coordinator.remember`，**不是** subagent；`superviseRoot` 那条才是 UI「确认存入记忆」的 supervised-writeback，但只由 Host RPC 触发。）

前置条件：先 `mnemon_document_create(title, content)` 造一个 active document（archive 要求 `status === "active"` + 存在 active 且 `capabilities.remember/forget/writeMode==="exact"` 的 Memory Space）。archive 会真的写一条 cold-reference 到 memory space 并留下 lineage。

## 验证结果（2026-09-30 03:07）
`cfa4d386-3bc1-4ce1-9056-436fc87f0c2a`（delegationDepth=1）：
- `request/header` 653 字符、**`tools=['mnemon_subagent_result']`**（修复前 `874ccdcd` 是 249 字符、**无 tools**）
- **`tool_calls=1`**（修复前 0）、`cjk=54`
- `archive` 返回 `provider:"spawn"` + `maintenance.runId` + `lineage[0].destination` 指向 `memory-space:default/item:54f1af4b-...`
- **没有** `memory subagent completed without recording its result`

## 遗留（模型行为，非配置）
child 的 reasoning 首句仍是 `Let me consider: ...` —— 英文骨架夹中文。system prompt 里 `用中文思考` 已注入（实测 `contains 用中文思考: True`），但**全新会话没有中文 thinking 的历史可跟随**，所以不如 root agent（有大量中文 history 的 in-context 影响）稳定。想更强只能再加强提示或接受混合。

## 另一条硬教训
`idle review` 在 goal 处于 `active` 时**不会触发**：goal round 每 2 秒一轮，会话永远不满足 idle 条件；`DEFAULT_IDLE_REVIEW.minIntervalMs = 300000` 只是下界。所以"用 idle review 验证 mnemon"这条路在有 active goal 时是死的。

## 顺手发现
`~/.dsh/storages/tools/verify-subagent-fix.py --all` 判据必须取**第一个** `request/header`：`720698d1` 的 header#1 有 4 个工具、header#2 没有，取最后一个会把成功的判成失败。
