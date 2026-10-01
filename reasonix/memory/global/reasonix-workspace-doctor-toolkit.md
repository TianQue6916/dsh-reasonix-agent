---
id: mem-4c0d239aab667aea321da3b93894ca41
revision: 1
created_at: "2026-09-21T02:47:23.4708081Z"
updated_at: "2026-09-21T02:47:23.4708081Z"
name: reasonix-workspace-doctor-toolkit
title: reasonix-ops 工具包：工作区体检与 Merge-Back 收尾自动化（2026-09-21）
description: 交付 reasonix-ops 工具包（脚本+README+自动触发技能）：定位并可逆修复「工作区被占用/Merge-Back 报错」四条阻断项，含两个脚本坑与编码铁律
keywords: reasonix-ops,reasonix-doctor.ps1,Merge-Back 阻断项,自动触发技能,PSScriptRoot param 默认值为空,worktree list 正斜杠,UTF-8 BOM 技能 frontmatter
activation: relevant
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 交付物（2026-09-21，均已在 C 盘）

| 文件 | 作用 |
|---|---|
| `C:\Users\27063\Desktop\reasonix-ops\reasonix-doctor.ps1` | 体检/修复脚本（8,791 B，UTF-8 **带 BOM**） |
| `C:\Users\27063\Desktop\reasonix-ops\README.md` | 中文用法与原理（无 BOM） |
| `C:\Users\27063\AppData\Roaming\reasonix\skills\reasonix-workspace-mergeback-doctor.md` | 自动触发技能（无 BOM，与现有技能格式一致） |

## 脚本用法

```powershell
$p="$env:USERPROFILE\Desktop\reasonix-ops\reasonix-doctor.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File $p                      # 体检，零写入
powershell -NoProfile -ExecutionPolicy Bypass -File $p -Heal                # 可逆修复未提交两项
powershell -NoProfile -ExecutionPolicy Bypass -File $p -Heal -IncludeTaskLogs  # 额外清任务日志
powershell -NoProfile -ExecutionPolicy Bypass -File $p -Workspace "D:\x\repo" # 指定工作区
```

输出：进程清单、锁目录规模、source+各 worktree 的分支/未提交/领先落后、**四条阻断项判定（与面板文案一一对应）**、结论与处置。

## 实测验证（重要）

修正路径比较后，脚本报 `task.lock × 10` / `任务日志 30 个`，与用户贴的 Reasonix 面板列出的 **30 个文件精确一致** → 检测逻辑与官方判定同源。

## 踩过的两个坑（写脚本时实测）

1. **`$PSScriptRoot` 在 param 默认值里为空**（PS 5.1）→ `Join-Path` 报 “empty string”；必须在 param 块之后计算。
2. **git `worktree list` 输出用正斜杠** → 若用 `-eq $Workspace`（反斜杠）比较，source 会被误判为 worktree，导致未提交/日志计数翻倍（当时报了 142/427 而非 10/30）。修法：`($p -replace '/','\').TrimEnd('\') -ieq ...`。

## 编码铁律（实测）

- 脚本含中文输出 → 必须 **UTF-8 带 BOM**（否则 PS 5.1 乱码）
- 技能/README 的 frontmatter 对 BOM 敏感 → 必须 **UTF-8 无 BOM**（现有 `aigc-master.md` 前 3 字节 = `45,45,45`）

## 设计约束（写进脚本与技能）

- 不 commit / 不 push / 不改 config.toml / 不重启应用 / 不删用户数据文件；写前先备份到 `backup\<时间戳>\`
- 排除规则写 `.git\info\exclude`，**不**在工作区放 `.gitignore`
- 中文路径规则用 `Get-ChildItem` 真实 Unicode 名，不用 git quotepath 转义名
- 界面「自动提交工作区未提交修改」不要勾

## 待办 / 限制

- 新技能需**重启 Reasonix 后**才进入 skills catalog（本次未重启）
- `skill-routing-rules` 记忆可增补一行路由：工作区被占用/合并报错 → `reasonix-workspace-mergeback-doctor`
- 用户环境仍有未清项：worktree 内 30 个任务日志（用 `-Heal -IncludeTaskLogs`）、active work 需结束会话
