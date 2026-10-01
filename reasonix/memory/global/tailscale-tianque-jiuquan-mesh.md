---
id: mem-aab5b7b6a2e13177c0c1825c4a5dce7c
revision: 1
created_at: "2026-08-08T12:37:00.905947816Z"
updated_at: "2026-08-08T12:37:00.905947816Z"
name: tailscale-tianque-jiuquan-mesh
description: Tailscale 双机组网档案：Linux=100.79.96.82 / Windows=100.84.67.49，SSH 命令、开机自启、Windows 安装登录坑（MSI/schtasks 提权/CLI 无输出）
metadata:
  type: user
  fact_type: reference
  scope: global
---

# Tailscale 组网（TianQue Linux ↔ 天阙九泉 Windows）— 2026-08-08 配置档案

## 设备（同一账号 TianQue6916@）
| 设备 | Tailscale IP | hostname | 系统 |
|------|-------------|----------|------|
| Linux 本机 | 100.79.96.82 | tianque | Ubuntu 24.04 |
| Windows 主力机 | 100.84.67.49 | node（天阙九泉） | Win11 |

## 用法（任意网络，无视局域网/运营商）
```bash
ssh 27063@100.84.67.49        # 走 Tailscale 虚拟 IP，异地也能用
tailscale ping 100.84.67.49   # 测连通/看路径（direct=直连 / DERP=中继）
```
- 现状：同局域网时 direct 直连（192.168.1.16:41641 UDP）；异地自动 NAT 穿透，穿透失败走 DERP 中继
- 登录 URL：Tailscale 网页后台 https://login.tailscale.com 可管理设备/生成邀请链接

## 开机自启
- Linux：`systemctl enable --now tailscaled`（已配，`systemctl is-enabled` = enabled）
- Windows：服务名 **Tailscale**（tailscaled.exe），START_TYPE = AUTO_START（LocalSystem）已确认；GUI 是 tailscale-ipn.exe

## Windows 端安装与登录的坑（复刻必读）
1. **winget 不可用**：主力机 winget 报 "unable to open database file"，改用直接下载 MSI
2. **MSI 下载地址**：新版只有 MSI 没有 exe！`https://pkgs.tailscale.com/stable/tailscale-setup-<版本>-amd64.msi`（v1.102.2 约 36MB；旧的 `tailscale-setup-latest-amd64.exe` 已 404）
3. **SSH 远程装 MSI 需提权**：SSH 会话受 UAC 令牌限制，普通 Start-Process msiexec 无效；用 `schtasks /create /tr "msiexec /i xxx.msi /quiet /norestart" /sc once /rl highest /f` + `/run` 绕过
4. **登录 URL 生成**：Windows 上 `tailscale.exe up` 在 CLI 无输出（有 GUI/IPN 或服务模式时 URL 不打印）；可靠路径 = 让用户浏览器直接打开 `https://login.tailscale.com/a/xxxx`（URL 有效期约 1 小时），或 GUI（tailscale-ipn.exe）托盘登录
5. **Linux apt 源**：`https://pkgs.tailscale.com/stable/ubuntu/noble.gpg`（**没有 .noarch**，404 坑）；keyring 需 `gpg --dearmor` 转二进制；`.list` 必须带 `signed-by=/usr/share/keyrings/tailscale-archive-keyring.gpg`，否则 apt 报"没有数字签名"
6. **ssh 到 Windows 默认 cmd**：管道/重定向要小心 cmd 语法（无 grep/tail/head）

## 相关记忆
[[windows-main-machine-full]]（主力机 SSH/RustDesk/IPv6——注意公网 IPv6 已过期，主力机现只有 ULA fdfd::）、[[linux-hotspot-tianque-jiuquan]]（热点，开热点时离开局域网，但 Tailscale 不受影响！）

**Why:** 用户回学校后无法连家里局域网，Tailscale 是"任意网络 SSH 主力机"的根治方案（IPv6 直连已不可靠：公网 IPv6 过期 + 跨运营商不通）。
**How to apply:** 回学校直接用 `ssh 27063@100.84.67.49`；开热点（占用 WiFi）时 Tailscale 走手机流量依然可用。
