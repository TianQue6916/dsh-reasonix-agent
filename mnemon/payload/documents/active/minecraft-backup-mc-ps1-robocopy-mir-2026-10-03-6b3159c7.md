---
id: "6b3159c7-02bf-4a40-8eaa-438b011f2414"
title: "Minecraft 存档备份脚本 backup-mc.ps1：robocopy /MIR 镜像设计、防呆守卫与解析坑（2026-10-03）"
description: "D:\\MCBackup\\backup-mc.ps1 的设计与实测：单元清单（saves 27.089GB + instance 0.30GB，合计 15,732 文件 / 27.362GB）、五类防呆守卫及其防的事故、robocopy「Bytes 人类可读单位」与列索引解析 bug、DryRun/Verify/Archive 用法、D 盘空间账与「C/D 同物理盘可防/不可防」边界。关联 PCL2 撑爆 C 盘诊断 422e3c22。"
status: "active"
created_at: "2026-10-03T15:59:39.994Z"
updated_at: "2026-10-03T15:59:39.994Z"
content_hash: "da39f8eeba410cfa24c02351ab1dcf24dc0c9934ef06df50354da213662b9fd4"
source_paths:
  []
session_ids:
  - "fc403f77-7ec0-40c2-9963-9c530cfe4057"
memory_body_ids:
  []
---

# Minecraft 存档备份脚本 backup-mc.ps1（2026-10-03）

## 背景与目标

用户清理完 C 盘（PCL2 导出把 `C:\...\Temp\PCL\TaskTemp` 撑到 27.7 GB 的事故，诊断见文档 `422e3c22-e6e8-4238-890a-e99d12534c5c`）后问「那我怎么备份」，并从候选中选 **D：做脚本化镜像备份**。目标是把 27 GB 级的 NeoForge 1.21.1 实例从 `D:\MINECRAFT` 镜像到 `D:\MCBackup`，替代此前手工版本化的习惯。

## 脚本与模式

脚本：`D:\MCBackup\backup-mc.ps1`（PowerShell 5.1，最终 13,407 B，`PARSE_OK` / 非 ASCII 0 / 无 BOM）。

```powershell
cd D:\MCBackup
.\backup-mc.ps1 -DryRun              # 预演，只读（robocopy /L）
.\backup-mc.ps1                      # 实跑增量镜像
.\backup-mc.ps1 -Verify              # 复跑 /L，断言 copied=0 && extras=0 && failed=0
.\backup-mc.ps1 -Archive             # 镜像后打 7z 归档（默认排除 LOD sqlite）
.\backup-mc.ps1 -Archive -KeepLod    # 归档含 sqlite
```

被备份实例：`D:\MINECRAFT\.minecraft\versions\1.21.1-NeoForge_21.1.236`，备份根：`D:\MCBackup`。
产出布局：`saves\`（27.09 GB）/ `instance\`（0.30 GB，含 mods+config+resourcepacks+shaderpacks+schematics+`options.txt`+`servers.dat`）/ `logs\`（每单元 robocopy 全量日志）/ `manifest_<stamp>.json`（逐单元 source/dest/exit/计数）/ `_archive\`。

## 备份单元与实测预演数据（`-DryRun`，未写盘）

| 单元 | files | copied | extras | failed | exit |
|---|---|---|---|---|---|
| `saves\` | 15,513 | 15,513 | 0 | 0 | 1 |
| `mods\` | 72 | 72 | 0 | 0 | 1 |
| `config\` | 109 | 109 | 0 | 0 | 1 |
| `resourcepacks\` | 6 | 6 | 0 | 0 | 1 |
| `shaderpacks\` | 3 | 3 | 0 | 0 | 1 |
| `schematics\` | 29 | 29 | 0 | 0 | 1 |
| `defaultconfigs\` | 0 | 0 | 0 | 0 | 0 |
| **合计** | **15,732** | **15,732** | 0 | 0 | — |

**27.362 GB**，另加散装文件 `options.txt`、`servers.dat`。
三个世界：`机械动力`、`新的世界`、`新的世界 (1)`。

**故意排除**：`journeymap\`（10.3 GB，可重建）、`backups\`（16.5 GB 旧假备份）、`logs\`、`java21\`、`cache\`、`CrashReports\`、两个旧 zip。

## 防呆守卫（设计理由，含 why）

| 机制 | 防的事故 |
|---|---|
| `$Instance` / `$BackupRoot` **硬编码在脚本内，不接受命令行传入** | `/MIR` 参数颠倒 ⇒ 把源掏空。robocopy 最经典的自毁方式 |
| 启动即查 `java`/`javaw` 进程数，非 0 直接 throw | 热拷撕裂 region；`DistantHorizons.sqlite` 带 WAL，热拷必坏 |
| 四条路径守卫：源存在 / 目标在 D: / 目标非嵌套于源 / 源非嵌套于目标 | 上一条的兜底 |
| `/MIR` 安全阀：目标端 extras > 100 时**中止**，需 `-Force` 才放行 | `/MIR` = `/E` + `/PURGE`，会删目标端多余文件；源被改坏后第一次镜像会把备份一起抹掉 |
| 退出码按 `>= 8` 判失败 | robocopy 0/1/2/3 全是成功；写 `-ne 0` 会把正常备份误判为失败 |

## robocopy 解析坑（两个真实 bug）

1. `Bytes :  27.089 g` —— robocopy 在体积大时输出**人类可读单位**，直接 `[int64]` 解析炸在 `Cannot convert value "g" to type "System.Int64"`。修法：加 `/BYTES`（强制字节数）+ `ConvertFrom-RoboSize` 双保险。
2. 列索引数错：FAILED 是**第 5 列（index 4）**，不是 index 3；最初版本把 copies/FAILED 取错列。修后 `Measure-Object -Property filesTotal` 缺属性导致的 `filesTotal cannot be found` 报错也随之消失。

## 验证链（跑完必须做）

```powershell
.\backup-mc.ps1 -Verify        # 期望 [PASS] mirror is identical to source
Get-FileHash 'D:\MINECRAFT\.minecraft\versions\1.21.1-NeoForge_21.1.236\saves\机械动力\level.dat'
Get-FileHash 'D:\MCBackup\saves\机械动力\level.dat'   # 两个 SHA256 必须逐字相同
```

## 空间账与保留策略

D 盘当时 `free=103.83 GB / size=652.87 GB`（C: `free=70.69 GB / size=300.01 GB`）。

| 项 | 占用 | 事后剩余 |
|---|---|---|
| 镜像 saves + instance | 27.36 GB | ~76.5 GB |
| `-Archive`（排除 LOD sqlite，`-mx=3`） | 估 13–15 GB | ~62 GB |

保留策略：1 份镜像 + 1 份里程碑归档，**不做**每天一份 27 GB 快照。`D:\存档\` 下 `2025-2026寒假存档12 → 26` 的手工版本化习惯（15 份、1,151 文件、1,679,150,287 B ≈ 1.56 GB）之所以可行，是因为当时世界只有几百 MB；27 GB 规模必须换策略。归档产物丢一份到网盘（机器上有 123pan / 百度 / 夸克 / 迅雷云盘客户端）才凑齐 3-2-1 的「异地」。

## 边界（必须说清）

C 和 D 是同一块 `KINGSTON OM8TAP41024K1-A00` NVMe 的两个分区。这套备份**能防**：误删世界、误改 config、mod 更新炸档、MC 崩溃写坏 region、手贱覆盖存档、回滚到时间点。**防不了**：SSD 挂掉、分区表损坏、整机丢失、勒索软件 —— 这些场景 C 和 D 一起没。

## 环境事实

- `7z` 不在 PATH；实际在 `D:\7-Zip\7z.exe`（同目录有 `7zG.exe`、`7z.dll`、`7z.sfx`），`C:\Program Files\7-Zip\7z.exe` 不存在。
- `tar` = Windows bsdtar `C:\Git\usr\bin\tar.exe`。
- PowerShell `5.1.26100.9549`，**无 `pwsh`**；`python` = `C:\Users\27063\AppData\Local\Programs\Python\Python313\python.exe`；代码页 65001。
- 用 bash here-doc 内嵌 Python 生成 PowerShell 脚本会踩 `unterminated triple-quoted string literal` —— 改用直接写文件的方式生成。

## 遗留待办

1. 是否实跑实备份 + 立即 `-Verify`（预演干净、extras=0、无需 `-Force`、java 进程 0；27 GB 同盘复制预计 2–6 分钟）。
2. D 盘 37 GB 旧假备份的处置（`backups\manual-20260913` 16.08 GB、两个 zip 19.9 GB、`journeymap\data` 10.3 GB）—— 新镜像验证通过后哪些可删。
3. 治本项：把用户级 `TEMP`/`TMP` 改到 D 盘，或给 `D:\Temp\PCL` 做 junction，从根上避免 PCL 导出再炸 C 盘。
