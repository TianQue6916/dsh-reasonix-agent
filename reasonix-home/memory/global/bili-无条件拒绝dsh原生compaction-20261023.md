---
id: mem-9af22cf89f603ba04066f9bd218105ad
revision: 1
created_at: "2026-10-23T04:03:48.111Z"
updated_at: "2026-10-23T04:03:48.111Z"
name: bili-无条件拒绝dsh原生compaction-20261023
description: "/compact 永久失败的真实原因：bili 0.1.204 把 allowDshCompaction 的 opt-in 删了（#3651），拒绝变成无条件；session log 里 compaction/end 的 error 是 422 dsh_compaction_refused；UI 文案「could not produce a useful summary」有误导性；已删无效键；zstd session log 解法"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 症状
`/compact` 永远回：`Compaction could not produce a useful summary. The attempt is recorded in the session log.`

## 根因（不是 bug，是 bili 的设计，**修不好**）
bili 0.1.204 的 `dist/index.js` 里，拒绝文案是常量 `REFUSAL_MESSAGE`：

> dsh native compaction call refused by billion-context: bili owns compression on this lane (#1729, cf. #1772/#1206).
> A landed dsh compaction checkpoint durably shadows the raw conversation history, which destroys the proxy's
> compression substrate. … **This refusal is unconditional — the former `allowDshCompaction` opt-in was removed
> (#3651, superseding #2028)**; to keep dsh-side checkpoints out entirely, apply host-side suppression instead (#3354/#2474).

配套还有 `warnRemovedDshAllowKey()`：会检测并告警「`top-level "allowDshCompaction"`」和「`dsh.<任意非 authoredCompaction 键>`」都是**已移除**的配置。

⇒ **10-16 那条 fact「开 allowDshCompaction 恢复 /compact」已经过时。** bili 升级后这个 opt-in 被删，拒绝变成无条件。`dsh.allowDshCompaction: true` 现在是**无效键**（本轮已从 `~/.config/billion-context/billion-context.json` 删除，备份 `.bak-20261023-pre-drop-dsh-allow`）。

## 证据链（session log，决定性）
`~/.dsh/sessions/--C-Users-27063--/<sid>/session.v4.jsonl.zstd`（**zstd 压缩**，用 `zstandard` 解）里那条命令的心跳：

```
[1681] command/run       {"commandId":"cmd-6c52d522-1","name":"compact"}
[1682] compaction/start  {"compactionId":"22d6043c-…"}
[1683] compaction/end    {"error":"422: {…\"code\":\"dsh_compaction_refused\"…}"}
[1684] command/done      {"kind":"error","text":"Compaction could not produce a useful summary. …"}
```

所以 dsh 确实发了请求，bili 用 422 打回，dsh 把 422 包装成那句「could not produce a useful summary」——**这句话有误导性，真实原因在 session log 的 `compaction/end.error` 里**。

## 诊断手法（可复用）
1. `/compact` 失败 → 不要看 UI 文案，直接解对应 session 的 `session.v4.jsonl.zstd`，看 `compaction/end` 的 `error` 字段。
2. 判断 bili 侧行为 → 直接读 `profiles/*/node_modules/billion-context/dist/index.js`（5.2 MB bundle，`grep -o -E ".{200}关键词.{200}"` 比 grep 行更好用）。

## 现在还剩的压缩手段
- bili 自己的 wire 层压缩：`compress.maxContextLimit: 70%`（868928 × 70% ≈ 608k 触发）+ `emergencyThresholdPercent: 90%`；`injectNudge: false` 表示它不主动提示模型，但接近窗口会自己 fold。
- bili 的 fold 需要 summary 后端；2026-10-22 那次窗口被压到 150000 时 summary 报 `unavailable`（`0 summary call(s)`）。**窗口恢复 868928 后是否可用，尚未验证** —— 要等上下文真的涨到 608k 才知道。
- 兜底：开新会话（PLAN.md + reasonix fact 接力），完全绕开压缩问题。
