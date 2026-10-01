# 双机网线直连通道档案（2026-08-27，静态 IP 版）

## 交付
- **直连成功**：两机用网线 + 转接器（USB 网卡到网线）接通，端到端已实测通过。
- 用途：双机大文件快速传输、SSH；与 WiFi 局域网（192.168.1.x）、Tailscale（100.79.96.82↔100.84.67.49）互为备份的**千兆物理通道**。
- 2026-08-27 已升级为**两侧固定静态 IP**，开机自动激活，无需每次配置。

## 物理层
- Linux 端：USB 网卡 `enx00e04c074608`（MAC 00:e0:4c:07:46:08），`ethtool` 显示 1000Mb/s 全双工，Link detected yes。
- Windows 端：接口名「以太网」，Realtek Gaming 2.5GbE Family Controller（2.5G 网卡，实际协商 1G）。

## 静态 IP（最终方案，2026-08-27）
选用私有段 `192.168.243.0/24`，避开 WiFi 的 192.168.1.0/24，避免混淆。

| 端 | 接口 | IP/掩码 |
|----|------|---------|
| Windows | 以太网 | **192.168.243.1/24** |
| Linux | enx00e04c074608 | **192.168.243.2/24** |

### Windows 端设置命令（管理员 PowerShell，sudo 用户即可）
```
New-NetIPAddress -InterfaceAlias "以太网" -IPAddress 192.168.243.1 -PrefixLength 24
# 若要删除残留的 link-local（可选）：
Remove-NetIPAddress -InterfaceAlias "以太网" -IPAddress 169.254.140.176 -Confirm:$false
```
> 注意：Windows 设 IP 后它所在的 169.254 没了，必须**同时**把 Linux 端改到同网段才能互通。SSH 改完后原 169.254 地址失效，应用 WiFi 地址（192.168.1.16）确认新 IP，再用新 IP 重新 SSH。

### Linux 端（NetworkManager 连接 usb-link）
```
nmcli connection add type ethernet ifname enx00e04c074608 con-name usb-link \
    ipv4.method manual ipv4.addresses 192.168.243.2/24 \
    connection.autoconnect yes connection.autoconnect-priority 100
nmcli connection up usb-link
```
- 桌面 NetworkManager 下 `nmcli` 无需 sudo（root 才需密码）；接口平时被 NM 置「已断开」，须先建连接激活。
- `connection.autoconnect yes + priority 100`：**开机自动激活**，插上线自动通。

## 验证结果
- 双向 ping 0 丢包，延迟 ~1ms。
- SCP 经网线直连拉取 100MB ≈ 473Mbps（含 SSH 加密 + SHA-256 哈希开销，实际链速接近 1Gbps）。
- `ssh 27063@192.168.243.1` 经直连通道可用（实测 echo OK）。

## SSH 经此通道
```
ssh -o StrictHostKeyChecking=no -o HostKeyAlias=tqjq 27063@192.168.243.1
```
- 现为固定 IP，已写死通道；若重启后仍报 hostname 不匹配，保留 `-o StrictHostKeyChecking=no -o HostKeyAlias=tqjq`（或把该 IP 加入 ~/.ssh/config 的 tqjq HostName 备选）。

## 千兆实测与瓶颈定位（2026-08-27 关键发现）
- **裸 TCP 实测 947Mbps**（接近千兆物理上限，用纯 Python TCP 收/发端验证，Windows server 计时 966/Linux 947）。
- 物理链路 + USB 网卡（RTL8153，USB3 口 5000M）**完全能跑满千兆**。
- 但 **SCP/SSHFS/SMB 都只有 ~450-520Mbps**——瓶颈在协议/加密层，不在硬件。
- **sshfs 在 Windows SFTP 下写入不可靠**（写会丢到本地孤儿层不落盘 Windows）；纯 SFTP(scp/sftp put) 写方向可靠。
- 达到千兆的方式 = **去掉 SSH 加密，走裸 TCP 或用无加密专用传输**。加密无所谓时这是唯一到 947Mbps 的路。
- SMB 已建（共享名 NetShare，Windows 账户 27063/密码见用户），挂载点 /home/tianque/smbshare，但 SMB 也只 ~500Mbps。

## 千兆互传工具（裸 TCP，2026-08-27 已验证）
- **位置**：Linux 端 `/home/tianque/桌面/常用功能性脚本/千兆互传/`（`giga.py` + `千兆互传.sh`）；Windows 端 `D:\giga_win.py`。
- **用法**（在 千兆互传/ 目录下）：
  - `./千兆互传.sh get D:\\NetShare\\文件名 [本地目录]` 拉 Windows→Linux
  - `./千兆互传.sh put /本地文件 [windows文件名]` 推 Linux→Windows（存 D:\NetShare）
- **实测**：get/put 均 ~910-960Mbps，MD5 双向全程一致（无损坏）。默认端口 9200(Linux recv)/9201(Win recv)。
- **原理**：裸 TCP + 首行元数据头（SEND <len> <base64名>），无加密。Windows recv 用 schtasks 起独立任务（SSH会话会杀 `start /b` 后台进程，schtasks 不会）。
- **依赖**：两端 Python3（Windows 有 3.13，Linux 3.12）。Windows 无 iperf3 源，纯 Python 脚本测速代替。
- **注意**：无加密→仅限可信内网；获取文件名用 Windows 反斜杠需 `case` 处理 `basename`；Windows 用户密码 TQJQ6916（勿外传）。

## 待办/注意
- 静态 IP 现固定，不再受 Windows link-local 漂移影响，SSH/脚本可写死 `192.168.243.1`。
- 若换网卡（USB 网卡换口/换 Windows 网线口），接口名与 MAC 可能变，需重新建连接。
- 2.5G 网卡在本 USB 转接器下协商到 1G；若想跑满 2.5G 需两端都配 2.5G 网口直连（同转接器做承载）。
