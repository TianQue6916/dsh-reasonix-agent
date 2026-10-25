---
id: "84cfe2b6-3f3c-4679-b7d7-774bb08e2508"
title: "平板扩展屏迁移实施手账：EDID 单模式锁死判定 → Sunshine 服务化 + Moonlight + parsec-vdd（2026-10-24）"
description: "ExtensoDesk 迁移的实施阶段手账：用 WmiMonitorListedSupportedSourceModes 判定 EDID 只声明 2000×1200 导致分辨率锁死、AOA accessory（VID_18D1/PID_2D00）握手约束、Sunshine 服务化部署四个坑（config 在 Program Files 需提权、--creds 需先停服务、RunAs+Hidden 不执行、防火墙端口段）、RNDIS 150Mbps/AX201 287Mbps 的码率预算、gh-proxy+aria2c 下载通路、两步验证顺序与 parsec-vdd 签名优势。关联 a60eaadf。"
status: "active"
created_at: "2026-10-24T15:57:42.554Z"
updated_at: "2026-10-24T15:57:42.554Z"
content_hash: "d6267f5cccab1f1c1c47bb2743a07107136fecb8208701fc4ed34ffd97c6ee80"
source_paths:
  - "_moonlight/setup-sunshine.ps1"
  - "_moonlight/uac-setup.ps1"
session_ids:
  - "4503ad68-1af9-4828-9f2b-e6540fccfa46"
memory_body_ids:
  []
---

# 平板扩展屏迁移：EDID 锁死判定与 Sunrise/Moonlight 落地要点（2026-10-24）

前置调研（候选方案 A–F 对比、ExtensoDesk 组件取证、推荐路线 C→A）见关联文档 `a60eaadf-c22c-4633-81fd-6284897cfb50`。本文只记**调研之后新产生的实施结论与踩坑**，不重复方案对比。

## 1. 定论：ExtensoDesk「糊」是 EDID 层的分辨率锁死，不是设置没调对

判据（可复用的诊断手法，无需拆驱动）：

```
WmiMonitorListedSupportedSourceModes
  DISPLAY\BOE0D55\4&40c9f7a&0&UID8388688_0  -> 2560x1600   # 京东方面板，主机内屏
  DISPLAY\YSM0000\1&28a6823a&5&UID256_0     -> 2000x1200   # ExtensoDesk 虚拟屏（YSM0000 为其自注册厂商 ID）
```

该 API 读的是 **EDID 声明的模式集**。ExtensoDesk 的 `EDIddDriver` 只声明了一个 2000×1200 模式，因此：

- Windows 显示设置的下拉框里根本不存在更高档位 —— 想选也选不到；
- 平板物理面板普遍是 2560×1600，链路等于「主机渲染 2000×1200 → 编码 → 平板放大到 2560×1600」，**两次重采样 + 丢约 39% 像素**；
- 这是驱动层锁死，**任何码率/编码器调参都救不回来**；会员卖的正是 EDID 里的模式档位。

推论：换方案必须**换掉 IDD 本体**，只换客户端 App 无效。

## 2. 平板侧握手约束（为什么不能只装个播放器）

USB 描述符：

```
USBDevice | ExtensoDesk Android Device | USB\VID_18D1&PID_2D00\PSXBB20B28902445
蓝牙名     | 天阙九泉matepad
```

`VID_18D1` / `PID_2D00` = 标准 **Android AOA accessory 模式**。即由平板侧 App 主动把设备切进 AOA 复合模式并占用连接，主机侧只是被动枚举。换客户端时这段握手必须由新 App 重做 —— 所以不能指望「保留 ExtensoDesk 的 USB 通道、只改编码端」。

另：`Get-Process` 看不到任何 `ExtensoDesk*`，但虚拟屏仍在亮 ⇒ 已服务化（`ExtensoDeskService.exe` 在 session 0，普通进程不可见），驱动常驻。`EDWPDFilter.sys` 是 filter driver，卸载后仍会影响 USB 设备枚举。

**清理/切换顺序**：停服务 → 卸载驱动 → 重启 → 卸载 WPD filter（顺序颠倒会留下半挂状态）。

## 3. 目标架构与已验证的服务端状态

链路：`Sunshine`（主机编码，NVENC）→ 网络 → `Moonlight`（平板解码，APK v12.2 官方非 root）→ 输出到 `parsec-vdd` 自定义虚拟屏。

已实测到位（2026-10-24 夜）：

| 项 | 状态 |
|---|---|
| `SunshineService` | Running / Automatic，`C:\Program Files\Sunshine\sunshine.exe` |
| 监听 | 47984 / 47989 / 47990 |
| Web UI | `https://localhost:47990` → HTTP 200 |
| 凭据 | 由 `--creds` 写入，落在 `C:\Program Files\Sunshine\config\credentials`（明文口令不入文档） |
| 防火墙 | 47984/47989/47990/47998/47999/48000/48002/48010 的 TCP+UDP 规则已建 |
| parsec-vdd | v0.45.1 已下载解压（`parsec-vdd-0.45.0.0.exe` + `ParsecVDisplay.exe`），**尚未安装** |
| 虚拟屏 | 仍只有 ExtensoDesk 那块 2000×1200 |

## 4. Sunshine 服务化部署的四个坑（都已踩过）

1. **配置目录在 `C:\Program Files\Sunshine\config`**，不是 `%LOCALAPPDATA%`。普通进程对该路径无写权限 ⇒ 改 `sunshine.conf` / 跑 `--creds` 都必须提权，且要**先 `Stop-Service SunshineService` 再改，改完重启服务**（服务运行中改会被覆盖或读不到）。
2. **`Start-Process -Verb RunAs` 与 `-WindowStyle Hidden` 同用会让脚本完全不执行** —— 表现为日志文件压根没生成，进程却「起过」。提权脚本一律去掉 `Hidden`，并把输出重定向到自己的 log 以便事后取证。
3. 提权动作本身就是**一次 UAC 交互**，脚本会阻塞等待。别在一个 step 里连弹两个 UAC（例如超时杀进程会让用户看到半截对话框）。
4. 端口放行不要只放一个 8080：Sunshine 用的是 47xxx 段，`New-NetFirewallRule` 需按程序或端口段一次性建全。

辅助脚本：`_moonlight/setup-sunshine.ps1`（配置写入 + 服务重启）、`_moonlight/uac-setup.ps1`（提权：停服务 → `--creds` → 建防火墙规则 → 起服务，日志 `uac.log`）。

## 5. 链路带宽预算（决定码率上限，别靠猜）

- `以太网 2 = Remote NDIS 150 Mbps`：已有 USB 网络共享在跑，150 Mbps 是 **USB 2.0 链路**量级。RNDIS 侧地址 `192.168.0.100/24`，对端平板 `192.168.0.106`（Reachable）。
- `WLAN = 192.168.0.102`，AX201 当前只协商 **287 Mbps**（2×2 @80 MHz 偏低）。287 Mbps 物理速率下实际可用约 150–180 Mbps，还要与码率、协议开销争抢。
- 结论：50–80 Mbps 码率在两条路径上都「能跑但没余量」；VDD 分辨率提到 2560×1600 后应优先压帧率或走有线 RNDIS。

## 6. 下载通路（GitHub 大文件）

`Invoke-WebRequest` 经 DevSidecar（31180）拉 GitHub release 只有 **14 KB/s** 量级。改用 `gh-proxy.com` 镜像 + 本机 `aria2c`（`D:\Toolbox\aria2\...\aria2c.exe`，16 连接拆分）后达 **525 KB/s – 1 MB/s**，10 MB / 32 MB 包几十秒内完成。profile 里已有 `ghdl` / `ghdlx` / `ghm` 封装可直接复用。

## 7. 验证顺序（刻意分两步）

1. **先不装 VDD**：用现存的 ExtensoDesk 2000×1200 屏跑通 Moonlight 配对与串流，观察码率上限、NVENC 实际延迟、平板解码表现。免费版对码率的压制比分辨率更严重，所以「码率自由」会先带来一大截画面提升。
2. 若仍不满意，再装 parsec-vdd 建 **2560×1600@60** 屏，Sunshine 侧把 `output_name` 指向它，`encoder = nvenc`。

选 parsec-vdd 而非开源 VDD 的理由：它带微软签名，能过本机的 WDAC 强化校验，不必开测试签名模式。

配对方式：Moonlight 填主机 IP（Wi-Fi `192.168.0.102`，不通再试 RNDIS `192.168.0.100`）→ 平板显示 4 位 PIN → 浏览器 `https://localhost:47990` 登录后在 PIN 页提交。

## 8. 尚未确认的前置条件

平板是否为纯血 HarmonyOS NEXT —— 决定 APK 路线是否成立。判据：APK 安装报「不兼容/解析包错误」即为 NEXT，此时改走浏览器 WebRTC（Deskreen / Weylus）。平板版本号尚未回报。
