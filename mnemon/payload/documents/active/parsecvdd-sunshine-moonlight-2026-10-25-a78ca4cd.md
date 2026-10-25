---
id: "a78ca4cd-460d-47bb-b1de-8a1658fff137"
title: "ParsecVDD + Sunshine + Moonlight 平板扩展屏：端到端验收定论与自启落地（2026-10-25）"
description: "平板扩展屏链路验收通过的最终定论：output_name = device_id GUID、dd_configuration_option 档位、ParsecVDD 重启后 NotInstalled 的修复、虚拟屏生命周期绑 host 进程、更正「VDD 必须先于 Sunshine 服务」的错误假说、dsh 进程回收/Startup 写权限边界、自启落地形态与验收快照、1920x1080 分辨率限制、Moonlight Trackpad 与 Direct touch 区别。前置 70b6a9ef、8d326aca。"
status: "active"
created_at: "2026-10-25T06:36:22.144Z"
updated_at: "2026-10-25T06:36:22.144Z"
content_hash: "5bfcd422c07bae712b4b07d2c984d487bf447963fffecfcf9425b87f200628fb"
source_paths:
  - "_moonlight/pvd-host.cmd"
  - "_moonlight/setup-autostart.bat"
  - "_moonlight/fix-vdd.bat"
  - "_moonlight/restore-service.bat"
session_ids:
  - "eb4c36b9-123f-4849-9a71-bfbf39ea17b5"
memory_body_ids:
  []
---

# 平板扩展屏链路最终定论（验收通过）

前置文档：
- `70b6a9ef-b017-4d02-8c0c-dd7d98a0e9a0` —— Sunshine 抓 ParsecVDD 的 DXGI duplication 过滤 / WGC 后端代码级定论
- `8d326aca-b7db-4aad-85c9-db05e0e17e25` —— output_name = device_id GUID、重启后 `NotInstalled`、当时给出的自启顺序假说

本文记录**用户本机实测通过后的最终状态**，并更正前置文档中的一处错误结论。任务已闭环，平板可裸连 TianQue-Pad 得到扩展屏。

## 一、最终可用的配置（值即真相）

```
# sunshine.conf 关键三行
output_name = {d92e0887-5152-51d2-8d06-d26fa451ce1f}      # 虚拟屏 ParsecVDA 的 device_id
dd_configuration_option = verify_only                      # Web UI 里叫「确认显示屏已启用」
encoder = nvenc
```

- 该 GUID 对应 `friendly_name = "ParsecVDA"`、`display_name = \\.\DISPLAY29`（编号每次启动会变，GUID 不变）⇒ **只有 GUID 稳定可写**
- 「适配器名称」留空（说明要求让 GPU 自动选择）
- 显示器的 `display_name` 编号（`\\.\DISPLAY42` 之类）**会漂移，不可写进配置**
- Sunshine Web UI 强制要求管理账号密码，**不允许空密码**，与配对无关

### `dd_configuration_option` 档位递进

`禁用（默认）` → `verify_only`（确认显示屏已启用）→ `自动激活显示屏` → `自动激活显示并设为主显示`（会把任务栏推到平板，仅诊断用，用完退回）

## 二、整条链路的四个机制（绕了一整夜的点）

1. **`output_name` 的合法值是 `device_id` GUID，不是 `\\.\DISPLAYn`。** 源码里虽比较 `desc.DeviceName`，但 Web UI「显示ID」输入框的字段语义是 GUID。写显示器名会永远匹配不上，静默回退到主屏捕获 —— 这就是"配置看起来生效、画面仍是复制屏"的根因。
2. **ParsecVDD 驱动重启后会进入 `NotInstalled` 状态。** 设备管理器里显示 OK 也没用，其 IOCTL API 直接拒绝服务，`parsec-vdd-rust add` 立刻失败退出。修复：静默重跑一次驱动安装包（`parsec-vdd-0.45.0.0.exe /S`）。这是"双击 host 脚本没反应"的真实原因。
3. **虚拟屏生命周期绑在持有它的进程上。** `parsec-vdd-rust` 一退出，屏立刻消失。因此必须有一个常驻 host（`pvd-host.cmd`），这也是启动项存在的全部理由。
4. **〔更正前置文档〕不存在"VDD 必须先于 Sunshine 服务"的顺序要求。** Sunshine 在**每次客户端连接时都重新枚举显示设备**，日志每次都有 `Info: Currently available display devices:` 列表。只要连接那一刻虚拟屏存在，GUID 就能匹配。之前那条"必须抢在服务前启动"的推论是错的，实测反例：服务开机就跑、虚拟屏后出现，连接照样成功。

## 三、dsh 环境的权限边界（为什么必须用户双击）

- tool 子进程每次命令结束即被整棵进程树回收：实测同一命令内 `alive: True`，下一条命令再查 `procs = 0`，虚拟屏同时消失
- 写入 Startup 文件夹被拒：`Access to the path '...\Startup\ParsecVDD-Host.cmd' is denied`
  ⇒ 凡需要"长期存活"或"写入启动项"的动作，只能产出 `.cmd/.bat` 交给用户双击执行

## 四、自启最终形态

```
启动文件夹: C:\Users\27063\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\
  ParsecVDD-Host.cmd   (296 bytes)   ← VDD host 常驻
  ollama-serve.vbs     (164 bytes)
```

`setup-autostart.bat` 只做一件事：把已验证可用的 `pvd-host.cmd` 复制进启动文件夹。

验收快照（用户执行后实测）：
```
startup entry : True
vdd proc      : 1 (pid 6620)
sunshine svc  : Running
displays      : \\.\DISPLAY1  2560x1600 primary=True
                \\.\DISPLAY42 2194x1371 primary=False
```

## 五、遗留项（不影响使用）

1. **虚拟屏分辨率不是平板原生 2560×1600**（现为 2194×1371 逻辑值）。`parsec-vdd` 0.45 的 `config` 命令在本机对任何分辨率都返回 `Failed to configure display`，README 亦标注 0.45 在部分 Windows 上失效。可选解法：换 0.41 版驱动，或用 `ParsecVDisplay.exe` 手动设置一次。属画质优化，非刚需。
2. **ExtensoDesk 可卸载**（其 IDD 驱动 / AOA 过滤驱动留在 USB 枚举里会碍事）。卸载顺序：停服务 → 卸驱动 → 重启 → 最后移除 `EDWPDFilter.sys`，否则 USB 枚举会出问题。

## 六、Moonlight 触屏模式（今日追问）

平板"只能滑动移动光标、不能点哪里打哪里"不是故障，是客户端输入模式：

| 模式 | 触摸事件映射 | 适合 |
|---|---|---|
| Trackpad（触控板） | 相对位移（`MOUSEEVENTF_MOVE`） | 精细拖拽、远程操作鼠标 |
| Direct touch（直接触控） | 绝对坐标（`MOUSEEVENTF_ABSOLUTE`），由 Sunshine 换算到虚拟桌面尺寸 | 点按钮、翻页、快速定位 |

改法：Moonlight 主界面 → 齿轮 Settings → Input → Touch mode，Trackpad 改 Direct touch；或连上后上边缘下滑 / 三指点击调出串流菜单切换。
限制：Windows 桌面本身不为触摸设计 —— 只是"在 (x,y) 打一次左键"，无长按右键、无滚动惯性、无手势。要多点触控透传需走虚拟 HID 触摸栈（Sunshine 把触摸事件转发到 Windows 触摸栈），配置复杂，未做。

## 七、产出文件入口

工作目录 `C:\Users\27063\_moonlight\`：

- `pvd-host.cmd` —— 虚拟屏常驻 host（自启实际执行体）
- `setup-autostart.bat` —— 复制 host 到启动文件夹
- `fix-vdd.bat` —— 静默重装 VDD + 拉 host + 列屏 + 重启 Sunshine 服务（`NotInstalled` 时的一键修复）
- `restore-service.bat` —— 把 Sunshine 服务 StartType 改回 Automatic
- `sunshine-lite\` —— Sunshine 安装/配置目录
