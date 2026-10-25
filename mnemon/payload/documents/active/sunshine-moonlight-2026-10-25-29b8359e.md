---
id: "29b8359e-9b18-46e5-9707-37f952341304"
title: "Sunshine/Moonlight 配对失败根因排查：防火墙枚举权限陷阱与多网卡同网段回包选路（2026-10-25）"
description: "平板 Moonlight 配对始终失败（PIN 页 No devices are waiting to pair、提交 400）的两条实测根因：非提权进程 Get-NetFirewallRule 枚举为空导致误判「无防火墙规则」；WLAN 与 RNDIS 以太网同处 192.168.0.0/24 且 metric 更低，回包走错网卡触发 Initial Ping Timeout。含 sunshine.log 证据链、netsh 程序级放行做法、接口 metric 调整与诊断顺序。"
status: "active"
created_at: "2026-10-24T16:41:10.448Z"
updated_at: "2026-10-24T16:41:10.448Z"
content_hash: "0f60a6086ac13ecf50784b6ebf066ac8fd0681cc39de93282e515e6ac99cd43f"
source_paths:
  - "_moonlight/fix-firewall.ps1"
  - "_moonlight/start-pad.ps1"
  - "_moonlight/cfg-sunshine.ps1"
session_ids:
  - "e12f9181-53a6-4cf5-afe7-87239fa39be9"
memory_body_ids:
  []
---

# Sunshine/Moonlight 配对失败根因排查（2026-10-25）

性质：带实测证据的故障定层记录。承接虚拟屏与 sunshine.conf 已落地阶段
（文档 `12e010fd-adbd-494b-ad86-23cd9bb69f89`）与早期方案调研
（文档 `a60eaadf-c22c-4633-81fd-6284897cfb50`），本文件只负责「配对为什么连不上」。

## 症状

- 平板 Moonlight 输入主机 IP 后确实出现 4 位 PIN；在 Sunshine Web UI 的 PIN 页提交后，
  下拉框显示 `No devices are waiting to pair`，换新 PIN 重试两次仍然如此。
- 直接用 HTTP 提交 PIN（`{"pin":"xxxx","name":"..."}`）返回 400 Bad Request。

## 证据链（sunshine.log）

```
Info: CLIENT CONNECTED
Info: CLIENT DISCONNECTED
Error: Initial Ping Timeout
Warning: SSL Verification error :: Client certificate identity is not enabled
```

读数：**平板到服务端的 TCP 已经通了**（CLIENT CONNECTED 出现过），断在控制通道建立
（Initial Ping）。因此不是「Moonlight 请求根本没到达 Sunshine」，也不是 PIN 过期。
SSL 那条 Warning 是配对未完成的伴生现象，不是首因。

## 根因 A：非提权进程枚举不到防火墙规则 → 误判为「没有规则」

- 在普通（非提权）工具进程里 `Get-NetFirewallRule` 返回空（打印成 `NONE`），
  据此得出「Sunshine 一条防火墙规则都没有」的判断。
- 提权后复核发现那批规则**本来就存在**（`Sunshine-TCP-47984` … 共 16 条，含 UDP 对应项）。
  ⇒ 教训：用非提权会话的 `Get-NetFirewallRule` 结果去证明「规则缺失」是不可靠的；
  需要 `netsh show rule` 或提权会话交叉验证。
- 仍补了更彻底的一层：按**程序**放行 + 端口段兜底，全部 profile（Domain/Private/Public）。
  脚本 `_moonlight/fix-firewall.ps1`，产出规则：

```
Sunshine-Program-In    In | Allow | Domain,Private,Public | Program=<...>\sunshine.exe
Sunshine-Ports-In      In | Allow | Any | TCP 47984-48010
Sunshine-Ports-UDP-In  In | Allow | Any | UDP 47984-48010
```

- 环境前提：网络 profile 为 **Public**（"未识别的网络"、"Tian Que Workspaces 2" 均为 Public），
  Windows 默认封公共网络入站，因此 profile 覆盖面必须显式包含 Public。

## 根因 B：两块网卡同处 192.168.0.0/24，回包走错出口

```
192.168.0.0/24 有两条路由：
  ifIndex=12  WLAN        192.168.0.102  InterfaceMetric=45
  ifIndex=22  以太网 2(RNDIS) 192.168.0.100  InterfaceMetric=35  ← 更优先
```

平板从 Wi-Fi 连接 `192.168.0.102`，Windows 回包按 metric 选了 RNDIS 网卡（`.100`），
源 IP 与对端期望不符 → 对端丢弃 → 控制通道永远建不起来，正好对应
`CLIENT CONNECTED → CLIENT DISCONNECTED → Initial Ping Timeout`。

处置：把 RNDIS 接口 metric 从 35 调到 90，WLAN 45 优先接管该网段
（route 的 RouteMetric 均为 256，真正起作用的是 InterfaceMetric）。
复核输出：`ifIndex=22 以太网 2 metric=90`、`ifIndex=12 WLAN metric=45`。
若仍失败，下一步是直接禁用 RNDIS 出口（同网段双出口本身就是配置错误）。

## 诊断顺序（可复用）

1. 先读 `sunshine.log` 判断是「请求没到」还是「回包出不去」：有没有 `CLIENT CONNECTED`。
2. 防火墙用提权会话或 `netsh show rule` 交叉验证，别信非提权枚举的空结果。
3. 查目标网段是否有多条路由、各接口 InterfaceMetric 顺序；同网段双网卡要压低非业务网卡。
4. 别截获 PIN 代为提交：Sunshine PIN 有效期很短，聊天往返＋HTTP 提交往往已超时，
   由用户在 Web UI PIN 页当场填最快。

## 同一连接实测暴露的另外两个待办（尚未修）

- `Info: Desktop resolution [2560x1600]`：Sunshine 实际捕获的是笔记本主屏，
  写入 `sunshine.conf` 的 `output_name = \\.\DISPLAY29` 未被采纳（对 IDD 虚拟屏枚举名形式不匹配）。
- `Found H.264 encoder: h264_qsv [quicksync]`：`encoder = nvenc` 未生效，实际用 Intel 核显。
  怀疑 Sunshine 服务以 SYSTEM 身份运行在 session 0，看不到 NVIDIA 编码会话。
  两项都应排在配对打通之后修，否则无法验证效果。
