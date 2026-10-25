---
id: "91ba0419-c485-418c-89c7-488475dfab28"
title: "DSH 三套「分叉」机制取证：UI session fork / subagent_fork / mnemon 文本 checkpoint splice"
description: "2026-10-01 调查 DSH 中 session fork 与 fork subagent 的关系、为何 agent 无法自行使用顶层 session fork、本地 105 个 child session 的实际来源，以及可给 agent 暴露 fork 能力的已装插件清单；含 isSeeded 核账判据与跨包 grep 静默失败的教训。"
status: "active"
created_at: "2026-10-01T12:23:49.494Z"
updated_at: "2026-10-01T12:23:49.494Z"
content_hash: "19df998aa5a22bfe71046061e16985c86d4b60f918016971056362744c94a851"
source_paths:
  - "profiles/node_modules/@deepseek-ai/dsh-subagent-fork-in-process/lib/index.js"
  - "profiles/node_modules/@deepseek-ai/dsh-subagent/lib/index.js"
  - "profiles/node_modules/@deepseek-ai/dsh-subagent-in-process-driver/lib/index.js"
  - "profiles/desktop/cordis.patch.yml"
  - "profiles/node_modules/@deepseek-ai/dsh-tool-cordis/lib/types/api-catalog.js"
session_ids:
  - "8ff3884b-c9b8-4e80-a29c-48716971e147"
memory_body_ids:
  []
---

# DSH 三套「分叉」机制取证（2026-10-01）

触发问题（用户原问）：像这样的功能 agent 自己用吗？是否有插件能向 agent 提供这一工具？我看 dsh 似乎从来都没有利用这样的东西。

## 1. 硬事实：seed 机制在两处同源

`profiles/node_modules/@deepseek-ai/dsh-subagent-fork-in-process/lib/index.js`（61 行，provider name `subagent-fork-in-process`）：

```js
function completedTurnPrefix(parent) {
	const events = parent.session.snapshotEvents();
	const lastEnd = events.findLast((e) => e.type === "turn/end");
	if (lastEnd === void 0) return [];
	return events.slice(0, lastEnd.seq + 1);
}
// ForkInProcessProvider.capabilities = { agentOptions, outputSchema, depthLimit, toolFilter, persona }
// inheritsParentContext = true
start(request) { const seed = completedTurnPrefix(request.parent);
                 return startInProcessRun(request, { ...seed.length > 0 ? { seed } : {} }); }
```

- seed 截止到**最后一个 `turn/end`**，`slice(0, lastEnd.seq + 1)`；未完成 turn 不平衡、不可重放。注释明确：live sequence numbers 等于数组下标，所以结果从 seq 0 起连续且是合法 seed。
- 顶层 session fork 用**同一套** cut 语义，区别只在兑现方式：session fork 产出**新顶层 session**，fork subagent 产出**一次 call/return**。

使用方：`profiles/desktop/cordis.patch.yml:526-548`（`web/cordis.patch.yml` 同）已挂

```yaml
- id: tool-subagent-fork
  name: '@deepseek-ai/dsh-tool-subagent'
  config: { provider: fork, toolName: subagent_fork }
```

## 2. 核账判据（可复用）

- `profiles/node_modules/@deepseek-ai/dsh-subagent/lib/index.js:470-481`
  ```js
  function childSessionMeta(parent, childDepth, isSeeded) {
  	return { ...cwd, ...agentPreset, parentSession: parentHeader.id, isSeeded, origin: "subagent", delegationDepth: childDepth };
  }
  ```
  `isSeeded` 字面即「child 有没有 seed」。
- `profiles/node_modules/@deepseek-ai/dsh-subagent-in-process-driver/lib/index.js:167-185`：仅在 `seed !== undefined` 时才传 `seed` 与 `inheritedEventCount`（`activationBoundary = SessionLogOffset(seed?.length ?? 0)`）。

实测（扫 1001 条 session：896 root + 105 child）：**`isSeeded` 全为 false** ⇒ UI session fork 使用 0 次，`subagent_fork` 触发 0 次。

## 3. 105 个 child 的真实来源

- 103/105 首事件签名为 `sandbox/mode|approval/policy|permission/preset|agent/inbox/spliced|turn/start`；
- 其上下文是**文本摘录注入**而非 event-prefix seed，首句固定 `"Bounded completed checkpoint (untrusted evidence; some context may be omitted; skip candidates needing missing evidence)"`，条目带 `[assistant/message; checkpoint event 659]` 这类 parent-seq 标记，单例约 24K chars；
- 归属：parent 的 seq 792 有 `subagent/catalog{childId, childCreatedAt, mode: "one-shot", label: "Mnemon idle checkpoint review"}` ⇒ 即 **dsh-mnemon idle checkpoint review** 的廉价 fork 仿制品（自己 bounded 到 ~24K，代价是显式声明会丢 evidence）。

⇒ 环境里三套「分叉」共存：① UI session fork（event-prefix，未用）；② `subagent_fork`（event-prefix，in-process，挂着未触发）；③ mnemon 文本 checkpoint splice（在用，lossy）。

## 4. 为什么 agent 无法自己用顶层 session fork（本质，非 bug）

fork 出的 **child session 是 future-shaped object**——一条「以后走进去的线」；而 agent 的 action space 止于「这轮返回什么」，没有任何动作能兑现该对象。没有对 child session `send` / `list` / `attach` 的工具时，fork 是只写不读的产物。

对照 `subagent_fork`：同一 seed 机制被包成 request/response（`start(request)` 返回 run，结果回到当前轮），**闭包在单轮内、可兑现**，所以 agent 用它很自然。

- 类比：session fork = continuation（需调度器再次 resume），subagent = call/return；模型只会说 call/return，continuation 只能由调度器（用户 / Web UI）持有。
- 推论：要让 agent 真用上 session fork，缺的不是 fork 工具，而是**对 child session 施加动作的另一半**（`send_message` / `list_agents` / `job_output`）。官方已埋此轴：`tool-subagent-control`（`profiles/desktop/cordis.patch.yml:520-524` 的 `list-agents`）。
- `sessions.fork` 在 core 中只作为 cordis ctx 可调用面存在（`profiles/node_modules/@deepseek-ai/dsh-tool-cordis/lib/types/api-catalog.js:1923-1926`），**无 model-facing 工具**。

## 5. 能给 agent 提供 fork 能力的已装插件（来自 `~/.dsh/storages/plugins.json`）

| 插件 | 给 agent 什么 |
|---|---|
| `dsh-session-fork`（Jason-skd） | `/branch` + 分支页签 + `send_message_by_branch` 跨分支消息 + 秘书根分支调度、squash/rebase 合回；把分支变成 agent 可寻址可写回的对象 |
| 某 remote-access 插件 | `fork_session` 工具 |
| 多个（"Adds generation_fork and generation_run"） | `generation_fork` / `generation_run`：拷 preset + 在新会话跑任务 |
| graft 类 | 读 session log 切片 / turn 边界 fork / 跨 session 转发 graft 消息 |
| `dsh-delegation-suite`（gezi-wen）等 | `subagent_route` / `subagent_fork_route`：模型自选 provider/model |
| `dsh-sidechain`（omdsh-dev）/ Codex-style `/side` / `btw` | `/side` 持久侧会话 + `/btw` 一次性侧问，跑在 fork provider 上、不写主历史 |
| `dsh-fork-relink`（Enosensu） | 官方 fork 后递归复制 subagent 子树（治「fork 丢子代理」） |
| `dsh-branch-inbox-guard`（xine2009cn） | 清掉 fork child **继承的排队 prompt**——暴露不变量：fork 继承的不只 log，还有 inbox 队列，故 child 首轮会跑去执行 parent 的下一句话 |
| `dsh-fork-graph` / `dsh-fork-diff` / `dsh-branch-review`（chouyong） | 血缘图 / 分叉 diff / 分支决策记录（治「没有 merge」） |
| "Durable background child agents on the official subagent seam" | 后台 child：可 list / message / interrupt（即第 4 节缺的那半边） |

## 6. 建议行动（当时给用户的两条）

1. 零安装先用已挂的 `subagent_fork`：策略为「接着这段对话往下做」的子任务（复核、续写、审阅）→ `subagent_fork`；真正独立新任务 → `subagent`。persona/preset 注入先例见 `profiles/desktop/cordis.patch.yml:164-165`（`subagent-language`）。
2. 要 agent 真能用顶层 session fork，装 `dsh-session-fork` 优于自写；最小自写面为 `ctx.sessions.fork({sessionId, atSeq}) -> childId` + `ctx.agents.get(childId).send({...})`。

待清项：`~/.dsh/tmp-probe/s3a65.jsonl`（session-log 形状，header `isSeeded:false, delegationDepth:0`，含一条 spliced inbox），可能是 `~/.dsh` 那 1 个 uncommitted 变更。未查死项：UI 那个 fork 按钮 label 仍 0 命中——大量插件都在改该按钮，很可能来自插件注入而非 core 前端。

## 7. 方法论教训

跨包 `grep -rI` 在该 tree 上**会静默返回空**（多次 0 命中而单文件 grep 有命中）⇒「grep 不到」不能当否定证据，必须带 positive control 或缩小 scope；本调查所有结论均用单文件/定点验证。
