---
id: mem-b4f811ab22c14f4685b8c73dc79fbed4
revision: 1
created_at: "2026-10-06T05:41:35.340Z"
updated_at: "2026-10-06T05:41:35.340Z"
name: dsh-desktop-requires-no-sandbox
description: "dsh 桌面版本机必须带 --no-sandbox（否则 0x80000003 崩溃）；三处快捷方式都要带，app 更新后会回归"
metadata:
  type: user
  fact_type: reference
  scope: global
---

dsh 桌面版（DeepSeek Harness）在本机（账号 `天阙九泉\27063`，非 admin）**必须带 `--no-sandbox` 才能启动**（2026-10-06 定论）：
不带 ⇒ 立即退出，`ExitCode = -2147483645` = **`0x80000003` STATUS_BREAKPOINT**、进程数 0；
带 ⇒ 正常 6 进程（main + gpu + renderer×N），主窗口出现（**约需 35 s**，20 s 时查 `MainWindowTitle` 仍是空的）。

崩溃发生在**最底层 sandbox 初始化（C++）**，早于 `lib/main.js` @281631 的 `claimDesktopSingleInstance()`
⇒ `requestSingleInstanceLock()` 根本到不了 ⇒ **已有实例在跑时点图标也不会激活窗口** ⇒ 症状一律是「点任务栏图标完全没反应」。

**三处快捷方式缺一不可**（2026-10-04 只修了开始菜单那一个，漏了任务栏 pin ⇒ 症状持续两天）：
1. 任务栏 pin：`%APPDATA%\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\DeepSeek Harness.lnk`
2. 桌面：`%USERPROFILE%\Desktop\工具箱\DeepSeek Harness.lnk`
3. 开始菜单：`%APPDATA%\Microsoft\Windows\Start Menu\Programs\DeepSeek Harness.lnk`

**一键修复**：`powershell -File ~/.dsh/storages/tools/fix-desktop-shortcuts-nosandbox.ps1`
（幂等、每处自动备份 `.bak-nosandbox`、自带 launch check）。
改完若任务栏点击行为没变：`Stop-Process -Name explorer -Force` 刷 pinned 缓存（Windows 自动拉起 shell）。
**app 更新/重装或重新 pin 之后必须重跑** —— NSIS 会重建快捷方式、参数丢失 ⇒ 症状回归。

**已排除的元凶**（全部查过、都干净）：IFEO(HKLM/HKCU)、Per-app Exploit Protection、
AppCompatFlags Layers(HKCU/HKLM)、三处 .lnk 与 exe、`app.asar` 的 Zone.Identifier（ADS 只有 `:$DATA`）。
**sandbox 失败的根因本身未定位**，`--no-sandbox` 是官方标准规避方式。

**两个易误判点**：① `Start-Process <.lnk>` 会弹「打开文件 - 安全警告」——那是 Attachment Manager 对
**非 explorer 发起**的 .lnk 启动的确认，**不是**本故障的一部分；验应用**直接启动 exe 加参数**。
② 窗口约 35 s 才出现，别在 20 s 时就判「没起来」。

**安全代价（需知情）**：`--no-sandbox` 关闭 Chromium 的 OS 级 renderer 隔离。本地自用工具可接受，
但不要在长期打开不可信网页的场景下这么跑。
