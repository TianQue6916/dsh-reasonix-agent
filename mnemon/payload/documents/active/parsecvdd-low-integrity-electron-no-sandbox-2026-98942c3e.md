---
id: "98942c3e-781e-43e4-a52a-58dd3cf47819"
title: "桌面 ParsecVDD 开关工具箱落地：Low Integrity 定层（Electron --no-sandbox）与「关屏只能重启设备节点」约束（2026-10-26）"
description: "ParsecVDD 虚拟屏从「手工 host 脚本」收敛为用户可自行开关的五入口工具箱（开/关/状态/自启安装/卸载）；含两条硬约束取证：dsh 的 bash 继承 Low Integrity 写入受限（进程树追到 Electron --no-sandbox，非 dsh 自身沙箱，靠目录降 IL 绕过），以及 0.45 remove 命令无效导致「关」必须走 pnputil /restart-device + UAC。源路径 D:\\Desktop\\工具箱\\ParsecVDD；前置 a997109d、12e010fd、ccd960b3。"
status: "active"
created_at: "2026-10-26T14:37:47.505Z"
updated_at: "2026-10-26T14:37:47.505Z"
content_hash: "f6a274a73d0b011f7ee7ea9d1cf48660a5d93aa1b2d69419155f80c7695196c4"
source_paths:
  - "_moonlight/pvd-host2.log"
  - "_moonlight/SOLUTION.md"
session_ids:
  - "67e5cd89-d700-4ffe-b111-b905aaf7db5b"
memory_body_ids:
  []
---

# 桌面 ParsecVDD 开关工具箱落地（2026-10-26）

项目：华为 MatePad 当 Windows 笔记本真实扩展屏（ParsecVDD → Sunshine → LAN → Moonlight）。
本阶段性质：把「反复调试的脚本堆」收敛成**用户自己双击就能决定开关**的固定入口，并补上开机自启。
关系：承接 `a997109d-3451-42fb-985d-501a35fa4990`（0.45 DriverError → 0.41 决策 + watchdog 方案）、
`12e010fd-adbd-494b-ad86-23cd9bb69f89`（0.45 config IOCTL 失效与常驻持有）、
`ccd960b3-9287-4531-b3a1-54f41cb8d2c3`（present 未进拓扑）。本文只记本阶段新增结论。

## 1. 用户诉求（原文）

> 「我只是让你做一个我能自由决定开关的入口,然后加上开机自启」

判据：交付物必须满足**用户不依赖 agent、不读文档即可操作**——双击开、双击关、看状态、装/卸自启。
凡是需要 agent 在场执行的步骤都不算交付。

## 2. 最终交付形态（定论）

落点 `D:\Desktop\工具箱\ParsecVDD\`（桌面工具箱成为唯一主线，`D:\Toolbox\ParsecVDD\` 旧副本降为备份）：

```
host.ps1            常驻 daemon：拉起 parsec-vdd-rust.exe，add 一块屏，持有子进程句柄
toggle.ps1          开/关/状态 的实现
parsec-vdd-rust.exe  随包
开扩展屏.cmd        双击 → 开
关扩展屏.cmd        双击 → 关（会弹一次 UAC）
状态.cmd            看当前开没开 + 枚举扩展屏
开机自启-安装.cmd    右键管理员 → 启动文件夹写 扩展屏自启.cmd
开机自启-卸载.cmd    右键管理员 → 删自启项，并清掉残留的 ParsecVDD-Watchdog.cmd
logs\
```

- **开**：只起 daemon，不需要管理员。虚拟屏生命周期绑持有进程（见 `12e010fd`），daemon 不死屏就在。
- **关**：停 daemon + 重启 VDD 设备节点清屏，**需要管理员**。
- 自启项被改指到桌面这份；旧 `ParsecVDD-Watchdog.cmd` 指 `D:\Toolbox\`，不删会双 daemon 抢屏，故卸载脚本顺手清掉。

## 3. 硬约束一：dsh 的 bash 跑在 Low Integrity（定层到 Electron `--no-sandbox`）

**症状**：`Set-Content D:\Desktop\工具箱\_wtest.txt` 报 Access denied；启动文件夹同样写不了；
`pnputil /restart-device` 报 `Access is denied`；而用户自己双击同样的 cmd 一切正常。

**取证**：
- `whoami /groups` → `Mandatory Label\Low Mandatory Level  S-1-16-4096`（不是 Medium）。
- 进程树：`DeepSeek Harness.exe --no-sandbox`（PID 27752，主进程）
  → `DeepSeek Harness.exe ... dsh-desktop-host\lib\index.js`（PID 2848）
  → `node.exe`（28996 / 31140）← agent 的 bash 在这里。
- `custom-bash.mjs` 里「No sandbox confinement on Windows」这句**是对的**：dsh 自己没做沙箱限制。

**结论**：降 IL 发生在 Electron 层——`--no-sandbox` 让整棵 dsh 进程树跑在 Low Integrity，agent 只是继承。
所以这不是 dsh 的配置项，配置里也确实没有开关；这也解释了为什么 `pnputil`、UAC 自提权在 agent 手里不稳定。

**采用的解法（绕过，不动 `--no-sandbox`）**：给 `D:\Desktop\工具箱` 加 Low integrity label。
该目录 ACL 本就给了 `Authenticated Users:(M)`，缺的只是标签这一层；标签降下来后 Low 进程即可写入。
是否去掉 `--no-sandbox` 留给用户决定（有恢复 Medium 的收益，也有 Electron on Windows 的未知副作用）。

**存疑**：`--no-sandbox` → 全进程树 Low IL 的因果是 agent 的解读，不是官方文档结论。
可观测事实只有两条：进程树里带着 `--no-sandbox`、当前 integrity 为 Low。要复现验证需去掉该参数再测 `whoami /groups`。

## 4. 硬约束二：「关」无法靠 remove 命令行完成（定论）

- `parsec-vdd-rust remove -i 0` **命令确实发出去了**（`logs\host.log` 可见 `> remove -i 0`），但屏不消失——0.45 驱动的 remove 有 bug。
- `parsec-vdd-rust get` 恒返回 `No added virtual displays.`，看不见实际存在的屏，所以无法按 index 精确摘除。
- `DisplaySwitch.exe /internal` 无效：它管不到 IDD 驱动层的虚拟屏。
- `pnputil /restart-device "ROOT\DISPLAY\0003"` 有效（整批清空），但必须管理员。

⇒ 最终「关」= 停 daemon + `pnputil /restart-device`，代价是每次一次 UAC。
这也意味着反复 `add` 会累积残留屏（实测攒到 `DISPLAY75/76/77/78` 四块虚拟屏 + 笔记本共 5 块），只能靠重启设备节点一次性清零。

## 5. 其它可复用的实测细节

- `config -i <n> -s WxH -r <hz>` 在该版本**不生效**（与 `12e010fd` 结论一致），但 `add` 会按 EDID 默认档建屏；实测出过 1920×1080、2048×1280、2560×1600 不同档位，说明尺寸由驱动上报默认值决定而非命令行。
- 1920×1080 是"尺寸对了"的验收档：`\\.\DISPLAY76 1920x1080 primary=False` 即成功。
- `parsec-vdd-rust` 是交互式 CLI：单次调用后进程退出即可能连带丢屏，所以 daemon 必须**持有 stdin 并保持进程存活**（`RedirectStandardInput` + `while (-not $p.HasExited)`）。
- 状态判读一行流：`驱动设备 = OK` + `VDD API ready` + `显示器数 ≥ 2` + `Sunshine Running` ⇒ 平板可直接连 Moonlight。

## 6. 交付后遗留

- 启动文件夹旧 `ParsecVDD-Watchdog.cmd` 需卸载脚本清理（双 daemon 抢屏是真实风险，已有前科，见 `a997109d`）。
- 平板实连验收（画面/分辨率/延迟）由用户完成，未在 agent 侧闭环。
- 若 `--no-sandbox` 后续被去掉，目录 Low IL 标签的 workaround 应重新评估是否还需要。

## 溯源

桌面工具箱 `D:\Desktop\工具箱\ParsecVDD\`（不在 workspace 内，故不列入 sourcePaths）；
`_moonlight/pvd-host2.log`、`_moonlight/pvd/parsec-vdd-rust.exe` 为早期 host 方案残留。
