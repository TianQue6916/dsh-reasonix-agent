---
id: "2bb56d7b-7c23-4366-8755-e0a3df00fa56"
title: "Kingston OM8TAP41024K1-A00 SSD 耐久性诊断：CrystalDiskInfo 自带历史日志、Modern Standby 致 POH 失真、写入源排名与剩余寿命外推（2026-10-04）"
description: "实测调查记录：CrystalDiskInfo 历史日志证伪「三个月前 97%」并给出 4 点真实衰减曲线；单位校正到 GiB（真实写入 22.6 TB）；仅 S0 Modern Standby（无 S3）导致 POH 414h 失真；写入速率由 28.5 升至 57.9 GiB/天而寿命换算率由 1967 降至 1011 GiB/1%（凸曲线）；写入源排名（Edge &gt; dsh/reasonix WAL+git auto-commit &gt; D:\\Temp &gt; DXCache）；剩余寿命 3–4 年上界、2–3 年更现实；未决缺口 ID 03 vs ID 05 与 KSM OEM 兼容性；Kingston SSD Manager 下载验签凭据。关联 422e3c22 / 6b3159c7。"
status: "active"
created_at: "2026-10-04T11:40:20.639Z"
updated_at: "2026-10-04T11:40:20.639Z"
content_hash: "d156f3563cb9f52288d1b37ce068ea70a3b424c7d469fa4d3dcdc4019b52281a"
source_paths:
  []
session_ids:
  - "8e5b1e89-925c-429c-a310-f8fe1b2614b1"
memory_body_ids:
  []
---

# Kingston OM8TAP41024K1-A00 SSD 耐久性诊断（2026-10-04）

一次性调查，回答「SSD 寿命是不是被 AI 用坏了」。结论基于**本机实测**，不依赖厂商标称 TBW（Kingston 未公开这块 OEM 盘 TBW）。

## 一、决定性证据：CrystalDiskInfo 自带历史日志

位置：`D:\20-工具\CrystalDiskInfo\Smart\KINGSTON OM8TAP41024K1-A0050026B7383A93F82\`
（`Smart.ini` + `Life.csv` / `HostWrites.csv` / `PowerOnHours.csv` 等按属性分列的 CSV；`AutoRefresh=10`、`StartupFixed=1` 已配置）

| 时间 | Life | 通电小时 | 通电次数 | 主机写入 | 主机读取 | ReallocatedSectorsCount |
|---|---|---|---|---|---|---|
| 2026-02-23 11:49（FIRST 段） | **96%** | 102 | 422 | 7,867 | 10,884 | 4 |
| 2026-02-23 23:28 | — | 104 | — | 7,888 | — | — |
| 2026-02-27 19:16 | **95%** | 112 | — | 8,342 | — | — |
| 2026-10-04 18:55 | **83%** | 414 | 615 | 21,015 | 28,332 | **17** |

**关键推论**：2026-02-23 就已是 96%，所以「三个月前 97%」的记忆被盘自己的日志证伪；真实曲线是 7 个多月 −13 个百分点。日志只有 4 个点，因为 CrystalDiskInfo **只在它运行时**每 10 分钟记一次，中间 7 个月是空洞 —— 不是盘突然掉，是中间没在测。

## 二、单位校正（易错点）

界面标签写「主机总计写入 21015 GB」，按 NVMe 规定（SMART raw，1 unit = 1000×512 B）反算
`0x2A07E16 = 44,072,470 units → 22.565×10¹² B ÷ 1024³ = **21015.6 GiB**`。
⇒ 该数字单位实为 **GiB**，真实写入量 **22.6 TB**，比界面标签读法大 7.3%。

## 三、POH 414 小时完全不可信 —— 不可用于估寿命

- Windows 装机 2025-05-23（距 2026-10-04 约 499 天），盘只报 414 h 上电。
- `powercfg /a`：只有 **待机 (S0 低电量待机) + 休眠**，无 S1/S2/S3、无混合睡眠，**快速启动被系统策略禁用**。
- Kernel-Power 事件（System 日志最早 2026-07-22；自 08-22 起统计）：
  - `566` 系统会话转换（InputAccelerometer/BootId）×858 —— 指纹传感器相关唤醒
  - `506` 进入新型待机（原因 Idle Timeout）430 次 / `507` 退出新型待机（原因 Input Keyboard）430 次
  - 43 天 430 次循环 ≈ **每天约 10 次 Modern Standby**
  - 另：`521` 电池计数变化 104、`125` ACPI 热区枚举 80、`109` 关机转换（Reboot）40、`577` 40、`105` 10

机器无 S3，Modern Standby 时 NVMe 进入低功耗态而 **POH 不累计** ⇒ 414 h 只是 D0 活跃时间的一部分，非使用时长。旁证：`h/cycle` 从 2 月的 0.24 跳到 10 月的 0.67，说明 POH 与 PowerOnCount 这对字段内部不自洽 —— **在这台机器上共同失真**。
（另查 `HiberFileSizePercent`/`HiberbootEnabled` 为空、`HYBRIDSLEEP`/`HIBERNATEIDLE` 电源项配置；`hiberfil.sys` 12.69 GB 存在，但 506/507 表明实际发生的是 Modern Standby 而非 hibernate。）

## 四、写入速率确实翻倍；但寿命消耗加速更快（凸曲线）

| 区间 | 天数 | 写入增量 | 速率 |
|---|---|---|---|
| 装机 → 2026-02-23 | 276 | 8.45 TB | **28.5 GiB/天** |
| 2026-02-27 → 2026-10-04 | 219 | 13.1 TiB | **57.9 GiB/天** |

| 区间 | 写入增量 | Life 降幅 | 换算率 |
|---|---|---|---|
| 0 → 2026-02-23 | 8.45 TB | −4% | **1967 GiB / 1%** |
| 2026-02-23 → 2026-10-04 | 13.1 TiB | −13% | **1011 GiB / 1%** |

**单位写入引起的寿命消耗提高约 2 倍**。这不是异常而是 NAND 物理本性：program/erase 在氧化层累积陷阱电荷 → 阈值电压窗口收缩 → LDPC 纠错压力上升 → WAF 上升 → spare block 消耗加快。`W_nand = W_host × WAF`，`Life 消耗率 ∝ W_nand / (N_die × PE_max)`，WAF 随盘龄单调上升 ⇒ **Life% 对 W_host 天然是凸的（accelerating）**。对照 CSAPP 存储层次：DRAM 读破坏/写回无磨损，NAND 写破坏是消耗品；加内存/换 cache 策略救得了 DRAM 但救不了 NAND。

## 五、剩余寿命外推（可复算）

以实测标定换算率 1011 GiB / 1%：

```
剩余 ≈ 83% × 1011 GiB = 83,913 GiB ≈ 82 TiB ≈ 90 TB 主机写入
按当前 57.9 GiB/天 → 1449 天 ≈ 3.96 年
```

- **3–4 年**是写入速率不再上升时的上界；考虑速率与 WAF 均在上升，**2–3 年**是更现实的中位估计。
- 旁证风险：ID 0D 不安全关机计数 = `0x0B` = 11 次意外掉电，是 spare block 消耗加速器。

## 六、「是 AI 用太多吗」—— 实测回答

**不是 AI 推理本身。** 本机 AI 相关占用实测：`.ollama` = 0.26 GB、`.cache\huggingface` = 0.08 GB、WSL vhdx 不存在 ⇒ 本地模型加载型大读写不存在。下载类（`OllamaSetup.exe` 1.5 GB、`ollama-win.zip` 1.4 GB、`DeepSeek Harness.exe` 233 MB、`claude.exe` 234 MB）均为一次性投入。

近 7 天 >150 MB 写入源与 C 盘大目录（`Users` 119.67 / `Windows` 43 / `Program Files` 21.64 / `Program Files (x86)` 15.23 / `ProgramData` 13.63 GB）：

| 写入源 | 证据 | 性质 |
|---|---|---|
| **Edge 浏览器** | 进程级 `IO Write Bytes/sec` 峰值 8.2 MB/s（物理盘总量仅 0.25–0.85 MB/s，说明大量经 cache 缓冲后落盘）；`User Data` 1.48 GB；`ExtensionActivityEdge` 单文件 243 MB | ★头号。cache/LevelDB/History/profile 快照，随机小块写 + 高频 fsync，WAF 不友好 |
| **dsh / reasonix harness 自身** | `session-catalog\v10.sqlite-wal` 233 MB、`desktop-sessions-v5\...\.recovery-cache\...` 256 MB、`reasonix-ops\repo\.git` pack 175 MB；git auto-commit 每 2–4 分钟一次（19:02/19:04/19:06/19:18/19:24/19:26/19:28/19:30） | SQLite WAL + 频繁 fsync 的持续小写入 |
| `D:\Temp`（用户级 TEMP） | 当日 441 文件 / 50.7 MB ⇒ 约 18 GB/年 | 边写边删的碎片流 |
| NVIDIA DXCache | 2 × 256 MB `.nvph` | 着色器缓存重写 |
| `hiberfil.sys` | 12.69 GB | **未在大量发生**（506/507 是 Modern Standby 非 hibernate） |

⇒ 真正烧盘的是「浏览器 + agent harness 的日志/WAL/git 提交 + 包管理/Windows」，AI 只是间接提高了这三者的频率。

## 七、未决缺口（需用户配合，尚未闭合）

1. **83% 的来源未确认**：截图 SMART 列表恰好从 ID 07 起，ID 03 / 04 / 05 被滚动条遮挡。两种语义截然不同：
   - 若 `83% = 100 − ID 05 (Percentage Used = 17%)` → 正常 TBW 消耗，外推 ~4 年；
   - 若 `83% = ID 03 (Available Spare = 83%)` → 备用块已耗 17%，属介质坏块信号，与写入量非线性。旁证：ReallocatedSectorsCount 4→17 的增幅正好等于 Life 96→83 的降幅（4+96=100、17+83=100）。
2. **两条取原始 NVMe log page 0x02 的路径都失败**：`Get-StorageReliabilityCounter` 提权后 `Wear = 0`（该盘固件未实现，不可信）；手写 `IOCTL_STORAGE_QUERY_PROPERTY` + `StorageDeviceProtocolSpecificProperty` 的 P/Invoke 提权后 `CreateFileW` 仍失败（`err=2`，acc 2147483648/0/3221225472 handle=-1 三种取值均失败）。

## 八、Kingston SSD Manager（KSM）下载与验签（当轮交付物）

- 来源：`https://media.kingston.com/support/downloads/ksm_setup.exe`（HTTP 200，58 MB）
- 落地：`D:\70-下载\disk-tools\ksm_setup.exe`，60,772,872 bytes，PE magic `MZ` ✓
- 签名：`SigStatus = Valid`；Signer `CN="Kingston Technology Company, Inc."`（Symantec Class 3 EV Code Signing CA - G3）；Company `Kingston Digital, Inc`；Product `Kingston SSD Manager Setup`
- SHA256：`CDAFAD3DCC99289AB2C807B931A087E5A6712FD904822E19580DC97F0C66EEC9`
- 打包器 **Inno Setup**；7-Zip 26.02 只能列出 PE 外壳资源（`.rsrc\1033\version.txt`、`.rsrc\0\string.txt`），**Inno 数据段需 innoextract 才能解开 ⇒ 支持型号表未能事前验证**
- 兼容性风险（预期而非结论）：`OM8TAP41024K1-A00` 是 **OEM 盘**（`OM8` 为 Kingston OEM 前缀），KSM 面向零售盘（A400/KC3000/NV2/FURY），很可能报 "no supported drives found"。安装需管理员权限并会装内核驱动（厂商 NVMe 命令 / 固件更新 / Secure Erase）。静默安装：`ksm_setup.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART`
- 同轮 `smartmontools` 从 SourceForge 取件被 **403** 挡住（下载到的 5794 B 是 HTML）；`aria2-1.37.0-win-64bit-build1` 在 `D:\Toolbox\aria2` 可用；`kingston.com` / `media.kingston.com` / `kingston.com.cn` 直接连通（302/403 非超时，403 只是缺 User-Agent）。
- 同轮 web_search 返回了完全无关的 URL 列表（第三方 GitHub 数据集内容）—— 再次印证以实测探测为准。

## 九、减写动作（按收益排序）

1. **让 CrystalDiskInfo 常驻**：`AutoRefresh=10` + `StartupFixed=1` 已配好。本次教训核心是「没有连续数据只能靠记忆」。
2. **Edge cache 迁移或定期清**：头号写入者，8.2 MB/s 峰值。
3. **降低 dsh 的 git auto-commit 频率**（现 2–4 分钟一次），并给 `session-catalog` 的 WAL 做 checkpoint 轮转 —— 本地可改。
4. **不要指望改用户级 TEMP 救寿命**：同一物理盘同一 controller，几乎无收益；RAM disk 在 16 GB 且要跑 harness 的机器上不划算，不建议。
5. **不要关休眠**：`hiberfil.sys` 那 12.69 GB 换来能真正断电休眠的能力，而 Modern Standby（每天 10 次）才是 POH 失真的根源。

## 十、关联

- 同盘不同事故：PCL2 导出 TaskTemp 撑爆 C 盘（文档 `422e3c22`）；Minecraft 备份 `robocopy /MIR` 设计含「C/D 同物理盘可防/不可防边界」（文档 `6b3159c7`）。
- 待续：把「ID 03 / 05 确认 + 写入源长期采样」做成脚本落到 `~/.dsh/storages/tools/`，开机自动记一行 CSV（用户尚未答复是否要做）。
