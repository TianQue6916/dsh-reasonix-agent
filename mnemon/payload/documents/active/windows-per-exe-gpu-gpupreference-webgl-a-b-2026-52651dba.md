---
id: "52651dba-0f75-4ef1-8640-ba5aaae1debd"
title: "Windows per-exe GPU 绑定（GpuPreference）落地与 WebGL A/B 验证：可靠判据与踩坑（2026-11-01）"
description: "给单个 exe 绑独显/核显的注册表做法与因果验证法：UserGpuPreferences 写入与回滚、独立 Edge 实例 + WebGL probe 页的 A/B 对照、LUID 与 UNMASKED_RENDERER 两条硬判据、dedicated 显存不可信的实测反例、rAF 节流与低完整性级别关不掉 Edge 两个坑、本机 LUID 映射与刻意未动的对象。与 ddaf53a7（ParsecVDD 虚拟屏父 GPU 归属）互补。"
status: "active"
created_at: "2026-10-31T17:41:11.707Z"
updated_at: "2026-10-31T17:41:11.707Z"
content_hash: "07d5340ba8b28bbfd3d966b95a52642802c553606c9ad1188c926732798085ff"
source_paths:
  - ".dsh/tmp/gpu-who.ps1"
  - ".dsh/tmp/gpu-probe.html"
  - ".dsh/tmp/UserGpuPreferences.backup-20261101.json"
session_ids:
  - "eacdcbc6-af65-44ca-a283-b38af9f45e2f"
memory_body_ids:
  []
---

# Windows per-exe GPU 绑定（GpuPreference）落地与 A/B 验证

**场景**：本机（ASUS 笔记本，Intel iGPU + NVIDIA RTX 5070 Laptop dGPU）上把 Edge 从 iGPU 挪到 dGPU，并用实验证明"真的生效"而不是只看改了注册表。
**相关**：`ddaf53a7-93f1-4636-8810-312bc877279f` 解决的是"虚拟屏挂在哪个 adapter / Sunshine 抓哪个屏"，本文解决"某个 exe 渲染跑在哪个 adapter"，判据可互相印证。

## 一、改动本身

- 位置：`HKCU\Software\Microsoft\DirectX\UserGpuPreferences`
- 值名 = exe 全路径，值 = `GpuPreference=2;`（2 = 高性能/dGPU，1 = 省电/iGPU）
- 生效时机：进程在 `D3D11CreateDevice` 那一刻读取，**不重启进程就不生效**（旧进程继续用旧绑定，看起来像"改了没用"）
- 回滚：`Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\DirectX\UserGpuPreferences' -Name '<exe 路径>'`，或从整键备份 json 还原
- 实测确认：**Windows 图形设置优先于 NVIDIA 控制面板的全局首选**（与 ASUS 官方 FAQ 一致，非仅文档说法）

## 二、验证方法：独立实例 + WebGL probe 页做 A/B 对照

不去碰用户正在用的进程：起**独立 `--user-data-dir` 的 Edge 实例**，加载自建 `gpu-probe.html`——全屏 WebGL2 shader（~64-tap sin/cos，1920×1080 每帧）制造可测负载，并把 `UNMASKED_RENDERER_WEBGL` 字符串直接渲染到页面上，再截图读出来。

- A 组 `GpuPreference=2`：`ANGLE (NVIDIA, ... RTX 5070 Laptop GPU (0x00002D18) D3D11)`，dGPU 上出现 `engtype_3d` 与 `engtype_copy`（跨 adapter 拷贝：渲染在 dGPU、呈现走 iGPU），`nvidia-smi` util 0%→10%、显存 58→304 MiB
- B 组 `GpuPreference=1`（反向对照）：`ANGLE (Intel, ... (0x0000A788))`，全部 engine 落在 iGPU LUID
- 两组唯一变量就是那个注册表值，输出从 NVIDIA 翻到 Intel 再翻回 → 因果链闭合
- device id 可交叉验证：`0x00002D18` = `PCI\VEN_10DE&DEV_2D18`，`0x0000A788` = Intel `DEV_A788`

## 三、两条硬判据（重要更正）

1. `\GPU Engine(*)\Utilization Percentage` 实例名里的 **LUID 后缀** —— 唯一可靠的 per-process adapter 归属
2. 应用/页面**自报的 `UNMASKED_RENDERER`**（或同类 API）

**❌ `dedicated` 显存占用不是判据**：B 组明明在 iGPU，dGPU dedicated 仍报 322 MB。原因是 Chromium 启动时会遍历所有 adapter、每个都建 device/context 探测能力（A 组可见 dGPU 上除 `3d` 还有 `ofa_0` / `jpeg_decode_0` / `security` 等探测残留）。只看显存数字会得出相反的结论。

## 四、两个可复用的坑

**坑 1：probe 必须加三个 flag**，否则窗口不在前台 → `requestAnimationFrame` 被节流 → 所有 engine 计数全 `0.00`，看起来像"切了没反应"：
`--disable-renderer-backgrounding --disable-backgrounding-occluded-windows --disable-background-timer-throttling`

**坑 2：低完整性级别（Low IL）下杀不掉 Edge**：`Stop-Process` / `taskkill /F` 全 Access Denied，进程活着 → 文件句柄不释放 → `rm` 一片 `Device or resource busy`。免 UAC 的可行解是给 browser 主进程发 `WM_CLOSE`：

```powershell
Add-Type -Namespace W -Name U -MemberDefinition '[DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr w, IntPtr l);'
$h = (Get-Process -Id <browser-pid>).MainWindowHandle
[W.U]::PostMessage($h, 0x0010, 0, 0)
```

只对 browser 主进程做，别 P/Invoke 子进程；发完子进程随之退出，目录立刻可删。

## 五、本机 LUID ↔ adapter 映射（实测）

| LUID 后缀 | adapter | 备注 |
|---|---|---|
| `..._f234` | Intel iGPU | 日常 3d 负载主场（dwm / msedge） |
| `..._f80a` | NVIDIA RTX 5070 Laptop dGPU | 目标 adapter |
| `..._f7d5` | vGPU | 虚拟显示驱动 |

## 六、刻意没有改的对象（附理由，避免下次重复讨论）

| 对象 | 不改的理由 |
|---|---|
| `sunshine`（常驻，videodecode 28–45%） | 串流服务端真实负载应是 NVENC encode 而非 decode；挪 dGPU 会让 dGPU 全时常亮，续航/温度代价远超收益 |
| `msedgewebview2.exe` | 该键按 exe 生效，一改即影响**所有** WebView2 应用（含 DeepSeek Harness UI），副作用面太大 |
| MUX / BIOS 禁 iGPU | 本机挂着 4 个虚拟显示驱动且 `dwm` 在 iGPU，风险不划算 |

## 七、留下的工具与未决问题

- 持久工具：`.dsh/tmp/gpu-who.ps1`（按进程打印 LUID 归属与 engine 占比，带 `-Label` 便于前后对照）、`.dsh/tmp/gpu-probe.html`；注册表整键备份 `.dsh/tmp/UserGpuPreferences.backup-20261101.json`
- 未决：用户最初观察到"iGPU 满载"的具体场景/进程未知。实测占用来源是 msedge + sunshine + dwm；若触发怀疑的是某个具体程序（游戏/渲染/训练脚本），拿到进程名即可按上面的判据直接定位其 LUID，再决定是否加下一条 `GpuPreference`
