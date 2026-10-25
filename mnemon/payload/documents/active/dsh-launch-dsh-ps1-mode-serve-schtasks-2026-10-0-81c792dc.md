---
id: "81c792dc-1f0f-485e-8a6a-39bebfadfa13"
title: "开机弹出 dsh 命令行窗口的来源排查：launch-dsh.ps1 -Mode Serve 调用者探针、自启项排除清单与本机 schtasks 失效（2026-10-06）"
description: "2026-10-06 晚排查「每次开机弹出命令行窗口」的实测记录：窗口即 launch-dsh.ps1 -Mode Serve；Run/RunOnce/Startup 排除清单；本机 schtasks/Get-ScheduledTask 失效的环境怪癖；已装 caller-trace 探针与读取位置；launch-dsh.ps1 的三条设计 rationale（单实例 / UseShellExecute / --use-system-ca）；web 3080 与桌面版共用 DSH_HOME 的互踩风险；ollama 便携版闲置现状。"
status: "active"
created_at: "2026-10-06T14:04:32.186Z"
updated_at: "2026-10-06T14:04:32.186Z"
content_hash: "e68e54eff26ffa5db1287e000c45063274a96e47ac15b7d7e54c4a2aa30ff3e2"
source_paths:
  []
session_ids:
  - "9059fe37-47ab-4566-ba0b-8a0087b137c6"
memory_body_ids:
  []
---

# 开机弹出 dsh 命令行窗口的来源排查（2026-10-06）

## 背景
用户报告「每次开机都会出现这样的（窗口）」。原始输入被输入法整串倒序上屏（`haiyedgnayehznaixuhciuhuodijiakicie`，35 字符），倒序后为可切分拼音 `eici kaiji douhui chuxian zheyang de yiah` ⇒ 原意是「（每次）开机都会出现这样的……（还有）」。

## 结论：窗口来自 `launch-dsh.ps1 -Mode Serve`
窗口那三行逐字来自 `C:\Users\27063\.dsh\launch-dsh.ps1` 的 `Write-Host`：

```
启动 ollama serve (port 11434)
启动 dsh web  port=3080  workspace=C:\Users\27063  mode=Serve
已在 3080 运行。
```

⇒ 有人执行了 `powershell -File ~/.dsh/launch-dsh.ps1 -Mode Serve`。`-Mode Serve` 的语义是「开机自启用：只保证服务在跑，不弹浏览器，启动后立刻返回」（脚本自身注释）。

**启动者未定位**（见下），已改为探针取证而非继续猜。

## 已排除清单
| 位置 | 结果 |
|---|---|
| `Win32_StartupCommand`（注册表 Run + Startup 文件夹权威合并视图） | 8 条，无一条 dsh：`ollama-serve`(Startup, `ollama-serve.vbs`) / `GameViewer` / `Mozilla-Firefox` / `OCS-AI-Tiku-Gateway`(`wscript.exe C:\Users\27063\.ocs-ai-tiku\start-hidden.vbs`) / `RustDesk Tray` / `Tailscale` / `SecurityHealth` / `sysdiag`(火绒 `D:\Huorong\Sysdiag\bin\hipstray.exe`) |
| Startup 文件夹（真实位置 `D:\ExplorerData\Start Menu\Programs\Startup\`，走 junction） | 只有 `desktop.ini` + `ollama-serve.vbs`(164 B / Sep 28)，后者 `sh.Run ..., 0, False` **隐藏窗口**，只拉 ollama，不碰 dsh |
| HKCU / HKLM / WOW6432Node 的 Run、RunOnce | 无 dsh |
| Task Scheduler | **没查透**（见环境怪癖） |
| `Microsoft-Windows-TaskScheduler/Operational`、`Microsoft-Windows-PowerShell/Operational`（4104/4103）搜 `launch-dsh` | 零命中 |

旁证（解释为何抓不到父链）：
- 本次开机时间 `2026年10月6日 17:10:20`，但 `~/.dsh/logs/dsh-web-3080.out.log` 的 mtime 是 **21:52** ⇒ 3080 是 21:52 那次起来的（与 `_restart-web.cmd` 的延迟 + 拉 ollama 的时间线吻合），**开机现场已被覆盖**。
- 21:51:38 起 ollama（PID 26684，父 26036 已退出）；21:51:59 起 `DeepSeek Harness.exe` 21256（是上一轮任务栏修复时手动拉的，非自启）。现场所有 powershell/wscript/cmd 进程 CreationDate 都在 21:51:38–21:58:58，父进程均已退出。

## 本机环境怪癖（会重复踩）
- `schtasks /query` 在本机一律 `ERROR: The system cannot find the path specified.`；`Get-ScheduledTask` 报 `HRESULT 0x80070003`；但 `sc query Schedule` = RUNNING，服务正常。**不要**把 schtasks 无输出当作「没有计划任务」。
- Git-bash（MSYS）会做路径转换：`/query`、`/fi` 被当成路径 ⇒ `ERROR: Invalid argument/option - 'C:/Git/query'`。改用 `cmd /c` 包裹后退出码 0 但仍无输出，没有绕过该机 schtasks 失效问题。
- 排查自启项时 `Win32_StartupCommand` 比逐个查 `HKCU/HKLM Run` + Startup 文件夹更省事，一次拿到全部来源与 User 归属。

## 已装探针（零风险，改完即生效）
在 `~/.dsh/launch-dsh.ps1` 开头（`$null = New-Item ... $LogDir` 之后）插入 caller-trace 段：**5633 → 7396 B**，`Parser::ParseFile` 语法检查 **SYNTAX OK**，自动备份 `~/.dsh/launch-dsh.ps1.bak-20261006-pre-callertrace`。每次被调用时把自身父进程链（最多 8 层，含 `CommandLine`）与两个 Startup 文件夹的实时内容追加到：

```
~/.dsh/logs/launch-dsh-caller.log
```

⇒ 下次开机窗口再出现，启动者会作为事实记录在该日志里，不必再靠推测。

## `launch-dsh.ps1` 设计 rationale（原作者注释要点，改动时必须保留）
- **单实例 / 幂等**：会话按文件存（`~/.dsh/sessions/<cwd>/session-<uuid>/session.v4.jsonl.zstd`），没有跨进程锁。第二个实例打开同一会话会两个进程同时追加同一文件 → 互相踩（表现为「无法同时对话」）。所以固定端口 3080，在跑就绝不再起。
- **`UseShellExecute = $true`（重要）**：旧版用 `$false`，子进程继承父进程 stdout 句柄；当 launcher 由别的进程（如 agent 的 bash 工具）调起时，stdout 是管道，dsh 长期存活 → 管道永不关闭 → 调用方等到超时，看起来像「卡死」。代价：不能 `RedirectStandardOutput`，改为让 cmd 自己重定向到日志文件。
- **`NODE_OPTIONS=--use-system-ca`**：本机 dev-sidecar 做 MITM，用自生成根 CA 签证书；Node 默认只信任内置 CA，于是 fetch 抛 `unable to verify the first certificate`。该 flag 让 Node 读 Windows 证书库（dev-sidecar 根 CA 已在 `CurrentUser\Root`）。实测：不加 → 证书失败；加了 → `https://github.com` HTTP 200 / 576183 bytes。
- 两种模式：`-Mode Serve`（开机自启）只保证服务在跑并立刻返回；`-Mode Open`（桌面快捷方式）保证服务在跑后打开带 token 的 URL。相关脚本：`~/.dsh/_restart-web.cmd`、`~/.dsh/_restart-web.vbs`（VBS `sh.Run ..., 0, False` 隐藏窗口 detach）。
- 当前 `launch-dsh.ps1` 共 120 行；本次探针补丁后 7396 B。

## web(3080) 与桌面版会互踩，不只是「要不要自启」
- 桌面版**不依赖** 3080（grep `~/.dsh/profiles/desktop/` 对 `3080` 零命中）。
- 但两者共用 `DSH_HOME=~/.dsh` 与同一份 session 文件；`launch-dsh.ps1` 的幂等只防 **web ↔ web**，防不了 **web ↔ desktop**。本次排查时 `DeepSeek Harness.exe`（7 个进程）与 `127.0.0.1:3080` 同时活着。
- 若主力换成桌面版，建议不让 web 自启（脚本本身留着，可随时手动跑回浏览器版）。

## ollama 现状（纯闲置）
- `C:\Users\27063\.local\ollama\ollama.exe`，**v0.34.4 便携版**（不是 `AppData\Local\Programs\Ollama`），监听 `127.0.0.1:11434`，约 33 MB。
- 只装了 `nomic-embed-text:latest`（137M / F16 / **768 维**）——是 **embedding 模型，不是聊天模型**，不能用来对话。
- 唯一消费者是 dsh 的 `dsh-mnemon` 插件 embedding 段，而两边配置都是 `enabled: false`：
  - `~/.dsh/profiles/desktop/cordis.patch.yml:1326-1329`
  - `~/.dsh/profiles/web/cordis.patch.yml:1367-1368`
- `/api/ps` 返回 `{"models":[]}`，无 inference ⇒ 目前只有内存占用，留着无害；自启项是 Startup 文件夹里的 `ollama-serve.vbs`。

## 待办 / 未决
- [ ] 下次开机后读 `~/.dsh/logs/launch-dsh-caller.log` 定位窗口启动者（尚未定位）。
- [ ] 用户未表态是否关闭 web 自启与 ollama 自启；3080 进程是否立即收掉，取决于当前对话窗口是桌面版还是浏览器标签页。

## 相关文档
- 图标白纸（本轮无关但同机同源环境）：`2a3a3f1e-f17c-470d-a66e-f595588d583a`（2026-10-04）、`f94f359a-90cb-439c-b2c3-8ce874fa16ef`（2026-10-06 第六轮）。
