---
id: "41ce8bea-bcaf-48a1-bf8b-38bca0fc55a5"
title: "2026-10-10 定案：dsh Windows sandbox 把 workspace 全树打成 Low Mandatory Level（NTFS 持久），image label 反压进程 IL ⇒ 配置改 danger-full-access 也无效"
description: "2026-10-10 机制层定案：dsh Windows ACL sandbox 在 workspace-write 下递归给 workspace（= session cwd = C:\\Users\\27063）打 Low mandatory label，label 写在 NTFS 上只加不撤；Windows 规则「进程 IL ≤ image 文件 IL」使 App exe 带 Low 后每次启动都被压到 Low，故 permission/sandbox 全 danger-full-access 也救不回；含实测 IL 表、60/60 抽样、icacls /setintegritylevel 修复路径（需管理员，仅改 App 目录）、零提权判决实验与未确证点。"
status: "active"
created_at: "2026-10-10T13:41:45.691Z"
updated_at: "2026-10-10T13:41:45.691Z"
content_hash: "b08285f87c7a3c7a140ff770dcacbed00b63efaee047e35021a9c804505ace44"
source_paths:
  - "PLAN.md"
  - "logs/host-stdio.log"
session_ids:
  - "5376b68c-9a55-4902-b263-edf7f33e2d66"
memory_body_ids:
  []
---

# 2026-10-10 定案：Low Mandatory Level 是 NTFS 持久状态，不是运行期 token 降级

本机 Windows（`天阙九泉\27063`，非管理员）实机实验。**结论推翻了 2026-10-07 那份文档的运行时解释**：sandbox 不是每次运行临时降 token，而是**把 Low mandatory label 写死在 NTFS 上**，于是配置层怎么改都救不回来。

相关既有文档：
- `741c915f-574f-4130-afa9-5d4db87b26e4`（D 盘不可写机制层定案，运行期 CreateRestrictedToken + TokenIntegrityLevel 说法）
- `a8a10cd0-28d7-473f-8466-d7c8c76e3f3c`（profile 树 Low → 白纸图标，junction 修复）

## 1. 新结论

1. dsh 的 Windows ACL sandbox 在 `workspace-write` 模式下会**递归给整个 workspace 树打 Low mandatory label**。
2. 该 workspace = session cwd = `C:\Users\27063` ⇒ **整个用户目录连同 App 自己的 exe 全被标成 Low**。
3. Windows 规则：**进程 integrity level 不会高于其 image 文件的 IL**。exe 带 Low label ⇒ App 每次启动都被压到 Low，与由谁启动、policy 设什么无关。这是本次的关键推进（此前只归因于 sandbox 对子进程的 token 操作）。
4. label 是 NTFS 上的持久状态，**sandbox 只加不撤**。所以 `permission/preset = danger-full-access` + `sandbox/mode = danger-full-access`（session 文件前 3 行实测）也修不好：`dsh-bash-sandbox/lib/index.js:68` 中该模式确实直接 `super.execute` 不做 confinement，但进程早就是 Low 了。

## 2. 实测证据

### 2.1 mandatory label（`C:\Users\27063` 是源头，无 `(I)` = 显式设置）

| 路径 | label |
|---|---|
| `C:\Users\27063` | `Low Mandatory Level:(OI)(CI)(NW)` ← 源头 |
| `C:\Users\27063\.dsh` | `Low (OI)(CI)(NW)`（继承） |
| `C:\Users\27063\AppData\Local\Programs` | `Low (I)(OI)(CI)(NW)` |
| `...\Programs\DeepSeek Harness` | `Low (I)(OI)(CI)(NW)` |
| `...\DeepSeek Harness\DeepSeek Harness.exe` | `Low (I)(NW)` |
| `...\Programs\Python\Python313\python.exe` | `Low` |
| `C:\Users\27063\AppData\Local\Temp` | `Low (I)(OI)(CI)(NW)` |
| `C:\Users\27063\Desktop` | `Low (I)(OI)(CI)(NW)` |
| `D:\Temp` | `Low (OI)(CI)(NW)` |
| `D:\Toolbox` | **(no ML) = Medium** |
| `D:\CrystalDiskInfo` | **(no ML) = Medium** |
| `C:\Windows\System32\notepad.exe` | **(no ML) = Medium** |

- **继承链检查**：`C:\Users\27063` → `AppData` → `Local` → `Programs` → 安装目录 → exe 全部是 label 继承，**不是**某次安装/某层目录单独设置。
- **对照**：`C:\Program Files`、`C:\Program Files (x86)`、`D:\Toolbox`、`D:\CrystalDiskInfo` 均为 `none -> Medium`。
- **AppCompatFlags** 两个 Layers 键（HKCU / HKLM）都 absent；exe 上**无 Zone.Identifier**（`stream=:$DATA len=244481512`）⇒ 排除 MOTW / shim 误判。
- 快捷方式（`Desktop\工具箱\DeepSeek Harness.lnk`、Start Menu 那份）args 均为 `--no-sandbox`。

### 2.2 进程侧 IL（读 token `TokenIntegrityLevel`）

```
PID  3660  DeepSeek Harness.exe  --no-sandbox        -> S-1-16-4096 (Low)  ← App 顶层主进程
PID 11564  DeepSeek Harness.exe  --expose-internals  -> S-1-16-4096
PID 20920  node  billion-context                     -> S-1-16-4096
PID 12384  node  mcp-goat-quota                      -> S-1-16-4096
PID 28288  powershell（工具自身）                     -> S-1-16-4096
```

### 2.3 规模化抽样与规模

- `C:\Users\27063\AppData\Local\Programs` 下 exe **抽样 60 个，Low=60 / NotLow=0** ⇒ 整个 Programs 子树（含用户自装程序）都在被降级运行。
- 文件数（成本估算）：`AppData\Local\Programs` = **147494**，其中 `DeepSeek Harness` = **9772**；profile 规模 165085。
- 顺带解释了一个旧疑点：`Get-Process -Name java,javaw` 一直返回空 —— Low IL 下高 IL 进程被过滤，不是"遮蔽"。

### 2.4 bash 子进程侧

bash 写 D 盘仍被 no-write-up 拒；实测 bash 进程 `Mandatory Label\Low Mandatory Level S-1-16-4096`（`.zstd` 前 3 行已证）。

## 3. 修复路径

需要把 label 改回 Medium，**绕不开管理员权限**：mandatory label 存在 SACL 里，改 SACL 要 `SeSecurityPrivilege`，这是 Windows 硬约束。

脚本：`C:\Users\27063\.dsh-lab\tools\fix-low-label.ps1`（3688 B，已过 `SYNTAX OK`）。核心：

```
icacls "C:\Users\27063\AppData\Local\Programs\DeepSeek Harness" /setintegritylevel "(OI)(CI)Medium" /T /C /Q
```

- **只改 App 安装目录（9772 文件，秒级）**。
- ⚠️ **千万不要对 `C:\Users\27063` 本身执行**：会让当前 Low IL 的 shell 立刻写不了自己的 home，把 `~/.dsh` 一起废掉。
- 两条落地方式：(A) 用户开管理员终端粘这一行，然后**完全退出 App 再启动**；(B) 点一次 UAC 由 agent 跑脚本（先打印 before/after 对账）。
- 副作用说明：DACL 一字不动，不是新增降级而是撤销 dsh 误加的标记；唯一副作用是必须重启 App（IL 在进程创建时确定）。
- 可选项：修好 App 后是否顺带恢复整个 `...\Programs` 子树（147494 文件）。

### 零提权判决实验（先验证再动手）

物料在 `D:\Temp\lab\`：
- `D:\Temp\lab\cmd-low.exe` — 从 `System32\cmd.exe` 复制、**带 `Low Mandatory Level:(I)(NW)`**
- `D:\Temp\lab\test-low.bat` — 三段对照，带 `pause`

判据：窗口自己的 cmd（Explorer 启动，Medium）为 **Medium**；`cmd-low.exe`（父进程 Medium）若显示 **Low**、`System32\cmd.exe` 对照显示 **Medium** —— 即 image label 压进程 IL 的直接铁证（唯一变量是 image 的 label）。

## 4. 未确证 / 待办

- 判决实验 `test-low.bat` 用户尚未双击执行，image-label⇒进程降级目前是强推论+间接证据，缺那一段自证。
- 修复尚未执行（等用户选 A/B）；`Programs` 子树是否一并恢复待用户拍板。
- dsh 侧是否应避免把 session cwd 当 workspace 递归打 label（真正的 upstream bug 点），未提交修复也未见上游讨论。
- 相关 runbook 与复现脚本散落在 `C:\Users\27063\.dsh-lab\tmp\`：`proctree.ps1`、`il.ps1`、`why-low.ps1`、`why-low2.ps1`。
- 踩坑记录：PowerShell `-match 'Mandatory Label\Low'` 因 `\L` 非法转义整段报错，须用 `-match [regex]::Escape(...)` 或单引号内避免反斜杠歧义。
