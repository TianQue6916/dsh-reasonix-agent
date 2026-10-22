---
id: mem-9369be18e1d49988553ee21f32a43e38
revision: 1
created_at: "2026-10-22T14:32:43.010Z"
updated_at: "2026-10-22T14:32:43.010Z"
name: bili-window-150000-deadlock-根因与修复
description: "dsh 会话 502 preflight_compress_failed 的根因：bili compress.modelContextLimit 压低窗口 + summary 后端不可用形成死锁；修复与验证路径"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 症状（2026-10-22 会话 session-a0d5fbf8 全死）
每条消息 502 `preflight_compress_failed`；`/compact` 回 `Compaction could not produce a useful summary`；但导出 zip 的 35355 行 session.v4.jsonl **JSON 零损坏** —— 会话本体没坏，坏的是这条 lane 的压缩判定。

## 根因链
1. `~/.config/billion-context/billion-context.json` 的 `compress.modelContextLimit` 被设成 150000（后改 200000）。它是 **preflight 压缩的硬墙**，不是截断上限：`context >= 硬墙` 就每轮触发 fold，fold 不成功就 fail fast 且 `retryable:false`。
2. bili 的 `compress` 段是**启动时快照** —— 改 json 不热生效，必须 `taskkill` 让 dsh supervisor 重拉 bili 才应用。
3. 生效窗口 = `native × (1 − 25% output headroom)`：`200000 → 150000`、`1M(maxTokens 32768) → 967232`、`1M(maxTokens 131072) → 868928`。三条都在 `/__bili/sessions` 的 `contextWindow` 字段实测到过。
4. 271k 上下文 > 150k 墙 ⇒ 每轮 fold；raw 折叠与 tier-distillation 都拿不到 summary（`0 summary call(s)` / `distillation summary was unavailable`）⇒ `futile round`。死锁本质：压缩需要发一次带全历史的 summary 请求，而这次请求被同一堵墙拦下。
5. 更早的 422 `dsh_compaction_refused`（bili 默认拒 dsh 原生压缩，需 `dsh.allowDshCompaction: true`）与 400 `invalid_request_error` 是同一条链的上游症状。

## 修复（已验证）
删掉 `compress.modelContextLimit`（备份 `billion-context.json.bak-20261023-pre-drop-ctxlimit`）→ `taskkill //PID <bili>` → **dsh 会自动拉起新 bili**（不必手动 start）→ `/__bili/sessions` 的 `contextWindow` 从 150000 变 868928，`conflicts` 清零。

## 教训
- `modelContextLimit` 只「制造」硬墙，**永远不要低于真实窗口**，更别当省钱旋钮。
- 判断 bili 实际窗口：直接读 `http://127.0.0.1:18787/__bili/sessions` 的 `contextWindow`，别猜。
- 链路：dsh → gateway 8788 → bili 18787 → upstream；`/v1/models` 报 deepseek/deepseek-v4.1-flash context_length=1000000。
