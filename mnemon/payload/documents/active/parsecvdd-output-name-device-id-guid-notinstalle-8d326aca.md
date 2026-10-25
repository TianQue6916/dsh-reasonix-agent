---
id: "8d326aca-b7db-4aad-85c9-db05e0e17e25"
title: "ParsecVDD 扩展屏收尾定论：output_name 必须是 device_id GUID + 重启后驱动 NotInstalled + 自启顺序（2026-10-25 夜）"
description: "接 70b6a9ef 之后的收尾排查：Sunshine「显示ID」/output_name 的合法值是 device_id GUID 而非 \\\\.\\DISPLAYn；dd_configuration_option 各档含义；重启后 ParsecVDD API 报 NotInstalled（设备管理器 OK 不等于可用）与重装修复；VDD host 必须先于 Sunshine 服务的自启顺序；dsh 环境的进程回收与 Startup 写权限边界。状态：修复待用户本机验证。"
status: "active"
created_at: "2026-10-25T05:58:06.898Z"
updated_at: "2026-10-25T05:58:06.898Z"
content_hash: "61c76a854049588c9b55263c779271610595d902a2f2bdc67ef76ebfc60f409d"
source_paths:
  - "_moonlight/pvd-host.cmd"
  - "_moonlight/fix-vdd.bat"
  - "_moonlight/restore-service.bat"
  - "_moonlight/start-sunshine.bat"
session_ids:
  - "fcfea720-28b7-4182-8791-d2c7ed7191c2"
memory_body_ids:
  []
---

# ParsecVDD 扩展屏收尾定论（2026-10-25 夜 → 26 日晨）

前置文档：`70b6a9ef-b017-4d02-8c0c-dd7d98a0e9a0`（Sunshine 抓 ParsecVDD 的 DXGI duplication 过滤 / WGC 后端）。
本篇只记录那次之后新拿到的、与抓屏后端无关的四条定论，不重述 DXGI 部分。

## 1. `output_name` 的合法值是 `device_id`（GUID），不是 `display_name`

Sunshine Web UI「音频/视频」页里那个控件叫 **显示ID**，提示示例是 `{de9bb7e2-186E-505b-9E93-F48793333810}` 这种 GUID：

```
显示ID：{de9bb7e2-186E-505b-9E93-F48793333810}
```

而 Sunshine 启动日志里枚举出的每个输出同时有两个标识：

```json
{
  "device_id":     "{d92e0887-5152-51d2-8d06-d26fa451ce1f}",
  "display_name":  "\\\\.\\DISPLAY29",
  "friendly_name": "ParsecVDA"
}
```

⇒ 手写 `output_name = \\.\DISPLAY29`（display_name）永远匹配不上；Sunshine 拿它跟 GUID 比对失败后**静默回退主屏**，表现就是"Moonlight 连上了，但画面是笔记本桌面"。这也解释了为什么改配置看不出报错。

Web UI 保存后 `sunshine.conf` 实际落盘的样子（已验证）：

```ini
output_name = {d92e0887-5152-51d2-8d06-d26fa451ce1f}
dd_configuration_option = verify_only
sunshine_name = TianQue-Pad
encoder = nvenc
fps = 60
lan_encryption_mode = 0
locale = zh
min_fps_factor = 1
```

## 2. 「高级显示设备选项」的两字段

- **设备配置**（`dd_configuration_option`）逐档递进：`禁用（默认）` → `确认显示屏已启用` = `verify_only` → `自动激活显示屏` → `自动激活显示并设为主显示`（最后一档会把任务栏推到平板上，只作诊断，试完退回）。
- **适配器名称**：说明里明确"留空由 GPU 自动选择"，不要填。

## 3. 重启后 ParsecVDD 进入 `NotInstalled`（新增根因）

现象：设备管理器里 `Parsec Virtual Display Adapter` 显示 OK，但直接跑 VDD 工具报

```
Parsec VDD device is not OK, got status NotInstalled.
```

`add` 随即失败退出（实测 spawn 出的进程 `alive: False`），屏幕列表只剩 `\\.\DISPLAY1` 主屏 ⇒ 没有虚拟屏可抓，GUID 填得再对也仍是复制屏。

两条推论：
- **设备管理器的 OK 不能作为 VDD 可用的判据**，必须以 VDD API 返回状态为准。
- 该驱动**不会自己创建显示器**，必须有 host 程序主动 `add` 并常驻持有；驱动刚装完的那一晚之所以成功，是因为当时处于正常 installed 状态。

修复路径：静默重装 `parsec-vdd-0.45.0.0.exe /S` → 拉起 host `add` → 打印显示器列表（应出现第二行 1920×1080）→ 重启 Sunshine 服务重新枚举。

## 4. 自启顺序决定成败

```
① ParsecVDD host（创建并持有虚拟屏）   ← 必须最先
② Sunshine 服务（启动时枚举显示器）    ← 必须第二
```

Sunshine 服务是 `Automatic`，开机立即枚举；虚拟屏若晚于它出现就枚举不到，`output_name` 的 GUID 也就匹配不上。所以"VDD host 放启动文件夹 + 给 Sunshine 服务加延迟启动"必须成对做，只做一半会复现同样的复制屏。

## 附：外部成功案例与一个恢复技巧

同款设备（Huawei MatePad 11，2560×1600）用 Sunshine + Moonlight + Parsec-VDD 做扩展屏的实践记录，含码率基线（1600p90 ≈ 45–75 Mbps、1440p60 ≈ 35–55 Mbps）与"显示ID 逐个试"的流程。其中值得保留的恢复技巧：

> 扩展模式无反应时：Windows 显示设置切「仅在 2 上显示」→ 应用 → 切回「扩展这些显示器」。常能刷新显示状态、把虚拟输出拉回可用。

## 环境边界（影响交付方式）

- dsh 的 tool 进程每次命令结束即被整体回收，**子进程活不过数秒**；常驻托管必须靠计划任务 / 用户双击，不能靠 agent spawn。
- 往 `%APPDATA%\...\Start Menu\Programs\Startup\` 写文件被拒（`Access to the path ... is denied`）；代理侧无法自行落自启项。
- 本机还装有 ExtensoDesk / GameViewer / USB Mobile Monitor 等多套虚拟显示驱动，排查时要先确认 `add` 命中的是 Parsec 那一个。

## 交付物路径

- `_moonlight/pvd-host.cmd` —— 无窗口拉起并持有虚拟屏
- `_moonlight/fix-vdd.bat` —— 静默重装 VDD + host + 列屏 + 重启服务
- `_moonlight/restore-service.bat` —— 把 `SunshineService` 改回 Automatic 并启动、打开 Web UI
- `_moonlight/start-sunshine.bat` —— 双击启动路径（进程能存活，但 lite 版监听端口不稳定）

## 状态

截至记录时：GUID 与 `verify_only` 已确认写入配置；VDD `NotInstalled` 的修复（`fix-vdd.bat`）**尚未得到用户回报结果**，扩展屏是否最终成立未验证。后续接手者应从"VDD API 状态 + 屏幕列表是否两行"开始确认，而不是再从 Sunshine 日志猜。
