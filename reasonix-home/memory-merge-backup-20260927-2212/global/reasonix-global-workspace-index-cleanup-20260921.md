---
id: mem-67ec2628e07e6da67493dc4b50f07160
revision: 2
created_at: "2026-09-21T02:31:51.9262359Z"
updated_at: "2026-09-21T02:42:20.4856333Z"
name: reasonix-global-workspace-index-cleanup-20260921
title: global-workspace 与 Merge-Back 收尾：两轮清理与三条阻断项（2026-09-21）
description: global-workspace 两轮清理（index 22,367→0 未提交）使 Merge-Back 面板两条阻断项归零；定位第三条=活动会话、清理段=30 个 .reasonix/tasks 日志（ignored 也阻止），并指出该 worktree 本就无事可合并
keywords: Merge-Back 阻断项,worktree has uncommitted changes,.git/info/exclude,quotepath 转义,.reasonix/tasks 阻止清理,active work,worktree 无事可合并
activation: relevant
metadata:
  type: user
  fact_type: project
  scope: global
---

## 一、已执行的修复（两轮，均为 git 元数据操作，磁盘零改动）

仓库：`<local-home>\AppData\Roaming\reasonix\global-workspace`（worktree 源）

**第一轮**：`git rm -r --cached` 移出 `ccgp-download`(15951)/`deepseek_data`(5441)/`cleanup_backup`/`strang_ocr_pages`/`batch_tmp` + `.reasonix` + `__pycache__` + 临时产物 globs（共 ~22,000 条）。

**第二轮（关键）**：改用 **`.git/info/exclude`**（仓库本地排除，在 `.git` 内、不进工作区）取代工作区 `.gitignore`：
- 先用固定规则 + 未提交顶层条目，再用 `Get-ChildItem` 的**真实 Unicode 顶层名**全量补齐（282 条）—— 因为 git `core.quotepath` 会把中文名转义成 `\346\226\271`，导致规则不匹配（首轮就因这个残留 39 条）
- `git reset -q` 取消全部暂存
- 移除工作区 `.gitignore`（避免它自身作为 untracked 文件又让状态不干净）

**结果**：source porcelain `529 → 0`，worktree porcelain `1 → 0`，index `3,582,443 B → 43,323 B`，HEAD 未变（`6bdaac24`）。抽查磁盘：`ccgp-download` 15,951 / `deepseek_data` 5,444 / `hostapd.conf` 均在。

**备份**：`.git\index.bak-20260921`、`.git\info\exclude.bak-20260921`（7/18 原版）、`exclude.bak2-20260921`。恢复跟踪：删 exclude 对应行或 `git add -f`。

## 二、Merge-Back 面板三条阻断项的真实对应（2026-09-21 用户贴图实测）

面板原文：`worktree has uncommitted changes` / `the recorded source checkout has uncommitted changes` / `a source or worktree runtime still has active or waiting work`，清理段：`tracked, untracked, or ignored files would be preserved`。

| 阻断项 | 真实来源 | 状态 |
|---|---|---|
| worktree uncommitted | worktree 里 `.reasonix/tasks/**`（1 个 `?? .reasonix/` 条目，未被 ignore） | ✅ 已归零（exclude 生效） |
| source uncommitted | 源目录 529 条未提交 | ✅ 已归零 |
| active or waiting work | **当前正在该 worktree 里跑的会话**（+ `task.lock`） | ❌ 只能等会话结束 |
| files would be preserved | 那 30 个任务日志（**ignored 也算阻止**） | ⬜ 需文件不存在 |

## 三、关键判读（重要）

面板显示 `领先 0 · 落后 0`、`6bdaac24 → 6bdaac24`、`变更文件 30 / +0 / -0` → **该 worktree 根本没有可合并内容**，唯一内容是任务日志。所以用户遇到的「合并报错」本质是 **收尾清理被阻止**，不是代码合并冲突。

## 四、最后一刀（交给用户，我不删数据）

worktree 里 `f5df9c031a/.reasonix/tasks/e9453d68c009c509d0b8a99e--bash-{1..10}`（每个含 events.jsonl/snapshot.json/0 字节 task.lock，时间 2026-09-20 08:29–09:51，均 `state=succeeded/cancelled, runtime=exited`）已备份到：
`C:\Users\27063\AppData\Local\Temp\reasonix-session-tmp-4110580412\rx-task-backup-20260921`（30 个文件）

结束后执行：
```powershell
Remove-Item -Recurse -Force "C:\Users\27063\AppData\Local\reasonix\worktrees\5837d8e9c978de32\f5df9c031a\global-workspace\.reasonix\tasks\e9453d68c009c509d0b8a99e--bash-*"
```
然后重试「合并至主分支」。

**不要勾「自动提交工作区未提交修改」**：它会把 30 个运行时文件提交进分支（垃圾入 master），且不解 source/active-work 两条。

## 五、未做 / 待决

- 改 `config.toml`（`allow_write` 三条 `/home/tianque/*` 失效、`max_parallel_writers 32`）→ 需重启应用
- 不 commit 任何用户文件（含 `scripts/deepseek/deepseek_token_*.cjs` 等候复核项；`reasonix.toml.conflict.*.bak` 类已排除）
- 更根本：`global-workspace` 是「杂物工作区 + 仅 1 个 commit」，不适合当 git 工作区（worktree 里看不到未提交文件）。若要真正版本化，应另建干净仓库

## 六、官方 worktree 错误文案出处

`...\Reasonix\versions\v1.38.10\app\resources\app\assets\zh-*.js` → 搜 `worktree\.` / `projectTree\.`（cleanupBlocked / mergeReceiptInvalid / cleanupViewBlocked / stateChanged / alreadyMerged / mergeUnavailable / worktreeCreatedDirty）
