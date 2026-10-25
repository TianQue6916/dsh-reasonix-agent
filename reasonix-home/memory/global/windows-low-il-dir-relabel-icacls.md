---
id: mem-bd958e07448f352402d7e04d67588f1a
revision: 1
created_at: "2026-10-25T19:36:56.895Z"
updated_at: "2026-10-25T19:36:56.895Z"
name: windows-low-il-dir-relabel-icacls
description: "Windows 上 agent 写 D 盘的唯一路径：icacls 降 integrity level（含 13992 对象/12.8s 实测与 UAC 姿势）"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 结论：用 icacls 降目标目录 integrity level，是 Windows 上让 agent 能写 D 盘的唯一可行路径

dsh 的 bash tool 进程在 Windows 上**固定跑 Low Mandatory Level（`S-1-16-4096`）**，与 `sandbox-policy.mode = danger-full-access` 无关（重启不解决）。`D:` 全盘对它只读 —— **ACL 给了 `Authenticated Users:(M)` 也写不进去**，因为 IL 的 no-write-up 检查发生在 ACL 判定之前。`C:/Users/27063/Desktop` 是 `D:/Desktop` 的 **junction**，所以"桌面写不了"其实是 D 盘写不了。

## 命令

```powershell
# 需 UAC 提权；不加 /T 只影响新建文件，加 /T 才能让 git checkout/pull 覆盖已有文件
icacls.exe '<目录>' /setintegritylevel '(OI)(CI)Low' /T /C /Q
```

## 实测（2026-10-26，`D:\Desktop\工具箱\reasonix-ops\repo`）

| 项 | 值 |
|---|---|
| 规模 | 13992 个对象（含 `.git` 724 MB / 1207 文件） |
| 耗时 | **12.8 s**，rc=0，`Successfully processed 13992 files; Failed processing 0 files` |
| 结果 | 目录 `Low Mandatory Level:(OI)(CI)(NW)`；`.git\config`、`.git\index` = `(I)(NW)` |
| 之后 | `git remote set-url` / `commit` / `push` 全部正常（此前 `.git/config` 恒定 Permission denied） |

`icacls` 只改元数据不读内容，所以 1.4 万对象只需十几秒；Medium 进程（explorer / git）对 Low 对象仍可写（write-down 允许），**副作用是任何低完整性进程也能写**。回滚：`/setintegritylevel Medium /T`。

## 弹 UAC 的姿势（关键，否则看不到结果）

从 **pwsh 7**（不是 5.1，它在本机被 WDAC 打死）执行：

```powershell
Start-Process -FilePath 'C:\Program Files\PowerShell\7\pwsh.exe' -Verb RunAs -Wait `
  -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File','<脚本.ps1>')
```

提权进程的 stdout **拿不到** ⇒ 脚本内所有输出必须自己写日志到 **C 盘**（本例 `C:\Users\27063\_rx-kb\relabel.log`），否则等于黑箱。
