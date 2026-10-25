---
id: "817c25e1-748a-4892-b8a4-20afcb000051"
title: "Sunshine 配对与捕获输出阶段故障定论：PIN 时效、防火墙误判、同网段多网卡路由冲突、named_devices 脏数据（2026-10-25）"
description: "平板扩展屏项目的配对与捕获输出阶段定论：PIN 时效不可由 agent 代填、非提权 Get-NetFirewallRule 会误判为无规则、WLAN 与 RNDIS 同网段路由冲突导致 CLIENT CONNECTED 后 Initial Ping Timeout、sunshine_state.json 的 named_devices 脏数据引发 401、output_name 字面量被读到却不被采纳（240Hz vs 60Hz 判读法）。含相关脚本清单与待验证项。"
status: "active"
created_at: "2026-10-24T16:53:53.971Z"
updated_at: "2026-10-24T16:53:53.971Z"
content_hash: "e3264f7ba470ee229553be07dfb3accff31fdcdb1d4022542c5a6fe2fc2c7d08"
source_paths:
  - "_moonlight/start-pad.ps1"
  - "_moonlight/fix-firewall.ps1"
  - "_moonlight/reset-pair.ps1"
  - "_moonlight/try-output.ps1"
  - "_moonlight/cfg-sunshine.ps1"
  - "_moonlight/pvd-host2.ps1"
session_ids:
  - "9bfd2c99-c54a-4277-a5cf-beca86c72cb4"
memory_body_ids:
  []
---

# Sunshine 配对与捕获输出阶段故障定论（2026-10-25）

性质：带实测证据的故障归因记录。承接 `12e010fd-adbd-494b-ad86-23cd9bb69f89`（虚拟屏入拓扑 + parsec-vdd 0.45 常驻持有）与 `ccd960b3-9287-4531-b3a1-54f41cb8d2c3`（present 但未入拓扑的取证）。本份只记录**虚拟屏已建好、Sunshine 服务已在跑之后**，配对与捕获输出这两段的四个根因，以及被证伪的误判。

平台：Windows，Sunshine 服务以 SYSTEM 身份常驻（`SunshineService`，Automatic），监听 47984 / 47989 / 47990，Web UI `https://localhost:47990`。

---

## 一、PIN 配对：agent 不能代填 PIN

- Moonlight 侧 4 位 PIN 的有效窗口约 **30–60 秒**。用户把 PIN 发给 agent、agent 再发 HTTP 请求，往返已超窗，服务器返回 **400 Bad Request**。
- 后续重试出现 `No devices are waiting to pair`，说明 PIN 过期只是表象，真正的阻断在别处（见二、三）。
- 结论：PIN 必须由用户**在浏览器 PIN 页直接提交**（`https://localhost:47990` → 左侧 PIN），agent 只负责修前置条件，不要截获 PIN。
- 附带教训：在 PowerShell 里手拼 JSON body 要用单引号或 here-string，`{"pin":"8049",...}` 会被解析成意外的 `:` token 而 ParserError。
- 判读标准：PIN 页左上设备下拉框出现**具体设备名**＝请求已到达服务端；一直显示 `No devices are waiting to pair` ＝ Moonlight 的配对请求根本没进来，不要反复换 PIN。

## 二、防火墙：非提权进程读不出规则，会导致"规则不存在"的误判

- 在非提权进程里跑 `Get-NetFirewallRule` 返回 `NONE`，据此判断"一条规则都没有"是**错的**；提权后 `netsh show rule` 与 `Get-NetFirewallRule` 能看到早已存在的 16 条 `Sunshine-TCP-47984` 等端口规则。
- 正确做法是按**程序**放行，一次覆盖全部端口，且 profile 全开：

  | 规则名 | 方向 | 条件 |
  |---|---|---|
  | `Sunshine-Program-In` | Inbound | Program=`sunshine.exe`，Profiles=Domain,Private,Public |
  | `Sunshine-Ports-In` | Inbound | TCP 47984-48010 |
  | `Sunshine-Ports-UDP-In` | Inbound | UDP 47984-48010 |

- 本机网络 profile 实际是 **Public**（"未识别的网络"、"Tian Que Workspaces 2"），Windows 默认封 Public 入站，所以按程序的 Public 放行是必要的。
- 教训：凡是「读不到防火墙规则」的判断，先确认进程是否提权，否则会把成功的配置误判为失败、再做一遍无用的写操作。

## 三、同网段多网卡路由冲突（本次真正的阻塞点）

症状链（`sunshine.log` 逐行吻合）：

```
Info: CLIENT CONNECTED
Info: CLIENT DISCONNECTED
Error: Initial Ping Timeout
```

同时 `Moonlight` 端表现为配对确认后立刻消失、或 `Host PC returned error ... 401`。

根因：`192.168.0.0/24` 上有两条同网段出口，Windows 按 InterfaceMetric 选路回包：

| ifIndex | 接口 | 地址 | InterfaceMetric |
|---|---|---|---|
| 12 | WLAN | 192.168.0.102 | 45 |
| 22 | 以太网 2（RNDIS 平板 USB 网卡） | 192.168.0.100 | **35（更优先）** |

平板从 Wi-Fi 连 `192.168.0.102`，但回包被路由到 RNDIS 网卡从而源 IP 不匹配，对端直接丢弃 ⇒ 控制通道永远建不起来。

修复：把 RNDIS 接口 metric 从 35 抬到 90，让 WLAN 优先。

```
Set-NetIPInterface -InterfaceIndex 22 -InterfaceMetric 90
```

复核方式：`Get-NetIPInterface` 看 ifIndex=22 变成 90、ifIndex=12 仍是 45。

教训：`CLIENT CONNECTED` 紧跟 `CLIENT DISCONNECTED` 是**回包路由错**的典型指纹，不要去查证书、编码器或 PIN。一个网段两个网卡本身就是配置错误，治本做法是禁用多余的那块。

## 四、配对成功但连接 401：`sunshine_state.json` 的 `named_devices` 脏数据

- 平板报 `Host PC returned error : The client is not authorized. Certificate verification failed (Error code: 401)`，服务端日志同时反复出现 `Warning: SSL Verification error :: Client certificate identity is not enabled`。
- `sunshine_state.json`（约 6.4 KB）顶层键：`username` / `salt` / `password` / `root`；`root` 下是 `uniqueid` + `named_devices`。反复尝试后 `named_devices` 里堆了 **8 条**互不相干的配对记录，证书验签时匹配不上。
- 修复做法（`_moonlight/reset-pair.ps1`）：停服务 → 备份 → 保留 `uniqueid` 只把 `named_devices` 清成 `[]`（文件从 6496 B 缩到 242 B）→ 启服务。Web UI 账号密码与 `uniqueid` 不受影响 ⇒ 不需要重新走一遍初始配置。
- 客户端侧必须**删掉旧主机条目**再重新配对，否则平板仍带旧证书来验签。

## 五、捕获输出：`output_name` 写了字面量却不被采纳

证据（同一次会话日志）：

```
Info: config: 'output_name' = \\.\DISPLAY29
Info: Currently available display devices:
    "display_name": "\\\\.\\DISPLAY1",
    "display_name": "\\\\.\\DISPLAY29",
Info: Desktop resolution [2560x1600]
Info: Display refresh rate [240Hz]
```

即：配置被读进来、目标屏也被枚举出来，**但捕获仍落在主屏**（240Hz 是笔记本屏，虚拟屏只有 60Hz）。

- 判读口诀：`Display refresh rate [60Hz]` ⇒ 抓到虚拟屏；`[240Hz]` ⇒ 还在抓主屏。
- 这两个字段只在**客户端真正发起会话时**才打印，离线看日志无法验证，必须连一次再看。
- 已试写法：`output_name = \\.\DISPLAY29`（未生效）→ 改为 friendly name `ParsecVDA`（parsec-vdd 的 EDID 厂商名，`WmiMonitorID` 里是 `DISPLAY\PSCCDD0\...`），**结果尚未验证**。
- 同一日志还有一句 `Info: Display device configuration is disabled. Reverting any active display device configuration.` —— 表明 Sunshine 的 display device 管理层未启用，`output_name` 被当作"读到的值"而不是"要强制捕获的输出"。若要让它接管拓扑，需加 `dd_configuration_option = ensure_active`。
- 另一条并存问题：日志显示 `Found H.264 encoder: h264_qsv [quicksync]`，即实际用的是 Intel 核显而非 NVENC；`encoder = nvenc` 写在 conf 里但未生效，怀疑是服务以 SYSTEM 跑在 session 0 看不到 NVIDIA 编码会话。此项未处理。

## 六、虚拟显示器必须由常驻进程持有

- `ParsecVDisplay.exe` 这个 GUI **不记忆虚拟屏**：杀掉进程，显示器立刻消失；重新打开 GUI 也不会自动恢复。所以它不能充当"开机自启 + 常驻扩展屏"的载体。
- 可行做法：让 `parsec-vdd-rust` 的 host 脚本常驻持有，开机重新 add 一次，屏就在。`output_name` 里的 `\\.\DISPLAY29` 编号每次重启都会变，必须每次重算后写回 `sunshine.conf`，不能写死。
- 分辨率仍受限于 0.45 驱动的 `config` IOCTL 失效（详见 `12e010fd`）：逻辑尺寸是 3072×1920，底层 EDID 模式仍是 1920×1080。要 2560×1600 需换 0.41 版本或在 GUI 里手动 `CUSTOM...`。

## 七、相关脚本（均在 `_moonlight/` 下）

| 文件 | 作用 |
|---|---|
| `pvd-host2.ps1` | 常驻持有虚拟屏 |
| `start-pad.ps1` | 拉起 host → 枚举非主屏 → 重写 `output_name` → 重启服务；已定型为可注册成"登录时最高权限运行"的计划任务（尚未安装） |
| `fix-firewall.ps1` | 三件套程序级/端口级入站放行 |
| `reset-pair.ps1` | 清 `named_devices`，保留 `uniqueid` |
| `try-output.ps1` | 改 `output_name` 写法并重启服务、回读新日志 |

## 八、顺序教训

配对（PIN + 路由 + 防火墙 + state 干净）必须先全部打通，再谈 `output_name` / `encoder` / 开机自启。在配对未通时改捕获参数只会得到无法验证的结果。
