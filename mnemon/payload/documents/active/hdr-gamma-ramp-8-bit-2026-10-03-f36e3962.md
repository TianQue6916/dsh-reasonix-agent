---
id: "f36e3962-86db-411f-ac62-6f37f889283b"
title: "内屏绿点等值线 / HDR 灰紫：gamma ramp 8-bit 量化机制闭环与定层诊断工具链（2026-10-03）"
description: "绿点等值线与 HDR 灰紫的第二层诊断：vcgt→256 项 ramp→Intel 8-bit LUT 量化机制与 identity 闭环实验证据、定层判据表、shot.py/ladder.py/cmp2.py/grad-test.png 工具链、三种永久修法与未决项（含关联文档 66d038f8）。"
status: "active"
created_at: "2026-10-03T04:45:42.977Z"
updated_at: "2026-10-03T04:45:42.977Z"
content_hash: "35018341ccacb09f2610f6381893e36f404749b0474636e18977e25f25779066"
source_paths:
  - "Documents/display-color-backup-2026-10-03/shot.py"
  - "Documents/display-color-backup-2026-10-03/ladder.py"
  - "Documents/display-color-backup-2026-10-03/cmp2.py"
  - "Documents/display-color-backup-2026-10-03/grad-test.png"
session_ids:
  - "12ab4fd6-c05d-49c2-adf8-226e5f4d448e"
memory_body_ids:
  []
---

# 内屏绿点等值线 / HDR 灰紫：ramp 量化机制闭环与定层诊断工具链（2026-10-03）

性质：带实测证据的显示色彩调查（第二层症状）+ 可复用定层工具链 + 永久修法候选。
前置调查（EDID 硬事实、OEM ICC/vcgt 值、HDR 与 OEM 校色互斥、ICMProfileAC 脏 profile）见关联文档 `66d038f8-f114-4870-b1e4-92e04230ad64`；本文只记该文档未覆盖的新结论。

## 结论

两个症状分属两层，且**都不在 framebuffer 里**：

1. **sRGB 态「绿点连成线」= 逐通道 transfer curve 量化（等亮度带 contour）**，不是链路时序故障。
   链条：非 identity `vcgt`（工厂校色并进 SDR 路）→ Windows 压成 **256 项** GPU gamma ramp → Intel 侧 `NumGammaBits = 8`（硬件 LUT 输出仅 8 bit）。三条曲线各自独立取整 ⇒ 缓慢渐变穿过某通道 LSB 台阶时 R/G/B 不同步 ⇒ 台阶不只是亮度跳，而是**整条等亮度线一起偏色**。G 曲线偏离最大（顶端 64069 vs R 64885）⇒ 因此偏绿。
2. **HDR 态「发灰紫」= 校色被强制拆除 + PQ/BT.2020 管线切换 + AC 路未校准自建 profile**（`lumi` 低报、`chad=identity` 而 `wtpt=D65`）三者叠加，导致白点漂 + 亮度映射错。

## 关键实测证据

- **framebuffer 干净**：`shot.py` 按原生 2560×1600 抓合成器输出（需 `SetProcessDPIAware()`），绿色过剩像素 `G-max(R,B)>25` 仅 **625 px / 0.0153%**，且全集中在两块 UI 笔画（x≈40–52/y≈177–185、y≈1434–1441），相邻脏行/列间距全为 1 ⇒ 连续笔画而非伪影。满屏斑点应为几万–几十万 px 量级。
- **同一份像素两个症状**：sRGB 与 HDR 两张截图 ROI(x 300–1850, y 150–800) 指标几乎相同 —— ROI mean RGB 127.7/167.0/172.6 vs 128.3/167.5/173.1；最亮 1% R/G=1.014/1.013、B/G=0.924/0.925；亮度 p1/p50/p99 = 52.3/146.2/248.0 vs 52.9/147.0/248.5。Δ < 0.6/255 ⇒ 症状发生在合成器（AC/HDR 转换）之后。
- **形状判据（最重要）**：用户报告「纯白记事本没问题，只在颜色变幻的位置出现」。加上屏摄放大 3× 可见绿线**沿云层亮度等值线起伏**（不是固定坐标）⇒ 值相关（value-dependent）。据此排除全部固定位置成因：DSC slice 边界、PSR2 dirty-rect、lane error、面板 mura/fixed pattern；同时排除相机 moiré（moire 不看内容，且同机同景 ph1/ph3 差 37 倍）。
- **屏摄数值**（手机原图被附件通道压到 240×180，仅够看粗等值线）：ph1(sRGB 绿点) 绿过剩>20 = 110 px (0.520%)、>40 = 16；ph2(Default) 48 px (0.227%)；ph3(HDR 灰紫) 3 px (0.014%)，但全图 B/G 1.093↑、R/G 0.901↓、最暗 1% 蓝 40.2→49.4 ⇒ 蓝紫整体偏移 + 暗部抬蓝。
- **闭环实验（决定性）**：`ladder.py identity` 写入 identity ramp 后，绿过剩 >20 从 **130 px (0.614%) → 14 px (0.066%)**（降 9 倍，与 HDR 态的 3 px 同量级 = 壁纸真植物绿）。`ladder.py status` 确认 ramp 为精确 identity `R=G=B=[0, 16448, 32896, 49344, 65535]`（= i×257），与 `Default.icm` vcgt 逐点差 1695–3608；`ramp − vcgt` 差值 ≤ ±128 = 半个 8-bit step ⇒ 8-bit 量化链坐实。
- **临时性警告**：`ladder.py identity` 只写 ramp，未关 calibration loader（未动 `WcsSetCalibrationManagementState`）⇒ 重启 / 切分辨率 / 插拔外接屏 / 动一次 HDR 都会让 vcgt 重新加载，绿点回来。

## 排除项与依据（可复用判据）

| 层 | 抓法 | 判据 |
|---|---|---|
| 软件/合成器之前 | 截图（framebuffer） | 有 ⇒ 软件层；无 ⇒ 链路/面板层 |
| 值相关 vs 时序 | 纯色背景上滚动窗口 / 看等值线是否随内容重排 | 随内容重排 ⇒ LUT/量化层；位置钉死 ⇒ 时序层 |
| DSC slice 边界 | 纵向细线 + 固定 x | 白底窗口也有才算 |
| PSR2 dirty-rect | 横向、间距 = 固定行数 | 同上 |
| lane error / link training | 随机簇状斑点 | 同上 |

另已实测的链路参数（供后续排查参考）：`refresh=240.00Hz`、`bpc=10`、2560×1600 只有 60/240Hz 两档 ⇒ 240Hz 必走 DSC；`PSR2Disable=0`、`Psr2DrrsEnable=1`。

## 工具链（备份目录 `C:\Users\27063\Documents\display-color-backup-2026-10-03\`）

- `shot.py`：原生分辨率截图 + 绿色异常逐行/逐列统计；**必须 `SetProcessDPIAware()`**，否则 `GetSystemMetrics` 返回 150% 缩放的虚拟分辨率 1707×1067，重采样会插值抹掉细线。用法 `GT=25 python -u shot.py`。
- `ladder.py`：`identity` / `vcgt` / `status` / `noac` / `ac` / `hdr-on` / `rollback`；每次动手前自动 snapshot HKCU+HKLM 的 ICM 关联到同目录 `snapshot-hkcu-icm.json`。
- `cmp2.py`：numpy+Pillow 图像比对（ROI 均值、最暗/最亮 1% 均值、亮度分位、绿色过剩计数、「只跳绿」竖直台阶计数），导出 `roi-srgb.png`/`roi-hdr.png`。
- `grad-test.png`（2560×1600）：7 条横向渐变带（gray 0→255 / 纯 R / 纯 G / 纯 B / 天空色 / 反向 gray / 中灰 96→160 慢渐变），带下方每 16 级刻度线 + 0/64/128/192/255 标注 ⇒ 从照片数台阶数可反推有效位深 ≈ log2(N)。
- 屏摄协议：对焦清楚、屏幕占满画幅、纯色/浅色背景（最大化记事本）、关闭手机自动增强/AI 修图；拍前在纯色背景上滚动一次做值相关/时序判别。**不要把原图走附件通道**（会被压到 240×180），放磁盘目录直读。

## 永久修法候选（按性价比）

1. **矩阵-only profile（推荐，无需管理员）**：保留 `rXYZ/gXYZ/bXYZ/wtpt` 矩阵（色域映射由合成器在 float/线性空间完成，不受 8-bit 影响），把 `rTRC/gTRC/bTRC` 与 `vcgt` 改成 identity ⇒ loader 每次加载到的都是 identity ramp，驱动永远绕过 LUT。代价：丢工厂灰阶/白点修正，vcgt 最大偏差 2.2%（仅顶端）≈ ≲1 ΔE。原文件在备份目录可回滚。
2. **`NumGammaBits` 8→10**（需管理员 + 重启）：台阶密度 ×4、色偏量 ÷4。客观判据：改完 `ladder.py status` 的 `ramp − vcgt` 差值应从 ≤128 降到 ≤32；没降 = 驱动忽略。命令：`reg add "HKLM\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\0001" /v NumGammaBits /t REG_DWORD /d 10 /f`。
3. **`ForceDitheringEnable` 0→1**（需管理员 + 重启）：抖动把台阶变噪点，代价是少量时域噪声，可同时保住校色。

## 未决 / 后续

- 未实测 **sRGB-first 时的 ramp**（此前只在 Default-first 量过）：临时把 `ICMProfile` 换成 `['sRGB.icm','Default.icm']` 强制 loader 重跑 → 读 ramp 与两条候选曲线逐点比，可确认选 sRGB 时究竟是哪条曲线进了 LUT。`sRGB.icm` 带 4096 项 gamma-2.2 TRC + `MHC2`，`Default.icm` 带 vcgt 且 TRC 为 identity（纯 gamma 2.2）。
- 绿点旁是否成对出现紫/品红点未确认（有 ⇒ 逐通道量化坐实；只有绿 ⇒ 集中在 G 通道）；`ladder.py identity` 后用户已确认「跑完程序就好了」，机制闭环成立。
- 操作纪律：不要用 API 反复切 HDR 做实验 —— 每次 `SET_ADVANCED_COLOR_STATE` 都会触发 eDP mode set（控制中心日志 `SystemEvents_DisplaySettingsChanged` 与 `11:54:09 / 12:19:16 / 12:19:19` 对应），在 DSC+PSR2+DRRS 组合上可能放大时序伪影。要试就用设置里的开关。
- 控制中心「校色开关」会重写 `ICMProfile` 关联（日志 `SetColorCalibrationSwitchOFF` / `UninstallCalibration`，`C:\ProgramData\ControlCenter\2026-10-03.log` 中 12:31:21–22 的 1.5 秒内出现 6 次关开关 + 5 次卸 OSD 提示 + 1 次真正卸 profile），动完需跑 `ladder.py status` 复核。

## 关联

- 前置文档：`66d038f8-f114-4870-b1e4-92e04230ad64`（EDID、OEM ICC/vcgt 值、HDR↔校色互斥、ICC 悬空修复与回滚）。
