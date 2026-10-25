---
id: "4c10dbfc-1438-4f00-afc2-4520efe2996e"
title: "Sunshine 抓 ParsecVDD 的第二轮证伪：lite 用户进程 + WGC 仍失败 → 转 OBS 中转（2026-10-25）"
description: "承接 70b6a9ef 的后续实测：把 Sunshine 从 Windows 服务切成 lite 用户进程（session 1）后 WGC 依旧失败（0x80070005 E_ACCESSDENIED，Capture size 仍为主屏 2560x1600），据此判定 Sunshine 侧两条捕获后端在 Windows 11 24H2 上全被排除；含切换脚本/配置复制做法、dd_manual_resolution 致 VDD 掉线的教训、当前机器状态的恢复方式与 OBS 中转/Parsec 客户端两条后续路线。"
status: "active"
created_at: "2026-10-24T17:36:02.318Z"
updated_at: "2026-10-24T17:36:02.318Z"
content_hash: "e2eafff138764453047166d11d2f53a363b114d4c1c46ff4d6ff64d779029fb6"
source_paths:
  - "_moonlight/switch-to-lite.bat"
  - "_moonlight/run-lite.ps1"
  - "_moonlight/start-sunshine.bat"
  - "_moonlight/fix-sunshine.bat"
  - "_moonlight/rollback-sunshine.ps1"
session_ids:
  - "e99e76cc-9260-4d2a-b6fc-ee48d0923100"
memory_body_ids:
  []
---

# Sunshine lite 用户进程模式实测：WGC 也失败，Sunshine 侧后端全排除（2026-10-25 凌晨）

承接文档 `70b6a9ef-b017-4d02-8c0c-dd7d98a0e9a0`（DXGI duplication 被 `test_dxgi_duplication()` 过滤、切 `capture = wgc`）。本文记录**该假说的证伪**：服务模式换到用户进程模式后 WGC 依旧不可用，Sunshine 自身选屏/捕获这两条路在 Windows 11 24H2 上均已排除。

## 1. 假说与验证方法

假说（承接上文）：WGC 失败码 `0x80070424`（`ERROR_SERVICE_DOES_NOT_EXIST`）是因为 Sunshine 以 Windows 服务运行在 **session 0**，那里没有交互式桌面，无法创建 `GraphicsCaptureItem`；改以**用户身份在 session 1** 运行即可。

验证步骤：
1. 下载 `Sunshine-Windows-AMD64-lite.zip`（36.3 MB，免安装），解压到 `_moonlight/sunshine-lite/Sunshine/`（`sunshine.exe` 67.6 MB）。
2. 把服务版 `config\` **整个复制**到 lite 目录：`sunshine_state.json`(1514 B)、`credentials`、`apps.json`、`sunshine.conf` —— 关键是 `sunshine_state.json`，配对信息得以保留，平板**无需重新配对**。
3. `sc stop SunshineService` + `sc config ... start= disabled`（需 UAC），再以当前用户启动 lite 的 `sunshine.exe`。
4. 观察端口、进程 session 与日志中的 `Capture size` / `Desktop resolution`。

## 2. 结果：session 1 成立，WGC 仍然失败

进程与端口都正常：

```
pid=30660   session=1        ← 确实是用户会话
47984 / 47989 / 47990 / 48010 LISTENING
```

但捕获仍失败，**且错误码只是从「服务不存在」变成「访问被拒」**：

```
Error: Screen capture is not supported on this device for this release of Windows:
       failed to acquire display: [0x80070005]      ← E_ACCESSDENIED
Capture size : 2560x1600                            ← 仍是主屏，不是虚拟屏
...
Error: Video failed to find working encoder
```

判定依据是 `Capture size`：`output_name = \\.\DISPLAY29` 若被采纳，尺寸应是虚拟屏的 2880x1620 / 1920x1200 档，而它始终报主屏 2560x1600 ⇒ **WGC 后端根本没走到 `output_name` 匹配那一步**，`0x80070005` 是 Windows 11 24H2 对 `GraphicsCaptureItem` 的额外访问限制（隐私/会话授权），不是 session 0 问题。

⇒ **两条后端全排除**：DXGI 过不了 `test_dxgi_duplication()`；WGC 拿不到捕获授权。这不是配置能修的。

## 3. 一个真实的自伤：`dd_manual_resolution`

`dd_manual_resolution = 3072x1920` 是**逻辑像素**，虚拟屏 EDID 到不了该档位；强设直接把 ParsecVDD 驱动搞掉线，随后出现一串 "Device not available" 的**假象**，误导了后续排查。

- 教训：**改 VDD 分辨率只能用驱动自报的档位（≤1920×1080 那几档）**，不要按显示器逻辑分辨率猜。

## 4. 当前机器状态与恢复方式

为切 lite，`SunshineService` 被停并设为 Disabled，lite 进程随后也未留在运行状态 ⇒ **Sunshine 目前是停着的**。

恢复：双击 `_moonlight/start-sunshine.bat`（不需要管理员，用户进程模式启动 lite，配置已从服务版复制，配对仍在）。判据：窗口出现 `47989 LISTENING`。此时平板点 `TianQue-Pad` 能连，但画面仍是复制屏。

相关脚本：`_moonlight/switch-to-lite.bat`（自提权：停/禁服务 + 起 lite + 查 47989）、`_moonlight/run-lite.ps1`、`_moonlight/fix-sunshine.bat`（把服务版 `sunshine.conf` 重置回基线：删 `capture`/`output_name`/`dd_*`）、`_moonlight/rollback-sunshine.ps1`。

## 5. 环境摩擦（下次直接避开）

- **工具进程无法自行提权**：多次 `Start-Process -Verb RunAs` 的 UAC 弹窗未被确认（用户原话「你就不能提权自己点吗」，而 tool 进程 `is elevated: False`、session=1 但 UAC 未点）。凡是改 `C:\Program Files` 或启停服务的动作，**必须落成一个用户可双击的 bat**，由用户按一次「是」，不要在一个回合内反复重试 UAC。
- **`D:\Desktop` 对 tool 进程不可写**：写临时目录报 `EPERM: operation not permitted, mkdir 'D:\Desktop\...tmpdir'`，脚本要落在 `C:\Users\27063\_moonlight\`。
- PowerShell 里写设备路径要用字符拼接避转义：`'\\.\DISPLAY' + 29`，或 `[char]92` 拼反斜杠；直接写字符串会被吃成一个反斜杠（曾产生 `\.\DISPLAY29` 这种无效 device string）。

## 6. 后续路线（均未实施）

1. **OBS 中转（首选）**：OBS 的「显示器采集」（`display_capture` 源）走 WGC 的**另一个入口**，能枚举并捕获包括 ParsecVDD 在内的任意显示器；再让 Sunshine 串流 OBS 预览窗口，绕开 Sunshine 自己的选屏缺陷。代价：延迟 +5–10 ms。
2. **Parsec 官方客户端**：ParsecVDD 本就是它的驱动，「虚拟屏当扩展屏」是原生能力；但需注册账号，且虚拟屏自动配置属于付费档，需先测免费档能做到多少。
3. 自启只能在路线确认后做：lite 模式不能开机自启，只能登录后拉起（启动文件夹或登录触发的计划任务）。
