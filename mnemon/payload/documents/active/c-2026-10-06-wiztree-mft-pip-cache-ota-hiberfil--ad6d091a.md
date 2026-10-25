---
id: "ad6d091a-eaaf-4b78-8754-117b96d23c74"
title: "本机 C 盘空间审计与可回收项清单（2026-10-06）：WizTree MFT 全盘扫描、pip cache/OTA 清理实测、hiberfil 12.69 GiB 与事件日志重算开机率的磨损口径修正"
description: "2026-10-06 本机 C 盘 79.3% 满的实测全貌（WizTree MFT，164 万文件）、已执行的零风险清理（pip cache 3.76 GB 等）与待用户决策的高价值项排序（hiberfil 12.69 GiB、NVIDIA grd/crd 各 3769 MB 非垃圾、.NET NativeImages、WPS addons、Trae VM、Whisper large-v3）；含 WizTree/awk 两个工具踩坑与「用 System.evtx 重建真实开机时长证伪 SMART Power On Hours」的方法。关联 2bb56d7b / 63c87fcc。"
status: "active"
created_at: "2026-10-06T05:03:47.475Z"
updated_at: "2026-10-06T05:03:47.475Z"
content_hash: "e43fc6676f2b6b6dad0829c173567e6d3c1c207e653ca952c27a81a0db14f5db"
source_paths:
  - ".dsh/PLAN.md"
session_ids:
  - "0d5bdff6-fbf2-4350-bbc8-8814903546c8"
memory_body_ids:
  []
---

# 本机 C 盘空间审计与可回收项清单（2026-10-06）

**性质**：实测调查 + 清理执行记录 + 决策待办。承接 SSD 耐久性文档 [Kingston OM8TAP41024K1-A00 诊断](doc:2bb56d7b-7c23-4366-8755-e0a3df00fa56) 与 [双机 SSD 写入量对照](doc:63c87fcc-77fb-49ae-814c-3b07b3b709ab)。

**缘起**：用户问「所以有改善吗？眼睁睁看着恶化？」——澄清后确认用户问的是 C 盘空间，不是硬盘寿命。结论：**硬盘本体没恶化，真正在恶化的是 C 盘容量**（300 GB 只剩 62.15 GB = 79.3%）。

## 一、C 盘全貌（WizTree 走 MFT，比 PowerShell 递归快几十倍）

```
DRIVECAPACITY = 322.1 GB (300.0 GiB)
USEDSPACE     = 255.4 GB (237.9 GiB)
FREESPACE     =  66.7 GB ( 62.2 GiB)   ← 清理前
RESERVEDSPACE =   3.1 GB               ← NTFS 保留区
扫描规模      = 1,649,809 文件 / 408,919 文件夹；CSV 324 MB
```

顶层（>100 MB 口径）：

```
121.13 GiB  C:\Users\
119.76 GiB  C:\Users\27063\
 80.45 GiB  C:\Users\27063\AppData\
 55.03 GiB  C:\Windows\
 48.97 GiB  C:\Users\27063\AppData\Local\
 31.67 GiB  C:\Program Files\
 31.28 GiB  C:\Users\27063\AppData\Roaming\
 20.02 GiB  C:\Windows\WinSxS\
 15.31 GiB  C:\Program Files (x86)\
 14.78 GiB  C:\ProgramData\
 13.27 GiB  C:\Users\27063\AppData\Local\Programs\
 12.69 GiB  C:\hiberfil.sys
 12.51 GiB  C:\Windows\System32\
  9.17 GiB  C:\Windows\assembly\
  7.97 GiB  C:\Program Files\WindowsApps\
  7.42 GiB  C:\ProgramData\NVIDIA Corporation\
  6.70 GiB  C:\Users\27063\Desktop\
  6.57 GiB  C:\Program Files\Microsoft Office\
  6.37 GiB  C:\Users\27063\AppData\Local\Programs\Python\
  6.34 GiB  C:\Program Files\dotnet\
  5.00 GiB  C:\pagefile.sys      (5,368,709,120 B)
   16 MiB   C:\swapfile.sys
```

下钻（可回收项主要藏在这三处）：

- `AppData\Local`：`Programs\Python\Python313\Lib\site-packages\torch\lib` 5.00 GiB、`pip\cache\http-v2` 3.50 GiB、`Buzz\Buzz\Cache\models\whisper\large-v3.pt` 2.88 GiB、`Local\Microsoft` 4.12 GiB
- `AppData\Roaming`：`reasonix` 7.10 GiB（`global-workspace` 2.86 + `desktop-sessions-v5\by-id` 2.34）、`TRAE SOLO CN\ModularData\ai-agent` 4.21 GiB（`vm\tools` 3.44）、`kingsoft\wps\addons\data` 2.04 GiB、`Code` 2.59 GiB
- `Desktop\工具箱` 6.21 GiB：`.reasonix\Reasonix\versions` 1.63、`reasonix-ops\repo` 1.14、`输出文件` 0.97、`reasonix-ops\backup\git-before-reset-20260923-073221` 0.70

**附带发现**：`C:\hiberfil.sys` 12.69 GiB ⇒ **物理内存 32 GB**（休眠文件默认取 40%），说明本机在用 Fast Startup / 混合关机 —— 这解释了一段「0:17 关机 → 7:34 开机」的时段。

## 二、已执行的清理（全部零/极低风险）

| 动作 | 结果 |
|---|---|
| `pip cache purge` | 删 1768 文件 / **3762.3 MB**、20 个目录（locally-built wheels 为 0） |
| 删分析用 `wiz_tree.csv` | 324 MB |
| 删 NVIDIA `ota-artifacts` 中 10 个「7 个月前」UUID 目录 | **freed 0.00 GiB —— 本来就是空的** |
| DISM `/StartComponentCleanup`（WinSxS 20.02 GiB） | 后台启动，进行中 |

**实测回收**：`C: free 62.15 GB → 65.66 GB`（+3.51 GB，与 pip cache 一致）。

## 三、⚠️ 一个被证伪的误判：NVIDIA 那 7.36 GiB 不是垃圾

按 mtime 筛出的 10 个 UUID 目录（`Mar 8 2026`）删完 **0.00 GiB**，因为真正的 7.36 GiB 在别处：

```
ota-artifacts\grd  3769 MB  Oct  3 13:12   ← Graphics Driver，完整驱动包
ota-artifacts\crd  3769 MB  Oct  2 12:50   ← Creator Ready Driver，完整驱动包
nvapp / default / d8d82ebb-…  0
```

**是 3–4 天前刚下载的两份完整安装包**，删掉会失去 NVIDIA App 的驱动回滚能力。**教训：按 mtime 猜测「旧目录＝垃圾」必须先验证大小，空目录会给出假成功。**

## 四、待用户决策的高价值项（按性价比）

| 项 | 大小 | 代价 |
|---|---|---|
| `C:\hiberfil.sys` | **12.69 GiB** | `powercfg /h off` → 失去休眠 + 快速启动（开机慢几秒） |
| `ota-artifacts\{grd,crd}` | **7.36 GiB** | 失去 NVIDIA 驱动回滚（见上） |
| `Windows\assembly\NativeImages_*` | **7.07 GiB** | .NET 原生镜像，首次运行 .NET 程序要重建（一次性变慢） |
| `kingsoft\wps\addons` | 3.86 GiB | WPS 部分功能需重下 |
| `TRAE SOLO CN\…\ai-agent\vm\tools` | 3.44 GiB | Trae AI agent 沙箱 VM |
| `Buzz\whisper\large-v3.pt` | 2.88 GiB | 语音转写模型需重下 |
| `Desktop\工具箱\reasonix-ops\backup\git-before-reset-2026-09-23` | 0.70 GiB | 9-23 的 git 备份 |
| `D:\_backup-dsh-desktop-pre-reinstall-20261005` | 1.1 GiB | 重装前备份（重装已验收） |
| `D:\_audit_transfer_*.tgz` ×5 | 14.7 MB | 8-30 一次性审计包 |

**合计潜在回收 ≈ 39 GiB**（C 盘 79.3% → 约 66%）。给出的方案：A 全清 / **B 只清零代价项（hiberfil + NativeImages + 旧备份）≈ 21 GiB，不碰要重下的东西** / C 用户圈定。**推荐 B**。本轮结束时用户尚未选择。

## 五、磨损速率的最终口径（修正版）

用户明确要问的是**「这个硬盘损坏的速度」**。补上的关键参数：系统安装 `2025-05-23`、BIOS `2025-07-24`、`System.evtx` 创建 `2025-05-07` ⇒ 盘约用 **13 个月**。

**实测窗口（10-04 19:07 → 10-06 12:45）**：

```
Data Units Written 44,072,914 → 44,497,390 units
写入量 = 424,476 × 512 KB = 217.3 GB
开机时长（事件日志逐段累加）34.32 h（墙钟 41.6 h，开机率 82.5%）
⇒ 开机时写入速率 6.33 GB/h
Percentage Used 17% → 18%（实际磨损 0.172% = 217.3 GB / 126.4 TB 全寿命）
```

**两个口径**：这两天折算 115 GB/天（偏重）⇒ 剩余 103.6 TB ≈ 2.5 年；13 个月历史均值 22.75 TB / 400 天 ≈ 56.9 GB/天 ⇒ ≈ 5.0 年。**取中间：真实预期寿命 3.5–5 年。结论「没有加速恶化」。**

三条独立证据支持正常磨损：**WAF = 1.07**（NAND 217.3 GB / 主机 203 GB）、**读放大 = 1.07**（462.2 GB / 431 GB）、**Available Spare 100%**（阈值 5%）、严重警告 0 / 媒体错误 0 / 错误日志 0。若盘在异常劣化，**WAF 会先飙起来**。

### 方法学要点（可复用）

1. **SMART `Power On Hours` 在这块 Kingston OEM 盘上不可信**：`422 h / 617 次开机 = 平均每次 41 分钟`，而事件日志实算约 `400 天 × 18 h ≈ 7200 h`，**差 17 倍**。任何「按 POH 算日均写入」的估算都会错（本轮已犯过一次）。可信的是 `Data Units Written`（单调递增、与 Host Writes 自洽）与 `Percentage Used`（与写入量反推的全寿命自洽）。
2. **用 `System.evtx` 逐段累加开关机时段**才是真实开机时长；本次据此得到开机率 82.5%（窗口内）/ ≈76%（5 天口径），并推翻「大部分时间关机」的误判。
3. `Get-StorageReliabilityCounter` 在本机该盘上 **`Wear: 0` 且其余字段全空** —— `Wear` 的 0 是「该盘不暴露此 counter」的默认值，与 CDI 的 17% 冲突，**不可用**。
4. CrystalDiskInfo 的 `/CopyExit` 本次**没有写进剪贴板**（读到的是上一次的残留内容），不能作为取数通道。
5. **建议**：每 2–4 周跑一次 CDI 存一份带日期的 `DiskInfo.txt` 快照（CDI 每次运行会覆盖），攒 5–6 个点画真实磨损曲线，优于任何单窗口外推。

## 六、工具踩坑

- **WizTree 走 MFT** 拿全盘 CSV 远比 PowerShell 递归快；4.31 版 CSV 首列有 BOM + 中文表头，需按列位解析（`DRIVECAPACITY/FREESPACE/USEDSPACE` 在表头行里）。
- **GNU awk 的 `-v` 会解释转义序列**（`\U`/`\A`/`\L`/`\R` 报 warning 并退化成普通字母），Windows 路径 `C:\Users\27063\AppData\Local` 传参必踩；**改用 `ENVIRON` 环境变量传路径**（不做转义处理）即可。第一版正则返回空即此原因。
- 提权操作需 UAC 弹窗确认；提权脚本一次拿多路数据（CDI + reliability counter）比多轮弹窗高效，但**必须交叉验证，本次两路都不可用**（见第五节 3/4）。
