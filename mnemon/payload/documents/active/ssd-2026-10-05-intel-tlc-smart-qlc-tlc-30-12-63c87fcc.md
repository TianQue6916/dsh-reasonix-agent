---
id: "63c87fcc-77fb-49ae-814c-3b07b3b709ab"
title: "双机 SSD 写入量对照（2026-10-05）：小机 INTEL TLC 首次 SMART 基线、QLC/TLC 额度量化对比、30 天文件扫描的 12× 缺口与「实时超分替代批量超分」决策"
description: "2026-10-05 双机对照实测：小机 TianQue（Ubuntu，INTEL SSDPEKKF010T8L，TLC）首次拿到 NVMe SMART 基线（Data Units Written 52.5 TB / Percentage Used 17% / POH 17,657h），与大机 Kingston QLC 同 17% 却写入 2.33×，推出额度 ≈309 TB vs ≈110–133 TB；30 天「改动文件当前大小」扫描合计仅 ≈158.7 GB（5.3 GB/天）对比真实 62 GB/天 ⇒ 12× 缺口证明九成写入是反复改写而非新增文件；用户放弃「批量 Real-ESRGAN 超分」改用 mpv Anime4K 实时超分（落盘≈0）。含 POH 对照组、可视化扫描盲区、采集命令。关联 2bb56d7b / 50e58e1e / 863dee8c。"
status: "active"
created_at: "2026-10-05T05:56:32.550Z"
updated_at: "2026-10-05T05:56:32.550Z"
content_hash: "60ae0eabde32b23d282022d63a63799ffb221a637827a60ff1aad84c70c45edd"
source_paths:
  - ".dsh/PLAN.md"
session_ids:
  - "386756e2-7a82-40de-a897-846a65bbfb2e"
memory_body_ids:
  []
---

# 双机 SSD 写入量对照（2026-10-05）

**性质**：实测调查 + 决策记录。承接 [Kingston OM8TAP41024K1-A00 SSD 耐久性诊断](doc:2bb56d7b-7c23-4366-8755-e0a3df00fa56)（大机衰减曲线）、[Kingston 是 QLC 的判定](doc:50e58e1e-80e1-45a0-b030-3c85f1378e26)、[写入放大归因第二轮](doc:863dee8c-69fa-4da7-87ef-8555e7b60011)；本文只写增量证据，不重复前三篇的结论。

## 一、小机首次拿到 NVMe SMART 基线（关键增量）

小机 **TianQue**（Ubuntu 24.04.5，与 Windows 双系统，`nvme0n1p3` 是 803 G 的 NTFS 挂 `/media/OS`）此前无任何寿命数据：`smartd` 从 10-02 起就在监控，但 `/etc/smartd.conf` 是 `DEVICESCAN -d removable -n standby -m root -M exec …` —— **smartd 只在属性变化/失败时写日志，正常运行不留数值**，`.state` 文件只有一行注释，`journalctl -u smartd` 无条目。**唯一途径是 `smartctl -a`（需 root）**。

采集命令（本机是 `sudo smartctl`，用了用户临时提供的密码；**密码不应落入任何文档或 memory**）：

```bash
sudo smartctl -a /dev/nvme0n1 | grep -iE 'Model Number|Serial|Firmware|Power On Hours|Power Cycles|Data Units Read|Data Units Written|Percentage Used|Available Spare|Media and Data Integrity|Warning'
```

无需 root 的旁证（可用于未获授权时的预判）：`/sys/block/nvme0n1/device/{model,serial,firmware_rev,state}`、`/proc/diskstats`（`nvme0n1` 行：read ops / read sectors / write ops / write sectors / discards / flushes）。

实测结果：

```
Model Number:   INTEL SSDPEKKF010T8L      Serial: PHHP937609F91P0D   FW: L15P   NVMe 1.3
SMART overall-health: PASSED      Critical Warning: 0x00     Temperature: 31 C
Available Spare: 100% (Threshold 12%)
Percentage Used: 17%                      ← 与大机数值巧合相同
Data Units Read:     26,176,674 [13.4 TB]
Data Units Written: 102,701,099 [52.5 TB]  ← 大机的 2.33 倍
Host Write Commands: 862,873,164      Host Read Commands: 306,193,465
Power Cycles: 803     Power On Hours: 17,657 (735.7 天 = 2.01 年)
Unsafe Shutdowns: 32   Media and Data Integrity Errors: 0   Error Log Entries: 0
```

换算与读法（同大机口径）：`Data Units Written × 512000 ÷ 1024³` = 主机写入 GiB；`Percentage Used` = 已消耗寿命。

## 二、QLC vs TLC 额度被量化（本轮最干净的定量结论）

两台 `Percentage Used` 都是 17%，但达到同一百分比所付出的写入量差 **2.33 倍**：

| | 大机 KINGSTON OM8TAP41024K1-A00（QLC） | 小机 INTEL SSDPEKKF010T8L（TLC） |
|---|---|---|
| 主机写入 | 22.6 TB | **52.5 TB** |
| Percentage Used | 17% | 17% |
| ⇒ 反推全寿命额度 | **≈133 TB** | **≈309 TB** |
| 交叉验算 | CDI 斜率法 1%≈1012 GiB ⇒ ≈109 TB | 仅单点，无法独立交叉验证 |

⇒ **QLC 的额度约为同容量 TLC 的 40%**；两条独立路径（斜率法 + 单点比例法）在大机上互相印证，所以大机的额度结论是硬的。

## 三、反转：小机写得更猛，「主力机写入异常高」的前提不成立

```
小机:  52.5 TB ÷ 735.7 天（POH 真实值） = 71.4 GB/天
大机:  22.6 TB ÷ ~500 天（装机至今）    = 46.2 GB/天
```

**小机日均写入比大机高约 55%。两台都在猛写，大机的问题只是盘弱（QLC 额度小）。**

**POH 失真的对照组证据**：小机 `Power On Hours = 17,657` 是可信真实值（Linux，无 Modern Standby 的 D3cold 停表问题），而大机同期只有 415 h —— 有了这个对照，大机 POH 被 Modern Standby 吃掉可完全确认（见 doc:2bb56d7b）。

剩余寿命外推：大机 83%≈90 TB ÷（46–62 GB/天）= **4.0–5.3 年**；小机 83%≈256 TB ÷ 71.4 GB/天 = **9.8 年**。两台都不在危险区。

## 四、30 天「最近改动文件」扫描：158.7 GB vs 62 GB/天 的 12× 缺口

扫描口径：`Get-ChildItem -Recurse` 只统计 **LastWriteTime 在最近 30 天内的文件**，累加其**当前大小**（脚本落 `-rw2.txt` 之类；D: 约 130 万文件，实测约 1000 文件/秒，全程约 9.5 分钟）。

主要结果（MB / 文件数）：

```
D:\50-游戏               83,292 / 81,324      ← 最大
D:\MCBackup              23,581 / 10,305
C:\Users\27063\AppData   19,271 / 253,827
D:\80-系统                5,125 / 751
D:\gh-publish             3,343 / 9,127
C:\Users\27063\Downloads  3,304 / 7
C:\Users\27063\Desktop    3,289 / 8,161
D:\代码缓存               2,974 / 1,373
…（.local 1,937、.dsh 1,702、.vscode 1,697、D:\30-软件 1,336、.dsh-lab 326、.cache 153、其余零散）
合计                     ≈158.7 GB / 30 天 ≈ 5.3 GB/天
```

**对比 CDI 硬数据的 62 GB/天，差 12 倍 —— 这个缺口本身就是最重要的发现。** 该扫描口径看不见两件事：

1. **反复改写**：一个 1 MB 的 SQLite 被写 1000 次，只算 1 MB，实际写了约 1 GB；
2. **扫描盲区**：只扫了 `D:\` 和 `C:\Users\27063`，**`C:\Windows`、`C:\ProgramData`、`pagefile.sys`、`hiberfil.sys`、`$Recycle.Bin` 全部未纳入**（当天 Windows 累积更新那 2.78 GB 就落在盲区里）。

⇒ 结论：**超过九成写入量不是「新增文件」而是「反复改写」**。可见部分里「游戏 + 备份」占 65%（`D:\50-游戏` 81.3 GB + `D:\MCBackup` 23.0 GB），且这两块是可迁移的；真正难治的是那些反复改写的小文件（Edge profile SQLite、gateway 日志与 `state.json`、Registry hive、事件日志、pagefile）—— 但那部分收益低、代价高。

## 五、用户的决策与据此的处置（2026-10-05）

用户明确表态：**「能撑两三年就行」，之后视频不再批量跑，改成「每次看的时候实时提升画质」，等两三年后盘降价直接换好盘。**

- **该方案是质变**：批量超分 = 读原片 → 写几十 GB 新文件 → 删原片，落盘 ≈ 输出大小 ×(1+WAF)；**实时超分 = 输入流 → 输出到屏幕，落盘 ≈ 0**（仅 shader cache 数 MB）。`D:\mpv-lazy` 已用 mpv，直接开 **Anime4K**（自带 GPU shader 实现）即可，比 Real-ESRGAN 一类方案轻一个数量级且不碰磁盘。
- **据新目标，长期写入采样器（`\PhysicalDisk` 每 20 秒记录的计划任务，需一次 UAC）被决定不挂** —— 定位那 91.5% 反复改写的收益已不必兑现，不再为它牺牲系统功能。**这是「先定目标、再决定要不要调查」的取舍范例。**
- **时间轴**：2026/10 83% → 2027/10 约 60% → 2028/10 约 40%（换盘窗口）→ 2029 接近 `ID 04` 报警阈值（5%）。悲观情形（WAF 再恶化 25%）也有 **3.2 年**。
- **WAF 确实在恶化**（用 CDI 三个点算「每掉 1% 需写多少」，取整误差区间不重叠）：装机→2026/02/23 为 1967 GiB/1%；2026/02/23→10/04 为 1011 GiB/1%，**约 1.8 倍**。原因大概率是盘越满 GC 越密（D: 剩 16.2%、C: 剩 23.1%）。
- **唯一有确定收益的动作 = 清盘**（QLC 低可用空间下 GC 效率断崖式下降，直接推高 WAF）。候选回收：`D:\MCBackup` 旧备份最多 28 GB、`D:\DeliveryOptimization`（DO 已停用，死缓存）4.7 GB、`C:\Windows\SoftwareDistribution\Download` 2.8 GB/21 万文件、`D:\_backup-dsh-desktop-pre-reinstall-20261005` 1.0 GB。其余：大文件输出别落这块盘（输入读不伤盘，输出写才伤）、每季度看一次 CDI `ID 05`。

## 六、可复用教训

1. **SMART 是必须主动读的**：`smartd` 正常运行不落数值，Linux 上 `/proc/diskstats` 只是「自开机逻辑写入」，不等于 NAND 累计 —— 判断寿命必须 `smartctl` / CDI 的 `Percentage Used` + `Data Units Written`。
2. **跨机器对比必须同口径**：拿 Ubuntu 空闲机 13.8 小时的瞬时速率去比 Windows 主力机是苹果比橘子；用 `Data Units Written`（全生命周期）÷ `Power On Hours`（真实通电时长）才是可比的「日均写入」。
3. **「最近改动文件总大小」会系统性低估写入量 1 个数量级**：它测的是文件而非写入，反问「缺口有多大」比追求更精细的扫描更有信息量。
4. **POH 需要同平台对照才能定性**：有了 Linux 真实 POH 作对照，Windows 侧 Modern Standby 停表的诊断才从推测变成定论。
