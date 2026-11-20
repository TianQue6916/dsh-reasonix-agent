---
id: mem-a16ba8e35882896b50535b85a16dbb90
revision: 1
created_at: "2026-11-20T06:36:41.402Z"
updated_at: "2026-11-20T06:36:41.402Z"
name: sunshine-mdns-chinese-hostname-fix
description: "本机 Sunshine 的 Moonlight 找不到主机：根因是中文计算机名进了 mDNS SRV，修法是只改 DNS hostname"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 症状
Moonlight 找不到主机/连不上；Sunshine（2026.914.233613，`C:\Program Files\Sunshine`）服务本身健康：47989 http=200、47990 https=401、防火墙 `Sunshine-Program-In` 绑 sunshine.exe。

## 根因
Windows 的 `DnsServiceRegister` 把 ComputerName「天阙九泉」原样写进 mDNS 的 SRV target，产生非 ASCII label（`天阙九泉.local`），Moonlight 解析失败。抓包实证（自写探针）：
```
PTR  _nvstream._tcp.local -> Sunshine._nvstream._tcp.local
SRV  Sunshine._nvstream._tcp.local -> 天阙九泉.local:47989
A    天阙九泉.local -> 192.168.0.100
```
同网段 192.168.0.106 是一台 Linux Sunshine（`Linux.local`，合法名），抓包会看到两个 responder。

## 修法（2026-11-20 14:36 已生效）
只改 DNS hostname、不动 ComputerName，因此不需要重启系统：
- `HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters` 的 `Hostname` 与 `NV Hostname` → `TianQue`
- `Restart-Service SunshineService`（`Restart-Service Dnscache` 会被拒：保护服务，但不需要它也能生效）
- 结果：`SRV TianQue._nvstream._tcp.local -> TianQue.local:47989`，`A TianQue.local -> 192.168.0.100`，PTR 实例名也从 `Sunshine` 变成 `TianQue`
- 副作用：`%COMPUTERNAME%` 仍是「天阙九泉」，与 DNS 名不一致；重启后注册表值是否被同步回中文待复核（回退就重跑脚本，或 `Rename-Computer TianQue`）

## 同时修掉
`sunshine.conf` 的 `encoder = nvenc` 在 Optimus 笔记本上恒失败（`Encoder [nvenc] is not supported on this GPU`）——内屏挂 Intel UHD、NVIDIA adapter 无 attached output（`dxgi-info.exe` 实证），改 `encoder = quicksync` 后日志直接 `Found H.264 encoder: h264_qsv`。

## 工具位置
- mDNS 探针：`C:\Users\27063\.dsh\.learn\run\mdns_probe2.py`（`python mdns_probe2.py 192.168.0.100 _nvstream._tcp.local`）
- 修复脚本：`fix-mdns-hostname.ps1`、`fix-sunshine-encoder.ps1`、`restart-sunshine-only.ps1`（同目录，需 UAC）
- UAC 提权：`Start-Process powershell -Verb RunAs -ArgumentList ... -PassThru`，本会话 shell `SessionId=1`，可正常弹窗
