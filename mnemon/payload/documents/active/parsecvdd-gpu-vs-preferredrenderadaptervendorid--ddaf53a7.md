---
id: "ddaf53a7-93f1-4636-8810-312bc877279f"
title: "ParsecVDD 虚拟屏父 GPU 归属（核显 vs 独显）：PreferredRenderAdapterVendorId 与 Sunshine 抓屏验证（2026-10-27）"
description: "接在 70b6a9ef / 8d326aca / a78ca4cd 之后的第三层排查：output_name 已用 device_id GUID 仍回退主屏时，用 dxgi-info.exe 判定虚拟屏挂在 Intel 核显而非 NVIDIA 独显，改 WUDF 注册表 PreferredRenderAdapterVendorId=0x10DE + DisablePreferredRenderAdapterChange=0 并重启；含 dxgi-info 读法、sunshine.log 取 device_id 与 refresh rate 对照验证法、output_name 反斜杠转义坑、host.ps1 单例保护。"
status: "active"
created_at: "2026-10-27T08:52:15.293Z"
updated_at: "2026-10-27T08:52:15.293Z"
content_hash: "3b822115575764bd97f149b0168225454d08c905f75bb94bdb01d4f2eea8d698"
source_paths:
  []
session_ids:
  - "503c2c2a-470e-43ae-bb10-c981cea3cdb3"
memory_body_ids:
  []
---

# ParsecVDD 虚拟屏父 GPU 归属与 Sunshine 抓屏验证（2026-10-27）

前置文档（按时间顺序，本层是它们的下游）：
- `70b6a9ef-b017-4d02-8c0c-dd7d98a0e9a0` —— DXGI duplication 过滤 / WGC 后端
- `8d326aca-b7db-4aad-85c9-db05e0e17e25` —— output_name 必须是 device_id GUID
- `a78ca4cd-460d-47bb-b1de-8a1658fff137` —— 端到端验收与自启

## D 定论

1. **`\\.\DISPLAY22` 出现在 Intel 那节、而不是 NVIDIA 那节时，Sunshine 的 `encoder = nvenc` 抓不到它。** 跨 GPU 捕获拿不到目标画面，Sunshine 静默回退主屏 —— 表现为 Moonlight 里画面是笔记本主屏的"复制"，而不是扩展。dbgview 侧只看到 `DevicePrepFailed`（错误信息误导性很强，别顺着它查）。
2. **虚拟屏父 GPU 由 WUDF 服务启动参数决定，不由 ParsecVDD 的 CLI 决定。**
   注册表位置：`HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\WUDF\Services\ParsecVDA\Parameters`
   - `DisablePreferredRenderAdapterChange` : `1` → `0`（允许按偏好分配）
   - `PreferredRenderAdapterVendorId` : 新增 DWORD，**NVIDIA = `0x10DE`（十进制 4318）**；Intel = `0x8086`；AMD = `0x1002`
3. **改完必须重启整机，重启 daemon 无效**（`parsec-vdd-cli restart` / 杀 host 进程都不行）。这是 WUDF host 的启动期参数。
4. **Sunshine 认的 device_id 只能从 `sunshine.log` 里 `Currently available display devices` 那段 JSON 抓**；ParsecVDD 驱动内部对自己设备的 GUID（例如 `{d92e0887-…}`）在 Sunshine 的设备枚举里根本不存在，填进 `output_name` 会静默失配并回退主屏。

## M 机制

- Sunshine 枚举输出走 Windows DISPLAYCONFIG_API，`device_id` 由目标设备的 **EDID** 推算生成；ParsecVDA 设备的 EDID 指纹是 `manufacturer_id: PSC` / `product_code: CDD0` / `serial_number: 8675309`（笔记本内屏是 `BOE` / `NE160QDM-NZL`）。两套命名空间（驱动内部标识 vs EDID 派生 device_id）互不通约，所以"看起来像 ID"的 GUID 一律不可信。
- `dxgi-info.exe`（Sunshine 自带，和 main exe 同目录）是**唯一能直接看出父 GPU 归属**的工具：它按 adapter 分组列出 OUTPUT。虚拟屏出现在哪个 ADAPTER 的 `====== OUTPUT ======` 下面，它就挂在哪个 GPU。
- 系统 `$Display`/Get-CimInstance 那类屏列表（`\\.\DISPLAYn width x height` 形式）**不体现父 GPU**，只能证明屏存在，不能证明归属 —— 这是最初判断失误的地方。

## J 判据（怎么确认真的抓到虚拟屏了）

- `dxgi-info.exe`：`\\.\DISPLAY22` 出现在 **NVIDIA GeForce RTX 5070 Laptop GPU** 的 OUTPUT 段下。
- `sunshine.log` 重启后出现 `Desktop resolution [2560x1600]` + **`Display refresh rate [60Hz]`**。
  对照基准：虚拟屏 60Hz，笔记本面板 240Hz。**刷新率变了就说明抓取目标切换了** —— 这是比任何配置文本都硬的证据，因为它是运行时实际抓的那块屏的属性。
- 注意：`screens` 里报的 `\\.\DISPLAY22 1280x800` 与 dxgi-info 报的 `2560x1600` 可以同时成立（系统模式 vs 显示面模式），不要据此否定结论。

## R 复现

1. `dxgi-info.exe` 记下虚拟屏当前挂在哪个 ADAPTER 下。
2. 停 daemon / 清屏（见 `a78ca4cd` 的 remove 绕行方案）。
3. 写注册表两个值（见 D-2），**重启整机**。
4. 开机后等约 10 秒建屏，再跑 `dxgi-info.exe` 确认虚拟屏落到 NVIDIA 段下。
5. 重启 Sunshine 服务，从 `sunshine.log` 抓 `Currently available display devices` JSON，取目标那条的 `device_id`。
6. 写入 `sunshine.conf` 的 `output_name`，重启服务，用 J 里的 refresh rate 判据验收。

## X 反例 / 坑

- **`output_name` 的反斜杠转义**：配置文件里正确值是 `\\.\DISPLAY22`（两个字面反斜杠）。用脚本写入时反复踩：少一层变成 `\.\DISPLAY22`，多一层变成 `\\\.\DISPLAY22`，两种都静默失效。用 PowerShell 生成时用 `'\\.\' + 'DISPLAY22'` 单引号字面量，不要走多层 `-replace`/`-join` 拼字符串。
- **把诊断脚本留在入口目录**：排查期攒下的 `一键修复.cmd` / `重装VDD.cmd` / `reset-vdd.cmd` / `clean-stale-monitors.ps1` / `fix-sunshine.ps1` / `fix-gpu-affinity.ps1` / `set-output.ps1` / `set-device-id.ps1` 全是过程遗留物，长期看会导致下次误跑旧脚本。
- **`host.ps1` 没有单例保护**：启动文件夹 + 手动双击会起两个 daemon 抢同一 VDD 会话。开头加：
  `if (Get-Process parsec-vdd-rust -ErrorAction SilentlyContinue) { exit 0 }`
- **启动文件夹的 cmd 必须写绝对路径**（`D:\Desktop\工具箱\ParsecVDD\host.ps1`），不要 `%~dp0`。

## 自启链路（已验证）

- `启动\扩展屏自启.cmd` → `start "" /min pwsh -NoProfile -ExecutionPolicy Bypass -File "…\host.ps1"` → daemon 读 `state.txt`（`on`）→ `add` 建屏。
- `SunshineService`：`Running` / `Automatic`。
- 判定自启是否真生效的办法：**看重启后 daemon 是否自己起来了（pid 存在）+ 屏是否出现在系统里**，不要只看配置文件文本。本次重启已验证通过。

## 存疑 / 未完成

- 分辨率仍是 1280×800，未对齐平板 2560×1600。`parsec-vdd config` 在当前驱动版本不生效，社区路线是改 `vdd_settings.xml` 加自定义分辨率 + 设备管理器禁用/启用虚拟显示设备 —— **未实施验证**。
- Sunshine Web UI（47990）的账号密码属于用户本地凭据，不在文档中记录；已知结论是它不接受空密码（见 `a78ca4cd`）。
