---
id: mem-b8c88e7ee8cafd6ae11dcba089eba141
revision: 2
created_at: "2026-10-23T04:18:16.751Z"
updated_at: "2026-10-23T04:31:16.348Z"
name: dsh-bili-压缩正确姿势
description: "bili 压缩机制、/compact 前提、全局化改造与手动 compress 流程（2026-10-23）"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 结论（2026-10-23 实测，bili 0.1.204 + dsh 0.2.1-rc.2）

**dsh 只注册 3 个 slash 命令**：`/compact`、`/feedback`、`/goal`。**没有 `/compress`**。

### `/compact` 在这条 lane 上的真实规则
bili 收到 dsh 的 compaction 调用（final user message = `COMPACTION_INSTRUCTION`）走两条分支：
- **A 成功**：`session.state.blocks.some(b => b.active)` 为真 → bili 用自己的快照本地伪造响应（#3733 authored checkpoint），不调上游、不花钱。日志 `ANSWERED LOCALLY with the bili snapshot`
- **B 失败**：blocks 为空 → 422 → `Compaction could not produce a useful summary`。日志 `REFUSED, not forwarded`

**`blocks` 是 per-session 的**，压 A 会话不会让 B 会话可用。

### 检查接口
- `GET http://127.0.0.1:18787/__bili/sessions?limit=N` → 每条 `blocks` / `tokensSaved` / `contextTokens`
- `GET /__bili/logs` → 最近 500 行；全文 `C:\Users\27063\.local\state\billion-context\bili.log`
- `GET /__bili/config`、`/__bili/health`、`/__bili/diagnostics`

### 全局化改造（2026-10-23 12:29，已落盘，**需重启 dsh 生效**）
1. `.agent-presets/anchored-standard/tool-bootstrap.mjs:147` 新增 `const RESIDENT_CONTEXT_TOOLS = ['compress','decompress','acp_status','search_context']`；`:309` promoted keep-set 并入 → **任何 promoted 会话常驻 compress，不用 dev_tool_search**
2. `profiles/desktop/cordis.patch.yml:224` `compactionTools` 追加 `compress` → **compaction 态的会话也能自救**
3. 技能 `C:\Users\27063\.dsh\skills\compress\SKILL.md`（`skill_search`/`skill_load` 已验证），触发 `/compress`、`压上下文`
备份 `*.bak-20261023-122906-pre-resident-context-tools`；`node --check` 通过；行尾已还原 LF（python 写文件默认转 CRLF，必须 `newline=''` 或事后修正）。

### 为什么之前每个会话都压不了
- 工具集里没有 `compress`，且 `dev_tool_search` 也不在（compaction 态 catalog 被裁成 `bootstrapTools + compactionTools`）
- bili 自己的自动 fold 从不跑：日志 `nudge idle: ... reason="growth < floor, blocked: T1 (cadence)"`，零条 `[preflight]`

### 手动压的流程
`dev_tool_search({"toolNames":["compress","decompress","acp_status"]})` → `acp_status()` 看 ranges → `compress({content:[{startId,endId,summary,topic}]})` → `GET /__bili/sessions` 确认 `blocks ≥ 1`。
2026-10-23 实测：`session-992f3685` 619538 → 45831 tok（5.3%），blocks 0→1，saved 522276。

### bili 配置
`compress.maxContextLimit` 70% → **50%**（434464 tok 触发）。`compress` 段是启动快照，改后需重启 bili（taskkill 后 dsh supervisor 约 10–15s 自动拉起）。
