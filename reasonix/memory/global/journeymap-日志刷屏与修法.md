---
id: mem-85760161d73a8ae444e256fc95bee725
revision: 1
created_at: "2026-10-28T18:02:57.460Z"
updated_at: "2026-10-28T18:02:57.460Z"
name: journeymap-日志刷屏与修法
description: "MC 里 JourneyMap 6.0.9 的 VanillaBlockSpriteProxy DEBUG 刷屏导致 5 MB/s 持续写盘：症状、证伪 logLevel、有效修法、对账与两个测量陷阱"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 症状

Minecraft 运行时磁盘写入恒定 **5.17 MB/s**（≈18.6 GB/h），停不掉、也没崩。定位后确认元凶是**单个日志文件**，不是存档、不是 DH 数据库。

## 病灶

`D:\50-游戏\MINECRAFT\.minecraft\versions\1.21.1-NeoForge_21.1.236\journeymap\journeymap.log`

| 会话 | 时长 | 写入 | 速率 |
|---|---|---|---|
| 2026-10-10 18:27:06 → 20:32:35 | 2.09 h | **25.55 GiB** | 13.1 GB/h |
| 2026-10-12 00:51:22 → 01:40:31 | 0.82 h | 127,596 B | 43 B/s |
| 2026-10-23 22:18:11 → 23:32:43（世界加载） | 1.24 h | **946.82 MiB** | 222 KB/s |

**⇒ 速率完全取决于「是否在采色/加载区块」，不是恒定值。** 5.17 MB/s 是「探索中」的值。

## 刷屏内容模板（每行 ~700–1000 B，四个 offset 处完全同构）

```
[18:28:03] [JM-task-2/DEBUG] [VanillaBlockSpriteProxy] Success during
[RenderType[solid:CompositeState[[texture[Optional[minecraft:textures/atlas/blocks.png]...]]]]
class com.simibubi.create.content.fluids.PipeAttachmentModel.getQuads(
  Block{create:fluid_pipe}[down=false,east=true,...], null, 0)
```

出现的 Create 类：`PipeAttachmentModel.getQuads` / `foundation.block.connected.CTModel.getQuads` / `content.fluids.tank.FluidTankModel.getQuads`。
**⇒ 只有 Create（机械动力）的自定义模型触发。**

## 日志行结构（`journeymap/client/log/JMLogger.class` 常量池）

```
"[%d{HH:mm:ss}] [%t/%level] [%C{1}] %msg%n"
"journeymap-logfile"
org/apache/logging/log4j/core/appender/RandomAccessFileAppender
```

⇒ `[22:22:50] [Render thread/DEBUG] [TaskController]` 里 **`Render thread` 是线程名（`%t`）、`DEBUG` 是事件级别、`TaskController` 才是 logger 名（`%C{1}`）**。别把线程名当 logger 名。

## ⚠️ `logLevel` 改不动它（实测证伪）

把 `journeymap/config/6.0/journeymap.core.config` 的 `"logLevel": "INFO"` 改成 `"ERROR"` 后重开 MC（新会话，config 已是 ERROR），对日志末 20 MB 做级别直方图：

```
  40257  DEBUG  VanillaBlockSpriteProxy    ← ERROR 级别下仍在写 DEBUG
     72  DEBUG  TaskController
     15  DEBUG  ImageHolder
      1  DEBUG  StatTimer
```

而且 JourneyMap 自己会**把 config 回写**把 `logLevel` 改回 `INFO`（实测 config mtime 与游戏内设置界面操作同刻）。
⇒ **`JMLogger` 的 `logLevel` gate 与 log4j2 的 root appender 没接上，是 JourneyMap 6.0.9 的 bug，不是配置问题。**

## 真正有效的修法

`journeymap.core.config` 里两个 bool 一起改：

```json
"mappingEnabled": "false",
"dataCachingEnabled": "false"
```

效果（10-11 实测，MC 全程开着）：

```
10-10（地图开）  13.1 GB/h
10-11（地图关）  0.0019 GB/h      →  约 7,000 倍
```

10-11 那天 MC 开了 5.02 h，日志只写 8.96 MiB；10-10 开 2.09 h 写了 25.55 GiB。

**注意**：`mappingEnabled=false` 只是关掉「持续采色」，**世界加载时仍会爆发**（10-23 那 946.82 MiB）。如果频繁加载新区块，这块还会涨。

## 对账方法（判断某天写入归因）

```
10-10 全天 NAND 写入  ≈ 82 GB
其中 journeymap.log    28.1 GB host ≈ 30.2 GB NAND（37%）
10-11 全天 NAND 写入  ≈ 51 GB
差 31 GB ≈ 正是关掉地图省下的量
```

**⇒ 差值与日志量闭合（误差 3%），说明没有第二个隐藏元凶。**

## 其他一并排除过的项

| 目标 | 实测 | 结论 |
|---|---|---|
| dsh 树（`~/.dsh` + `~/.dsh-lab`） | 62 B/s = 5.1 MB/天；`host-stdio.log` 实测 21 B/s | 排除 |
| 火绒 `C:\ProgramData\Huorong\Sysdiag\` | 66 MB / 102 min = 11 KB/s | 排除 |
| `WebCacheV01.dat` | 6 次采样逐字节不变 | 排除 |
| WSL / Docker `ext4.vhdx` | 不存在 | 排除 |
| JourneyMap `data\` 目录 | 79,926 files / 10.58 GB，84 天累积 ⇒ 日均 0.12 GiB | 量级差百倍，不是病灶 |
| `DistantHorizons.sqlite` | 10.98 GB 是**历史存量**，每次原地重写但 WAL 恒 6.2 MB | 不是流量主因 |

## 两个方法论陷阱（务必记住）

1. **`\Process(*)\IO Write Bytes/sec` 不能用来定位落盘写** —— 它统计的是 write syscall 字节，含管道/控制台/网络。实测 `deepseek harness` 恒定 17–19 MB/s，同期 `\PhysicalDisk(_Total)\Disk Write` 只有 0.008–0.638 MB/s。而且它会把同一 pipe 两端都记上（曾见 `procW ≈ procR` 逐字节对称）。**唯一可靠路径 = `\PhysicalDisk` + 文件树差分。**
2. **dsh 工具树在 Low IL 下 `Get-Process` 看不到 java/PCL/火绒** —— 曾据此误判「MC 没在跑、写入无归属」。用 `handle64.exe`（需 `SeDebugPrivilege`，非提权报 `Error obtaining handle information: Access denied`）提权后才看到 `java.exe PID 19068` 持有全部 DH/JourneyMap/region 句柄。**任何需要看全进程的观测必须提权。**
