---
id: mem-b993dfd9e53928ccfc5812661513ff76
revision: 1
created_at: "2026-09-20T23:51:32.8946799Z"
updated_at: "2026-09-20T23:51:32.8946799Z"
name: reasonix-workspace-write-lease-mechanism
title: Reasonix 工作区写租约机制与 Windows 侧冲突根因（2026-09-21 实测）
description: Reasonix 写锁的真实粒度是「工作区」不是文件；冲突根因 = 机制设计 + Windows 侧 global-workspace 从未瘦身（23,506 文件 / 22,800 git dirty）
keywords: workspace lease,工作区正在被写入,workspace mutation conflicts,global-workspace 瘦身,ccgp-download,reasonix worktree,多并发写锁
activation: relevant
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 一、机制（客户端代码实测，非推测）

**写隔离单位 = workspaceRoot（工作区），不是文件/项目。** 同工作区内，一方做「整区写入」时其他任务全部排队，哪怕写的是完全不同的文件。

证据（v1.38.10，`...\Reasonix\versions\v1.38.10\app\resources\app\assets\zh-CxADINSy.js`）：
- `runtime.workspaceConflictTitle` = 当前工作区正在被写入
- `runtime.workspaceConflictExternal` = 另一个 Reasonix 窗口当前正在写入这个工作区。
- `runtime.workspaceConflictNote` = **冲突的同文件或整区写入**结束后，本任务会自动继续。
- 英文：`notice.workspaceLease` = Another session is writing to this workspace; ...
- 代码里有 `session_lease_held`（runtime issue code）、`runtime_owner_id` / `runtime_lease_until`、`reclaimBusyTab`；UI 提供「查看占用任务 / 在 worktree 中继续 / 停止等待」
- 并行写的唯一前提：config.toml `max_parallel_writers = 32  # concurrent writers with non-overlapping write_paths` → **声明非重叠 write_paths 才并行**，否则取整区写权
- 锁目录 `%LOCALAPPDATA%\reasonix\workspace-leases\`：`<64位hash>.lock`（= workspaceId 的 hash，如 9b4ba8c1bea8407c0dcb5795… 对应 desktop-tabs.json 里 `project-9b4ba8c1bea8407c0dcb5795`）、`path-XXX.lock`、`tree-XXX.lock`、`*.lock.queue`
- 桌面会话跑在 git worktree：`%LOCALAPPDATA%\reasonix\worktrees\<inst>\<hash>\metadata.json` 记 sourceRoot/targetBranch/createdHead，分支名 `reasonix/delivery-<时间>-<hash>`；**交付回源仓库期 = 整区写权**

## 二、Windows 主力机实测现状（2026-09-21 07:5x）

- `sourceRoot` = `%APPDATA%\reasonix\global-workspace`：**23,506 文件**；`ccgp-download` 15,951 + `deepseek_data` 5,444 = **91%**；`git status --porcelain` = **22,800 行**（分支 master）
- 进程树：1 个 Electron 窗口（Reasonix.exe 27420 + gpu/renderer/utility）+ `reasonix-desktop.exe --host-rpc`(27636) + 它派生的 3 个 worker(23772/27912/11092，7:35–7:43 启动) + 常驻 `reasonix-bot`(8676)。判定是跨进程的（共享 workspace-leases）→ 所以提示会说「另一个 Reasonix 窗口」
- 今早 `crash-fatal\27636.log`、`crash-pending` 时间戳 7:33:44（日志为空）；`desktop-shell\logs\service.log`: 2026-09-20 08:25 `WARN desktop: session history load failed err="workspace mutation conflicts with persisted state"`
- 跨机冲突：9/11 21:34 批量 `*.conflict.linux.*.bak`（8 个 session + memory + skills + 工具脚本）
- 锁残留：`workspace-leases` 共 293 个 0 字节文件（79 path-* + 79 tree-* + hash/queue），最早 9/06，从不 GC

## 三、「上次没处理干净」的准确含义（核对结论：成立）

- 8/15 的瘦身（大目录外移+symlink、watcher 2,725→178、同步 EXCLUDE_DIRS、cron 避让活跃会话）**只做在 Linux 机**
- 8/16 的《多并发与长任务规范》**只是使用层规避**（长命令后台化、输出写工作区外、会话长度控制），不动机制
- Windows 侧同一个 global-workspace 里 `ccgp-download`/`deepseek_data` 原封未动 → 整区写代价始终很大
- 未验证项：reasonix-bot 与 3 个 worker 各自的工作区归属（只确认共享锁目录）

## 四、处置优先级（2026-09-21 用户选择「只记档」，以下均未执行）

1. 大数据目录移出工作区（照搬 Linux 先例：大目录外移 + symlink/忽略）→ 2.35 万文件降到 ~1,500
2. 不同项目用不同 workspaceRoot（不同租约天然不互斥）
3. 同区一次一个写者：长命令 run_in_background、输出写工作区外、「在 worktree 中继续」
4. 排查 bot/worker 工作区归属，避免与桌面端同区
5. Windows 侧补「有活跃写入则跳过本轮同步」机制

相关：reasonix-多并发-长任务后台化规范（8/16 使用层）、workspace-write-lag-fix（8/15 Linux 侧结构层）
