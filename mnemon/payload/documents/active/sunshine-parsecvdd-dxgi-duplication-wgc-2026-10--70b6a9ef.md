---
id: "70b6a9ef-b017-4d02-8c0c-dd7d98a0e9a0"
title: "Sunshine 抓不到 ParsecVDD 虚拟屏：DXGI duplication 过滤的代码级定论与 WGC 后端切换（2026-10-25）"
description: "平板扩展屏项目进入「Moonlight 能连但画面仍是主屏」阶段后的抓屏根因定位：Sunshine `output_name` 匹配成功仍回退主屏的真实原因（display_base.cpp 中 test_dxgi_duplication 过滤 IddCx 虚拟屏）、用 ExtensoDesk 二进制 import 表证伪「DXGI 抓不了虚拟屏」、发现源码内置 display_wgc.cpp 与 `capture` 配置开关、以及两次失败配置的教训（强改 IDD 分辨率致驱动掉线）。供后续接手者直接定位改哪里，不必重走日志排查。"
status: "active"
created_at: "2026-10-24T17:11:11.729Z"
updated_at: "2026-10-24T17:11:11.729Z"
content_hash: "b8a93a9a0af9600f1d2b35633c67aaf00d477e37abee323a01c057bda86c998f"
source_paths:
  - "_moonlight/dd-auto.ps1"
  - "_moonlight/try-wgc.ps1"
  - "_moonlight/start-pad.ps1"
session_ids:
  - "9f00447d-2377-4821-84f4-f49ce14c5e4b"
memory_body_ids:
  []
---

# Sunshine 抓不到 ParsecVDD 虚拟屏：DXGI duplication 过滤的代码级定论与 WGC 后端切换

日期：2026-10-25 凌晨。项目：平板当第二屏（Sunshine + Moonlight + ParsecVDD/IddCx 虚拟屏）。
承接文档：调研 `a60eaadf-c22c-4633-81fd-6284897cfb50`、阻塞取证 `ccd960b3-9287-4531-b3a1-54f41cb8d2c3`、打通手账 `12e010fd-adbd-494b-494b-494b-ad86-23cd9bb69f89`（见 `12e010fd` 全 id：`12e010fd-adbd-494b-494b-494b-ad86-23cd9bb69f89`）。

## 症状与两次失败配置

现象链：Sunshine 服务跑起来、Moonlight 已配对（重连不用再输 PIN）、虚拟屏存在于扩展拓扑（`\\.\DISPLAY29`），但平板画面始终是笔记本主屏。

日志判据（决定性，无需看画面）：

```
Info: Desktop resolution [2560x1600]
Info: Display refresh rate [240Hz]
Info: CLIENT CONNECTED
Info: Creating encoder [h264_qsv]
```

主屏是 BOE 2560×1600@240Hz，虚拟屏是 60Hz ⇒ 出现 `2560x1600 / 240Hz` 就等于抓的是主屏。全程**无任何 error**，配置项被正常读取（日志会回显 `config: 'output_name' = \\.\DISPLAY29`、`config: 'capture' = wgc`）。

失败尝试 1：把 `dd_resolution_option` 强制改成 3072×1920。ParsecVDD 的 EDID 不支持该模式，驱动直接掉线，Sunshine 找不到设备后回退主屏。**教训：不要对 IddCx 虚拟屏做强制定分辨率，`dd_resolution_option = auto` + `dd_configuration_option = ensure_active` 即可。**

失败尝试 2：只留 `ensure_active` + `output_name = \\.\DISPLAY29`（不改分辨率）。配置生效、设备也找到，但仍抓主屏 —— 这次「无报错地选错屏」直接指向代码路径。

## 根因（代码级，非推测）

Sunshine `src/platform/windows/display_base.cpp` 的 `display_base_t::init()`：

```cpp
auto output_name = utf_utils::from_utf8(display_name);
...
for (int y = 0; adapter_tmp->EnumOutputs(y, &output_p) != DXGI_ERROR_NOT_FOUND; ++y) {
  DXGI_OUTPUT_DESC desc; output_tmp->GetDesc(&desc);
  if (!output_name.empty() && desc.DeviceName != output_name) continue;   // :523 名字匹配是对的
  if (desc.AttachedToDesktop && test_dxgi_duplication(adapter_tmp, output_tmp, false)) {  // :527
    output = std::move(output_tmp);   // 只有 DuplicateOutput 自检通过才会真正选中
```

`test_dxgi_duplication()` 内部调用 `IDXGIOutput5::DuplicateOutput1` / `IDXGIOutput1::DuplicateOutput`（同文件 :88 / :116 / :426，失败会打 `DuplicateOutput1 Failed [0x...]` / `DuplicateOutput() test failed`）。ParsecVDD 的虚拟屏过不了这一步，被静默跳过；循环结束 `output` 为空，Sunshine 回退到第一个输出 = 主屏。**这就是「name 读到、设备在、仍抓主屏」的机制。**

## 关键证伪：不是 DXGI/D3D11 抓不了 IddCx

用 import 表检查本机 ExtensoDesk 组件（闭源商业软件，无源码）：

```
ExtensoDeskServer.exe -> dxgi.dll, d3d11.dll, gdi32.dll, dwmapi.dll,
                         mfplat, nvencodeapi, avcodec, libx264, amfrt, aom, svt
shadow.exe           -> dxgi.dll, d3d11.dll
```

ExtensoDesk 用的**就是 DXGI + D3D11**，且它确实能抓到虚拟屏。额外还链了 `dwmapi.dll` / `gdi32.dll`，说明它走的不是 Desktop Duplication 这一条（DWM/GDI 组合是另一条抓取路径）。结论：能力上完全可行，缺陷只在 Sunshine 选择 output 的实现里，改源码/换后端有解，换驱动方向是错的。

## 可用出口：WGC（Windows.Graphics.Capture）后端已在源码里

- `src/platform/windows/display_wgc.cpp` 存在（约 13.8 KB），`display.h:15` 直接 `#include <winrt/windows.graphics.capture.h>` ⇒ WGC 后端随 Windows 构建一起编译进来，不是可选插件。
- 配置层有字符串开关 `capture`：`config.cpp` 默认值 `{}`（`800: {},  // capture`），`1729: string_f(vars, "capture", video.capture);`。实测写 `capture = wgc` 被接受，日志正常回显、无 `Invalid` 报错。
- WGC 走 `GraphicsCaptureSession` + `GraphicsCaptureItem` + D3D11 纹理拷贝，不经过 `test_dxgi_duplication()`，因此理论上绕开上面的过滤。`wgc_capture_t::init()` 开头有 `winrt::GraphicsCaptureSession::IsSupported()` 守卫，被系统策略/WinRT 版本挡住时会在日志报错。

验证方法（下一步的唯一判据）：连一次后在日志里看 `Desktop resolution` / `Display refresh rate` —— 出 `60Hz`（或虚拟屏分辨率）即成功，仍 `2560x1600 / 240Hz` 即 WGC 也没生效。

脚本：`_moonlight/dd-auto.ps1`（display-device/`output_name` 侧配置）、`_moonlight/try-wgc.ps1`（写入 `capture = wgc`、重启服务、抓日志）。

## 环境副作用（有意保留）

修配对时把 RNDIS 网卡的 interface metric 从 35 改成 **90**，这是打通配对的关键，建议保留。回滚一行：

```powershell
Set-NetIPInterface -InterfaceIndex 22 -InterfaceMetric 35
```

## 备选路线（按可靠性排序，若 WGC 不成立）

1. **OBS 中转**：OBS 的「显示器采集」可指定任意显示器（能抓 ParsecVDD 那块），再让 Sunshine 串流 OBS 输出（虚拟摄像头/窗口）。绕开 Sunshine 多显示器限制，代价是多一层合成，延迟 +5–10 ms。
2. **Parsec 官方客户端**：ParsecVDD 本就是 Parsec 的驱动，Parsec 客户端原生支持虚拟屏当扩展屏、能选屏；免费档需注册账号，「虚拟屏自动配置」属付费档，需实测免费档边界。
3. **查 Sunshine 仓库 Windows 多显示器 issue**：可能有未文档化的 display index 参数或社区 patch。

## 已可用、不必重做的部分

Sunshine 服务 + Moonlight 配对（PIN 已存） + ParsecVDD 虚拟屏 + 扩展拓扑，这套均可用；缺的只有「选哪块屏」这一个开关。剩余待办：开机自启（`start-pad.ps1` 挂计划任务）。

## 方法论备注（可复用）

- 用户提示「闭源软件也能看它怎么实现」是对的：**import 表/DLL 依赖足以证伪 API 层面的推断**，成本远低于读源码。
- 抓屏类问题先分层：① 配置是否被读取（日志回显 conf）② 是否选中了目标设备（`output_name` 匹配 + 自检）③ 自检条件是什么（源码）。三层都有日志证据才能下结论，否则容易在 ① 层反复瞎改。
