---
id: mem-d568219dae8d13af81193397526f8fef
revision: 1
created_at: "2026-10-04T14:35:35.767Z"
updated_at: "2026-10-04T14:35:35.767Z"
name: dsh-desktop-app-status-breakpoint-nosandbox-20261004
description: "desktop App 双击无反应的真因：0x80000003 STATUS_BREAKPOINT，非 admin 下 Chromium sandbox 起不来，解法 = --no-sandbox（与 Edge 同源）"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 症状

双击 `DeepSeek Harness.exe` 无反应（无窗口、无报错弹窗）。

## 根因（2026-10-04 实测确证）

用 `Start-Process -Wait` 拿退出码 = **`-2147483645`**，即 **`0x80000003` = `STATUS_BREAKPOINT`**（Chromium 的 `CHECK` 失败路径 `base::debug::BreakDebugger()` 打 `int3`）。
`--enable-logging` 零输出 ⇒ 崩溃发生在**日志初始化之前**。

**这不是 App 坏、也不是 asar 坏**（`app.asar` = 121,348,951 B，mtime 仍是 2026-10-03 13:47，未被改动）。

**唯一决定因素 = `--no-sandbox`**（逐 flag 对照实验）：

| 启动参数 | 结果 |
|---|---|
| （无） | EXITED `0x80000003` |
| `--disable-gpu-sandbox` | EXITED |
| `--in-process-gpu` | EXITED |
| **`--no-sandbox`** | **STILL RUNNING** ✓ |

与**同一台机上 Edge 154 的 CDP 结论完全同源**：
非 admin 账户（`天阙九泉\27063`，`isAdmin=False`）下 Chromium 的 renderer/GPU sandbox 起不来。
⇒ **本机所有 Chromium 系（Edge / Electron 打包应用）启动失败，第一嫌疑都是 sandbox，第一步试 `--no-sandbox`。**

## 解法（已实施，用户级操作，不需要提权）

改快捷方式的 Arguments：
```powershell
$sh=New-Object -ComObject WScript.Shell
$lnk=$sh.CreateShortcut("$env:APPDATA\Microsoft\Windows\Start Menu\Programs\DeepSeek Harness.lnk")
$lnk.Arguments='--no-sandbox'; $lnk.Save()
```
- 已改：`%APPDATA%\Microsoft\Windows\Start Menu\Programs\DeepSeek Harness.lnk`，备份同目录 `.bak-20261004-pre-nosandbox`
- 桌面上的 `Desktop\DeepSeek Harness.lnk` **不存在**（用户从开始菜单启动）
- **注意**：改快捷方式只覆盖「从快捷方式启动」；若 App 由 updater 自动重启，参数可能丢失。

## 排除的嫌疑（勿再查）

- `AppData\Roaming\@deepseek-ai\dsh-desktop\` 下**没有** `SingletonLock` / `Crashpad` 残留。
- 无 dsh/electron 僵尸进程（故障时进程表零命中）。
- `NODE_OPTIONS=--use-system-ca` 只存在于 dsh 给 bash 工具注入的子进程环境（User/Machine 级均为空）⇒
  Electron 日志里那句 `Most NODE_OPTIONs are not supported in packaged apps` 是**测试时继承环境**造成的，不是病因。
- 用户数据目录里的 Cache/Code Cache 今天（18:19–18:35）仍有写入 ⇒ 说明 App 在 18:35 那次重启**之前**是能跑的，
  故障时点与「10/2 系统 build 26200 → 26300 升级 + 10/4 18:35 重启」一致。

## 可复现判据

```powershell
$exe='C:\Users\27063\AppData\Local\Programs\DeepSeek Harness\DeepSeek Harness.exe'
$p=Start-Process $exe -ArgumentList '--no-sandbox' -PassThru; Start-Sleep 15
$p.HasExited          # 期望 False
(Get-Process -Id $p.Id).MainWindowTitle   # 期望非空
```
