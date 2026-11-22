---
id: mem-4e23b4e72d18a62756c7e83ede0fea36
revision: 1
created_at: "2026-11-21T19:27:22.243Z"
updated_at: "2026-11-21T19:27:22.243Z"
name: TianQue-散热-2026-11-22-cpu-power-tune拆除
description: "ThinkPad X1C7 自写 cpu-power-tune 导致 26W 高温；已拆除改 TLP，备份与回滚脚本位置"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 机器
ThinkPad X1 Carbon 7th（DMI `20R10004CD`，BIOS `N2QET63P` 2026-02-25），Intel i7-10710U（Comet Lake-U，6C12T，**15W TDP**，base 1.1GHz / turbo 4.7GHz）。之前误认为是「机械革命游戏本」，2026-11-22 纠正。

## 问题（2026-11-22 02:00–03:27 实测定位）
自建 `/etc/systemd/system/cpu-power-tune.service` + `/usr/local/sbin/cpu-power-tune`（Python 常驻，PID 6182）：
- L1 每秒写 `platform_profile=performance`，EC 放开 MMIO 限权；
- L2 把 RAPL PL1/PL2 写成 `(26,30)W` = 1.73× TDP，降档门槛 `T_DEGRADE=90°C`、升档门槛 `T_RECOVER=84°C`。
- **滞回方向写反**：26W 档稳态温度就是 75±5°C，永远低于 84 → 降档后 20 秒必回升。33850 条采样中 `level=0` 占 33632 条（99.8%），level 1/2 合计 74 次。
- **MMIO 污染**：panic 分支 `set_pl(*DEFAULT_PL, dirs=(RAPL_MSR, RAPL_MMIO))` 把 MMIO 写成 51/51/71W，恢复时 `apply()` 只写 MSR，MMIO 永久留 51W。共 23 次 PANIC（11-21 全天 0 次，11-22 夜间 3 次）。
- 后果：pkg 75–83°C（最热核 83），风扇 4672 RPM，外壳烫；`package_throttle_count=2309`。

## 已执行的处置
1. 改写 `/usr/local/sbin/cpu-power-tune`：删掉全部 `RAPL_MMIO` 写入点（原 2 处），`restore()` 不再写 PL，`DEFAULT_PL` 由 (51,51) 降到 (15,25)。
2. `systemctl disable --now cpu-power-tune`（已从 multi-user.target.wants 移除）。
3. RAPL 写成 TDP 级：MSR 15/25W，MMIO 15/25W。**MMIO constraint_2 (peak) 71W 写不进（rc=0 但值不变），是固件锁定，非隐患。**
4. `/etc/tlp.conf`：`PLATFORM_PROFILE_ON_AC=balanced`、`ON_BAT=low-power`、`CPU_ENERGY_PERF_POLICY_ON_AC=balance_power`、`ON_BAT=power`，TLP 1.8.0 接管。

## 结果（2026-11-22 03:27）
pkg 83→**69°C**，风扇 4672→**4060 RPM**，CPU 3100→1900 MHz，`package_throttle_count` 零增长，电池满 80% 停止充电（25W 充电热消失）。

## 关键教训
- 这台机刚启动的旧进程用的是旧代码：`systemctl stop` 那一瞬间旧 `restore()` **确实**把 MSR 写成 51/51W（现场验证），随后手动写回才安全。改脚本 → 必须先 stop 再改，或改完再 stop。
- 社区共识：RAPL PL 是「解锁性能」工具（throttled/setPL 都是往回提），降温该用 platform_profile + EPP + no_turbo，不是改 PL。
- Comet Lake 的 undervolt 已被 microcode 锁死（CVE-2019-11157 Plundervolt），别走。
- TLP 与自写 service 会抢同一个 `platform_profile` 节点（现场看到 balanced 与 performance 来回跳）。

## 备份与回滚
- 备份目录：`/home/tianque/.dsh/.learn/run/cpu-tune-20261122-032059/`（脚本、unit、tlp.conf、sysfs 快照）
- 回滚：`sudo bash /home/tianque/.dsh/.learn/run/rollback-cpu-tune.sh [--reenable]`
- 施加：`sudo bash /home/tianque/.dsh/.learn/run/apply-cpu-tune.sh`（幂等性未验证，勿重复跑）
- 注意：`/etc/systemd/system/cpu-power-tune.service` 文件仍在（仅 disabled），误 `systemctl start` 会回到 26W。
