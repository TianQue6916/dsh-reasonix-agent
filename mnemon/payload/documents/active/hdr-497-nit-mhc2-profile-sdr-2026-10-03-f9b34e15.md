---
id: "f9b34e15-13bb-426a-9c73-043676ee57cd"
title: "内屏 HDR 观感调优：497-nit MHC2 profile 定版、外接/内屏 SDR 白点判据与开机自愈保活（2026-10-03）"
description: "机械革命内屏（BOE NE160QDM-NZL / BOE0D55）HDR 校准收尾记录：MHC2 profile 从 450 改为 497-nit / min 0.396 的依据（EDID max 与 max-frame-average 同为 496.743）与 linuxhw/EDID 逐位互证、hdr-finisher 社区判据（外接屏 SDR白点=80+4×档位、内屏不适用）、HDR headroom 实测算法与目标 raw≈2500、guard.py + display-guard.cmd 开机五条自愈检查、hdr.cmd on/off/status 用法、三条只能手动的 Windows 步骤。与 66d038f8、f36e3962 同属一条色彩管线调查但覆盖不同层面。"
status: "active"
created_at: "2026-10-03T05:53:19.289Z"
updated_at: "2026-10-03T05:53:19.289Z"
content_hash: "53db4253dfdaee4297aef1029bbc149ceb4a12d5c7cc04be94e93680158b0e83"
source_paths:
  - "Documents/display-color-backup-2026-10-03/guard.py"
  - "Documents/display-color-backup-2026-10-03/display-guard.cmd"
  - "Documents/display-color-backup-2026-10-03/hdr.cmd"
  - "Documents/display-color-backup-2026-10-03/ladder.py"
  - "Documents/display-color-backup-2026-10-03/README.md"
  - "Documents/display-color-backup-2026-10-03/guard-log.txt"
session_ids:
  - "3c2b7e5d-d75f-463b-a925-b409cd7eeb77"
memory_body_ids:
  []
---

# 内屏 HDR 观感调优：497-nit MHC2 profile 定版与开机自愈保活

**日期**：2026-10-03 ｜ **机器**：机械革命内屏 BOE0D55 / BOE NE160QDM-NZL（16" 2560x1600@300Hz，EDID 自报）
**相关文档**：`66d038f8-f114-4870-b1e4-92e04230ad64`（HDR 与 OEM 校色互斥、ICC 悬空修复与回滚）、`f36e3962-86db-411f-ac62-6f37f889283b`（gamma ramp 8-bit 量化与定层诊断工具链）。本文只记「定版数值 + 观感调优 + 保活」，其余机制见上述两篇。
**工作目录**：`Documents/display-color-backup-2026-10-03/`（README.md 13393 B 为总入口与回滚）

## 1. 定版：HDR-cal-BOE0D55-497nit.icc

上一轮我（assistant）凭"怕 ABL 会低报"手拍了 450 nit，本轮按面板自报改正：

| | 旧（拍脑袋） | 现（面板自报） | 理由 |
|---|---|---|---|
| MHC2 peak | 450 nits | **496.743** | EDID 把 `max` 与 **`max-frame-average` 都写成 496.743**（= 面板自称可持续到这个亮度）。低报 = 白丢动态范围；**只有高报才会 clip** |
| MHC2 min | 0.10 nits | **0.396** | 报太低 = Windows 以为面板能显示更深的黑 ⇒ 暗部被压到看不见 |

产物：`HDR-cal-BOE0D55-497nit.icc`，**816 B，13 个 tag，sha256 前缀 `35a00226da43852b`**
- `MHC2` min = 25952 → 0.3960 nits，peak = 32554549 → 496.7430 nits，`lumi` X = 496.7430（与 peak 一致）
- 手调入口（不重跑脚本时）：只改 `MHC2` 里 min / peak 两个 int32
- 关联：HKCU 下 **`\0001` 与 `\0003` 两个 PnP 实例**（同一块 BOE0D55 的新旧实例）的 `ICMProfileAC` 首位均指向本 profile；`ICMProfile` 首位仍为 `Default.icm`
- 旧 profile `HDR-cal-BOE0D55-450nit.icc` 与两份 Windows 校准产物（290 nits 低报 42%、930 nits 高报 87%）留在色目录但不再被引用

### 外部互证（逐位一致）

| 项 | 本机（自解析 EDID） | linuxhw/EDID 同型号 dump | system76 oryp14 规格 |
|---|---|---|---|
| Red | 0.6465 / 0.3301 | **0.6464 / 0.3300** | — |
| Green | 0.2939 / 0.6299 | **0.2939 / 0.6298** | — |
| Blue | 0.1514 / 0.0537 | **0.1513 / 0.0537** | — |
| White | 0.3135 / 0.3291 | **0.3134 / 0.3291** | — |
| 尺寸 | 34 × 22 cm | 34 × 22 cm | — |
| 峰值 | ~497 cd/m² | **496.743**（max 与 max-frame-average 均 = 106） | **500 nits** |
| 黑位 | ~0.40 cd/m² | **0.396** | — |
| 色域 | 80.9% DCI-P3 | — | DCI-P3 81% / sRGB 100% |

⇒ 497 nits / 0.396 nits 是面板自己声明的值，两个独立来源互证，不是推算。

### 网络/工具口径更正（避免下次误判）

- **`curl` 直连 `raw.githubusercontent.com` 是可用的**：首次连接常超时（`Failed to connect ... after 21030 ms`），加 `--retry` 后 HTTP 200。
- `dev_tool_search` 里没有 browser/web-fetch：只返回 `sidebar_open`，它把页面开进侧栏但**不把内容交给模型**（返回 "the session sidebar is not connected yet, so the open is queued"）。
- `web_search` 必须**具体到型号**（`NE160QDM-NZL`）才搜得到可用源。

## 2. 社区判据（LucienMidnight/hdr-finisher，`docs/setup/windows.md`）

两条可直接引用的规则：

> Entering a peak much higher than the display can reproduce. That encourages Windows to send values the display will tone-map or clip.
> Adding saturation in the calibration app. This is a preference control, not a substitute for an accurate gamut or profile.

以及**外接屏 vs 内屏的 SDR 白点区别** —— 外接屏 `SDR白点 = 80 + 4×档位`，**不适用于笔记本内屏**；内屏只能用原生读数实测。这条直接命中本机（内屏）场景。

## 3. HDR 观感调优：headroom 才是最大单因子

`GET_SDR_WHITE_LEVEL` 换算口径：`nits = raw × 0.08`。

```text
nominal headroom in stops = log2(display peak / Windows SDR white)
```

- 实测 HDR 开启时 raw = **4650 ⇒ 372 nits**，面板峰值 496.7 ⇒ headroom = **0.42 档**（HDR 看着"发灰、没劲、只是变亮一点"的原因）
- 目标：raw ≈ **2500（200 nits）** ⇒ headroom = **1.31 档**
- 做法：`hdr on` → 调屏幕亮度滑块（若出现「HDR 内容亮度」一并调）→ `hdr status` 看 `SDRwhite` 是否落在 2500 上下
- 外接屏另有用表：档位 25 → 180 nits、**30 → 200**、**31 → 204**、50 → 280、100 → 480（0–100 非百分比），203-nit 工程推荐 30 或 31
- 原则：视为彼此独立的四个量 —— 滑块档位 / Windows SDR white / 工程 HDR Reference White / 显示峰值；**不要用 Windows SDR white 替代工程 reference white**

## 4. 开机自愈保活（无需人工干预）

- `display-guard.cmd` 已放入用户级 Startup（删文件即取消），调用 `Documents/display-color-backup-2026-10-03/guard.py`（5056 B），日志 `guard-log.txt`
- 五条检查（失败即自愈，日志 `=== guard 启动/结束 ===`，最近一次 exit=0 全 OK）：
  1. `Default.icm`（已换成 novcgt 版 `Default-novcgt.icm`）的 `vcgt` 是 identity
  2. live gamma ramp 是 identity —— **不是就强行写回，最多等 30 s**
  3. `ICMProfile` 首位 = `Default.icm`
  4. `ICMProfileAC` 首位 = `HDR-cal-BOE0D55-497nit.icc`
  5. 关键文件在位
- 状态/切换入口 `hdr.cmd`（360 B）：`hdr on` / `hdr off` / `hdr status`，内部转 `ladder.py hdr-on|hdr-off|status`
- `hdr status` 同时输出：DISPLAYCONFIG（refresh / HDRenabled / ACM / enc / bpc / SDRwhite）、模式判定（实测口径 `raw=0x3 ⇒ HDR`，`raw=0x7 ⇒ SDR+ACM`）、gamma ramp 与 `Default.icm` vcgt 的 9 点差值（全 0 = 驱动逐点照搬）、HKCU/HKLM 的 ICM 关联、色目录清单

## 5. 只能手动的三步（harness 做不到）

1. **HDR 模式下的屏幕亮度**（见 §3，目标 raw ≈ 2500）
2. **关四个开关**（否则颜色不可复现）：设置 > 系统 > 显示 = **夜间模式 / 根据内容更改亮度 / 自动更改亮度**；设置 > 系统 > 电源 = **节电模式 / 电池时自动降低 HDR**
3. **不要再跑 Windows HDR 校准 app**：它会新建 profile 抢占首位（上次跑出的就是 290 nits 低报 42% 与 930 nits 高报 87% 那两份）；真跑了也无妨，guard 下次开机把首位改回

## 6. 回滚

见 `Documents/display-color-backup-2026-10-03/README.md`（13393 B）末尾：逐条记录改动、依据与手调入口（`MHC2` 的 min/peak）。配套遗留物：`ICM-before-hdr.reg`、`ICM.reg`、`snapshot-hkcu-icm.json`、`install-novcgt.cmd`、`rollback-vcgt.cmd`、`verify-novcgt.py`。
