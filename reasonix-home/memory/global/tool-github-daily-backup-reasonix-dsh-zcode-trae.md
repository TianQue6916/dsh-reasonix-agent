---
id: mem-c96c52d2995f958c296ea3cffbb31c2e
revision: 1
created_at: "2026-09-22T23:53:34.9273289Z"
updated_at: "2026-09-22T23:53:34.9273289Z"
name: tool-github-daily-backup-reasonix-dsh-zcode-trae
title: GitHub 每日备份机制：reasonix/dsh/zcode/trae 配置 + tool-box 脚本（2026-09-23）
description: 建成每次自动备份到 GitHub 的完整机制：reasonix 仓库（子目录 reasonix/dsh/zcode/trae）+ tool-box 仓库（reasonix-ops 脚本）+ 每日 23:30 计划任务，含强制脱敏与 3 个真实脚本 bug 的修法
keywords: backup-to-github.ps1,ReasonixGitHubBackup,脱敏,sk-REDACTED,Push Protection GH013,workspaceStorage,Full/full 大小写冲突,porcelain 目录折叠,tool-box reasonix-ops,TianQue6916
activation: relevant
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 一、机制总览（2026-09-23 建成）

**目标**：每日把 Reasonix / dsh / zcode / trae 的配置与记录备份到 GitHub，电脑丢了也能恢复。

| 件 | 位置 |
|---|---|
| 备份脚本 | `C:\Users\27063\Desktop\reasonix-ops\backup-to-github.ps1`（10,802 B，UTF-8 BOM） |
| 仓库检出 | `C:\Users\27063\Desktop\reasonix-ops\repo\` |
| 日志 | `%APPDATA%\reasonix\github-backup.log` |
| 计划任务 | `\ReasonixGitHubBackup` — 每日 **23:30**，`StartWhenAvailable`（错过则尽快补跑），Logon Mode = Interactive only |
| 手动触发 | `powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\27063\Desktop\reasonix-ops\backup-to-github.ps1"` |

**参数**：`-DryRun`（同步+脱敏+报告不提交）、`-NoPush`、`-Full`（全量重扫，默认只处理变更文件）。退出码：2=克隆失败、3=发现残留密钥（已中止）、4=commit 失败、5=push 失败。

## 二、push 目标（username = TianQue6916，SSH 已验证可用，**无需 token**）

| 仓库 | 内容 |
|---|---|
| `TianQue6916/reasonix`（**public**） | 分子目录：`reasonix/`、`dsh/`、`zcode-appdata/`、`zcode-home/`、`trae-cn/`、`trae-solo/` |
| `TianQue6916/tool-box`（public） | `reasonix-ops/`（脚本本体）；本地检出 = `C:\Users\27063\Desktop\工具箱\学科总结文档生成`（remote = `git@github.com:TianQue6916/tool-box.git`，分支 main） |

首次推送：commit `fd3d93b9 backup: 2026-09-23 07:50`（1,524 文件）；tool-box：`fd98a605`。

## 三、强制脱敏（public 仓库的硬前提）

脱敏规则（`$Scrub`）：`sk-{16,}`、`sk-ant-`、`ghp_`、`github_pat_`、`gho_`、`AKIA`、`xox*`、`user_`、私钥块（`-----BEGIN … PRIVATE KEY-----`）、`Bearer ...`、`wpa_passphrase=`、密码/密钥字段。标记写作 `sk-REDACTED`（**故意短于 16 字符**，否则会自救匹配探测规则）。

**双重校验**（提交前，任一中止即 exit 3 不推送）：
1. 文本层：对 staged 的文本扩展名文件跑 `$Detect`
2. **字节层全扫**（新增）：对**所有** staged 文件（不限扩展名，Latin1 读字节）跑 `$Detect` — 这道卡是为补 `*.vscdb` 那类白名单外类型的漏洞

**排除清单**（不入库）：整个 `global-workspace/`、`projects/`、`desktop-sessions-v5/`、`cache/`、`archive/`、`repair/`、`mcp-state/`、`文件翻译*`；dsh 的 `gate/`；zcode 的 `cli/`(2.6GB)、`workspace/`；trae 的 `logs/`、`Cache`、`ModularData`(4.3GB)、`Partitions`；**并额外排除 `workspaceStorage`、`globalStorage`、`History`、`credentials.json`、`*.vscdb`、`*.sqlite`、`*.db`、`certs`、`checkpoints`**。

## 四、修复的 3 个 bug（都是真实踩坑，写脚本时必避）

1. **`param([switch]$Full)` 与局部变量 `$full` 同名** —— PowerShell 变量名**不区分大小写** → `$full = "C:\..."` 实际是在给 `[switch]` 变量赋字符串 → 报 `Cannot convert System.String to SwitchParameter`，且**行号指向下一行的 `[IO.Path]::Combine`**（误导排查）。修：局部变量改名 `$fullPath`。
2. **`git status --porcelain` 对未跟踪目录只折叠为一行** `?? reasonix/` → 文件清单里全是目录名 → `-PathType Leaf` 全部跳过 → 脱敏与兜底校验**一起假通过**（`扫描 0 个`）。修：改为 `git add -A` 后从 `git diff --cached --name-only` 取清单。
3. **脱敏标记自救匹配** —— `sk-REDACTED` 本身满足 `sk-{16,}` → 兜底校验把已脱敏的文件当残留报（42 个假阳性）。修：标记缩短为 `sk-REDACTED`；校验前先剥离标记。

另：`$PSScriptRoot` 在 `-File` 下的 param 默认值里为空（老坑）；中文全角引号 `“”` 会让 PowerShell 解析失败；脚本含中文输出必须 UTF-8 **带** BOM，skill/README 必须**无** BOM。

## 五、安全事件（已处置）

- 首次 push 被 **GitHub Push Protection (GH013)** 拦下：`trae-cn/User/workspaceStorage/<id>/state.vscdb.backup` 含 DeepSeek API Key（扩展名 `.backup` 不在白名单 → 被跳脱）。**密钥未进入公开仓库** ✅
- 该 key 与**当前在用** key **交集 = 0**（是 Trae state 里存的旧 key）→ 无需轮换。
- 处置：本地 `git reset --soft HEAD~1` 撤销含密钥的 commit → 排除 `workspaceStorage/globalStorage/History` + 新增字节层全扫 → 重推成功。
- **遗留**：`5c6046a2`（2026-06 的 Initial backup）的 **git 历史里仍有 3 个旧 `sk-` 值**（在 `sessions/` 的 10 个 jsonl 中），当前树已删但历史不可改；用户选择“不必处理”。若要彻底清除需重建仓库。

## 六、日常使用规则（用户明确要求）

- 用户说：**“每天我完成、改动你的一些东西的时候提交上去”、“有用了就提交”** → 会话中产生有用的脚本/配置/记忆改动后，应**主动跑一次 `backup-to-github.ps1`** 提交，不等 23:30。
- 自动备份已在 23:30 备好；手动跑只是提前触发。
- 改脚本后记得同步到 tool-box：复制 `*.ps1` 到 `Desktop\工具箱\学科总结文档生成\reasonix-ops\` → `git add` + `commit` + `push origin main`。

## 七、磁盘占用与清理

- `reasonix-ops\backup\git-before-reset-20260923-073221\`：719.6 MB（reset 前的完整 .git，保险用，确认无事后可删）
- `reasonix-ops\repo\`：约 150 MB（仓库检出，勿删）
