---
id: mem-58e0aa22945dd8fd974eac57f220db32
revision: 1
created_at: "2026-09-22T23:35:46.570425Z"
updated_at: "2026-09-22T23:35:46.570425Z"
name: reasonix-workspace-autocommit-verification-20260923
title: 工作区占用问题的真正修复：reasonix-autocommit.ps1 + 计划任务（2026-09-23 检测）
description: 检测确认：本对话「工作区占用/Merge-Back」问题的真正修复体是 reasonix-autocommit.ps1 + 每 2 分钟计划任务（非 dsh，排他证据=9/21 dsh 最晚 10:44），并纠正我上轮「用排除换 porcelain=0」的方向性错误
keywords: reasonix-autocommit.ps1,ReasonixWorkspaceAutocommit,工作区占用真正修复,autocommit.log,dsh 未参与,排除一切是错方向,worktree 副本完整,-CommitBaseline
activation: relevant
metadata:
  type: user
  fact_type: project
  scope: global
---

## 一、检测结论（2026-09-23）

用户问「dsh 是否已经把本对话的问题（工作区占用 / Merge-Back 报错）修复」——**修了，但不是 dsh**。

真正的修复体：`C:\Users\27063\Desktop\reasonix-ops\reasonix-autocommit.ps1`（3,266 B，2026-09-21 20:08 创建）+ 计划任务。

| 项 | 实测 |
|---|---|
| 任务名 | `\ReasonixWorkspaceAutocommit` |
| 触发 | `StartBoundary 2026-09-21T20:08:00`、`Interval PT2M`（每 2 分钟） |
| 状态 | `Enabled` / `Ready` / `Last Result: 0`；Last Run 2026/9/23 7:34:02 |
| 执行体 | `powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File <上述路径>` |
| 日志 | `%APPDATA%\reasonix\autocommit.log`（超过 512KB 自动截尾 400 行） |
| 锁 | `%APPDATA%\reasonix\autocommit.lock`（10 分钟陈旧保护） |
| 撤销 | `schtasks /Delete /TN "ReasonixWorkspaceAutocommit" /F` |

脚本目的（原文）：Keeps git HEAD in sync with the working tree, so that Reasonix “Create isolated worktree” always produces a **COMPLETE** copy → multiple sessions can write in parallel。
作者署名 `Reasonix Autosave` / `autosave@reasonix.local`（与 9/21 那些 autosave 提交作者一致）。
安全设计：单实例锁、遇 merge/rebase/cherry-pick 跳过、clean 时 no-op、**从不删/从不 reset/从不 checkout**。
自动发现工作区 = Reasonix home 下所有含 `.git` 的直接子目录 + `global-workspace`。

**实测工作痕迹**：9/21 20:08–20:31 管 `global-workspace` + `文件翻译`；**9/22 14:58–15:32 为 `文件翻译2` 提交 300+ 文件**（14/50/3/37/5/…/94/10/31）。

## 二、不是 dsh（关键排他证据）

- 9/21 的 dsh gate job 共 37 个，**最晚 10:44:45**，此后整天无任务 → 20:08 的部署与 dsh 无关
- 9/22 dsh 只有 15:20–15:24 的 4 个 job，内容是 **MIT 18.065 译者注规格修订**（deepseek-v4.1-flash / effort=max / rc=0 / done / 251s / 137,861 B），产物在 `%TEMP%\dsh-gate\`；`~/.dsh/scratch/draft.md`（27KB）也是 Strang 习题解

## 三、本机工作区格局（重要）

`%APPDATA%\reasonix\` 下有 **3 个独立 git 仓库 = 3 个独立写者域**（各自有 .git，租约 key 解析最近 .git → 不共享写者域，符合官方推荐的「不同项目用不同 workspaceRoot」）：`global-workspace`、`文件翻译`、`文件翻译2`。

注意：若把多个项目放在**同一个** git 仓库根及其子目录下，会因租约折叠到最近 .git 而共享写者域 → 冲突。

## 四、我这一轮的方向性纠偏（教训）

**错**：用「把未提交项排除掉」换 `porcelain=0`（旧 `-Heal` 写 290 条排除一切规则）。
**对**：声明原则 —— **只排除「可再生的依赖/缓存/运行时」；你的数据全部纳入版本控制**（Reasonix 原生的 `.git/info/exclude` 26 行版就是这个）。
**理由**：worktree 隔离副本来自 git 索引；排除 = 新会话在独立工作区里看不到这些文件 → 制造「工作区像被占用/文件不见了」。

已修：`reasonix-doctor.ps1` → v2（10,471 B）：`-Heal` 写原生规则、新增 `-CommitBaseline`（提交而非排除）、`-ExcludeAll` 降为显式废弃选项；技能同步写入该原则。

## 五、执行过的动作与当前状态

动作：备份整个 `.git`（719.6 MB）→ `git reset --soft 6bdaac24` + `git reset -q` → 恢复 26 行原生 exclude → `git add -A` + commit（7,213 文件）→ 验证。

| 项 | 值 |
|---|---|
| HEAD | `0c5c2d45 chore: Reasonix baseline snapshot (2026-09-22)`；父 `6bdaac24` |
| 提交数 | 8 → **2**（去掉了 6 个 autosave 噪声：`.autoprobe.txt`、`autosave-e2e-test.md`） |
| porcelain | 0 |
| 跟踪文件 | 7,214（数据全纳入） |
| exclude | 26 行原生规则 |
| `.git` | 719.6 MB（数据基线的必要代价；新旧快照 blob 复用 → gc 收益极小，故未 gc） |
| 工作区 | 283 顶层 / 23,570 文件（`ccgp-download` 15,951 + `deepseek_data` 5,444 = 91%） |
| worktree 实测 | `git worktree add --detach --no-checkout` **成功** → 官方前提（source checkout 干净）成立 |
| 四条阻断项 | 全 `[ OK ]` |

## 六、备份位置（可回退）

- `Desktop\reasonix-ops\backup\git-before-reset-20260923-073221\` — reset 前的完整 `.git`（719.6 MB）
- `…\backup\20260923-073250\` — 含 `index` 与 26 行 `exclude` 快照
- `…\backup\exclude-290rules-rejected-20260923` — 被否决的「排除一切」规则留档
- `reasonix-doctor.ps1.bak-20260923-pre-fix`、`skills\…-doctor.md.bak-20260923-pre-fix` — 纠偏前版本

## 七、待办 / 可选

1. 想继续降低「整区写」代价 → 把 `ccgp-download` / `deepseek_data` **物理移出**工作区（照搬 Linux 先例：大目录外移 + 链接），**不要**用排除
2. 快照 719.6 MB 与 autocommit 每 2 分钟的 `git add -A` 叠加，工作区变大时提交会变慢 → 瘦身是同一件事的正解
