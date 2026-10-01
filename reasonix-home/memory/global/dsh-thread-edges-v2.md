---
id: mem-4611d766b4eddfd329a642061bdb4e99
revision: 1
created_at: "2026-09-28T07:34:25.291Z"
updated_at: "2026-09-28T07:34:25.291Z"
name: dsh-thread-edges-v2
description: "#5 thread_spawn_edges 的真实实现：parentSession 权威边 + 全量扫描 + 每日刷新任务"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 位置与用法
`~/.dsh/storages/tools/thread-edges.mjs` → 输出 `~/.dsh/storages/thread-edges.json` + `thread-edges.dot`。

```
node thread-edges.mjs [--dir <sessions 根>] [--out x.json] [--dot x.dot] [--limit N] [--names subagent,workflow,subagent_fork,ralph]
```
`--limit 0`（**默认**）= 扫全部。旧默认 30 —— 实测全机 1451 个 session 文件，旧默认只覆盖 3%。

## 两类边（2026-09-28 重写）
1. **`session:spawn`（权威）** —— 从每个 session 文件**第一行 header** 的 `parentSession` / `delegationDepth` / `cwd` / `agentPreset` 读出。这是 Codex `state_5.thread_spawn_edges` 一对一的对应物。
   - **旧脚本的核心注释是错的**：它断言 dsh 的 subagent"不落独立 session 文件"。实测 subagent **有独立 session 目录与文件**，形如 `{"type":"session","id":"d37f2224-…","parentSession":"session-a0d5fbf8-…","delegationDepth":1}`。
   - 实测结果：1451 个 session → **17 条 depth=1 权威边**（全部指向 `session-a0d5fbf8`），旧版这个数字是 **0**。
2. **工具调用边（启发式）** —— `subagent` / `workflow` / `subagent_fork` / `ralph` 的 tool/call 参数；workflow 的 `script` 里每个 `agent("…")` 算一条。只有"派发意图"，不含子线程身份。
   - 实测：`{workflow: 3, workflow:agent: 2, subagent: 2, session:spawn: 17}` = 24 条（旧版 5 条）。

## 同时修掉的三个 bug
- `--help` 直接 `ReferenceError`：用了 `readFileSync` 但没 import。
- sid 提取只匹配 `session-<uuid>` 形式，**裸 `<uuid>` 的目录名全部漏掉**（改为优先取 header 的 `id`，正则兜底）。
- dot 生成里 `split('\\')` 被 shell heredoc 吃成 `split('\')` → 语法错误。
- 另加：`zstd` 不在 PATH 时立即报明确错误并 `exit 2`，而不是让 1451 个文件静默全失败。

## 自动化
计划任务 **`ThreadEdgesRefresh`**（每日 12:30，接在 MemoryIndexHeal 12:10 / MemoryToMnemon 12:20 之后），`Register-ScheduledTask` 以 `27063` / Interactive / Limited 注册，`-StartWhenAvailable`。已实测手动触发成功：`generatedAt` 07:29:38Z → 07:32:08Z。脚本日志：`~/.dsh/logs/thread-edges.log`。全量扫描耗时约 **41 秒**。

## 回滚
`thread-edges.mjs.bak-20260928-1535-pre-parentsession`、`thread-edges.json.bak-20260928-1540-pre-fullscan`。
