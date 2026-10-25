---
id: "a60eaadf-c22c-4633-81fd-6284897cfb50"
title: "ExtensoDesk 替代方案调研：平板当第二屏的无会员高画质路线（Sunshine/Moonlight + IddCx VDD，2026-10-24）"
description: "2026-10-24 调研：用户要「和 ExtensoDesk 功能相同、不要会员、清晰度极高、不弹广告」的平板第二屏方案。含本机 ExtensoDesk 组件取证（EDIddDriver/AOADriver/EDWPDFilter.sys）、三个已加载虚拟显示器枚举、硬件编码基线（RTX 5070 Laptop/8 代 NVENC/AV1、1 Gbps 有线、WLAN 287 Mbps）、A–F 候选对比与推荐路线 C→A、RNDIS 替代 Wi-Fi、以及驱动清理顺序的坑。"
status: "active"
created_at: "2026-10-24T15:34:35.577Z"
updated_at: "2026-10-24T15:34:35.577Z"
content_hash: "3de23b1347d426dc30b7796c462ed169f91017cafb7e56ef04c6dd2d72e27ae7"
source_paths:
  []
session_ids:
  - "faf585a7-f218-44ff-9439-f3928b70576e"
memory_body_ids:
  []
---

# ExtensoDesk 替代方案调研（2026-10-24）

## 需求（用户原话要点）
要「和 ExtensoDesk 功能相同」的软件 —— 平板当 Windows 第二块扩展屏 —— 但**不要会员**、**清晰度要极高**、**不能像它一样过一会弹出弹窗广告**。用户强调平板当时正连着电脑，「要什么信息你自己看」。

## 一、本机 ExtensoDesk 组件取证（不靠印象）
已安装：ExtensoDesk v1.3.5，publisher 成都万有码力科技有限公司，uninstall `D:\屏幕扩展\ExtensoDesk\uninst.exe`。文件级结构：

| 组件 | 文件证据 | 作用 |
|---|---|---|
| IddCx 虚拟显示器 | `driver/EDIddDriver/EDIddDriver.inf` | 系统层真正新增一块显示器，当前已加载 `ROOT\DISPLAY\0000` = ExtensoDesk Display（drv 15.43.31.291） |
| AOA 直连 | `driver/aoa/AOADriver.inf` | Android Open Accessory，USB 数据线直连，不走局域网 —— 这是它延迟优势的来源 |
| WPD 过滤驱动 | `EDWPDFilter.sys` | 接管 USB 便携设备（WPD）枚举，把自己插进设备链 |
| 前端/服务 | `ExtensoDesk.exe` / `ExtensoDeskServer.exe` / Qt6 | Qt 前端 + 服务进程 |

**核心判断**：广告弹窗与清晰度限制都发生在 **Android 客户端 App**，Windows 侧 `EDIddDriver` 是干净的 IddCx 虚拟显示器。商业模式是「驱动免费 + 手机/平板 App 订阅」，所以**只换 Windows 端不会有任何改善，必须两端一起换**。

**坑**：`EDWPDFilter.sys` 是内核 WPD 过滤驱动，卸载后若残留会干扰其他 USB 方案（设备枚举异常）。更换方案时必须按顺序清理，这一步做错会导致 USB 便携设备枚举出问题。

## 二、同机并存的虚拟显示层（实测枚举）
```
ExtensoDesk Display                 | drv 15.43.31.291    | ROOT\DISPLAY\0000 | OK
GameViewer Virtual Display Adapter  | drv 15.6.5.199      | ROOT\DISPLAY\0001 | OK   (网易 UU远程 v4.34.0.8979)
USB Mobile Monitor Virtual Display  | drv 2.0.0.1         | ROOT\DISPLAY\0002 | OK   (来源 D:\屏幕扩展\5.71)
Intel(R) UHD Graphics / NVIDIA GeForce RTX 5070 Laptop GPU (PCI\VEN_10DE&DEV_2D18)
```
三个 IDD 共存不直接冲突，但都会参与显示器枚举，替换方案时要考虑谁抢占 `output_name`。另见 doc `a2634c8a-c256-4c7e-9061-8cf9ba6a8a5f`（微信 4.1.15.53 黑屏排查里也枚举过这三个虚拟显示适配器）。

其他同装软件：RustDesk v1.5.0（`D:\RustDesk`）、UU远程（`D:\新建文件夹 (2)\GameViewer`）。

## 三、硬件编码基线（实测）
- **RTX 5070 Laptop**（Blackwell，第 8 代 NVENC，支持 **AV1 硬件编码**）+ Intel UHD 核显 → 码率/画质上限远高于国产投屏 App 免费档，不应自我限制。
- 网络：以太网 1 Gbps、以太网 2 150 Mbps、WLAN 287 Mbps。WLAN 与 Moonlight 共享码率会互相抢带宽 → 优先 USB 网络共享（RNDIS）复现 AOA 直连优势。

## 四、候选方案对比
| 方案 | 真扩展屏 | 画质上限 | 延迟 | 费用 | 会员/广告 | 备注 |
|---|---|---|---|---|---|---|
| **A. Sunshine + Moonlight + VDD** | ✅ | 最高：HEVC/AV1 @ 50–150 Mbps，原生 2560×1600@60，可 YUV444 | 10–20 ms | 0，全开源 | 无 | 需把 `output_name` 指向虚拟屏；stef1949/Sunshine-Secondary-Monitor 管布局切换 |
| **B. parsec-vdd 作虚拟屏** | ✅ | 高（支持高分辨率/高刷新率） | 依 Host | 0 | 无 | nomi-san/parsec-vdd，IddCx VDD，签名完整，可作 A 的显示层 |
| **C. 复用现有 ExtensoDesk Display + 开源 Host** | ✅ | 同 A | 同 A | 0 | 无 | 最小改动，15 分钟可证伪：用 ffmpeg/OBS 试抓该屏，能抓到就说明是标准 IddCx 设备 |
| **D. spacedesk** | ✅ | 中高（受 quality slider 限制） | 30–80 ms | 个人免费 | 闭源厂商，条款以官网为准 | iOS 端支持最好 |
| **E. Deskreen / Weylus** | 半（镜像或单窗口） | 中（浏览器 WebRTC） | 50–150 ms | 0，开源 | 无 | 只适合看文档，滚动卡 |
| F. Windows 原生 Miracast | ✅ | 中 | 100 ms+ | 0 | 无 | Win11 24H2 起「无线显示」可选功能已移除，不纳入 |

补充：`shadow-x78/orbiscreen`（GPL-3.0，Android 平板当第二屏 + 压感笔，直接对标 ExtensoDesk）**只有 Linux 端**（Wayland/X11）→ 对主力 Windows 机器无用，但用户那台 Ubuntu（TianQue）正合适，纯开源零会员。

## 五、推荐路线（尚未执行，等用户拍板）
1. **先做 C 的可行性验证**：不装新组件，用 ffmpeg 或 OBS 抓 `ExtensoDesk Display`。能抓到 → 只装 Sunshine Host，保留现有 IDD，只换客户端（零风险，15 分钟）。
2. 抓不到（ExtensoDesk 可能只对自家 App 输出）→ **走 A**：parsec-vdd 新建虚拟屏，Sunshine `output_name` 指向它。
3. 平板↔电脑用 USB 网络共享（RNDIS）而不是 Wi-Fi，复现 AOA 直连的延迟与稳定性优势。
4. 若最终卸载 ExtensoDesk：需处理 `EDWPDFilter.sys` 残留 + 三个 IDD 的清理顺序，避免 USB 枚举损坏。

## 六、未决问题
- 平板系统与型号（Android 版本 / iPad）→ 决定 Moonlight 客户端能否跑高码率、是否支持 AV1 解码（AV1 解码需 2022 年后 SoC，否则回落 HEVC/H.264，画质差距可忽略）、以及能否走 RNDIS。
- 用户选 A（干净重装）还是 C（保留现有 IDD 最小改动）。

## 七、本次会话遇到的工具阻塞（记录，未解决）
`bash` 工具无法启动，连续 3 次调用（含 `echo ok`）均失败：
```
bash.exe: *** fatal error - NtCreateDirectoryObject(\BaseNamedObjects\msys-2.0S5-85fa7254a9bdf1a9): 0xC0000022
```
`0xC0000022` = STATUS_ACCESS_DENIED，且发生在 bash 本体启动阶段，与执行的命令无关 ⇒ 当时**没有任何执行通道**。推测是另一完整性级别的进程（会话内做过 `Start-Process -Verb RunAs` 提权）占住了按 SID+环境命名的 `BaseNamedObjects` 对象，或挂起的 bash.exe 半死进程。建议修复：任务管理器结束所有 `bash.exe` / 关闭全部 Git Bash 与 Windows Terminal 窗口后重试，无需重启机器。

替代探测（请用户在 pwsh 7 粘贴）：`Get-PnpDevice -PresentOnly | ? { $_.FriendlyName -match 'ADB|Android|AOA|MTP|Portable|RNDIS|ExtensoDesk|Pad|Tab|Phone' }`、`Get-NetAdapter`、`[Windows.Forms.Screen]::AllScreens` 打印每屏分辨率与主屏标记。
