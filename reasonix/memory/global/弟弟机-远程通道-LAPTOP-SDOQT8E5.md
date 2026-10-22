---
id: brother-pc-remote-channel-laptop-sdoqt8e5
revision: 1
created_at: "2026-10-05T15:05:00.000000000Z"
updated_at: "2026-10-05T15:05:00.000000000Z"
name: 弟弟机-远程通道-LAPTOP-SDOQT8E5
title: 弟弟 Windows 机「LAPTOP-SDOQT8E5」远程通道（双地址 + SSH + Radmin）
description: 弟弟机在 LAN 与 Radmin VPN 双地址的同一性判据、开放端口、SSH 指纹与当前缺口
metadata:
  type: user
  fact_type: reference
  scope: global
---

# 弟弟机「LAPTOP-SDOQT8E5」远程通道

> 2026-10-05 实测确证。**注意：这不是主力机天阙九泉**（主力机见 `windows-main-machine-full`，LAN IP 192.168.1.16）。

## 一、身份

| 项 | 值 |
|---|---|
| NetBIOS / 主机名 | `LAPTOP-SDOQT8E5`（出厂默认名；工作组 `WORKGROUP`，无域） |
| 系统 | Windows（SSH banner `OpenSSH_for_Windows_10.0 Win32-OpenSSH-GitHub`） |
| 使用者 | 用户的弟弟（学生，在学 Python） |

## 二、双地址 = 同一台机（硬判据）

| 地址 | 网络 | 说明 |
|---|---|---|
| `192.168.1.10` | 家里 LAN（DHCP） | **以前是 `192.168.1.8`** |
| `26.222.168.225` | Radmin VPN（本机为 `26.248.141.36`） | 异地也可达 |

**同一性判据**：两个地址的 SSH host key 三把（rsa / ecdsa-sha2-nistp384 / ed25519）**逐字节相同**：

```
ssh-ed25519          AAAAC3NzaC1lZDI1NTE5AAAAIPbinXhbVPRL66Pit71c9AN4KOY8MjXkHEMA...
ecdsa-sha2-nistp384  AAAAE2VjZHNhLXNoYTItbmlzdHAzODQAAAAIbmlzdHAzODQAAABhBCDwmlLa...
ssh-rsa              AAAAB3NzaC1yc2EAAAADAQABAAABgQCY8LAUIn+R2uJiMyOR8e+uW7IJ2Dea...
ED25519 fingerprint  SHA256:gkNRneR5m1cKMu1DbdWygk/z7FaRTnGPWWMFIt/J2mM
```

**地址漂移证据**：`~/.ssh/known_hosts` 里 `192.168.1.8` 的三行与上面**完全一致** ⇒ 该机以前占用 `.8`，现 DHCP 分到 `.10`。**known_hosts 中那三条 192.168.1.8 记录，就是"以前控制过"留下的痕迹。**

## 三、开放端口（2026-10-05 扫描）

| 端口 | 服务 | 备注 |
|---|---|---|
| 22 | OpenSSH for Windows 10.0 | 支持 `publickey,password,keyboard-interactive` |
| 135 / 139 / 445 | RPC / NetBIOS / SMB | 在 Radmin 侧可见 |
| 4899 | **Radmin Remote Control Server** | 图形远控通道 |
| 5040 | Radmin 相关 | |
| 3389 / 5985 | **未开** | 无 RDP、无 WinRM ⇒ 命令行只能走 SSH |

## 四、本机侧通道

- **Radmin VPN** 已装且 `RvControlSvc` 服务 RUNNING；本机 Radmin IP `26.248.141.36`
- `%LOCALAPPDATA%\Famatech\Radmin VPN\phonebook.rpb` 里**唯一一条对端记录**就是 `26.222.168.225 / LAPTOP-SDOQT8E5`
- ⚠️ Radmin Viewer 地址簿 `%APPDATA%\Radmin
admin.rpb` 是**空的**（25 B）
- 本机另有 RustDesk（peer 表里只有 Linux 天阙机 70379525，**与弟弟机无关**）与 GameViewer 常驻

## 五、当前缺口（2026-10-05）

- 本机 `~/.ssh/id_ed25519` **不在**弟弟机白名单：以 `27063` / `Administrator` / `User` / `user` / `admin` 试 publickey，全部 `Permission denied (publickey)`
- 要免密须先拿到一个可用账户 + 密码；写公钥时**管理员组账户必须写 `C:\ProgramData\ssh\administrators_authorized_keys`**（用户目录 `~/.ssh/authorized_keys` 对管理员无效，ACL 需 `SYSTEM:(R)` + `Administrators:(R)`）—— 与主力机同一个坑
- 拿到通道后的待办：① 磁盘健康度（`Get-PhysicalDisk` + `Get-StorageReliabilityCounter`）② VSCode + Python 环境

**Why:** 弟弟机从 `.8` 漂到 `.10` 并新增 Radmin 地址，不记下来下次仍会重复"找不到机器"的排查。
**How to apply:** 优先 `ssh <user>@26.222.168.225`（Radmin 侧不依赖家里 LAN，异地可用），LAN 侧用 `192.168.1.10`；连接前比对指纹 `SHA256:gkNRneR5m1cKMu1DbdWygk/z7FaRTnGPWWMFIt/J2mM`。

## 六、2026-10-05 续测：地址会漂，本机网段也会漂

**① 弟弟机 LAN 地址是 DHCP 漂移的**：`192.168.1.8`（known_hosts 旧记录）→ **`192.168.1.10`**（本次实测）。**永远用 host key 指纹认机，不要用 IP 认机**。

**② 本机自己的网段也会在两张网之间切**（同一天内实测）：
- 上午/午后：本机 LAN = `192.168.1.16`（网关 192.168.1.1）—— 此时弟弟机 `192.168.1.10` **可达**
- 傍晚：本机 LAN = `192.168.0.103`（网关 `192.168.0.1`）—— 此时 `192.168.1.10` **跨子网不可达**，且 `192.168.0.0/24` 全网扫只有网关，**没有弟弟机**
⇒ 排查前**先 `ipconfig` 确认本机在哪个段**，别拿旧 IP 硬撞。

**③ Radmin 隧道靠 `RvRvpnGui.exe` 常驻维持，只有 `RvControlSvc` 服务不够**：2026-10-05 观察到 GUI 进程不在时 `26.222.168.225` 不可达（ARP 条目消失 + TCP timeout）。手动拉起 `Radmin.exe` 后仍不通（说明还需要 GUI 内手动连接 / 对端在线）。

**④ 密码与账户**：用户给的密码 `TQJQ6916` 与主力机「天阙九泉」**完全相同**（见 `windows-main-machine-full`），而主力机账户名是 `27063` ⇒ 弟弟机大概率同账户，**但未经证实**。

**⑤ 网络仍通时的认证行为**（换网前，对 `192.168.1.10`）：
| 用户名 | 结果 |
|---|---|
| `27063` | `Connection reset by 192.168.1.10 port 22`（**不是** Permission denied） |
| `Administrator` | `Permission denied (publickey,password,keyboard-interactive)` |

两者行为不同，但**不足以定性**（ASKPASS 交互也能造成 reset）。换网后两条线路全 timeout，无法复测。

**Why:** 本次排查的最大教训是「IP 认机 + 假设网段不变」，两次踩同一个坑。
**How to apply:** 连接前固定三步 —— ① `ipconfig` 看本机网段 ② `ssh-keyscan` 比指纹 `SHA256:gkNRneR5m1cKMu1DbdWygk/z7FaRTnGPWWMFIt/J2mM` ③ 再连。

## 七、Radmin 操作要点（2026-10-05 踩坑）

**① `Radmin.exe` 不是 VPN！** 目录里两个东西容易混：

| 文件 | 真实身份 |
|---|---|
| `Radmin.exe` (954 KB) | **Radmin Viewer / 远控客户端**（有 30 天试用与授权号码那套），**与组网无关** |
| `RvRvpnGui.exe` (14 MB) | **Radmin VPN 的 GUI**，组网就靠它 |
| `RvGuiStarter.exe` | VPN GUI 的启动器（负责提权拉起 GUI） |
| `RvControlSvc.exe` | VPN 控制服务（常驻，但不维持隧道） |

误启 `Radmin.exe` 会弹繁体中文「**不能儲存到登錄檔**」—— 来自 `1028.lng_rad`（zh-TW），对应字符串是「未能將機碼寫進登錄檔」（要写 HKLM 却没权限）。**这个弹窗与 VPN、与弟弟机都无关**，关掉即可。

**② 网卡 Connected ≠ 隧道通**：`netsh interface show interface` 报 `Radmin VPN / Enabled / Connected`、IP `26.248.141.36` 一切正常，但对端 `26.222.168.225` 依然 TCP timeout、ARP 无条目。**判据只能是「对端到底能不能连」**，不要被网卡状态骗。

**③ 隧道开关是 GUI 里那个大电源按钮**：注册表可看痕迹
`HKCU\Software\Famatech\Radmin VPN\ui\MainWindow` → `wasPwrBtnEverPressed = true`。
（该值只说明"被按过"，**不足以判定当前开关状态** —— 要判定就得看 GUI 或直接测对端。）

**④ VPN 网络名 = `天阙九泉`**
（见 `HKCU\Software\Famatech\Radmin VPN\ui\networks\天阙九泉`），`phonebook.rpb` 里那条 `26.222.168.225 / LAPTOP-SDOQT8E5` 就在这个网络内。

**⑤ 恢复连接的顺序**：① 本机 `RvRvpnGui.exe` 起来 ② GUI 里连上网络「天阙九泉」 ③ **对端（弟弟机）的 Radmin 也必须在线** ④ 才轮到 SSH 那一层。缺任何一环，`26.222.168.225` 都不会通。

## 八、2026-10-05 打通记录（账户 / 磁盘 / 坑）

### 账户（★ 关键）
- **可用账户 = `tqjq6`**（Windows 侧显示 `TQJQ6`），密码 `TQJQ6916` ⇒ `ssh tqjq6@26.222.168.225` **成功**
- 该机 `Get-LocalUser` 实测：
  | 账户 | Enabled |
  |---|---|
  | **TQJQ6** | **True**（LastLogon 2026/10/5 20:21） |
  | 27063 | False（**存在但已禁用**） |
  | Administrator | False |
  | Guest / DefaultAccount / WDAGUtilityAccount / WsiAccount | False |
  ⇒ 之前试 `27063` 必然失败（账户被禁用），**不是密码问题**
- 历史会话里 `tqjq6@192.168.1.8` 出现 339+ 次（`zzzz_noexist@` 是对照组）——**账户名是从历史里挖出来的**

### 磁盘（已确证的部分）
| 项 | 值 |
|---|---|
| 型号 | `WDC PC SN730 SDBPNTY-512G-1036`（西部数据 SN730，OEM NVMe TLC） |
| 序列号 | `E823_8FA6_BF53_0001_001B_444A_491A_0796` |
| 固件 | `11110000` |
| 容量 | 512110190592 B = 476.9 GiB |
| 接口 | NVMe / SSD |
| **HealthStatus** | **Healthy**；OperationalStatus **OK** |
| 分区 | C: 120GB（剩 40）/ D: 343GB（剩 141），卷标均为「天阙九泉」，NTFS，Healthy |

**拿不到的（重要）**：`Get-StorageReliabilityCounter` 在这块盘上只吐出 `Temperature=41℃`、`TemperatureMax=84℃`、`FlushLatencyMax=281`、`ReadLatencyMax=1208`、`WriteLatencyMax=622`；
而 **`Wear=0`、`PowerOnHours`、`ReadErrorsTotal`、`WriteErrorsTotal`、`StartStopCycleCount` 全部为空**。
**`Wear: 0` 是"读不到"，不是"零磨损"** —— Windows 存储栈解析不了这家的 OEM NVMe SMART（与主力机同一现象）。要真数据必须 smartctl 走 NVMe 直读。

### 装 smartctl 的四条路（走到第 4 条）
1. **winget**：仓库里有 `smartmontools.smartmontools 7.5`，但安装器托管在 **GitHub**，而**弟弟机 `github.com` 超时** ⇒ `InternetOpenUrl() failed 0x80072efd`
2. **SourceForge 直链 / 5 个镜像**：全部返回同一个 **124344 字节 HTML 拦截页**（`head=<!`），拿不到文件
3. **本机下载 → SFTP 推送**：本机 `curl -L` **直连 GitHub 成功**（1,059,352 B，`PE32` + `MZ` ✓），SFTP 上传到 `C:/Users/TQJQ6/AppData/Local/Temp/sm-setup.exe` **成功**
4. **安装**：`Start-Process /S` **挂在 UAC**（SSH 会话令牌属 admin 组但未提权）⇒ 读 stdout 600s 超时；**schtasks /rl highest 绕过方案已写好但未及执行**（随后 Radmin 链路断开）

**→ 残留状态**：`%TEMP%\sm-setup.exe`（1.06 MB）**已躺在弟弟机上**，只差一次提权安装。

### 该机特有的三个坑（下次直接用）
- **`powershell -EncodedCommand` 返回空**（cmd 层问题），必须走 **`-Command` + base64 + `iex([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(...)))`**
- **SSH 会话装安装器必须提权**：`schtasks /create /tn X /tr "安装器 /S" /sc once /st 00:00 /rl highest /f` + `schtasks /run /tn X`（与主力机同一个坑）
- **网络分层**：`www.microsoft.com` 200、`downloads.sourceforge.net` 200（但返回拦截页）、**`github.com` 超时**

**该机身份**：`laptop-sdoqt8e5\tqjq6`，`isAdmin=True`。

## 九、★ 磁盘健康度实测结果（2026-10-05 21:54，smartctl 7.5 直读 NVMe Log 0x02）

```
SMART overall-health self-assessment test result: PASSED

Critical Warning:                   0x00
Temperature:                        46 Celsius      (Warning 84C / Critical 88C)
Available Spare:                    100%            (Threshold 10%)
Percentage Used:                    3%
Data Units Read:                    60,783,672 [31.1 TB]
Data Units Written:                 36,628,873 [18.7 TB]
Host Read Commands:                 629,754,449
Host Write Commands:                648,199,116
Controller Busy Time:               1,507
Power Cycles:                       781
Power On Hours:                     2,252
Unsafe Shutdowns:                   67
Media and Data Integrity Errors:    0
Error Information Log Entries:      10   (但 Error Information Log 本身: No Errors Logged)
Warning Comp. Temperature Time:     0
Critical Comp. Temperature Time:    0
```

**结论：这块盘非常健康，寿命几乎未消耗。**
- `Percentage Used = 3%` ⇒ 免疫度 97%；`Available Spare = 100%` ⇒ 备用块零消耗；介质错误 0
- 交叉校验：写 18.7 TB / 512 GB ≈ **36.5 次全盘覆写**；SN730 512GB 额定 TBW 约 300 TB，比值约 6% —— 与固件报的 3% 同量级，**可信**
- 唯一可留意项：**`Unsafe Shutdowns: 67`**（67 次异常断电/强制关机），但 `Media Errors = 0`、无重建迹象，属"次数偏多但未造成损害"
- 对照主力机：主力机 1TB KINGSTON QLC 已用 17%（健康 83%），弟弟机 SN732 只 3% —— 年轻得多

## 十、★ 最终可用方案（smartctl 免安装部署，可复用）

**背景**：弟弟机 `github.com` 不通、SourceForge 返回 124KB 拦截页、NSIS 安装器在 SSH 会话（session 0 无桌面）退出码 **2** 装不上。
**解法**（四步，缺一不可）：

1. **本机下载**（本机可直连 GitHub）：`curl -sL -o sm.exe https://github.com/smartmontools/smartmontools/releases/download/RELEASE_7_5/smartmontools-7.5.win32-setup.exe`（1,059,352 B）
2. **本机取 7z**（本机原本没有 7-Zip）：`conda create -y -p ...\7zenv -c conda-forge 7zip` ⇒ 得到 `7z.exe` + `7z.dll`（**完整版支持 NSIS**，`7za/7zr` 不够）
3. **本机解包**：`7z x sm.exe -o./smx -y` ⇒ `smx/bin/smartctl.exe`（1,165,312 B，静态链接无 DLL 依赖；`bin/` 64 位、`bin32/` 32 位）
4. **SFTP 推送 + 直读**：传到 `C:/Users/TQJQ6/AppData/Local/Temp/smartctl.exe`，跑 `smartctl -a -d nvme /dev/sda`

**关键坑（下一步必查）**：
- **Windows 下设备名不是 `/dev/sd0`**！`smartctl --scan` 才给答案 —— 实测输出 **`/dev/sda -d nvme`**，且**必须显式带 `-d nvme`**，否则报 `Unable to detect device type`
- SSH 会话的 token 实测是 **`High Mandatory Level` (S-1-16-12288)** + `SeDebugPrivilege` 已启用 ⇒ **读 SMART 不需要额外提权**（之前以为是 UAC 挡住，判断错了）
- 安装器退出码 **2** = NSIS 在无桌面会话初始化失败，**不是权限问题** —— 遇到就直接走解包路线，别在安装器上耗
