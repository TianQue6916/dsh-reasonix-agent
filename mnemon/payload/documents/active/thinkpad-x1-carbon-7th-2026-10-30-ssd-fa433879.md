---
id: "fa433879-8a55-4590-90cd-718635ffa2f0"
title: "ThinkPad X1 Carbon 7th 整机老化基线体检（2026-10-30）：SSD/电池/散热/背光/内存读数与「再用七八年」维护排序"
description: "2026-10-30 对二手 X1C7 (20R10004CD, i7-10710U) 做的整机老化基线：Intel 660p 1TB smartctl 17% used/17668 小时、电池 99% 容量但仅 4 循环、满载仅 77°C 且限频来自 26W PL1 而非热墙、背光 L70 预算已耗尽、LPDDR3 板载不可升级。含复现路径、可换件优先级与成本排序、以及 Python 3.14 forkserver 踩坑。可复用于任何「旧笔记本还能用几年」的可测量评估。"
status: "active"
created_at: "2026-10-30T12:28:08.337Z"
updated_at: "2026-10-30T12:28:08.337Z"
content_hash: "8f5509a5c31322469d744de78a9b75ce39b9e47973ab3bcad973709640792e19"
source_paths:
  []
session_ids:
  - "a6d37012-b465-4889-b476-c7b1a5b7d52d"
memory_body_ids:
  []
---

# ThinkPad X1 Carbon 7th 整机老化基线（2026-10-30 实测）

起因：用户问「这台是 2018/19 年的二手本，还想再用七八年，有没有办法看硬件老化程度」。
核心方法论：**老化必须用可测量基线衡量，不能靠"感觉它老了"** —— 把每个部件的寿命计数器读出来，换算成「还剩多少」，比泛泛而谈可靠得多。下文所有数字都是本机实读值。

相关文档：
- `c6ce35f6-1c63-45a0-9de0-9ecd91ded84f`：同机 eDP 面板鉴定（LP140QH2-SPD1 是 IPS LCD，无 OLED burn-in 通路，image retention 与 burn-in 的 τ 判据）
- `51a8e7e4-4a8c-4da8-9ec7-f874e7160e20`：同机 TLP 充电阈值 75/80 的 EC NVRAM 取证

## 机器身份（先纠正机龄）

```
Product Name : 20R10004CD          X1 Carbon 7th
CPU          : i7-10710U 6C12T 1.1→4.7 GHz, L3 12 MB
BIOS         : N2QET63P (1.57), Release 02/25/2026
内存         : 2 × 8 GB Samsung LPDDR3-2133（板载 Row Of Chips，双通道）
SSD          : INTEL SSDPEKKF010T8L (660p 1TB, QLC), FW L15P
电池         : LGC 02DL004, Li-poly, 54 Wh design
```

**机龄纠正**：EDID 里 `Made in: 2018` 是面板批次，不是整机年份；X1C7 是 2019 年 6 月上市机型，BIOS 初版 2019 年。SSD `power_on_hours = 17668` 按 7 年折算 = 平均每天 6.9 小时，强度中等，与"用了七八年"吻合。

## SSD：状态优秀，属于最不需要担心的部件

```
Percentage Used      : 17%          ← 剩 83% 寿命
Data Written         : 52.8 TB  (Read 13.9 TB)
Power On Hours       : 17,668 h
Power Cycles         : 813
Unsafe Shutdowns     : 32
Available Spare      : 100%  (阈值 12%)
Media/Data Integrity Errors : 0
Error Log Entries    : 0
Temperature          : 36°C  (warn 75 / crit 80)
```

写入速率 = 52.8 TB / 17,668 h ≈ **2.99 GB/h**。线性外推再用 7 年（每天 8 h ≈ 20,440 h）≈ 再写 61 TB，累计约 114 TB，`percentage_used` 约到 **35%** —— SSD 至少还有 15 年余量。

**唯一要记住的取舍**：660p 是 QLC，SLC cache（1TB 版约 100–140 GB 动态）耗尽后持续写入会掉到 ~100 MB/s。这是速度问题不是寿命问题；拷大文件、跑大数据集时会明显感觉到。

## 电池：好得反常，几乎肯定换过 —— 「99%」不代表整机年龄

```
energy_full_design = 54.0 Wh → energy_full = 53.47 Wh = 99.0%
cycle_count = 4
charge_start_threshold = 75 / charge_end_threshold = 80 (TLP)
capacity-level = Normal
```

7 年锂电不可能只有 4 次循环还留 99%：锂电有日历老化，25°C 满电静置 7 年容量必掉 15–25%。所以这块电池要么是二手商换的新件，要么前任几乎不插电循环。**结论：电池是唯一需要计划性更换的部件，但当前这块是新件，不是风险**（X1C7 原厂件几百元，可换）。

75–80% 阈值是教科书级正确做法：锂电日历老化在 SoC 40–60% 时最慢，比 100% 满电存放慢一倍以上，应保持（机制细节见 `51a8e7e4`）。

## 散热：健康，且限频来自功耗墙而非热墙

满载 30 s 实测（12 核跑满，`/sys/class/hwmon/hwmon7/fan1_input` 取转速）：

```
 t(s)   pkg°C   avgMHz  fanRPM
    0    67.0     2400    2700   ← 空载基线
    2    72.0     2738    2688
    4    75.0     2784    2688
    6    77.0     2733    2689   ← 峰值
    8    67.0     1800    2692   ← 掉到 PL1，温度反而降
   30    66.0     1800    2692   ← 稳态
```

判据：
1. 峰值 77°C / 稳态 66°C，距 100°C throttle 点还有 34°C → 硅脂未干、热管未失效、灰尘不多。
2. 8 秒后温度自己下降且频率 2.7→1.8 GHz，**这不是热节流**。RAPL 实测：`constraint_0 (long_term) = 26 W`、`constraint_1 (short_term) = 30 W`；i7-10710U 在 26 W 下全核就是 1.8 GHz，属正常物理。
3. 风扇恒定 ~2690 RPM 不随负载变化 → 温度未达联想风扇曲线加速阈值（约 70°C+），说明 26 W 产热低于散热系统能力。
4. 调频：`governor=powersave`、`driver=intel_pstate`、`epp=balance_performance`；tlp enabled，thermald inactive。

**推论（重要）**：以后嫌慢时，提高 PL1 没有收益 —— 墙在功耗策略而不是散热，调它不会变快。想快只能换机。

## 热循环应力：低（这是对主板有利的用法）

`Power Cycles = 813 / 7 年 ≈ 每年 116 次`。BGA 焊点疲劳失效通常要数千次循环，现在才 813 次 → 说明用户以睡眠唤醒为主而非频繁开关机，**应保持**。

反面项：`Unsafe Shutdowns = 32` 偏高，长期对文件系统与 SSD FTL 映射表有风险，应查清是否有硬关机/长按断电习惯。

## 背光：最先到期的部件

```
WLED 标称 L70 寿命 = 15,000 h
整机 power_on_hours = 17,668 h（屏幕点亮时间必然 ≤ 此值）
```

即**背光已经吃掉大约 100% 的标称 L70 预算**（L70 = 亮度降到出厂 70%），当前面板很可能比出厂暗 20–30%，且不可逆。这不是故障：L70 之后 WLED 还能用很多年，只是持续变暗，再用 7 年（约再 20,000 h）会到 L50 左右，那时暗得明显。补救只有换屏/换背光条（LP140QH2-SPD1 面板数百元）。

这条直接支撑了「把亮度从 100% 降到 40–60%」的建议 —— 不是为了残影，而是因为背光是**最先到期且不可逆**的部件（burn-in/image retention 的区分见 `c6ce35f6`）。

## 内存：唯一的硬约束，永远无法改善

```
2 × 8 GB Samsung LPDDR3-2133, Rank 2, Form Factor = Row Of Chips
ChannelA-DIMM1 / ChannelB-DIMM1 = No Module Installed
MemTotal = 15,499,332 kB (14.78 GiB，已扣 iGPU 预留)
```

LPDDR3 焊死在主板上，**没有任何升级路径**。16 GB 在 2026 年对本科/研究够用；到 2033 年本地跑 LLM、大数据集、大型编译会明显紧张。这是"再用七八年"的最大风险 —— 电池/屏/SSD 都能换，只有它换不了。现有缓解：`zram0`（约 7.4 GB 压缩 swap）是正确做法，其余只能把重负载外移（实验室服务器/远程）。

CPU 则是**渐进式落后**（到 2033 年单核落后 2–3 代），对文本/数学/研究用途仍够用，不是断崖。

## 动手查不了、必须人工确认的机械件

| 部件 | 风险 | 检查方法 |
|---|---|---|
| **USB-C 充电口** | **高**，7 年每天插拔，最先坏的机械件 | 插线晃动看是否断连/掉功率 |
| 铰链 | 中（X1C 常见故障点） | 缓慢开合，听异响、看晃屏 |
| 风扇轴承 | 中 | 满载时听低频嗡鸣/咔哒 |
| 键盘 | 中 | 逐键试，重点空格/方向键 |
| 主板电容 | 低（固态电容通常 10 年+） | 只能等它坏 |
| TB3 控制器 | 低（JHL6540 有零星长期失效报告） | 接雷电设备试 |

## 维护排序（按 7 年内出问题概率）

| 排序 | 部件 | 何时出问题 | 可维护性 | 成本 |
|---|---|---|---|---|
| 1 | 背光变暗 | **已经在发生** | 换屏/换背光条 | 数百元 |
| 2 | 电池退化 | 2–3 年（日历老化） | 换电池 | 数百元 |
| 3 | 散热需维护 | 3–5 年（硅脂干） | 清灰+换硅脂 | <100 元 |
| 4 | USB-C 口磨损 | 3–5 年 | 可修/换小板 | 数百元 |
| 5 | 铰链松动 | 5–7 年 | 可修 | 数百元 |
| 6 | 主板/CPU 失效 | 低概率，但一旦发生即终点 | 不可修 | — |
| — | SSD | 15 年+ | 可换 | 数百元 |
| — | 内存 | **永不改善** | **不可升级** | — |

**没有任何部件处于"即将失效"状态；所有高概率项都是可更换耗材，真正无解只有内存。**

## 建议动作

立刻（0 成本）：亮度降到 40–60%；保持 TLP 75–80%；止住硬关机（unsafe_shutdowns=32）。
花几十元：USB-C 磁吸转接头，把充电口插拔磨损转移到转接头（性价比最高的一项）；确认合盖/息屏真的关屏。
每 3 年：清灰 + 换硅脂（现在状态好，不急）。
每年：重跑同一份体检并把数字记下对比 —— 这才是「老化程度」唯一可靠的度量。

另外提过一个待用户拍板的方案：写 `hw-health.py` 把关键指标（SSD percentage_used/写入量、电池容量、满载稳态温度与频率、通电小时）追加进 JSONL 时间序列。两档：**A 轻量**（只读 sysfs + `nvme smart-log`，2 秒，可每日 cron）、**B 完整**（A + 30 s 满载热测试，追踪硅脂老化）。推荐 A 每日 + B 每季度，因为散热退化是慢变量，天天测徒增背光磨损。此方案当时**未实施**。

## 复现路径与坑

- 电池：`/sys/class/power_supply/BAT0/{cycle_count,energy_full,energy_full_design,charge_control_start_threshold,charge_control_end_threshold,charge_behaviour}`，或 `upower -i` 看 `capacity`。
- SSD：`smartctl -a /dev/nvme0`（要 `Percentage Used`、`Data Units Written`、`Power On Hours`、`Unsafe Shutdowns`、`Media Errors`）。
- 内存/BIOS：`dmidecode -t 17 / -t 0 / -t 1`；**注意 dmidecode 与实际 free 常对不上**（iGPU 预留 + 板载双通道），要两边都读才能说清。
- 温度/风扇：**hwmon 编号不固定**，必须先枚举 `/sys/class/hwmon/hwmon*/name` 再取（本机 `hwmon7=thinkpad` 风扇、`hwmon8=coretemp` 包温；早期误把风扇路径记成 hwmon7 可行但 `pwm1` 读 128% 属正常缩放）。`coretemp` 的 `Package id 0` 与 `thinkpad` 的 `CPU` 温度会差几度。
- 节流计数器：`/sys/devices/system/cpu/cpu*/thermal_throttle/*`（`core_throttle_count` 等）。
- RAPL：`/sys/class/powercap/intel-rapl/intel-rapl:0/constraint_*_{name,power_limit_uw}`。
- **Python 3.14 坑**：默认 start method 改成了 `forkserver`，多进程负载脚本会报 `RuntimeError: An attempt has been made to start a new process before the current process has finished its bootstrapping phase`，随后 `ConnectionResetError`。解决：用 `multiprocessing.get_context("fork")`，或加 `if __name__ == "__main__":` 保护。

## 一句话结论

这台 7 年机结构上可以再用七八年：SSD 与散热接近新机状态，电池是新件，瓶颈是**不可换的 16 GB LPDDR3** 和**正在不可逆变暗的背光**。前者决定了它 2033 年前后会被迫降级为轻量机，后者决定了现在就该降亮度。
