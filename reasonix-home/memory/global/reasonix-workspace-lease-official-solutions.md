---
id: mem-eba0ccb0e5471df39b8a69f050162d02
revision: 1
created_at: "2026-09-21T02:23:29.6783464Z"
updated_at: "2026-09-21T02:23:29.6783464Z"
name: reasonix-workspace-lease-official-solutions
title: Reasonix 工作区占用：官方解法与勘误（2026-09-21 实搜）
description: Reasonix 工作区占用：官方机制原文 + 三类型区分 + 解法清单 + 本机实测，并勘误 8/16 记忆里「写工作区外即不争锁/后台化即释放锁」
keywords: workspace lease,#9077,#10509,#8990,#9111,write_paths 文件粒度,worktree 隔离,reasonix-desktop 重启,workspace mutation conflicts
activation: relevant
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 一、官方机制原文（最权威，中文版）

`docs/SESSION_RECOVERY_AND_PARALLELISM.zh-CN.md` 开篇：
> Reasonix 将会话记录持久化和工作区文件修改分成两条安全边界。**只读任务和互不重叠的文件声明可以并行执行；不透明写入（例如无限制 shell 或未知 MCP 修改）继续使用工作区写租约。** 需要独立工作区的任务可以使用 Git worktree 隔离。

PR #6542（引入 workspace lease）的两条关键设计：
1. 「acquired only at the **first mutation** and retained through **participating agents and background jobs**」——租约在首次变更时获取，并**贯穿参与的 agents 与后台任务保留**（re-entrant，root agent / task subagents / skill subagents / retained background jobs 共享一个 owner）
2. 「The lease key resolves the **nearest `.git`** marker through the filesystem, so opening a Git repository root and one of its subdirectories **shares one writer domain** even when Git is not installed.」→ **这就是「不同项目文件也冲突」的官方根因**；反过来「Separate **linked worktrees** retain independent writer domains」→ 官方解法
3. 「lock files live outside the user's workspace and OS file locks are authoritative across processes」

细化到路径级（issue #9111 / #9055）：`WorkspaceLease.AcquireWrite(ctx, targets)` 按目标路径协调，**disjoint paths 立即并行**；但 `HoldWriteForPaths`（`scope.go:52`）对**目录做前缀匹配** → 声明 `src/` 这类目录级 write_paths 会让两个写不同文件的 writer 被判 overlap → 退化成排他等待。结论：**write_paths 必须声明到文件粒度**（对应 PR #9284）。

## 二、三种不同现象（不要混为一谈）

| 类型 | 现象 | 根因 | 状态 |
|---|---|---|---|
| A 活动写者短时持有 | UI 「当前工作区正在被写入」，冲突结束后自动继续；acquire 被打断则 fail-fast 报 `acquire workspace write lease: acquire file lock: context canceled` | 另一会话/子代理/后台任务/不透明 shell 持有整区租约 | 设计如此 |
| B 回合结束仍占用 | 对话已结束仍显示被占用，`runtime_lease_until` 持续续约不自动过期 | 进程 heartbeat 不释放 | **#9077 open**，官方确认未修；解法=重启 `reasonix-desktop` |
| C state 层冲突 | `WARN desktop: session history load failed err="workspace mutation conflicts with persisted state"`；严重时工作区永久只读 + shell 永久失效 | v5 迁移非幂等等（#10509 四项根因） | **#10509 open**；#10510 只覆盖启动时所有权冲突 |

## 三、解法清单

**A 立刻解开**
1. UI 阻塞卡片：「查看占用任务 / 停止等待 / 在 worktree 中继续」
2. `Stop-Process -Name reasonix-desktop -Force; Start-Process "reasonix-desktop"`（#9077 正文确认解法；会终止正在跑的回合）
3. 定位持有者：`<工作区>/.reasonix/tasks/<task>/snapshot.json` → `state`/`runtime_state`/`runtime_lease_until`/`runtime_owner_id`（无 live lease 的 running 记录会被当作陈旧）
4. 官方 CLI：`reasonix sessions diagnose` / `reasonix sessions cleanup` / `reasonix doctor session <id> --export-v1 PATH.jsonl`；`reasonix doctor credentials|billing|catalogs`

**B 结构性不撞**
1. **隔离 worktree**（官方推荐，#8990 官方立场是**不**放开同区并发写）。限制：source checkout 必须干净（有未提交/未跟踪文件会拒建，提示先 commit/stash）；未装 Git 时不可用（回退到 workspace lease）
2. **write_paths 声明到文件粒度**（不要写目录）
3. **减少不透明写入**：无限制 shell / 未知 MCP 修改一律取整区租约；能声明路径的写工具优先
4. **不要把多个「项目」放在同一个 git 仓库根下**（租约折叠到最近 .git）
5. 只读任务并行不受限（不占写租约）；`read_only_task`/只读 `parallel_tasks` 同理
6. 配置：官方示例 `max_parallel_writers = 3` / `max_subagent_concurrency = 6`（本机设的是 32）；`--dir PATH` 可切 workspace 根

**C 版本**
- v1.38.10 → **v1.38.11**（2026-09-20 发布，主题含「会话迁移、接管与导出可靠性 + Windows 凭据与 Shell 修复」）

## 四、本机实测（2026-09-21）

- 类型 A 亲历：写 `%TEMP%` 的命令也被 workspace write lease 挡住，数秒后同命令成功 → **瞬时竞争**；证明租约在**工具调用层**获取，与输出目录无关
- 无陈旧租约：`tasks/*/snapshot.json` 全部 `runtime=exited`、`lease_until=0001-01-01`
- `workspace mutation conflicts with persisted state` = 1 次（9/20 08:25）；`refusing unsafe event-log replay` = 0 次
- root 大小写三处记录一致（未踩 #10509 评论里那条大小写不一致）
- `desktop\session-migration-v5.json`：`attempts: 49`、`sourceRevision: stat-v1-…`、status=completed（与 #10509 点名的 stat 型幂等键吻合，异常值）
- 版本 1.38.10；`global` 工作区（Roaming）与它的 worktree（Local\worktrees\…）是**两个独立写者域**，同时开会互不阻塞但内容可能互相覆盖

## 五、对已有记忆的勘误（重要）

修正 `reasonix-多并发-长任务后台化规范`（2026-08-16）两条表述：
1. ❌「长任务写工作区外 → 不争锁」——实测不成立：租约按**工具类型 + 声明的写路径**判定，bash 是不透明写者，输出到哪都取整区租约
2. ❌「命令立即返回 → 写租约立即释放」——与官方 PR #6542「租约贯穿 participating agents and background jobs」不符；后台化改变的是前端是否被阻塞，**不等于释放租约**（此条官方原文支持，但「后台任务是否延长租约」的精确语义仍待验证）

## 六、未验证
- 后台任务对租约持有时长的精确影响
- v1.38.11 是否已覆盖 #10509 全部四项根因（issue 仍 open）
- reasonix-bot 与 3 个内核 worker 各自的工作区归属
