---
id: "2e5441ee-ef83-4b18-ac46-c80cb61b7fec"
title: "弟弟机 LAPTOP-SDOQT8E5 NVMe SMART 实测（SN730，Percentage Used 3%）与「免安装取 SMART」绕行流程"
description: "2026-10-05 补齐弟弟机磁盘健康结论：WDC SN730 512GB 的完整 NVMe SMART（PASSED / 3% / Spare 100% / 0 介质错误）、与 Windows Get-StorageReliabilityCounter 的矛盾解释，以及 github/sourceforge 双封锁下「本机下载 → conda 装 7zip → 7z 解 NSIS → SFTP 推送 → smartctl --scan」的可复用绕行流程与六个具体踩坑。承接通道层文档 b7c08f4b。"
status: "active"
created_at: "2026-10-05T13:56:46.783Z"
updated_at: "2026-10-05T13:56:46.783Z"
content_hash: "ff0e58f16bb8d578b62c425345c746b9b67eed03cd73ebb2d0ffab1ec034cc67"
source_paths:
  - ".reasonix/memory/global/弟弟机-远程通道-LAPTOP-SDOQT8E5.md"
session_ids:
  - "f7af5b71-efee-47eb-85b7-5563c6944ada"
memory_body_ids:
  []
---

# 弟弟机 LAPTOP-SDOQT8E5 NVMe SMART 实测与免安装取 SMART 绕行流程

**性质**：实测调查 + 可复用操作流程。时间 2026-10-05。
**承接**：[远程目标机（弟弟机 LAPTOP-SDOQT8E5）通道排查与 Windows OpenSSH 免密教训](doc:b7c08f4b-9084-4143-90cd-23b70dc33166) —— 那份文档解决到「通道打通、OpenSSH 免密」为止，并明确记录**磁盘健康度未取到**；本文补上那一环。同族 SSD 耐久性调查见 [双机 SSD 写入量对照](doc:63c87fcc-77fb-49ae-814c-3b07b3b709ab) 与 [Kingston OM8TAP41024K1-A00 耐久性诊断](doc:2bb56d7b-7c23-4366-8755-e0a3df00fa56)。

**原始材料**：目标机侧 `%TEMP%\smartctl.exe`；汇总笔记 `.reasonix/memory/global/弟弟机-远程通道-LAPTOP-SDOQT8E5.md`（本次追加后约 13.8 KB / 十节）。

## 1. 结论

目标机 SSD = **WDC PC SN730 SDBPNTY-512G-1036**（西数 SN730，OEM NVMe，TLC，512 GB 级，固件 `11110000`，序列号 `E823_8FA6_BF53_0001_001B_444A_491A_0796`）。

**固件自评健康，寿命消耗极低。** 定量依据（`smartctl -a -d nvme /dev/sda`，NVMe Log 0x02）：

| 指标 | 值 | 判读 |
|---|---|---|
| overall-health | **PASSED** | 固件自评通过 |
| Percentage Used | **3%** | 寿命用了 3%（≈健康度 97%） |
| Available Spare | **100%**（阈值 10%） | 备用块零消耗——最硬指标 |
| Media and Data Integrity Errors | **0** | 零不可纠正错误 |
| Critical Warning | **0x00** | 无任何固件告警 |
| Temperature | 46 ℃ | 警告阈值 84 ℃ / 临界 88 ℃，远未触顶 |
| Power On Hours | 2,252 h（≈94 天） | |
| Power Cycles | 781 | 平均 ≈2.9 h/次，频繁开关机 |
| Unsafe Shutdowns | 67 | 见 §4 |
| Data Units Written / Read | 18.7 TB / 31.1 TB | |
| Error Information Log / Self-test | No Errors Logged / No Self-tests Logged | 干净 |
| NVMe Version / 容量 | 1.3 / 512,110,190,592 B | 1 个 namespace，LBA 512 |

## 2. 为什么这个 3% 可信（交叉校验）

单看一个数字不下结论；两条独立路径互证：

1. **固件口径**：`Percentage Used = 3%`，固件按真实 P/E 循环记账。
2. **粗算**：写入 18.7 TB ÷ 512 GB ≈ **36.5 次全盘覆写**；SN730 512 GB 额定 TBW 约 **300 TB** ⇒ 18.7/300 ≈ **6%**。

两值同量级（固件口径通常比「TBW 线性外推」更保守），**不是孤证**。更硬的旁证是 `Available Spare = 100%`：NAND 一旦出现坏块，固件必然消耗 spare 顶替、该计数就会下降；它仍是满值 ⇒ 物理层面尚未发生坏块。

## 3. 与 Windows 存储栈数据矛盾 —— 以 smartctl 为准

Windows 侧 `Get-StorageReliabilityCounter` 给出 `Wear = 0`，且 `PowerOnHours` / `ReadErrorsTotal` / `WriteErrorsTotal` / `StartStopCycleCount` **全为空**，只有温度与 LatencyMax 有值。

**`Wear = 0` 是「读不到」，不是「零磨损」。** 同一条 `-a` 命令换 smartctl 就吐出 12 个字段真值——差别在于 **smartctl 直接发 NVMe 协议命令读 Log 0x02，绕过 Windows 存储栈的 SMART 解析层**；这块 OEM 盘的 SMART 在 Windows 驱动栈里就是解析不出来（与主力机上撞过的同一堵墙）。

教训：**「Windows 报 0 / 报空」必须先用 smartctl 复核再下结论**，否则会把「解析失败」误读成「健康满分」或「数据缺失即无信息」。

## 4. 唯一值得留意的一项

`Unsafe Shutdowns = 67`（2,252 h / 781 次开机，占比不低）。但未造成损害：`Media Errors = 0`、spare 未动、错误日志空。属**使用习惯问题而非健康问题**——提醒对方不要长按电源键关机即可。

## 5. 可复用绕行流程：网络双封锁 + 无交互桌面下的远程取证

目标机环境是三重封锁，且权限/store 层都不能走常规路。最终有效的四步：

1. **本机下载**（本机能直连 GitHub）。目标机侧取包全灭：
   - `winget` 能匹配到包，但**安装器托管在 GitHub**，而目标机 `github.com` 超时；
   - SourceForge 直链 + 5 个镜像（master / phoenixnap / netcologne / cfhcable / astuteinternet，含 `?download=1`）**全部返回同一个 124 KB 级 HTML 拦截页**；
   - **校验手法**：不要只看 HTTP 200 和 size，要验 **PE 头 `MZ`**。本机最终拿到 `smartmontools-7.5.win32-setup.exe` = 1,059,352 B、`MZ` + `PE32` ✓。
2. **本机 conda 装 7zip**：`conda create -p <tmp>\7zenv -c conda-forge 7zip` ⇒ 得到 `7z.exe` + `7z.dll`（完整版支持 NSIS）。选 conda 的理由：走自有镜像，不依赖 GitHub / SourceForge 这两条已被打的线（本机 7-Zip 官网 302 未跟上、GitHub 后段也开始 `http=000`；本机原本没装 7-Zip，`bsdtar` 不支持 NSIS）。
3. **`7z x` 解 NSIS 安装包**，取 `bin/smartctl.exe`（1,165,312 B，`PE32+` x86-64，静态链接，`bin32/` 版同存）。解包会报 `Data Error`（`runcmda.exe` / `uninst-*.exe` 等 34 项子项错误），**不影响 `smartctl.exe` 本身**。先后在本机验证可运行（`smartctl 7.5 2025-04-30 r5714`、`exit=0`）再推送。
4. **SFTP 推送 → 直接跑**。绕开「安装」这一步，因为安装根本不需要：

**为什么必须绕开安装器**：SSH 会话里执行安装器 `exit code = 2`。这个 2 是 **NSIS 初始化失败——SSH 会话运行在 session 0、没有交互式桌面**，与 UAC 无关（见下）。

**权限真相（推翻此前的 UAC 误判）**：目标机 SSH 会话的 token 本来就是提权态——

```
Mandatory Label\High Mandatory Level   S-1-16-12288
SeDebugPrivilege / SeBackupPrivilege / SeRestorePrivilege / SeTakeOwnershipPrivilege  已启用
IsInRole(Administrator) = True    （schtasks /create 也成功）
```

⇒ **「在管理员组」不等于提权，但这里是真·High integrity**。所以 `Start-Process` 超时、`schtasks /rl highest` 也不装不上，都**不是权限问题**，而是无桌面会话里 NSIS 起不来。真因定位后才找到 §5.3 的解包路。

## 6. 目标机特有的六个坑（下次直接跳过）

1. **设备名不是 `/dev/sd0`**：Windows 下必须 `smartctl --scan`，得到 `/dev/sda -d nvme`，且**必须显式带 `-d nvme`**（不带给 `Unable to detect device type`，给 `/dev/sd0` 给 `Invalid argument`）。
2. **PowerShell 变量边界**：`"$base?viasf=1"` 会把 `$base?` 当变量名，URL 被吃掉（表现为每个镜像都返回 `len=154` 的 HTML）。必须写 `${base}`。
3. **原生 Python 不认 MSYS 的 `/tmp`**：SFTP 前要把 `C:\Users\<user>\AppData\Local\Temp\sm.exe` 这类真实 win path 取出来，否则 `FileNotFoundError [WinError 2]`。
4. **SFTP 读回 stdout 容易超时**：`paramiko` 上传后 `o.read()` 会 `PipeTimeout` / `TimeoutError`，**这通常是链路抖动而非上传失败**——用远端 `stat` 校验字节数（本次 1,059,352 B 落地 ✓）而不是靠读回输出判断。
5. **`powershell -EncodedCommand` 在该机返回空**，须改走 `-Command` + base64 + `iex`（与通道文档一致）。
6. **Radmin 链路不稳**：`26.222.168.225:22` 会反复 timeout 断流，长流程要在断流前把结果落盘。

## 7. 复查方式（随时可重跑）

```powershell
& "%TEMP%\smartctl.exe" -a -d nvme /dev/sda
```

`smartctl.exe`（1.1 MB）已留在目标机 `%TEMP%`，复查无需重下。装完/推送后无需残留安装器。

## 8. 未收尾项

- 用户最初提的**「游戏封锁 + 每小时动态密码」**方案仍未开工；本次已把前置条件摸清（SSH 可进、token 为 High integrity、文件推送通道可用），可复用本文 §5 的通道手法。
- 目标机账户实况（供后续连接参考）：实际启用的是 **TQJQ6**；`27063` 在本地存在但 **Enabled = False**（`Administrator` / `Guest` / `DefaultAccount` / `WsiAccount` 亦为 False），故早前用 `27063` 认证必然失败，**不是密码错而是账户被禁用**。凭据不入库。
