---
id: "a997109d-3451-42fb-985d-501a35fa4990"
title: "ParsecVDD 0.45 二次自崩（DriverError）后的 0.41 决策与 ParsecVDD 工具箱 watchdog 方案（2026-10-25 夜）"
description: "平板扩展屏验收通过后的续篇：ParsecVDD 0.45 驱动在无人干预下从正常变为 DriverError（不同于此前的 NotInstalled），引出换 0.41 Stable 的决策；以及把「双击 pvd-host.cmd」的手工流程工具化为 C:\\Users\\27063\\Toolbox\\ParsecVDD\\（vdd.ps1 五 action + watchdog + install-to-toolbox.cmd），含 D 盘/启动文件夹只读、双 host 抢屏、0.41 与 rust CLI IOCTL 版本可能不兼容等约束。前置 a78ca4cd、70b6a9ef、673cddda。"
status: "active"
created_at: "2026-10-26T13:05:04.490Z"
updated_at: "2026-10-26T13:05:04.490Z"
content_hash: "f95e477a1b1cffa0038a741a5a5984e4f01fd93764f09663e27603360e9ff247"
source_paths:
  - "Toolbox/ParsecVDD/vdd.ps1"
  - "Toolbox/ParsecVDD/Start-VDD.cmd"
  - "Toolbox/ParsecVDD/Status.cmd"
  - "Toolbox/ParsecVDD/install-to-toolbox.cmd"
  - "_moonlight/repair-vdd.bat"
  - "_moonlight/upgrade-vdd-041.bat"
  - "_moonlight/pvd-host.cmd"
  - "_moonlight/setup-autostart.bat"
session_ids:
  - "dfc882b4-d6b9-4bed-bf76-206ac79ff303"
memory_body_ids:
  []
---

# ParsecVDD 0.45 二次自崩与工具箱化（2026-10-25 夜）

项目：华为 MatePad 当 Windows 笔记本真实扩展屏（ParsecVDD → Sunshine → LAN → Moonlight）。
关系：本文是 `a78ca4cd-460d-47bb-b1de-8a1658fff137`（端到端验收定论）的续篇；抓屏代码级结论见
`70b6a9ef-b017-4d02-8c0c-dd7d98a0e9a0`，WebUI 选屏入口与社区证据见 `673cddda-ff72-4efd-a405-c4b5aa42fd4a`。
本文只记录验收**之后**发生的新事实，不重复前三篇已确立的定论。

## D 定论

1. **ParsecVDD 0.45 在本机有两种不同的失效姿态，不止一种。**
   - 此前：`Parsec VDD device is not OK, got status NotInstalled.`（重跑安装器即恢复）。
   - 本次：`Parsec VDD device is not OK, got status DriverError.`，同时设备节点
     `Parsec Virtual Display Adapter | Error | ROOT\DISPLAY\0003`（此前为 `OK`）。
   - 触发条件：**用户尚未重启电脑**，驱动与虚拟屏在无人操作的情况下自行失效；
     启动文件夹里的 `ParsecVDD-Host.cmd` 仍在（`startup file: True`），host 进程数 0，
     屏回落成只有主屏 `\\.\DISPLAY1`。→ 结论：问题不在自启逻辑，而在 0.45 驱动本身。
2. **版本策略改为「0.41 优先」。** 依据是该驱动 README 的自述：0.45 是
   "Better streaming color, but may not work on some Windows"，0.41 被标为 Stable。
   0.41 对应 rust CLI 的 v1.4 接口，0.45 对应 v1.5。
3. **手工双击流程被判定为不可接受，转为工具化 + 常驻 watchdog。** 用户原话诉求：
   「好是好了,流程好麻烦,都改成开机自动配置算了」「那你给我写一个程序,启动程序,放到这个工具箱里面」。

## M 机制：工具箱的结构与 action 语义

落地目录 `C:\Users\27063\Toolbox\ParsecVDD\`（`vdd.ps1` 语法已校验，7209 bytes）：

| 文件 | 作用 |
|---|---|
| `vdd.ps1` | 核心脚本，五个 action 见下 |
| `Start-VDD.cmd` | 双击启动（脚本内自动提权） |
| `Status.cmd` | 只查状态，免提权 |
| `install-to-toolbox.cmd` | 一键复制到 `D:\Toolbox\ParsecVDD\`，并在启动文件夹装 watchdog |

`vdd.ps1` 的 action：
- `status`：只打印五段状态（驱动 / API / host / 虚拟屏 / Sunshine），不做任何变更。
- `start`：驱动异常时先自愈——`pnputil /restart-device` → 失败则重装 0.41 → 再退到 0.45；
  然后拉 host，缺屏则重建。
- `stop`：停 host（虚拟屏随之消失，这是生命周期绑定的必然结果）。
- `repair`：强制重装驱动 + 重建屏。
- `watch`：**守护模式**，每 30 s 自检一次，遇到「驱动 Error / host 死 / 虚拟屏消失」自动修复，
  日志按天落到 `logs\`。

设计要点：`install-to-toolbox.cmd` 会**替换掉旧的那个单发 `ParsecVDD-Host.cmd` 启动项**，
因为两个 host 同时持有 VDD 会互相抢屏。

## J 判据

- 判断「屏没了」不要只看设备管理器：设备管理器显示 OK 也可能是 `NotInstalled`；要以
  `parsec-vdd-rust` 的 API 输出（`Parsec VDD is ready.` vs `status NotInstalled / DriverError`）为准。
- 判断「自启是否坏」看三件事是否同时成立：启动项文件在（`startup file: True`）、host 进程数 ≥ 1、
  显示器列表里出现非 primary 的第二块屏。本次是「启动项在 + 进程 0 + 只有主屏」，故锁定驱动侧。
- 虚拟屏存在性检查只在**同一个进程生命周期内**有效；跨命令再查必然看不到（进程树被回收）。

## X 反例（本段路径上不要重复的错）

- 连续在 0.45 上「重启设备 / 重跑安装器」不是长久解，第二次失效换了个错误码（`DriverError`）。
- 不要把 `parsec-vdd-rust.exe` 直接配给 0.41 就当能用：该 CLI 是社区工具，IOCTL 常量按特定驱动版本写死，
  0.41 若报 `Unsupported version` 一类字样，要改用同目录的 `ParsecVDisplay.exe`（C# GUI，兼容
  0.38/0.41/0.45）手动点一次 ADD DISPLAY。
- 不要从 tool 进程里尝试创建需要常驻的 host，也不要尝试写 `D:\Toolbox`、启动文件夹、HKCU——
  实测 `Access to the path 'D:\Toolbox\ParsecVDD' is denied.`，这三处对本进程只读。

## R 复现：从崩溃到可用

1. `vdd.ps1 status` 确认三段：驱动 API 文本 → host 进程数 → 显示器列表。
2. 若为 `DriverError`/`NotInstalled`：管理员运行 `repair-vdd.bat`（`pnputil` 重启设备），
   仍失败则右键管理员运行 `upgrade-vdd-041.bat`（装 0.41 → 打印设备状态应从 `Error` 变回 `OK`
   → 起 host → 打印显示器列表 → 贴 host 日志尾部）。
3. 出现两行显示器（其中一行 `primary=False`）即视为屏回来了，平板重连即可。
4. 长期解：`install-to-toolbox.cmd` → watchdog 每 30 s 自守。

## 观测到的分辨率漂移

`\\.\DISPLAY42` 在同一晚出现 `1920x1080` 与 `2194x1371` 两种逻辑值（后者出现在 watchdog/host
稳定常驻之后）。仍不等于平板原生 2560×1600；`parsec-vdd` 0.45 的 `config` 对本机任意分辨率都返回
`Failed to configure display`。**不要**再试 `dd_manual_resolution = 3072x1920` 这类超出 EDID 能力的值——
上一次正是这样把驱动搞掉线，制造出一串 "Device not available" 假象。

## 存疑 / 待验证

- 0.41 驱动是否真能装成功并让 rust CLI 建屏成功：本段结束时只确认「0.41 下载完成（0.21 MB，
  落在 `_moonlight\pvd\`）」，升级脚本已写、未见执行结果。
- watchdog 能否在用户会话登录前后都稳定拉起 host（启动项属登录时触发，非开机时）——需重启后验收。
- Moonlight 侧 `Touch mode` 从 Trackpad 改 Direct touch 已告知用户，仍未见确认。
- ExtensoDesk 仍待卸载，顺序：停服务 → 卸驱动 → 重启 → 清 `EDWPDFilter.sys`。

（本文刻意不含 Sunshine Web UI 凭据；需要时去机器上查，不要写进文档。）
