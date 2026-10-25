---
id: "554bf141-4776-4be8-8b97-8cb321fa93a7"
title: "Win+R 的 `powershell` 指向 7.6.8：HKCU App Paths 覆盖与「两套解析路径」分裂（2026-10-24）"
description: "本机把 Win+R / 开始菜单里的 `powershell` 从 5.1 换成 PowerShell 7 的落地方式：HKCU `App Paths\\powershell.exe` 覆盖 HKLM；ShellExecute 路径得 7、PATH 路径仍 5.1 的实测边界；dsh tool 进程对 HKCU 只有读权限（WinError 5）故必须走 UAC 提权；含回滚命令与 `dsh.cmd` 兜底。"
status: "active"
created_at: "2026-10-24T15:33:16.678Z"
updated_at: "2026-10-24T15:33:16.678Z"
content_hash: "ff20625fe7e0a11444c889c4e0ecc9b53683667ef1198a5c9880318410d46a5a"
source_paths:
  - ".dsh/PLAN.md"
  - "set-winr-powershell7.ps1"
session_ids:
  - "42e645e5-a3da-48c8-b995-cea12974be36"
memory_body_ids:
  []
---

# Win+R 的 `powershell` 指向 7.6.8：HKCU App Paths 覆盖（2026-10-24）

**机器**：Windows 11（`10.0.26100.8972` 为 5.1 exe 版本）｜**用户目录**：`C:\Users\27063`｜**关联文档**：`316b5d89-62ee-497c-8be6-25ab93cf09c1`（WDAC 拦截 5.1 脚本的根因与 dsh `pwshPath` 钉死）、`eef3a990-b234-42c0-accd-e098eaf79721`（5.1 vs 7.6.8 实测对照与替换边界）。

## 问题

Windows PowerShell 5.1 下任何 `.ps1` 都被判 `is not digitally signed`（根因见 `316b5d89`：机器级 WDAC script enforcement，非 ExecutionPolicy）。因此交互式默认 shell 必须落到 `pwsh` 7。`pwsh` 已在 PATH，Win+R 输 `pwsh` 可直开 7；但用户习惯输 `powershell`。

## 落地方式：用 HKCU 的 App Paths 覆盖 HKLM

`ShellExecute` 查 `App Paths` 时 **HKCU 优先于 HKLM**，而 HKLM 那条指向 5.1：

```
HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\powershell.exe
  (default) = C:\Windows\system32\WindowsPowerShell\v1.0\PowerShell.exe   ← 未动
HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\powershell.exe   ← 新建
  (default) = C:\Program Files\PowerShell\7\pwsh.exe
  Path      = C:\Program Files\PowerShell\7
```

脚本 `set-winr-powershell7.ps1`（只写 HKCU，不动系统文件、不需管理员）：

```powershell
$target = 'C:\Program Files\PowerShell\7\pwsh.exe'
if (-not (Test-Path $target)) { throw "pwsh not found: $target" }
$key = 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\powershell.exe'
if (-not (Test-Path $key)) { New-Item -Path $key -Force -EA Stop | Out-Null }
Set-Item -Path $key -Value $target -EA Stop
New-ItemProperty -Path $key -Name 'Path' -Value (Split-Path $target) -PropertyType String -Force -EA Stop | Out-Null
```

## 关键实测：同一个词 `powershell` 分裂成两条解析路径

| 输入位置 | 解析机制 | 结果 |
|---|---|---|
| Win+R、开始菜单搜索、资源管理器地址栏 | `ShellExecute` → `App Paths`（HKCU 优先） | **7.6.8** ✅ |
| `cmd.exe` 内、任意 PowerShell 内、`Start-Process powershell` | `PATH` 查找 → 命中 System32 | **5.1** ❌ |

验证判据：
- `where powershell` → `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`（**仍是 5.1**，不要据此判断 App Paths 是否生效）
- 判断 App Paths 只能直接读 `HKCU`/`HKLM` 两条键，或用 `ShellExecuteExW("powershell")`（实测返回 System32，因为该 API 走 PATH/App Paths 组合且受工作目录影响——结论以注册表键值为准）。
- 用户口述「直接输入 powershell 就是 7.6.8」⇒ 他走的是 Win+R/开始菜单，正是 App Paths 生效的那条路。
- 要让 `cmd.exe` 里也变 7，只能改系统 `PATH` 顺序或替换 System32 的 exe —— 破坏面大，**明确不做**。

## 权限坑：dsh tool 进程对 HKCU 是只读

同一条键 ACL 显示 `天阙九泉\27063 FullControl Allow`、无 Deny，但 tool 进程写入全部失败：

```
HKCU\Software\__probe_a                        FAIL [WinError 5] 拒绝访问
HKCU\Software\Microsoft\__probe_b              FAIL [WinError 5] 拒绝访问
HKCU\Software\...\CurrentVersion\__probe_c     FAIL [WinError 5] 拒绝访问
HKCU\Environment                               FAIL [WinError 5] 拒绝访问
```

`Set-Item` 与 python `winreg.CreateKeyEx` 两条路都被拒 ⇒ 是 **dsh tool 进程 token 受限**，不是文件/键 ACL 问题。可行路径：`Start-Process -Verb RunAs` 弹 UAC，由用户点「是」。本机最终值即由该提权脚本写入（用户主观「没运行过脚本」= 没在终端手打，但确认过 UAC 框）。

## 回滚与兜底

```powershell
reg delete "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\powershell.exe" /f
```

- 在 5.1 里跑 dsh 用 **`dsh.cmd`**，不能直接 `dsh`：`PATHEXT` 中 `.PS1` 排在 `.CMD` 前，`dsh` 会命中 npm 的 `dsh.ps1` 并被 WDAC 拒。`dsh.cmd --version` → `0.2.1-rc.2` 正常。
- 故障的隐性代价：5.1 session 里 profile 加载失败，`ghurl` / `ghdl` / `ghdlx` / `ghm` / `ghmirror_base` 全都不存在，切到 7 才恢复。

## 顺带踩到的小坑

- **Python 往 Markdown 写 Windows 路径**：`"""..."""` 里 `PowerShell\7`、`\v1.0` 被当转义，落盘成控制字符（表现为 `PowerShell\pwsh.exe` 少个 `7`、`WindowsPowerShell1.0` 少个 `v`）。写含反斜杠的内容要用原始字符串或先 `chr(92)` 拼接，写完用 `cat -v` / `od` 复核 BEL(\a)、VT(\v) 计数。
- **Git Bash 崩溃**：连续两条命令报 `bash.exe: *** fatal error - NtCreateDirectoryObject(\BaseNamedObjects\msys-2.0S5-...): 0xC0000022`（`STATUS_ACCESS_DENIED`），是 bash 进程起不来而非命令本身有错；该类失败与提权/UAC 会话并存时高发，重试或换 pwsh 执行即可。
