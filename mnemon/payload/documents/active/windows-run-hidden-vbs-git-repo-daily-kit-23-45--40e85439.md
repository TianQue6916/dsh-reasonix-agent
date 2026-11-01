---
id: "40e85439-8d36-4514-a3e1-58044e241b25"
title: "Windows 计划任务静默化（run-hidden.vbs）与三套 git repo 分工诊断：daily-kit 23:45 弹窗根因、inbox 空跑 35 天（2026-11-01）"
description: "2026-11-01 调查：每天 23:45 弹出窗口的根因是 daily-close 计划任务直接调 bash.exe；给出 wscript + VBS 隐藏窗口 + 日志重定向的改法、XML 回滚路径，以及 ~/.dsh / dsh-reasonix-agent / inbox 三套 repo 的职责与活动量对照（inbox 自 09-27 起无提交）。含沙箱对 D 盘无写权限的落地位置选择。"
status: "active"
created_at: "2026-11-01T16:05:19.275Z"
updated_at: "2026-11-01T16:05:19.275Z"
content_hash: "63ebe47270a8e42ef41c722d5c808301bb98ef1b7bac2ed6d8e0e648b9689e66"
source_paths:
  - "daily-kit/daily.sh"
  - "daily-kit/config.sh"
  - "daily-kit/pushall.sh"
  - "daily-kit/daily.log"
  - ".dsh/storages/tools/run-hidden.vbs"
session_ids:
  - "fc43a50a-945f-4f46-af8d-1f5dcd6a10f3"
memory_body_ids:
  []
---

# Windows 计划任务静默化与三套 git repo 分工诊断（2026-11-01）

相关既有文档：`37e02e35-130b-4cd7-8fd2-9aec17f1f11e`（GitHub 每日备份静默断链 20 天、junction 根因、备份 repo 体检清单）。本文只记本次新增的两块：**计划任务为什么弹窗、怎么静默化**，以及 **三套 repo 各自今天有没有真的在动**。

## 1. 现象与根因

用户截图里每天 23:4x 自己弹出一个窗口。根因不是脚本坏了，而是注册的计划任务 Action 直接调用：

```
C:\Git\usr\bin\bash.exe -lc "TRIGGER=scheduler /d/daily-kit/daily.sh close"
```

`bash.exe` 是控制台程序，任务未设置隐藏 ⇒ 每次触发都开窗口。**输出也只存在于那个窗口里，窗口一关就丢。**

## 2. daily-kit 的四个任务与语义

| 任务 | 时间 | 命令 |
|---|---|---|
| `daily-snap-0930` | 09:30 | `daily.sh snap auto` |
| `daily-snap-1900` | 19:00 | `daily.sh snap auto` |
| `daily-close` | 23:45 | `daily.sh close` ← 每次弹窗的这个 |
| `daily-pushall` | 23:50 | `pushall.sh --reason 'auto: 每日批量'` |
| `ReasonixGitHubBackup` | 23:30 | `backup-to-github.ps1` |
| `dsh-SmartSnapshot` | 14:18 | `smart-snapshot.ps1` |

`daily.sh` 是「当天临时流水区」而非备份，语义：

- 工作副本 `D:/00-Inbox/work`（独立 repo），远端 `git@github.com:TianQue6916/inbox.git`
- `snap`：`git add -A` → 无变化直接返回（不产生空 commit）→ 分支 `days/win/<date>`，基于 main 干净起点
- `close`：push 分支并校验 sha → 转成同名 **tag**（`--force`，因为当天 ref 是可变容器）→ 删远端分支 → 校验后才本地清零；ignored 文件搬 `keep/<date>/` 不静默删
- 前缀在 `daily-kit/config.sh`：`PREFIX=days/win/`（Linux 端 `days/lin/`，避免双机撞同名 tag）；`REMOTE_URL` 用 SSH，计划任务里不弹 GCM
- 设计细节值得保留：`remote.origin.fetch` 只映射 main（默认 refspec 会让 push 出去的 `days/*` 变成 remote-tracking ref，清零 gc 时把对象保活）；`push.default nothing`；`gc.auto 0`

因此 `close` 打印「今天没有可提交的内容（$br 不存在），只做归档与清零」是**正确输出**，不是故障——它表示当天确实没往流水区丢东西。

## 3. 静默化实现

中间层 `~/.dsh/storages/tools/run-hidden.vbs`：

```vbs
Set sh = CreateObject("WScript.Shell")
sh.Run "C:\Git\usr\bin\bash.exe -lc " & Chr(34) & cmd & Chr(34), 0, False
```

第二个参数 `0` = 隐藏窗口；第三个 `False` = 不等退出，`wscript` 立即返回、bash 后台跑完。四个任务的 Action 改成：

```
wscript.exe "C:\Users\27063\.dsh\storages\tools\run-hidden.vbs" "<原命令> >> /d/daily-kit/daily.log 2>&1"
```

顺带补上原来没有的**持久日志** `D:/daily-kit/daily.log`（`>>` 追加 + `2>&1`）。

落地踩点：

- VBS 放 `~/.dsh/storages/tools/` 而不是 `D:\daily-kit\`，因为 agent 沙箱对 D 盘那个目录无写权限（`PermissionError: [Errno 13]`，与此前 filter-repo 同类）。功能无差别。
- 用 Python heredoc 生成 PowerShell/VBS 时，反斜杠字符串反复触发 `SyntaxError: (unicode error) 'unicodeescape' ... truncated \uXXXX/\UXXXXXXXX` —— 生成含 Windows 路径的脚本时优先 raw string 或改用文件写入，别在 `-c` 内联。
- `-File C:/Users/27063/fix-tasks.ps1` 报不存在：临时脚本要真写到磁盘再调用。

**回滚**：改之前用 `Export-ScheduledTask` 导出 4 个 XML 到 `C:/Users/27063/.dsh/storages/tools/tasks-backup-20261101/`，还原：

```powershell
Register-ScheduledTask -TaskName daily-close `
  -Xml (Get-Content "...\tasks-backup-20261101\daily-close.xml" -Raw)
```

**验证方法**：用新方式手动跑 `daily.sh status`，观察 wscript 立即返回、无窗口、`daily.log` 落盘。

## 4. 三套 repo 的分工与活动量（用户问「之前建立的 git repo 没用？」）

| repo | 位置 | 管什么 | 2026-11-01 活动 | 远端 |
|---|---|---|---|---|
| `~/.dsh` | 本地 | dsh 配置 / plan / journal 版本控制 | 16 条 commit（含 autocommit 每 5 分钟的 `auto:`） | **无 remote** |
| `dsh-reasonix-agent` | `D:/Desktop/工具箱/reasonix-ops/repo` | 全量备份镜像（robocopy 镜像 `.dsh` 到 `dsh/` 子目录，只保最新文件状态、不保 commit 历史） | 3 条 `backup:` @ 00:35 / 14:26 / 23:30 | master 一致 |
| `inbox` | `D:/00-Inbox/work` | 当天临时文件流水（snap → 23:45 close → 清零） | **0** | main 一致；tag 只有 `days/win|lin/2026-09-27` |

结论与判据：

- 备份 repo 与 `~/.dsh` 都正常在跑；`~/.dsh` 的 `.git` 已从 546 MB 瘦到 46 MB 并 force push。
- **inbox 自 2026-09-27 起连续空跑**：每天 `work/` 无变更 ⇒ `close` 走空分支 ⇒ 远端 35 天无新 tag。用户日常文件没进流水区，这套实际上闲置。
- 「云端没记录」若指 `~/.dsh` 属预期：它设计成纯本地，改动靠 23:30 那轮 robocopy 镜像带走；23:30 之后的新改动要等次日或手动跑 `backup-to-github.ps1`。

## 5. 待用户决策（未执行）

1. 手动跑一次 `backup-to-github.ps1`，把当天新增改动送上云端；
2. 或禁用 `daily-close` / `daily-snap-*` / `daily-pushall` 四个任务，停掉闲置的 inbox 流水；
3. 或给 `~/.dsh` 加 remote（不推荐：会把 346 MB `.dsh` 推上去，不如维持镜像方式）。
