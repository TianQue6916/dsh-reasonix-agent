---
id: "e4cc6b3f-b290-482f-a2b8-fa383a82cae9"
title: "虚拟扩展屏换轨 usbmmidd：pnputil 补装驱动、enableidd 开关、Sunshine output_name 改绑（2026-10-30）"
description: "ParsecVDD 走不通后改用 usbmmidd 的落地结论与操作脚本：deviceinstaller64 install 只建设备节点、必须再 pnputil /add-driver usbmmidd.inf /install 才注册 WUDF usbmmIdd 服务；开关为 enableidd 1/0 无 remove 死锁；Sunshine output_name 需指向 usbmmidd 屏的 device_id GUID；C:\\Users\\27063\\扩展屏 下 5 个 .cmd 一键脚本。状态：虚拟屏与 service 已就位，Moonlight 端到端未最终确认。前置 a78ca4cd / 8d326aca / 12e010fd。"
status: "active"
created_at: "2026-10-30T15:49:48.088Z"
updated_at: "2026-10-30T15:49:48.088Z"
content_hash: "7fac95c48bd242bf7b86b70e1970fa5688ab4dcb353c62acda33d1e6434ae6fd"
source_paths:
  - "扩展屏/0-一次配置.cmd"
  - "扩展屏/1-开扩展屏.cmd"
  - "扩展屏/2-关扩展屏.cmd"
  - "扩展屏/3-状态.cmd"
  - "扩展屏/4-自启.cmd"
session_ids:
  - "64c5bb1e-9e0a-44a1-8aee-5e321c726cce"
memory_body_ids:
  []
---

# 虚拟扩展屏换轨 usbmmidd（接 ParsecVDD 失败线）

前置文档：
- `a78ca4cd-460d-47bb-b1de-8a1658fff137` —— ParsecVDD + Sunshine + Moonlight 端到端验收定论
- `8d326aca-b7db-4aad-85c9-db05e0e17e25` —— output_name 必须是 device_id GUID、重启后 NotInstalled
- `12e010fd-adbd-494b-ad86-23cd9bb69f89` —— parsec-vdd 0.45 config IOCTL 失效、常驻持有方案

## 为什么弃掉 ParsecVDD

ParsecVDD 的 `remove` 会把驱动内部状态机打成 `NotInstalled`，之后只有**卸载设备节点 + 重启系统**才能恢复；四天排期里三次失败都卡死在这个状态。

usbmmidd_v2 没有 `remove` 接口，开关只有：

```
deviceinstaller64.exe enableidd 1    # 开
deviceinstaller64.exe enableidd 0    # 关
```

驱动状态机无法进入 NotInstalled，这是选择它的唯一决定性理由。代价是分辨率上限低一档，实测这块虚拟屏是 **2560×1440**（ParsecVDD 那次可用档位是 1920×1080/1280×800）。

## 关键陷阱：install 只建节点，不装驱动

`deviceinstaller64.exe install` 输出里的 "Install is complete **when drivers are installed**" 是字面意思：它只创建设备节点（`ROOT\DISPLAY\0003`），UMDF 驱动并未安装。此时：

- `WUDF\Services` 下**没有** `usbmmIdd` 项
- `enableidd 1` 无人接收，屏幕不会出现
- 排查表现为"服务消失了"

必须补一条（管理员）：

```
pnputil /add-driver usbmmidd.inf /install
# → Driver package added successfully.
# → Driver package is up-to-date on device: ROOT\DISPLAY\0003
```

成功判据是 `Get-Item 'HKLM:\SYSTEM\CurrentControlSet\Control\WUDF\Services\usbmmIdd'` 存在（ImagePath = `C:\Windows\System32\drivers\UMDF\usbmmIdd.dll`，WdfMajorVersion 2 / WdfMinorVersion 15）。补上这条后虚拟屏立即出现在屏幕列表里。

## Sunshine 侧：output_name 改绑这块屏的 device_id GUID

Sunshine 只认 device_id GUID，不认 `\\.\DISPLAYn`。抓法：重启 Sunshine 后从日志的 display device 列表里取：

```
\\.\DISPLAY38 -> {b420ceed-4c5a-5b2f-942d-ea2c5c332683}   usbmmidd 虚拟屏
```

`sunshine.conf` 改为：

```ini
output_name = {b420ceed-4c5a-5b2f-942d-ea2c5c332683}
```

日志核对方式：Sunshine 启动日志出现 `Desktop resolution [2560x1600] / Display refresh rate [240Hz]` 即已切到目标屏（注意逻辑分辨率与屏的物理报告值可能不一致，以日志 + 屏幕列表两者对读）。

## 落地脚本（免手动提权的日常入口）

目录 `C:\Users\27063\扩展屏\`：

| 脚本 | 作用 |
| --- | --- |
| `0-一次配置.cmd` | 一次性：备份 sunshine.conf → 替换 output_name → 装自启 → enableidd 1 → 重启 SunshineService → 打印屏幕列表。内含 `net session` 检测，非管理员时自 `Start-Process -Verb RunAs` 提权 |
| `1-开扩展屏.cmd` | 提权 → `enableidd 1` |
| `2-关扩展屏.cmd` | 提权 → `enableidd 0`（驱动保留，可反复开关） |
| `3-状态.cmd` | 纯查询，免提权：屏幕列表 / SunshineService / output_name 当前值 / 虚拟显示设备 / WUDF Services / 启动项 |
| `4-自启.cmd` | 供启动文件夹调用，由 0-一次配置 复制为 `扩展屏自启.cmd`；同时删除旧的 `ParsecVDD-Watchdog.cmd`（旧路径 `D:\Toolbox\ParsecVDD\vdd.ps1` 会与新方案冲突） |

usbmmidd 资产路径：`D:\Desktop\工具箱\ParsecVDD\usbmmidd_v2\usbmmidd_v2\`。

## 环境事实：写入权限边界

- `D:\Desktop\工具箱\ParsecVDD\` 内的 `.cmd` 写入一律 `PermissionError: [Errno 13] Permission denied`（只能写 `.txt`），中文文件名与 ASCII 名同样失败。
- `C:\Users\27063\` 及子目录可正常写入 —— 脚本因此落在 `C:\Users\27063\扩展屏\`。
- 写 `C:\Program Files\Sunshine\config\sunshine.conf` 需要 UAC 交互，非交互会话里点不到，所以配置收进 `0-一次配置.cmd` 由用户手动双击触发。

## 当前状态（2026-10-30）

已验证：`usbmmIdd` WUDF service 注册、`\\.\DISPLAY38`（1536×960 逻辑 / 2560×1440 报告）出现在非主屏位置、`output_name` 已切换、`SunshineService` Running/Automatic、四个虚拟显示设备与六个 WUDF IDD 条目并存（ExtensoDesk / GameViewer / ParsecVDA / RdpIdd 等互不干扰）。

未确认：Moonlight 端到端连接是否呈现为扩展屏而非复制模式。用户反馈"是服务消失了，不是屏幕"，但逐项复查 service / 屏 / 配置均在位，指代对象未澄清（可能是已废弃的 `parsec-vdd-rust` 常驻进程，或设备管理器某驱动的"服务"页签）。下一步取决于用户指明观察位置，不再猜测。

## 后续待办

`host.ps1` 里那套 `parsec-vdd-rust` 逻辑与开机自启顺序应整体替换为 enableidd 方案（原自启顺序约束来自 ParsecVDD 生命周期绑持有进程，usbmmidd 无此约束）。
