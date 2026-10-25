---
id: "ccd960b3-9287-4531-b3a1-54f41cb8d2c3"
title: "parsec-vdd 虚拟屏 present 但未进桌面拓扑：三项阻塞取证与提权边界（2026-10-25）"
description: "平板扩展屏项目的阻塞点定层记录：Sunshine 服务/凭据/防火墙与 parsec-vdd 驱动已实测落地；parsec-vdd-rust add 能创建 2560x1600@240Hz 虚拟屏且 PnP 为 OK，但 SetDisplayConfig(EXTEND|APPLY) 返回 5=ERROR_ACCESS_DENIED、DisplaySwitch /extend 同样失败、显示器随持有进程退出而消失；含 REPL 常驻持有方案 pvd-host.ps1、GUI 自动化点偏的失败取证、`-WindowStyle Hidden`+`-Verb RunAs` 导致脚本静默不执行，以及后续 output_name/encoder/配对顺序。"
status: "active"
created_at: "2026-10-24T16:15:53.835Z"
updated_at: "2026-10-24T16:15:53.835Z"
content_hash: "db94d0423fdc5ec9f525844ba2e6b4d00da92ea064c8847e69ae0ddd364311ce"
source_paths:
  - "_moonlight/pvd-host.ps1"
  - "_moonlight/uac-setup.ps1"
  - "_moonlight/setup-sunshine.ps1"
  - "_moonlight/uac.log"
session_ids:
  - "9bbc089c-4159-42c5-95cd-83419a620ac3"
memory_body_ids:
  []
---

# parsec-vdd 虚拟屏 present 但未进桌面拓扑：三项阻塞取证与提权边界（2026-10-25）

性质：带实测证据的阻塞点定层（承接实施手账 `84cfe2b6-3f3c-4679-b7d7-774bb08e2508` 与方案调研 `a60eaadf-c22c-4633-81fd-6284897cfb50`）。记录的是「已经能建屏、但屏进不了活动桌面」这一层的机制与边界，不是完整安装教程。

## 客户端诉求（决定后续所有开关）

用户明确纠正：目标是**扩展屏**，不是复制/镜像屏。因此 Sunshine 的 `output_name` 必须钉到虚拟屏那一路，否则 Moonlight 传的是整块拼接桌面，主屏内容会一起上屏。

## 已实测落地的服务端基线

| 项 | 证据 |
|---|---|
| `SunshineService` | Running / Automatic |
| Web UI | `https://localhost:47990` 返回 HTTP 200 |
| Web 凭据 | `--creds` 执行 exit=0，日志「New credentials have been created」；凭据本身不记录在此 |
| 防火墙 | 47984/47989/47990/47998/47999/48000/48002/48010 的 TCP+UDP 规则已创建 |
| parsec-vdd 驱动 | `Parsec Virtual Display Adapter` 显示 OK，`ROOT\DISPLAY\0003` |
| 虚拟屏对象 | `Generic Monitor (ParsecVDA)` = OK，`WmiMonitorID` 列出 `DISPLAY\PSCCDD0\1&F868FB5&0&UID256` |

注意 `HKLM\SOFTWARE\Parsec\vdd` 在本机为空 —— 该键存在不等于有已配置的显示器，判断虚拟屏是否真的存在要靠 PnP 设备 + `WmiMonitorID`，而不是读注册表。

## 建屏路径与参数（parsec-vdd-rust 0.0.1）

`parsec-vdd-rust.exe` 是 REPL 而非一次性 CLI，必须先起进程再喂命令：

- `add` 无参数，创建后打印 `Added a new virtual display, index: 0, hmonitor_id: 962594839, display_name: [1] \\.\DISPLAY1 (PSCCDD00) - 2560x1600@240Hz`，默认即 2560x1600@240Hz。
- `config -i <index> [-s WxH] [-r Hz] [-p x,y] [-o landscape|portrait|landscape-flipped|portrait-flipped]`。
- `get` / `remove` / `exit` 为其余子命令。

## 三项阻塞（均实测，非推测）

1. **显示器生命周期绑在持有进程上。** `add` 成功后进程一退出，屏就消失；`get` 在下一个进程里返回 `No added virtual displays.`。对策是常驻持有：已写 `_moonlight/pvd-host.ps1` 后台拉起并保持 REPL 存活（pid 存活已验证，`Add-Type` 之外无需管理员）。代价是重启即失效，先验证链路再谈自启，顺序不要颠倒。
2. **present 但未加入桌面拓扑。** 屏已在 PnP/`WmiMonitorID` 层存在，但 `[Windows.Forms.Screen]::AllScreens` 始终只有 1 块。`SetDisplayConfig(SDC_TOPOLOGY_EXTEND | SDC_APPLY)` 返回 **5 = ERROR_ACCESS_DENIED**；`DisplaySwitch.exe /extend` 同样失败；vdd 运行中与否结果一致（一次返回 87 = ERROR_INVALID_PARAMETER）。判定为 dsh tool 进程权限被压低所致 —— 同一限制早前也让 `HKCU\Environment` 写入报 WinError 5，属同源证据，不是参数写错。
3. **GUI 自动化不可用于 ParsecVDisplay 点「ADD DISPLAY」。** 窗口自适应 + 自定义绘制控件，`UIA` 拿到的 rect 与实际像素不符，按 `1788,1074` 点击会点偏（`hwnd` 与 `foreground` 不一致，说明前台被抢）。已弃用该路线，改 REPL 持有。

## 环境 quirk：`-WindowStyle Hidden` + `-Verb RunAs`

UAC 提权脚本若同时带 `-WindowStyle Hidden`，脚本会被启动但**完全不执行**，判据是日志文件根本没生成；去掉 `Hidden` 即正常。以后所有 `Start-Process -Verb RunAs` 脚本都不要加 `Hidden`，靠脚本内自写日志确认执行。

## 未验证 / 待用户单步确认

- `Win + P` → 「扩展」是否可见可选（屏被后台进程持有期间才有效）。
- 若「扩展」灰置，改由 UAC 提权进程执行 `SetDisplayConfig`，权限够时才可判参数对错。
- `encoder = nvenc` 与码率/帧率落 `sunshine.conf` 需一次 UAC 重启服务；码率上限要按 AX201 实测 287 Mbps 链路计算，不要猜。

## 后续顺序（不可跳过）

1. `Win+P` 让虚拟屏进拓扑 → 记录「显示器 N」标号。
2. `output_name` 钉到 ParsecVDA → `encoder=nvenc` + 码率帧率 → UAC 重启服务。
3. 平板 Moonlight 连 `192.168.0.102`（RNDIS 备用 `192.168.0.100`）→ 4 位 PIN 由服务端 PIN 页提交。
4. 链路跑通后再做持久化（ParsecVDisplay GUI 或计划任务托管 host）。
