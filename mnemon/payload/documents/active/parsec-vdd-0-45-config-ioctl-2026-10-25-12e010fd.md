---
id: "12e010fd-adbd-494b-ad86-23cd9bb69f89"
title: "平板扩展屏打通阶段：虚拟屏入桌面拓扑、parsec-vdd 0.45 config IOCTL 失效与常驻持有方案（2026-10-25）"
description: "承接 ccd960b3 的打通阶段实施手账：用户 Win+P 后虚拟屏成功进入扩展拓扑（DISPLAY29 2880x1620 @3840,0）；定论 parsec-vdd 0.45 的 config IOCTL 对任何分辨率都失败、ParsecVDisplay.exe 能设模式但不持久故不适合开机自启；给出 pvd-host2.ps1 常驻持有 + start-pad.ps1 一键拉起（spawn host → 等屏出现 → 改 sunshine.conf）的架构与路径。含虚拟显示器生命周期绑持有进程这一非显然机制、GUI 自动化点击不可行的教训、sunshine.conf 定型参数与剩余配对/自启顺序。"
status: "active"
created_at: "2026-10-24T16:29:28.287Z"
updated_at: "2026-10-24T16:29:28.287Z"
content_hash: "3a3bb3e9f947f570c9afee87de1e34e70fac139fb6adcc365146cbcc460e9f71"
source_paths:
  - "_moonlight/pvd-host2.ps1"
  - "_moonlight/start-pad.ps1"
  - "_moonlight/cfg-sunshine.ps1"
  - "_moonlight/pvd-host.ps1"
session_ids:
  - "abf5732a-c379-49d7-a5b4-a560d9462d06"
memory_body_ids:
  []
---

# 平板扩展屏：从「屏 present 但不入拓扑」到「链路打通、只差配对」

性质：打通阶段的实施手账与方案选型定论。阻塞取证与提权边界见 `ccd960b3-9287-4531-b3a1-54f41cb8d2c3`；EDID 锁死判定与 Sunshine 服务化见 `84cfe2b6-3f3c-4679-b7d7-774bb08e2508`；候选方案调研见 `a60eaadf-c22c-4633-81fd-6284897cfb50`。本文只记本阶段新增的结论，不重复前两篇的取证。

## 1. 打通后的实测状态

- 虚拟屏进入桌面拓扑：`Screen.AllScreens` 出现第二块 `\\.\DISPLAY29`，位置 `@(3840,0)`、`primary=False`，即实体屏（`\\.\DISPLAY1` 2560x1600 @0,0 主屏）右侧的扩展位。触发方式是用户手动 `Win + P` → 「扩展」（程序侧 `SetDisplayConfig` / `DisplaySwitch.exe /extend` 因权限被拒，见前篇）。
- 曾观察到逻辑尺寸 `2880x1620` / `3072x1920` 浮动 —— 这是 Windows 缩放后的逻辑像素，底层 EDID 模式仍是 Parsec VDD 默认的 1920x1080，不是真的设上了高分辨率。
- Sunshine：service Running，监听 `47984 / 47989 / 47990`；Web UI `https://localhost:47990` 返回 401 = 凭据已生效（用户名 `dsh`，密码不入文档）。
- `sunshine.conf` 定型参数：`sunshine_name = TianQue-Pad`、`encoder = nvenc`、`fps = 60`、`min_fps_factor = 1`、`output_name = \\.\DISPLAY29`、`origin_web_ui_allowed = lan`、`lan_encryption_mode = 0`。`output_name` 指向虚拟屏是「只串流扩展屏、主屏不受影响」的关键开关，缺了它 Moonlight 传的是整个拼接桌面。

## 2. 非显然机制：虚拟显示器生命周期绑在持有它的进程上

`parsec-vdd-rust add` 确实成功（打印 `Added a new virtual display, index: 0, hmonitor_id: ..., display_name: [1] \\.\DISPLAY1 (PSCCDD00) - 2560x1600@240Hz`），PnP 对象 `Generic Monitor (ParsecVDA)` = OK、`WmiMonitorID` 列出 `DISPLAY\PSCCDD0`。但**进程一退出屏就消失**，且 `ParsecVDisplay.exe` GUI 重启后也不会自动恢复虚拟屏。

⇒ 任何「开机自启」方案必须让一个进程常驻持有 handle，不能靠「跑一次 add 然后退出」。

## 3. 失败定论：0.45 驱动的 config IOCTL 在本机不工作

- `parsec-vdd-rust config` 对**任何**目标分辨率都返回 `Failed to configure display, index: N`（试过 2560x1600@60 等多个模式，全部失败），而 `add` 与 `get` 正常 ⇒ 不是分辨率上限问题，是 0.45 驱动的 config IOCTL 不工作。项目 README 自己标注 0.45 "may not work on some Windows"。
- 所以分辨率不能靠 parsec-vdd-rust 设置。可行路线二选一：① 换 `parsec-vdd` **0.41**（README 标为 Stable）；② 用 `ParsecVDisplay.exe` 的 `CUSTOM...` 手动设一次任意分辨率（该 GUI 对 0.38/0.41/0.45 全兼容）。
- `ParsecVDisplay.exe` 虽能设模式，但**不持久**（见 §2），不能充当自启方案；它只是「手动调分辨率」的工具。

## 4. 教训：不要用屏幕坐标点击做 GUI 自动化

尝试用截图 + 计算 client 坐标去点 `ParsecVDisplay.exe` 的按钮（含 `hwnd` / `ScreenToClient` 换算、校验窗口 under cursor 是否匹配），初期几次命中，但该窗口**会自己漂移位置**，后续点击全部落空，最终放弃。

⇒ 涉及 GUI 的最后一步（选显示器标号、点 `CUSTOM...` 设分辨率、`Win+P`）交给用户手点，比盲点快一个数量级。这属于「一次人工点击换掉十次盲试」的止损判断，不是能力不足的托词。

## 5. 落地脚本（`C:\Users\27063\_moonlight\`）

- `pvd-host2.ps1` —— **常驻持有器，当前实际生效的方案**。后台 spawn `parsec-vdd-rust`、add 虚拟屏、配置模式、然后 `hold handle`。关键工程细节：**故意不读子进程 stdout**（注释 `output intentionally unread; buffer is small`），因为读/不读会决定管道缓冲是否阻塞子进程。日志写入自身 log（`==== pvd-host2 start ... ====` / `spawned pid=` / `holding handle`）。
- `start-pad.ps1` —— **一键拉起**：spawn VDD host → 轮询等虚拟屏出现在 `Screen.AllScreens` → 取其设备名写进 `sunshine.conf` 的 `output_name` → 重启服务 → 打印监听端口。实测日志：`screen \\.\DISPLAY29 3072x1920 @3072,0`、`virtual display = \\.\DISPLAY29`、`sunshine.conf updated`、`service: Running`。
- `cfg-sunshine.ps1` —— 只重写 `sunshine.conf` 并重启服务，不动 VDD。
- 旧的 `pvd-host.ps1` 仍在磁盘上（`create` 不能覆盖已存在文件，所以第二版另起名 `pvd-host2.ps1`）；改脚本前先确认没有同名文件挡路。

## 6. 剩余待办与顺序（顺序不可颠倒）

1. 用户在平板 Moonlight 里 `+` → 输 `192.168.0.102` → 记下 4 位 PIN → 由程序调 Sunshine 的 PIN 配对接口提交（比在 Web UI 手填快）。配对成功后 Moonlight 会记住主机，之后平板上点一下即连 —— 这正是用户要的「一键」。
2. 验证画质后再决定是否折腾分辨率（1080p@60 + 高码率通常已明显优于 ExtensoDesk 免费档）。
3. 最后才做开机自启：`SunshineService` 已是 Automatic；缺的是「登录时触发、最高权限运行 `start-pad.ps1`」的计划任务。**先验证链路可用，再持久化**，否则开机自启一个未验证的流程只会添乱。

## 7. 本阶段踩到的权限边界（补充前篇）

`SetDisplayConfig(SDC_TOPOLOGY_EXTEND|SDC_APPLY)` 返回 `87`（ERROR_INVALID_PARAMETER，参数形态问题）与 `5`（ERROR_ACCESS_DENIED，权限问题）两种情况都出现过；后者的根因是 dsh 的 tool 进程权限被压得很低（同一限制导致 `HKCU\Environment` 写入失败），不是调用写错。要程序化改拓扑只有 UAC 提权一条路，而提权脚本本身还有 `-WindowStyle Hidden` + `-Verb RunAs` 导致静默不执行的坑（详见前篇）。
