---
id: mem-b17fea4a6a284aeafca88f3552dc2683
revision: 1
created_at: "2026-09-27T16:16:14.878Z"
updated_at: "2026-09-27T16:16:14.878Z"
name: dsh-patchreload-live-new-session-and-mnemon-dsh-side-verified-20260928
description: "纠正\"改配置需重启 3080\"的误判：patchReload=live 下新会话即读到新配置，进程无需重启；并实录 mnemon 在 dsh 侧的双向验收（mnemon_status 实调返回与 CLI 完全一致）及 deja 家族工具也同时接上"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 一、🔴 纠正一个我说错了五轮的判断：**不需要重启 3080**

前五轮我反复说「所有改动都需要重启 3080 才生效」——**错的**。

**证据（2026-09-28 round 6 实测）**：
- `3080` 的 PID **仍是 52540**，启动时间 **2026-09-27 13:12:39** —— 早于我安装 mnemon 的时间（当晚）
- 但**当前会话里 mnemon 已经生效**：系统提示带 `MNEMON RUNTIME MEMORY SNAPSHOT`，`dev_tool_search` 能列出 `mnemon_*` 全套工具

**正确机制**：
- profile 的 `patchReload: live`（web profile 如此，headless 是 `startup`）
- **新会话在创建时读取当时的 profile 配置** → 配置变更**对新会话立即生效**
- **进程本身不必重启**；正在跑的旧会话保持旧配置不变

**推论（实用）**：验证 dsh 配置变更，**开一个新会话即可**，不必动长期运行的进程。
（对比：`patchReload: startup` 的 headless profile 才需要重启才有新配置。）

## 二、✅ mnemon 在 dsh 侧的双向验收（不只是"列得出来"）

`dev_tool_search` 返回 **25/27 个匹配工具**，其中 mnemon 家族齐全：
```
mnemon_recall · mnemon_remember · mnemon_status · mnemon_related · mnemon_link · mnemon_forget
mnemon_memory_bodies · mnemon_memory_body_create/update/merge
mnemon_document_search · mnemon_document_create · mnemon_document_manage
mnemon_runtime_memory · mnemon_view_route · mnemon_view_action · mnemon_subagent_result
```

**实调 `mnemon_status` 的返回**（与 CLI 完全一致）：
```json
{"healthy": true, "version": "0.2.9", "commandFound": true, "writeEnabled": true,
 "memorySpaces": {"total": 1, "active": 1, "healthy": 1, "unhealthy": 0, "providerDisabled": 0},
 "aggregate": {"totalInsights": 195, "deletedInsights": 0,
               "edgeCount": 5498, "oplogCount": 196, "dbSizeBytes": 5267456}}
```
→ **CLI 侧 195 insights / 5498 edges 与 dsh 侧报告完全吻合**，`healthy: true` / `commandFound: true` / `writeEnabled: true`。

**注意工具用法约束**（Host 侧强制）：
- `mnemon_recall`：**每轮只允许一次**初始查询 + 一次 LLM 选的 refinement；**只在当前问题确实需要历史时才调**
- `mnemon_related`：**每轮最多一次遍历**，且只能遍历**本轮 recall 已准入**的 insight
- `mnemon_runtime_memory`：只写**新的用户提供事实**或**显式保存/更正请求**，**永不写检索到的证据**
- `mnemon_remember`：普通新热记忆应走 `mnemon_runtime_memory`；直接写 Space 只用于显式长期持久化或容量迁移

## 三、✅ deja 也同时接上了（本轮顺带发现）

工具面里还有 deja 家族：
```
deja_recall      — 搜本机过去所有 AI coding session（跨 agent）
deja_session     — 单个最佳匹配会话的完整摘要
mcp__deja__deja  — deja 的 MCP 工具
```

## 四、当前生效的完整工具面（2026-09-28）

**resident**：`bash` / `dev_tool_search` / `skill_load` / `skill_search` / `str_replace_editor` / `web_search`

**按需解锁**（`dev_tool_search`）：
- 记忆：`memory_search` / `memory_read` / `memory_profile` / `memory_remember`（reasonix 语料）+ `mnemon_*` 全套
- 会话检索：`deja_recall` / `deja_session` / `mcp__deja__deja`
- 编排：`subagent` / `subagent_fork` / `workflow` / `ralph` / `create_goal` / `get_goal` / `update_goal`
- 控制：`interrupt_agent` / `send_message` / `list_agents` / `todo_write` / `ask_user_question`
- 作业：`job_list` / `job_output` / `job_kill` / `read_image`
