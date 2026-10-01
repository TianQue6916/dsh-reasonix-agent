---
id: mem-11d16c9a547a2c542635a4c681a6c2d6
revision: 1
created_at: "2026-09-26T15:28:05.482Z"
updated_at: "2026-09-26T15:28:05.482Z"
name: dsh-session-index-codex-threads-20260926
description: "dsh session_index 上线（Codex threads 表对应物）：跨 cwd 会话索引，827 个会话扫描 813ms、title 覆盖 99%；并确认 system32 的 640 个是批量任务独立会话"
metadata:
  type: user
  fact_type: reference
  scope: global
---

# dsh session-index 上线（Codex `threads` 表的对应物）

## 一、Codex 对标进度（8 项，用 sqlite schema 实证的清单）

| # | Codex 能力 | 状态 |
|---|---|---|
| 1 | `memories.stage1_outputs` 蒸馏记忆 | 🟡 显式写入 ✅ / **自动蒸馏 ❌** |
| 2 | `state_5.threads` 统一索引 | ✅ **本轮完成** |
| 3 | `goals.thread_goals` 带 `budget_limited` | ❌ 未动 |
| 4 | `state_5.agent_jobs` CSV 批处理 | ❌ 未动 |
| 5 | `state_5.thread_spawn_edges` 子线程持久化 | ❌ 未动 |
| 6 | `remote_control_enrollments` 远程接管 | ❌ 未动 |
| 7 | `computer-use/` | ❌ 未动 |
| 8 | `thread_dynamic_tools` | ⛔ dsh 架构上做不到 |

## 二、本轮上线：`session_index`

- 文件：`~/.dsh/.agent-presets/anchored-standard/session-index.mjs`
- 挂载：`~/.dsh/profiles/web/cordis.patch.yml` → `preset-anchored-standard` → plugins
- 工具：`session_index({query, cwd, since, limit, refresh})`
- 原理：dsh 会话 = `<sessionId>/session.v*.jsonl.zstd`，**按 cwd 分目录**；第一帧约 200 bytes 就是 session header（id / version / createdAt / cwd / agentPreset / delegationDepth），首条 user 消息在 **frame 3**（不是 frame 1 —— 这个坑实测踩过）
- 缓存：`~/.dsh/storages/dsh-session-index.json`，按 (mtime, size) 增量刷新；只读，不碰会话存储

## 三、实测数据

- 全量扫描 **827 个会话 813ms**；二次增量 127ms
- title 覆盖率 **99.0%**（819/827）
- cwd 桶分布：`C:\Windows\System32` **640 个**、`C:\Users\27063` 151 个、其余 6 个小桶
- 版本分布：v4 249 / v3 386 / v0 192

## 四、意外发现（重要）

**system32 那 640 个不是 subagent 子会话**（delegationDepth 全为 0），而是**批量任务的一次性独立会话**，首条消息直接是任务模板：

> 用 Read 工具读取 `C:\Temp\100b\p001\audit\1_5a2_spec.md`，严格按该文件（含【输出完整性红线】）执行终审，并用 Write 工具写回 ...

即 100B 实分析的 25×2 批量审计 / 修复链路（`audit/` 与 `fix/A_spec.md|B_spec.md`）。批量派发时 cwd 落在 system32（未指定 cwd），所以桶里堆到 640 个。

## 五、价值

补上 dsh 默认组合里**跨 cwd 列出会话**的空白：agent 现在能回答「我上次在做什么」「那批批量任务一共派发了多少会话」，也是上轮行为回顾里"会话碎片化"痛点的直接解法。

## 六、备份

`cordis.patch.yml.bak-20260926-pre-session-index`
