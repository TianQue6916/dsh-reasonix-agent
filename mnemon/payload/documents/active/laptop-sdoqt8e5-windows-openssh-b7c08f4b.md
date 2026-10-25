---
id: "b7c08f4b-9084-4143-90cd-23b70dc33166"
title: "远程目标机（弟弟机 LAPTOP-SDOQT8E5）通道排查与 Windows OpenSSH 免密教训"
description: "2026-10-05 对弟弟机 LAPTOP-SDOQT8E5 的 SSH/Radmin 通道排查：主机身份靠 host key 指纹认定（同一机器曾用 192.168.1.8 → .10、Radmin 26.222.168.225）；根因是本机网段漂移（192.168.1.16 → 192.168.0.103）与 Radmin GUI 未常驻；含 Windows 管理员组 OpenSSH 免密必须写 administrators_authorized_keys + ACL 的坑。磁盘健康度未取到（被通道卡住）。"
status: "active"
created_at: "2026-10-05T09:26:20.759Z"
updated_at: "2026-10-05T09:26:20.759Z"
content_hash: "3c84fe12ccc4fdefc75bb30f8c5ab34a0ce29e3b3307c1ef1469bb80a2365464"
source_paths:
  - "PLAN.md"
  - ".reasonix/memory/global/弟弟机-远程通道-LAPTOP-SDOQT8E5.md"
session_ids:
  - "77917cf3-ef5d-492a-b34a-97b3d887a198"
memory_body_ids:
  []
---

# 远程目标机通道排查（2026-10-05）

目标：从本机（Windows 主力机「天阙九泉」）连到弟弟的笔记本，取磁盘健康度（`Get-PhysicalDisk` + `Get-StorageReliabilityCounter`）。**结论：磁盘数据未取到**，但通道侧的身份认定、根因定位与可复用教训已拿到。

## 一、目标机身份（靠指纹，不靠 IP）

| 项 | 值 |
|---|---|
| 主机名 | `LAPTOP-SDOQT8E5`（WORKGROUP，无域） |
| SSH banner | `OpenSSH_for_Windows_10.0 Win32-OpenSSH-GitHub` |
| ED25519 指纹 | `SHA256:gkNRneR5m1cKMu1DbdWygk/z7FaRTnGPWWMFIt/J2mM` |
| 地址 A | `192.168.1.10`（家里 LAN，DHCP） |
| 地址 B | `26.222.168.225`（Radmin VPN，本机为 `26.248.141.36`） |

- **同一台机的硬证据**：两个地址返回的 rsa / ecdsa-sha2-nistp384 / ed25519 三把 host key **逐字节相同**。
- 本机 `~/.ssh/known_hosts` 里的历史 `192.168.1.8` 记录与上述三把 key 一致 ⇒ 这台机以前是 `.8`，后经 DHCP 漂到 `.10`。**以前"控制过它"的那条通道就是 SSH，由本机发起。**
- **排除项**：`192.168.1.16` 是本机自己（主力机天阙九泉的 LAN 地址）—— 第一轮扫描扫到自己，别再当目标机。RustDesk 与弟弟机无关（peer 表里只有 Linux 天阙机）。4899 = Radmin Remote Control，5040 = Radmin 辅助口。

## 二、免密 / 认证侧的结论

- 22 端口开着，且支持 `publickey,password,keyboard-interactive`。
- `27063` / `Administrator` / `User` / `user` / `admin` 全部 `Permission denied (publickey)` ⇒ 本机 `id_ed25519` 已不在对方白名单（对方重装或清理过），**钥匙没了，通道还在**。
- **账户名未证实**：用户给的密码与主力机记录的密码一致，故推测弟弟机也是 `27063`，但这是推测，未写进任何记忆为既成事实。需目标机跑一次 `whoami` 才能真正确定。
- 有一条弱差异信号：`27063` 得到 `Connection reset by ... port 22`，`Administrator` 得到 `Permission denied`。行为不同，但 ASKPASS 交互本身也能造成 reset，样本只有一次，**不作结论**。

## 三、Windows OpenSSH 管理员组免密坑（可复用）

- **管理员组账户必须写 `C:\ProgramData\ssh\administrators_authorized_keys`**；用户目录 `~/.ssh/authorized_keys` 对管理员组成员**无效**。这是免密首次失败的根因。
- ACL 必须是 `SYSTEM:(R)` + `Administrators:(R)`，且 `/inheritance:r`；否则 sshd 直接拒绝读取该文件。
- 参考既有记录：`ssh-passwordless-and-tool-skills-20260804.md`、`工具-网络与远程.md`（两者同一条坑）。

## 四、根因：本机网段漂移（本次最大的排查失误来源）

| | 之前 | 现在 |
|---|---|---|
| 本机 LAN | `192.168.1.16`（网关 `192.168.1.1`） | **`192.168.0.103`（网关 `192.168.0.1`）** |

- 弟弟机在 `192.168.1.10` ⇒ **跨子网，路由直接不通**。扫 `192.168.0.0/24` 全网（22/445/4899/3389）**只有网关**，没有弟弟机。
- `192.168.1.16` 的 "reachable" 是**本机 ping 自己旧 IP**，自己回自己 —— 一度误导判断。
- Radmin 侧 `26.222.168.225` 也同时不可达，**ARP 条目消失** + TCP 超时 ⇒ 隧道断了，与密码无关。
- Radmin 断因：**`RvRvpnGui.exe` 没在跑**，只剩 `RvControlSvc` 服务。把 GUI 拉起来（PID 6588，后台不抢焦点）后**隧道仍未恢复** ⇒ 还需要在 GUI 内手动点连接，或对端不在线。

## 五、可复用教训

1. **别用 IP 认机** —— DHCP 会漂（`.8` → `.10`），host key 指纹才是身份。先核对 ED25519 指纹再连，避免连错机。
2. **排查网络前先 `ipconfig`** —— 本机的 LAN 会在 `192.168.1.x` / `192.168.0.x` 之间切；拿到旧 IP 直接当目标地址会得到一串无意义的 timeout。
3. **Radmin VPN 靠 `RvRvpnGui.exe` 常驻** —— 只有 `RvControlSvc` 服务不足以维持隧道。
4. **`ssh -vv` 与 paramiko 结论矛盾时，先怀疑网络变化而不是认证** —— 当次 paramiko 全候选 timeout，而 OpenSSH CLI 一度能到认证层；随后 CLI 也变 timeout，证明是链路而非凭据。
5. **`re.sub` 替换串里的反斜杠会被当转义**（本例 `bad escape \P`）—— 路径类字符串替换改用 lambda 或纯字符串 `replace`；同类坑此前也出现过（`bad escape \T`）。
6. **写记忆/索引的路径字符串要按字节校验**：本次 `C:\ProgramData\sshdministrators_authorized_keys` 少一个反斜杠（`ssh\` 丢了 `\`）被写进记忆并同步入库，需重跑修正；写入前后应 dump 段落原文核对。

## 六、当时环境事实

- 本机该次多网卡并存：`26.248.141.36`（Radmin）、`100.84.67.49`、`192.168.243.1`、`192.168.0.103`。
- `sshpass` 不存在；`paramiko 5.0.0` 可用（做非交互密码认证的首选）；`plink`/`putty` 无；`ssh.exe` 存在于 `/usr/bin/ssh.exe` 与 `C:\Windows\System32\OpenSSH\ssh.exe`。

## 七、下一步（通道恢复后三步出结果）

`ipconfig` 确认网段 → `ssh-keyscan` 核对指纹 `SHA256:gkNRneR5m1cKMu1DbdWygk/z7FaRTnGPWWMFIt/J2mM` → paramiko 连上后跑：

```powershell
Get-PhysicalDisk | ft DeviceId,FriendlyName,SerialNumber,MediaType,BusType,@{n='GB';e={[int]($_.Size/1GB)}},HealthStatus,OperationalStatus
Get-PhysicalDisk | Get-StorageReliabilityCounter | ft DeviceId,Wear,Temperature,PowerOnHours,ReadErrorsTotal,WriteErrorsTotal
whoami
```

判读要点：`Wear`（NVMe used-life %）、`Temperature`、`ReadErrorsTotal`/`WriteErrorsTotal` 是否非零；`Get-StorageReliabilityCounter` 需管理员权限，且**应隔一段时间读两次**看 `Wear` 是否在动，才是真实衰减速率而非快照。

## 八、相关文档

- `2a3a3f1e-f17c-470d-a66e-f595588d583a` —— 2026-10-04 系统异常排查（含本机网络/共享/Radmin 适配器为 Private 的既有结论）。
- 本次调查的完整叙述已另存于 `~/.reasonix/memory/global/弟弟机-远程通道-LAPTOP-SDOQT8E5.md` 并同步进 mnemon（该文件是 reasonix 记忆仓库，本文是独立的项目文档）。
