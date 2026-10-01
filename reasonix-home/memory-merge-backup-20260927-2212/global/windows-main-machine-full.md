---
id: legacy-09ac07baf7f09c8d554e2966
revision: 1
created_at: "2026-07-28T14:33:23.566518149Z"
updated_at: "2026-07-28T14:33:23.566518149Z"
name: windows-main-machine-full
title: Windows 主力机「天阙九泉」完整远控信息
description: Windows主力机完整远程控制信息（SSH + RustDesk + IPv6），全局可用
metadata:
  type: user
  fact_type: reference
  scope: global
---

## Windows 主力机「天阙九泉」完整信息

### 基本信息
| 项目 | 值 |
|------|-----|
| **主机名** | 天阙九泉 |
| **局域网 IP** | 192.168.1.16 |
| **公网 IPv6** | `2409:8a7a:32d8:10d0:be07:222b:248f:e536` |
| **用户名** | 27063 |
| **密码** | `TQJQ6916` |
| **系统** | Windows 11 家庭版 中文版 |
| **CPU** | Intel Core i9-14900HX |
| **内存** | 32 GB |

### 远程控制方式

#### 1. SSH（命令行控制，推荐）
```bash
ssh 27063@192.168.1.16
密码: TQJQ6916
```
- SSH 服务已安装 OpenSSH Server，开机自启
- 防火墙已放行 TCP 22 端口（IPv4 + IPv6）
- 局域网走 IPv4，外网支持 IPv6 直连

#### 2. RustDesk（GUI 远程桌面）
```bash
rustdesk --connect 514476659 --password '@zyxTQJQ6916'
```
- RustDesk 已安装为 Windows 系统服务，开机自启
- 通过公网中继 rs-ny.rustdesk.com 连接，不依赖局域网
- 密码 `@zyxTQJQ6916`

#### 3. 跳板控制（推荐的外网方案）
通过本机 Linux（TianQue, 192.168.1.13）中转：
- Reasonix AI → Linux → SSH 内网 → Windows 主力机
- 用户只需打开 Reasonix，无需关心网络环境
- 手机热点 / 学校网络均可

### 验证状态
- ✅ SSH 连接成功（密码认证）
- ✅ RustDesk 连接成功（密码认证）
- ✅ IPv6 直连成功
- ✅ 可远程执行任意 PowerShell 命令
- ✅ 可启动 GUI 程序
- ✅ 可用 TTS 语音播报

### 关键配置
- SSH 服务: Automatic, Running
- RustDesk 服务: Automatic, Running
- RustDesk 设置: 已关闭「仅窗口打开时允许连接」
- 防火墙: 放行 SSH (TCP 22), Any profile
