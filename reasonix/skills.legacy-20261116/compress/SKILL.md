---
name: compress
description: 手动压缩本会话上下文并把 dsh 的 /compact 解锁 — 走 bili 的 compress 工具（摘要由模型写，不依赖 bili 的摘要后端）。用户说 "/compress"、"压上下文"、"压缩上下文"、"上下文太满了"时触发
disable-model-invocation: false
---
# /compress — 手动压上下文，同时给 /compact 开路

## 什么时候用

- 用户打 `/compress`（dsh 没有注册这个命令，它就是一普通消息，靠本技能接住）
- 上下文占用高（底部百分比 > 50%），或 bili 报 `Nudge: ACTIVE — OVER-LIMIT`
- 用户点了 `/compact` 但报 `Compaction could not produce a useful summary.` ← 这说明**这个会话的 `blocks` 还是 0**，必须先压一次

## 为什么必须这么走（原理，别省）

bili 收到 dsh 的 compaction 调用（final user message = `COMPACTION_INSTRUCTION`）时只有两条路：

| 分支 | 条件 | 结果 |
|---|---|---|
| A 成功 | `session.state.blocks` 里有 **active block** | bili 用自己的快照本地伪造响应（`#3733` authored checkpoint），不调上游、不花钱 |
| B 失败 | blocks 为空 | 422 → dsh 显示 `could not produce a useful summary` |

**`blocks` 是 per-session 的**：压了 A 会话不会让 B 会话的 `/compact` 可用。
**bili 自己从不自动压**：日志实证 `blocked: T1 (cadence)`，`growth < floor` 就不触发，且 `injectNudge:false` 连提醒都不注入。

⇒ **让 `/compact` 变可用的唯一可靠动作，就是用 `compress` 工具手动压一次。**

## 执行步骤

### 1. 解锁工具（不在默认 resident set，必须先解锁）

```
dev_tool_search({"toolNames": ["compress", "decompress", "acp_status"], "query": "compress conversation ranges"})
```

解锁在**下一个请求**生效。

### 2. 看现状与可压范围

```
acp_status()
```

关注三行：
- `CONTEXT BREAKDOWN` —— 当前 139K tool / 393K text 之类的分布
- `Compressible ranges (N)` —— 每个 range 的 `mNNNNN–mNNNNN`、消息数、token 量；**从最老的开始压**
- `Nudge:` / `OUTPUT BUDGET CLAMP` —— 若出现 `Only compression can recover the input`，说明已经被 bili 钳了输出预算，必须压

### 3. 压（一次调用带完所有 range）

`compress` 的参数用**对象数组**形式，`summary` 是**你写的、自包含的**摘要：

```
compress({content: [
  {"startId": "m00001", "endId": "m01298", "topic": "短标题", "summary": "……"}
]})
```

**摘要写作铁律**（这条决定压完还能不能干活）：
- 记录每项任务**做了什么、为什么这么做**（决策理由比结论重要）
- 保留**完整路径**（`C:\Users\27063\.dsh\...`）、命令、错误原文、版本号、magic number
- 保留**未完成的目标**与**悬而未决的问题**，写明 `Open objectives:`
- 不要写"探索了 X"就完事 —— 要把 X 的结论写出来
- 中英混排：正文中文，术语用英文原词（provider / session / block / tier / token）

### 4. 验证（必做，别跳）

```
curl -s "http://127.0.0.1:18787/__bili/sessions?limit=5"
```

找当前会话那条，确认：

| 字段 | 期望 |
|---|---|
| `contextTokens` | 显著下降（例：619538 → 45831） |
| `blocks` | **≥ 1** ← 这条就是 `/compact` 通不通的开关 |
| `tokensSaved` | 等于压缩掉的量 |

也可以用 `bash` 起 python 读，避免引号地狱：

```python
import json, urllib.request
d = json.load(urllib.request.urlopen("http://127.0.0.1:18787/__bili/sessions?limit=5", timeout=15))
for s in d["sessions"]:
    print(s["id"][:26], s.get("title"), s.get("blocks"), s.get("tokensSaved"))
```

### 5. 告诉用户结果

- 压了多少（tokens / 百分比）
- `blocks` 现在是几
- **`/compact` 现在能不能用了**
- 还原方式：`decompress({blockId: "b1"})` 或 `decompress({blockId:"b1", full:true})` 回到原文

## 硬边界（遇到就直说，别硬编）

**① 当前会话没有 `dev_tool_search` → 本技能无法执行。**
判断方法：工具列表里没有 `dev_tool_search`、也没有 `compress`。
这种情况（例如某些自定义 preset 的会话，工具集是 `bash/read/write/edit/glob/grep/str_replace_editor/todo_write/ask_user_question`）：
**直接告诉用户"这个会话的工具集里没有 compress，也没有 dev_tool_search，压不了"**，然后给两条出路：
- 把该会话的 agent preset 换成 anchored-standard（有 dev_tool_search）
- 或者接受现状，用 dsh 的 emergency fold / 开新会话 + 交接文档

**② `compress` 只压"当前会话"**，不能跨会话。想压别的会话，必须在那个会话里执行本技能。

**③ 压完别立刻再压。** `compress` 会回 "No compressible ranges remain"，此时继续干活即可。

**④ 不是为了省 token 而压。** 压的目的是让 `/compact` 可用 + 避免爆窗；压太碎会丢上下文，摘要质量比压缩率重要。

## 本机速查

| 项 | 值 |
|---|---|
| bili 端口 | `http://127.0.0.1:18787` |
| 会话列表 | `GET /__bili/sessions?limit=N` |
| 配置 | `GET /__bili/config`（`compress.maxContextLimit` 当前 `"50%"`） |
| 日志 | `GET /__bili/logs`（最近 500 行）；全文 `C:\Users\27063\.local\state\billion-context\bili.log` |
| 健康 | `GET /__bili/health` |
| 诊断 | `GET /__bili/diagnostics` |
| bili 重启用 | `taskkill //PID <pid> //F`，dsh supervisor 约 10–15s 自动拉起 |

## 一次真实执行记录（2026-10-23，可对照）

```
1. dev_tool_search → 解锁 compress / decompress / acp_status
2. acp_status → 可压 m00001–m01298（1298 msgs, 504.6K）
3. compress([{startId:"m00001", endId:"m01298", summary:"…"}])
   → Compressed m00001–m01298 → 1 block(s), ~522276 tokens saved
4. GET /__bili/sessions
   → session-992f3685  ctx 619538 → 45831 (5.3%)  blocks 0 → 1  saved 522276
5. 结论：该会话 /compact 从 422 变为可本地应答
```
