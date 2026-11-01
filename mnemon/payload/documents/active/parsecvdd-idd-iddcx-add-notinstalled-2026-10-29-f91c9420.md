---
id: "f91c9420-d7e9-41c0-b7c9-9b14f514abf7"
title: "ParsecVDD 扩展屏「自启失效」真因：三个 IDD 驱动争抢 IddCx 导致 add 恒 NotInstalled（2026-10-29）"
description: "接 8d326aca / a78ca4cd 之后的续查：重启后「自启失效」实为 add 被驱动拒绝并报 status NotInstalled；定位到 ExtensoDesk / GameViewer / ParsecVDD 三块 IDD 同时存活争抢 IddCx，以及 remove 会毁状态机。含已验证无效的手段清单、A/B/C 三条处置路线与用户选择（a，不行就 c）、host.ps1 单例守护与 toggle.ps1 去 remove 的改造、遗留项（分辨率 / Web UI 密码 / 脚本清理）。"
status: "active"
created_at: "2026-10-29T05:14:08.385Z"
updated_at: "2026-10-29T05:14:08.385Z"
content_hash: "d8ffd5890892c0d718e8b1c4ffa815454bfc4d763945b3a5bfe58cbfe225bd58"
source_paths:
  []
session_ids:
  - "7fa55017-13fa-4579-adf5-5da58589f7df"
memory_body_ids:
  []
---

# ParsecVDD 扩展屏「自启失效」真因（2026-10-29）

前置文档：
- `8d326aca-b7db-4aad-85c9-db05e0e17e25` —— `output_name` 必须是 device_id GUID、重启后驱动 `NotInstalled`、VDD host 先于 Sunshine 自启
- `a78ca4cd-460d-47bb-b1de-8a1658fff137` —— 链路端到端验收定论与自启落地
- `70b6a9ef-b017-4d02-8c0c-dd7d98a0e9a0` —— Sunshine DXGI duplication 过滤与 WGC 后端

## 症状与第一处误判

用户重启后反馈「开机没有自启，开启扩展屏的也失效了」。

实际证据：自启**跑了**。`host.log` 有完整链：

```
03:31:34  daemon start pid=10728
03:31:34  child pid=16468
03:31:34  > add
03:31:37  child gone, skip: config -i 0 -s 1920x1080 -r 60
03:31:19  child exited code=1
```

`扩展屏自启.cmd` → `host.ps1` → `add` 都执行了，是 `add` 被驱动拒绝。手动执行同样报 `Parsec VDD device is not OK, got status NotInstalled.`，屏没建出来，用户看到的现象就是「自启失效」。
**教训：自启问题的第一判据不是「启动项在不在」，而是 host.log 里 `add` 的返回**；启动文件夹里 `扩展屏自启.cmd` 与 `ollama-serve.vbs` 都在位。

关键区分：`Get-PnpDevice` 里 `ROOT\DISPLAY\0002  OK` 指的是 PnP 层（`CM_PROB_NONE`），**不代表 VDD 驱动内部状态机也是 OK**。`NotInstalled` 是 Parsec VDD 自己的取值。

## 已验证无效的手段（全部试过）

| 手段 | 结果 |
|---|---|
| `pnputil /restart-device` | `NotInstalled` |
| `pnputil /disable-device` + `enable-device` | `NotInstalled` |
| 重装 0.45 | `NotInstalled` |
| 重装 0.41（Stable） | `NotInstalled` |
| 只卸载 device node 后重启 | `NotInstalled` |
| 停 `ExtensoDeskService`（不重启）+ 立即 add | `NotInstalled` |

驱动本体核查过没问题：`mm.dll` 的 `FileDescription = Parsec Virtual Display Driver`、`FileVersion = 0.45.0.0`；`ParsecVDA` 服务 `ImagePath = C:\Windows\System32\drivers\UMDF\mm.dll`、`WdfMajorVersion 2 / WdfMinorVersion 25 / WdfExtensions {IddCx0102}` 均正确。UMDF 目录里同时存在 `mm.dll`（2024-01-25）与 `usbmmIdd.dll`（2026-07-21）。

## 根因（当前工作假说，证据支持强）

本机同时存活着**三块 IDD 虚拟显示适配器**，开机时先加载的先占住 IddCx 框架，ParsecVDD 就拿不到资源：

```
ROOT\DISPLAY\0000   ExtensoDesk Display                    OK   ← ExtensoDeskService，Automatic
ROOT\DISPLAY\0001   GameViewer Virtual Display Adapter     OK   ← GameViewerService，Automatic 且停不掉
ROOT\DISPLAY\0002   Parsec Virtual Display Adapter         OK   ← 目标（PnP OK 但内部 NotInstalled）
```

DriverStore 里还压着四个 IDD 驱动包：`edidddriver.inf_amd64_fa69df88af91db2a`、`gamevieweridddriver.inf_amd64_9586929572de2d1b`、`usbmmidd.inf_amd64_2cb21e2b14e16bf2`、`hiddigi.inf_amd64_a4b2eba0d2a070a9`。

之前三四次重启之所以都没修好，是因为每次 `ExtensoDeskService` 都是 `Automatic`，开机即抢占，ParsecVDD 永远轮不到——排查方向一直盯在 ParsecVDD 自己身上，漏掉了同机的另一个 IDD。

## 另一条独立结论：`remove` 会毁掉状态机

每次 `remove -i 0` 都可能把驱动内部状态机弄坏（`NotInstalled`），且只能靠卸载 device node + 重启系统恢复。因此**从设计上禁止再调用 remove**：

- `host.ps1`：只 `add` 一次，然后永久持有（`while (-not $p.HasExited) { Start-Sleep 10 }`），不 remove、不重建
- `toggle.ps1` 的 `off`：只杀 `parsec-vdd-rust` 进程，虚拟屏保留，下次开启直接复用
- 代价：「关」之后屏仍在系统里，只是没内容

补充加固：`host.ps1` 开头加单例守护，避免启动文件夹与手动双击各起一份 daemon 抢同一个 VDD 会话：

```powershell
if (Get-Process parsec-vdd-rust -ErrorAction SilentlyContinue) {
    L ('another instance already running, exit pid=' + $PID)
    exit 0
}
```

两个脚本改完均做过语法检查并通过，日志中已确认 remove 相关代码全部移除。

## 处置路线与用户决策

- **A（最小干预，可回退）**：`Stop-Service ExtensoDeskService` + `Set-Service -StartupType Manual`，重启后先测 `add`。驱动与设备保留，随时可恢复。→ **已执行**：`ExtensoDeskService  Stopped / Manual`。
- **B（不可回退）**：卸载 ExtensoDesk + `Disable-PnpDevice` 两路 + `pnputil /delete-driver`；破坏性，需重装才能复原。
- **C（换挂载）**：不用 ParsecVDD，改用已在 DriverStore 里的 `usbmmidd`（`usbmmidd.inf` 与其 `.cat` 可用）或 Sunshine 自带虚拟显示；需把 `output_name` 改到新 device_id。

用户选择：**「a，如果不行就 c」**。下一步判据——重启后 `add` 仍报 `NotInstalled` 即判定 A 失败，直接转 C，不再在 ParsecVDD 上做重启/重装循环。

已知顽固点：`GameViewerService` 用 `Stop-Service` 停两次都被拉活（疑似服务保护或被驱动层拉起），是 A 唯一的漏项；A 若失败也需把 GameViewer 计入嫌疑。

## 遗留项（未处理）

1. **分辨率**仍是 1280×800，平板是 2560×1600。改 `vdd_settings.xml` 的思路有先例教训：曾因强改 IDD 分辨率导致驱动掉线（见 `70b6a9ef`）。改完需在设备管理器禁用/启用虚拟显示才生效。
2. **Sunshine Web UI 密码未设**：`https://localhost:47990` 无密码，同一 WiFi 下任何人都能改配对与命令。设好后把 `credentials` 备份进工具箱。
3. `工具箱\ParsecVDD` 目录下遗留脚本待清理（`一键修复.cmd`、`重装VDD.cmd`、`reset-vdd.cmd`、`clean-stale-monitors.ps1`、`fix-sunshine.ps1`、`fix-gpu-affinity.ps1`、`set-output.ps1`、`set-device-id.ps1`），建议只留四个入口 + `tools\` 子目录。

## 当前链路（设计态）

开机 → 启动文件夹 `扩展屏自启.cmd`（用绝对路径调 `pwsh -File host.ps1`，不用 `%~dp0`）→ 起 daemon 读 `state.txt`（`on`）→ `add` 一块虚拟屏 → `SunshineService` 同时自启 → 按 `{fb5c30ab-9671-54c9-8739-00b008ae5da6}` 抓该屏。日常入口两个：`开扩展屏.cmd`（写 `state.txt=on` + 确保 daemon 在跑）、`关扩展屏.cmd`（写 `off` + 杀 daemon；旧实现还要弹 UAC 重置设备节点清屏，该逻辑已废弃）。
