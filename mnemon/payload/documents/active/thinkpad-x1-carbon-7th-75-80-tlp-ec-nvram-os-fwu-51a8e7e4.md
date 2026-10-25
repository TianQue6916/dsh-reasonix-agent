---
id: "51a8e7e4-4a8c-4da8-9ec7-f874e7160e20"
title: "ThinkPad X1 Carbon 7th 电池充电阈值 75/80 取证（TLP）：阈值存 EC NVRAM、OS 更新不影响、唯一真实风险是 fwupd 胶囊"
description: "2026-10-26 在 Ubuntu 24.04 的 ThinkPad X1 Carbon 7th (20R1) 上核实 TLP 充电阈值 75/80 是否在「系统更新后」失效：三层证据（官方文档 + 社区案例 + 本机 sysfs/dmesg/包状态）判定阈值存于 EC NVRAM，apt/内核/tlp 升级结构性无法影响；给出参数约束（Stop>Start+3、100=hardware default）、drop-in 覆盖顺序坑、以及「revert-battery-threshold.sh 是假动作」的纠正。可复用于任何 ThinkPad 电池阈值排查。"
status: "active"
created_at: "2026-10-25T17:21:06.946Z"
updated_at: "2026-10-25T17:21:06.946Z"
content_hash: "e29d00d223fe62e21195889229f655d485cf19bc582d3d3a0999392b7b85160c"
source_paths:
  []
session_ids:
  - "383eb319-b8bc-4026-b987-3e702fed85ea"
memory_body_ids:
  []
---

# ThinkPad 电池充电阈值 75/80 取证（TLP）：阈值存 EC NVRAM

时间：2026-10-26。目标机：ThinkPad X1 Carbon 7th（20R1），Ubuntu 24.04，kernel 7.0.0-38-generic。
问题：配好的 TLP 充电阈值（START 75 / STOP 80）在「系统更新后」是否还生效？

## 结论（三层，互相独立）

1. **阈值存在硬件（EC NVRAM），不存在 TLP 配置里。** `dmesg` 里 `battery 1 registered (start 75, stop 80)` 是内核启动时从 EC 读回来的，不是从 `/etc/tlp.conf` 读的。因此删掉 TLP 也不会解除阈值；真要恢复 100% 只能 `sudo tlp fullcharge`（或 `tlp setcharge 0 100`）。
2. **apt / kernel / tlp 包升级结构性无法影响阈值。** 内核自 4.19 起内建 `charge_control_{start,end}_threshold`，`tp-smapi` / `acpi_call` / `tpacpi-bat` 全部 obsolete；本机未安装这两个 out-of-tree 模块，故不存在「DKMS 编译失败 → 阈值丢失」这条经典失效路径。实测内核 34 → 38 升级后阈值未变。
3. **唯一有真实风险的是固件层**：fwupd 胶囊更新会重刷 EC firmware，而阈值恰在 EC NVRAM 里。风险是「可能 reset」，非确定；操作前记下 75/80，刷完立即 `cat /sys/class/power_supply/BAT0/charge_control_*_threshold` 复核，掉了就 `sudo tlp start` 写回。

## 现场证据（本机）

- 包版本：`tlp 1.8.0-1ubuntu2`、`fwupd 2.1.1-1ubuntu3.1`、`upower 1.91.1-1`、`gnome-shell 50.1`（GNOME 无电池阈值 UI，upower 只读 ⇒ **唯一写入者就是 TLP**）。
- `/etc/tlp.conf.dpkg-dist`（Dec 6 2025）是历次升级留下的「新默认 vs 用户保留」痕迹，与官方 FAQ「升级不覆盖用户改过的配置」吻合。
- `/etc/tlp.d/` 仅 `00-template.conf` + `README`，无自定义 drop-in，目前无覆盖冲突。
- sysfs mtime 晚于 TLP 启动时间属于正常：**每次从挂起恢复 TLP 会重写一次阈值**（官方明示 restore on resume），不是异常。
- `fwupdmgr` 刷新元数据：16 台设备可更新，已启用远程源中 1 个更新待装（`fwupd-refresh.timer` 生效中）。

## 参数约束（易踩）

- ThinkPad 要求 **Stop > Start + 3**；75/80 差 5，合法。
- 特殊值 **`100` = hardware default**（即「不由 TLP 管」）。
- **TLP 1.3+ 配置读入顺序：内置 defaults → `/etc/tlp.d/*.conf` → `/etc/tlp.conf`**，后者覆盖前者。因此把阈值搬进 drop-in 之前**必须先注释掉 `/etc/tlp.conf` 里的对应行**，否则 drop-in 静默失效。这是社区给建议时最常漏掉的坑。

## 对既有自研件的纠正

`revert-battery-threshold.{service,timer}` + `battery-guard.{service,timer}` 这套自研 systemd unit：

- `revert-battery-threshold.sh` 的实现是「注释掉两行 + `tlp start`」。TLP 语义下「配置里没有该参数」= **不碰硬件**，EC 里仍是 75/80 ⇒ 它不是隐患，而是**假动作**，留着会让人误以为有回退手段。真要回退用 `sudo tlp fullcharge`。
- `battery-guard.sh` 写 `charge_behaviour`，与 TLP 的阈值路径不同但作用于同一 EC gate ⇒ 属于「第二个写入者」，disabled 是对的，应清理而非启用。

## 社区踩坑对照（别人的机器坏了，本机为什么不）

| 坑 | 案例 | 本机为何安全 |
|---|---|---|
| 双阈值根本不支持 | Dell 机型 `START/STOP` 被无视，照充 100% | ThinkPad 原生支持 start+stop，`capacity=79` 时状态就是 `Not charging` |
| 内核升级 sysfs 接口迁移 | LG Gram 6.8 用 `lg-laptop/battery_care_limit`，6.9+ 迁到 `charge_control_end_threshold`，6.9–6.10.4 有重置 50% 改不动的 bug | vendor 驱动特例；ThinkPad `charge_control_*` 自 4.19 起稳定 |
| 固件重启重置阈值 | MagicBook 等厂商 | ThinkPad 用户反馈「跨重启、甚至重装 OS 都保留」（EC NVRAM） |
| 两个写入者打架 | KDE 下 ThinkPad 读回值「总是 +128 偏移」（legacy `charge_stop_threshold` 0x80 bit 编码与 `charge_behaviour` 并存） | 本机 GNOME + 只读 upower，唯一写入者 TLP（自研 unit 已 disabled） |
| 固件更新流程临时 inhibit-charge | fwupd #10114：ThinkPad T450 升 fwupd 1.9.34 后卡在 `pending-charge` / 0W | 本机 fwupd 2.1.1，后续升级属需观察项 |

## 参考来源

- TLP FAQ（升级不覆盖配置）：https://linrunner.de/tlp/faq/settings.html
- TLP Battery Care / Vendor Specifics（`100` = hardware default、resume 时恢复）：https://linrunner.de/tlp/settings/battery.html 、https://linrunner.de/tlp/settings/bc-vendors.html
- TLP 1.3 配置方案变更（`/etc/default/tlp` → `/etc/tlp.conf` + `/etc/tlp.d/`）：https://sources.debian.org/src/tlp/1.3.1-2/debian/NEWS/
- Launchpad bug 1953261 comment 21（4.19 起内建，acpi-call 等 obsolete）：https://bugs.launchpad.net/ubuntu/+source/acpi-call/+bug/1953261/comments/21
- fwupd issue #10114（固件更新致 pending-charge）：https://github.com/fwupd/fwupd/issues/10114
- KDE Discuss（+128 偏移双编码）：https://discuss.kde.org/t/lenovo-thinkpad-charge-limit/48988/14
- LG Gram 接口迁移分析：https://blog.gitcode.com/a3f7aa6288670ecbfca73366e02cfd01.html

相关文档：笔记本 CPU 功耗上限实测（Mechrevo / i7-10710U）`868b707c-5bc4-42da-add0-415dd4fa6e08` —— 同一类「EC 说了算，OS 层设置不一定生效」的排查方法论，可对照阅读。
