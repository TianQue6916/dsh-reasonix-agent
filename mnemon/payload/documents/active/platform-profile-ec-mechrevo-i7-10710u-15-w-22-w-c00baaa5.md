---
id: "c00baaa5-c8e3-42ba-8620-96bcb9784cf2"
title: "platform_profile 才是 EC 功耗的正确抽象层：Mechrevo/i7-10710U 从 15 W 硬帽到 22 W 稳态的落地实录（cpu-power-tune daemon）"
description: "接续 868b707c（EC 劫持 MMIO PL1 致 15 W 硬帽）：实测 platform_profile=performance 即解除 EC 覆盖，MMIO PL1 稳定在设定值不再被刷回（26/30 W → 稳态 22 W / 2.4 GHz，85 s 无断崖、Tavg 82.5 °C，对出厂 15 W / 1.8 GHz 约 1.33×）。含 balanced vs performance 对照表、EC/DPTF ACPI _DSM 机制解释、社区方案（throttled / thermal-governor）对照、cpu-power-tune daemon 三级降档+PANIC 回退设计与运维命令、降档计数器被清零的 bug 教训、\"先读 platform_profile 再写 RAPL\"的排查原则。"
status: "active"
created_at: "2026-10-24T16:54:01.739Z"
updated_at: "2026-10-24T16:54:01.739Z"
content_hash: "91266315d5506b2eaa0faf296fb0e12bd25422bb3f10e3fa42b825b408728a62"
source_paths:
  []
session_ids:
  - "77c05efe-db40-4011-819c-e67204ae9c21"
memory_body_ids:
  []
---

# platform_profile 是 EC 功耗的正确抽象层（续篇，2026-10）

时间：2026-10-25（接续 `868b707c-5bc4-42da-add0-415dd4fa6e08`《Linux 笔记本 CPU 功耗上限实测（Mechrevo / i7-10710U）：EC 劫持 MMIO PL1 致满载压到 15 W…》）。

**先读前篇。** 前篇记录了"EC 在满载 5–20 s 后把 MMIO RAPL PL1 刷成 10–15 W，MSR 0x610 写入读回成功却不生效"，并停在 A/B/C 三个待选方案（A=BIOS 找 PL/cTDP，B=固定 30/40 W，C=写 MSR 0x64B 切 cTDP）。

本篇记录其后的**结论修正与落地**：前篇"BIOS 是唯一可能突破 15 W 的路"是**错的**，突破口在 OS 层；A/B/C 三项均不需要。硬件与前篇相同（Ubuntu 24.04.5，i7-10710U 6C/12T，Mechrevo/同方模具），文中路径均为该机 Linux 绝对路径。

## 一、决定性发现：`platform_profile=performance` 解除 EC 的 PL 压制

```
profile=performance，设 PL1=32 PL2=40 → MSR=32.0  MMIO=32.0（读回一致）
  1s pkg=39.81W T=81.0C f=3003MHz MMIO_PL1=32.0
 16s pkg=41.12W T=95.0C f=3191MHz MMIO_PL1=32.0
 45s pkg=31.34W T=97.0C f=2900MHz MMIO_PL1=32.0   ← 全程 MMIO 不被刷回，断崖=NO
```

对比（同一台机、12 线程满载逐秒采样）：

| 配置 | 稳态功率 | 稳态频率 | 峰值温度 | 功率断崖 |
|---|---|---|---|---|
| balanced（出厂默认）+ PL 51/51 | 15 W | 1.8 GHz | 94 °C | **有**，t=6 s 掉 15 W 并锁死 |
| performance + PL 51/51 | 36.6 W | ~3.0 GHz | 98 °C | 无（35 s 实测） |
| performance + PL1 32 / PL2 40 | 32.2 W | 2.84 GHz | 98 °C | 无（45 s 实测） |
| performance + PL1 26 / PL2 30（落地配置） | 22 W | 2.4 GHz | 90 °C | 无（85 s 实测） |

即：**balanced 下写 MMIO RAPL 1 秒内被 EC 覆盖，performance 下不再被覆盖。** 算力相比出厂状态约 1.33×。

## 二、机制（为什么必须走 platform_profile，而不是直接写 RAPL）

```
直接写 RAPL:       OS ──write──→ MMIO 寄存器 ──→ EC 不认，下一轮覆盖
platform_profile:  OS ──ACPI _DSM──→ BIOS DPTF 表 ──→ EC 自己把 MMIO PL1 放开（10 W → 51 W）
```

同一个 EC，**走它认可的接口就配合，绕过它说话就被撤销**。这不是"哪个寄存器更管用"的问题，而是抽象层选错了：EC/DPTF 是这套功耗策略的真正 owner，`platform_profile`（`/sys/firmware/acpi/platform_profile`）是它对外暴露的受支持旋钮，RAPL 是单方面改它的内部状态。前篇观察到的 `thermald --adaptive` 与自定义 controller 抢同一个 MMIO limit 的冲突，在这里得到统一解释。

**可复用的排查原则**：任何"PL 设了不生效"的 Intel 笔记本，先确认 `platform_profile` / DPTF 层的档位，再谈写 RAPL。

## 三、社区方案对照

- **`erpalma/throttled`**：逻辑是温度超阈值就把 PL1 降到 low-power-limit。思路对，但**单独用在此机无效** —— balanced 下它写的 PL1 被 EC 立刻覆盖（[issue #432](https://github.com/erpalma/throttled/issues/432) 即此症状）。必须先 `platform_profile=performance` 打底，其反馈才有落点。
- **[glutamatt/thermal-governor](https://github.com/glutamatt/thermal-governor/blob/34dbfb3f5d6e24807f321501390d725a24afe2db/README.md)**：遥测字段 `rapl_power_w, platform_profile, pl1_w, pl2_w, freq_cap_mhz, epp, throttle_rate` 与本机实测收敛出的控制变量完全一致 —— 说明"两层：profile 决定 EC 帽子高度，RAPL PL1 在帽内做温度反馈"是社区已验证结构。
- **静态写死 20/40 W 的做法**（如 [macbook_hardware_fixer.sh](https://github.com/vrilutza/MacBookPro14.1/blob/9e78090f75433b2fefea817c353703a3cda6ca0b/macbook_hardware_fixer.sh)）：AC 时写固定值，不做分档，粒度偏粗。
- **TLP 不碰 RAPL**，与本问题无关。

前篇的 RC 热模型 + RLS 辨识 + PI + anti-windup 方案**已撤回**：其前提（PL 可作为可控设定点、温度对 PL 线性响应）在 balanced 下被证伪；在"断崖"对象上跑 PI 会导致积分饱和后剧烈过冲。改用查表分档 + 滞环足矣。

## 四、落地实现：`cpu-power-tune`

| 路径 | 内容 |
|---|---|
| `/usr/local/sbin/cpu-power-tune` | 约 159 行 Python，仅标准库，root 运行 |
| `/etc/systemd/system/cpu-power-tune.service` | `Type=simple`，`Restart=on-failure`，`RestartSec=5`，`Nice=-5`，`After=multi-user.target`，`StartLimitIntervalSec=120` / `StartLimitBurst=3`，`TimeoutStopSec=15`；`ExecStartPre=/bin/sh -c "until [ -e /sys/firmware/acpi/platform_profile ]; do sleep 1; done"`（等 sysfs 就绪） |

控制结构：

```
L0  正常          PL1 26 W / PL2 30 W   目标 ≤ 90 °C
L1  持续 >90 °C    PL1 22 W / PL2 26 W   3 s 确认后降档
L2  持续 >93 °C    PL1 18 W / PL2 22 W   （留给夏天 / 无外置散热器）
PANIC >95 °C      回退 platform_profile=balanced + 51/51 W，完全退回出厂行为
回升 <84 °C 连续 20 s → 升一档           带滞环 + 最小驻留，避免抖动
```

Python 内改档位只需改一行：`LEVELS = [(26, 30), (22, 26), (18, 22)]`。

运维：

```bash
systemctl status cpu-power-tune
journalctl -u cpu-power-tune -f
sudo systemctl disable --now cpu-power-tune   # SIGTERM → 自动写回 balanced + 51/51 W，无残留
```

持久化的只有那个 unit；**BIOS / NVRAM / firmware 一个字节未动**（用户明确要求老电脑不碰 BIOS），未做 undervolt。

## 五、实测验收与 bug 教训

85 s 12 线程满载：`first5=29.4W last10=21.8W Tmax=90.0 Tavg_last20=82.5 断崖=NO`。相比出厂"5 s 冲到 94 °C → 撞墙 → 永久 15 W 反复重置"，现在是恒定 82 °C 平稳运行 —— 用户关心的老电脑寿命上，热循环比恒温更伤焊点，因此这套配置被认为比原厂更保护硬件。

**必须记录的 bug**：第一版降档逻辑中，`n_down` 计数器在 `< 95 °C` 分支被无条件清零，导致降档永远无法触发（首轮 85 s 测试里温度到 94 °C 也没降档）；事后查 journal 才发现，修完第二轮即正常。教训：**这类温控状态机必须实测验证，不能只看代码**。

另有两个过程坑（前篇已记 `pkill -f "while 1: pass"` 会匹配自身 `bash -c` 命令行导致会话自杀，需写 `whi[l]e`）：本轮新踩到 `sudo -n` 在 Windows 侧转发时被 `sudo.exe` 解析报 `unexpected argument '-n'`；以及部分远程命令超时（exit 124/255）需加时限重试。

## 六、遗留事项

1. 过程中为免交互读写 sysfs 建过 `/etc/sudoers.d/agent`（NOPASSWD:ALL）；daemon 本身以 root 运行，**该文件已无必要，待用户确认后 `sudo rm` 撤销**。（提权内容不入文档。）
2. 若日后要更高稳态功率：优先上调 `LEVELS`，而非回退到 balanced；BIOS/cTDP（前篇方案 A/C）在用户明确不碰 BIOS 的前提下不做。

## 七、AI 助手自身的判断纠错（供后续复用）

本轮被实测纠正了两次结论：① "PL1 越过 max 15 W"是误判 —— 那个 15 W 来自 `MSR 0x614` 的 `min_power` 字段，不是上限；② "BIOS 是唯一出路"错误 —— OS 层 `platform_profile` 即可。两次纠错的共同点：**先建立一个可证伪的实测量（每 1 s 的 pkg 功率 + MMIO_PL1 + 温度三列同采），结论跟着数据改**。连续负载 + 逐秒三列同采 + "断崖=YES/NO"判定，是本机排查功耗问题的可靠最小实验法。
