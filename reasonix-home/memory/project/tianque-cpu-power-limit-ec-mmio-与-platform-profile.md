---
id: mem-1591218428d38ac04e193f697100a238
revision: 1
created_at: "2026-10-24T16:57:16.947Z"
updated_at: "2026-10-24T16:57:16.947Z"
name: tianque-cpu-power-limit-ec-mmio-与-platform-profile
description: "TianQue(i7-10710U) 功耗墙根因：EC 抢 MMIO RAPL，platform_profile 才是正确抽象层；已部署 cpu-power-tune.service"
metadata:
  type: user
  fact_type: project
  scope: project
---

## 背景
用户最初问「Linux 端电量阈值到 80% 后会不会断电导致性能下降」。结论：**电荷阈值与性能无关**（`AC/online=1` + `BAT0 status=Not charging` 只是不充电，VSYS 由 adapter 直供）。但排查中发现了真正的性能瓶颈。

## 机器
Mechrevo（同方模具），Intel i7-10710U（6C12T，cTDP 12.5/15/25W），Ubuntu 24.04.5，hostname TianQue，kernel 7.0.0-38-generic。TLP active、power-profiles-daemon inactive（TLP 不碰 RAPL，无关）。

## 根因（2026-10-25 实测，8 轮实验）
1. **EC 强占 MMIO RAPL**：默认 `platform_profile=balanced` 时 EC 把 `/sys/class/powercap/intel-rapl-mmio:0/constraint_0_power_limit_uw`（MMIO PL1）压到 **10–15 W** 并动态改写。OS 写 MSR 0x610 能改 MSR（读回成功），但 MMIO 在起载 1 秒内被 EC 刷回，**实际 enforcement 跟 MMIO 走**。
2. **结果**：balanced 下 12 线程满载 = 「前 5–20 s 跑 40–50 W（PL2 boost）→ 断崖 → 永久锁 15 W / 1.8 GHz」。boost 时长 ∝ 1/功率，总能量预算约 250–450 J，起始温度越低撑得越久（46 °C 起撑 18 s，52 °C 起撑 5 s）。断崖瞬间 1 秒掉 26 K，`IA32_PACKAGE_THERM_STATUS(0x1B1)` 的 readout 字段 = **TjMax − T**（TjMax=100）。
3. **`MSR 0x610` 里的 PL1=51 W 是摆设**，只在 boost 期有意义。

## 关键解法：platform_profile 是 EC 认的接口
写 `/sys/firmware/acpi/platform_profile` = `performance`（ACPI `_DSM` → BIOS DPTF 表）后，**EC 自己把 MMIO PL1 放开到 51 W 且不再回抢**，MSR 写入也稳定生效。

> 本质：EC 是功耗策略的真正 owner。直接写 RAPL = 绕过它改内部状态（会被撤销）；`platform_profile` = 走它对外暴露的受支持旋钮（会被接受）。**抽象层选错，不是寄存器选错。**

## 实测数据（12 线程满载 45–85 s）
| 配置 | 稳态功率 | 稳态频率 | 断崖 | 温度 |
|---|---|---|---|---|
| balanced（原厂） | 15 W | 1.8 GHz | 有 | 94 → 72 °C |
| performance + PL 51/51 | 36.6 W | ~3.0 GHz | 无 | 98 °C |
| performance + PL 32/40 | 32.2 W | 2.84 GHz | 无 | 98 °C |
| **performance + cpu-power-tune** | **22 W** | **2.4 GHz** | **无** | **Tmax 90 / 稳态 82.5 °C** |

## 寄存器解码（power_unit=0.125 W, time_unit=0.9765 ms）
- `0x606` = 0x000A0E03
- `0x610` PKG_POWER_LIMIT = 0x0042819800DD8198 → PL1 51 W(en=1,**clamp=1**,win≈28 s) / PL2 51 W(en=1,clamp=0) / **lock=0**
- `0x65C` PLATFORM_POWER_LIMIT → PSYS PL1 90 W clamp=1（**不是瓶颈**，实测平台峰值仅 66 W）
- `0x614` PKG_POWER_INFO = 0x78 → **min_power=15 W**，max_pkg_power=0（固件未填）
  ⚠️ 曾误判 sysfs `constraint_0_max_power_uw=15 W` 为上限，实为 min 字段回退
- `0x64B` CONFIG_TDP_CONTROL = 0 → tdp_level=0, lock=0（未试）

## 已落地（可回退，未动 BIOS/NVRAM/firmware）
- `/usr/local/sbin/cpu-power-tune` — 159 行 Python，无第三方依赖。L1 每 tick 强制 `platform_profile=performance`；L2 温度滞环调 MSR PL1/PL2：L0 26/30 W、L1 22/26 W（>90 °C 持续 3 s）、L2 18/22 W、**PANIC >95 °C → 回退 balanced + 51/51**，回升 <84 °C 持续 20 s。只 policie MSR 区（MMIO 归 EC）。
- `/etc/systemd/system/cpu-power-tune.service` — enabled，`Restart=on-failure`，`ExecStartPre` 等 `platform_profile` 出现；SIGTERM 时自动 restore。
- 运维：`journalctl -u cpu-power-tune -f` / `sudo systemctl disable --now cpu-power-tune`（自动恢复原厂）。
- 调档只改脚本里 `LEVELS` 一行。

## 踩坑记录
1. **`n_down` 计数器 bug**：初版在 `< T_PANIC` 分支无条件清零计数器，降档永不触发（温度到 94 都不降）。看 journal 才发现。→ 任何滞环逻辑必须实测验证。
2. **`pkill -f "while 1: pass"` 会自杀**：远端 `bash -c` 命令行本身含该串，pkill 把自己杀掉 → ssh exit 255 无输出。用 `pkill -f "whi[l]e 1: pass"` 规避。
3. `constraint_0_time_window_us = 27983872`（≈28 s）导致 **<28 s 的短测被 PL2 预算污染**，必须跑 ≥45 s 才能看到真稳态。
4. Windows Git Bash 下 heredoc 之后的命令是**本地执行**，`sudo -n journalctl` 会命中 `sudo.exe`。
5. 电池：`energy_full=54.26 Wh / design 54 Wh / cycle_count=1 / capacity 100%`，TLP 阈值 `START=75 STOP=80`，健康。

## 未做/可选
- `MSR 0x64B` cTDP level 切换（lock=0，可能拿到 cTDP-up 25 W）
- undervolt（Comet Lake + Plundervolt 补丁后 MSR 0x150 大概率失效）
- 用户明确要求**不动 BIOS**（老电脑怕损坏）

## 社区锚点
- [erpalma/throttled](https://github.com/erpalma/throttled)：温度超阈值降 PL1 的通用做法，但单独用在会被 EC 抢 MMIO 的机器上无效；[issue #432](https://github.com/erpalma/throttled/issues/432) 记录了「写入读回全成功但不生效」同款症状
- [LenovoLegionLinux](https://github.com/johnfanv2/LenovoLegionLinux)：警告 `thermald --adaptive` 会往同一个 MMIO limit 写 PL1，与自定义 controller 冲突
- [glutamatt/thermal-governor](https://github.com/glutamatt/thermal-governor)：遥测字段 `rapl_power_w / platform_profile / pl1_w / pl2_w / freq_cap_mhz / epp` 与本方案控制变量组一致
