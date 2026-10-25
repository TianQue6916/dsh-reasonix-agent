---
id: "ca587aaa-4f88-47d7-800b-656aa8efdfac"
title: "Minecraft 1.21.1 NeoForge 客户端 GC 切换（G1 → 分代 ZGC）：PCL2 VersionRamOptimize 参数控制链、改法与验收判据（2026-10-17）"
description: "D:\\MINECRAFT 上 1.21.1-NeoForge_21.1.236 实例的 JVM GC 调优：PCL2 Setup.ini VersionRamOptimize=1 会在版本 json 参数之后追加 G1 专用参数 ⇒ 换 GC 必须先关该开关；含改动的两处文件与备份、纯插入的字节级验证、验收判据（gc.log Using G1 → Using The Z Garbage Collector）、一键回滚脚本与 ZGC 风险。关联备份脚本 6b3159c7。"
status: "active"
created_at: "2026-10-17T15:27:48.121Z"
updated_at: "2026-10-17T15:27:48.121Z"
content_hash: "e390ca0d15cf8c7a1ffd61fabf61c44997a95d986bf5cd9a41407589e3b57840"
source_paths:
  []
session_ids:
  - "df645f53-2dd6-432a-8c3b-56b0871ce1c3"
memory_body_ids:
  []
---

# Minecraft 1.21.1 NeoForge 客户端 GC 切换（G1 → 分代 ZGC）（2026-10-17）

## 背景与目标

- 用户诉求（原话）：「社区没有能让minecraft充分利用多核性能的方法吗?每次都是单核卡死」⇒ 目标是缓解主线程/GC 造成的卡顿，而非真正让 MC 逻辑多线程化（那不可行）。
- 用户授权原话：「你现在可以进行,不过需要备份和先备份我的存档,保证能回滚」⇒ 先备份、后改动、必须可回滚。
- 结论方向：从 G1 换成 JDK 21 的**分代 ZGC**（`-XX:+UseZGC -XX:+ZGenerational`），并同步修剪 G1 专用参数。

## ★ 关键机制发现：GC 参数既不在版本 json，也不来自启动器 UI 显式配置

1. 版本 json `D:\MINECRAFT\.minecraft\versions\1.21.1-NeoForge_21.1.236\1.21.1-NeoForge_21.1.236.json` 的 `arguments.jvm` 原本 **28 项，一个 `-XX` 都没有**（只有 `-Xlog:gc*:file=C:/Users/27063/mcopt/gc.log:...`、`-Dlog4j2.configurationFile=C:/Users/27063/mcopt/log4j2-quiet.xml` 以及 `--add-opens/--add-exports` 等）。
2. 实际启动命令行（取自 PCL2 日志 `D:\MINECRAFT\PCL\Log1.txt`）在 json 参数**之后**又追加了一整串：
   `-Xmx10240m -XX:+UnlockExperimentalVMOptions -XX:+UseG1GC -XX:G1NewSizePercent=20 -XX:G1ReservePercent=20 -XX:G1HeapRegionSize=32M -XX:MaxGCPauseMillis=50 -XX:+PerfDisableSharedMem -XX:MinHeapFreeRatio=25 -XX:MaxHeapFreeRatio=40`
3. **源头 = `D:\MINECRAFT\.minecraft\versions\1.21.1-NeoForge_21.1.236\PCL\Setup.ini` 的 `VersionRamOptimize:1`**（PCL2「内存优化」开关）。因为顺序在 json 之后，**若直接在 json 里加 `-XX:+UseZGC`，后面的 `-XX:+UseG1GC` 会与之冲突 → JVM 直接启动失败**。⇒ **先关开关，再改 json。**
4. 环境事实（本机）：JDK = `jdk-21.0.6+7`（Microsoft，位于版本目录 `java21\`），非 21.0.1；`gc.log` init 段显示 `CPUs: 32 total, 32 available`、`Memory: 32487M`。21.0.6 是 LTS 补丁版，分代 ZGC 可用但 `-XX:+ZGenerational` 在 JDK 21 仍标记 experimental。

## 改动（两处，均可回滚）

| 文件 | 改动 | 备份 |
|---|---|---|
| `...\1.21.1-NeoForge_21.1.236\PCL\Setup.ini` | `VersionRamOptimize:1` → `0`（其余键位不动） | `Setup.ini.bak-20261017-232449`（386 B） |
| `...\1.21.1-NeoForge_21.1.236\1.21.1-NeoForge_21.1.236.json` | `arguments.jvm` 追加 6 项，**28 → 34** | `1.21.1-NeoForge_21.1.236.json.bak-20261017-232449`（155994 B） |

追加的 6 项：
```
-Xmx10240m
-XX:+UnlockExperimentalVMOptions
-XX:+UseZGC
-XX:+ZGenerational
-XX:+PerfDisableSharedMem
-XX:-OmitStackTraceInFastThrow
```

设计理由（每条都刻意）：
- `-Xmx10240m` 冗余写进 json：关掉 `VersionRamOptimize` 后不确定 PCL2 是否还给 `-Xmx`（不给则默认仅物理内存 1/4 ≈ 8 GB），故保底；PCL2 若再给同量级值无副作用。
- G1 专用参数（`G1HeapRegionSize` / `MaxGCPauseMillis` / `Min-`/`MaxHeapFreeRatio`）**全部不保留**：与 ZGC 不兼容，留着只刷警告；ZGC 用 ZPage 自管理，无 region 概念。
- 保留 `-XX:+UnlockExperimentalVMOptions`：JDK 21 中 `-XX:+ZGenerational` 仍 experimental，去掉会启动失败。
- 补回 `-XX:+PerfDisableSharedMem`、`-XX:-OmitStackTraceInFastThrow`：原本由 PCL2 开关提供，关开关后会消失，但二者对本机有益（前者免 `hsperfdata` mmap I/O，后者让重复异常打全栈）。

## 改动方法与验证证据

脚本 `C:\Users\27063\mcopt\switch-gc-to-zgc.ps1`，日志 `C:\Users\27063\.dsh\logs\switch-gc-to-zgc.log`（末尾 `RESULT: ok=True`），脚本自带失败自动回滚。

改前确认与写入校验：
```
PCL running = False / java running = False
json: needle occurrences = 1            ← 插入锚点唯一
json: indent = 34 spaces, EOL = CRLF    ← 复用原行自身格式
json: length 155994 -> 156354 (delta 360)
verify: JSON PARSE OK, arguments.jvm count = 34
```
字节级 diff 证明是**纯插入**（未碰任何现有字节，`${natives_directory}`/`${classpath}` 占位符原封不动）：
```
first divergence at byte 11715
common prefix len 11715 | old tail len 0 | new tail len 0
TAIL EQUAL: True
```

存档备份（改 JVM 参数物理上不触碰存档，备份目的是提供可回滚快照点）：源 `...\saves\机械动力`（27.06 GB）→ 目标 `D:\MINECRAFT\_backup\saves-机械动力-20261017\`，robocopy `/MT:16` 耗时 27 秒，src/dst 均 **15480 files / 29,055,925,733 bytes**、`MATCH=True`、`exit=1`（0–7 视为成功）；日志 `C:\Users\27063\.dsh\logs\backup-saves.log`。回滚 = 整目录覆盖回 `saves\机械动力`。注意 `saves` 下另有 `新的世界`（21.6 MB）与 `新的世界 (1)`（15.9 MB）**未**备份。此前的通用备份脚本见文档 6b3159c7（`D:\MCBackup\backup-mc.ps1`）。

## 验收判据（改动后待核，本条为开放式）

1. `C:\Users\27063\mcopt\gc.log` 中 `Using G1` → **`Using The Z Garbage Collector`**（最锋利判据；改前基线为 `[2026-10-17T22:45:18.817+0800][0.018s][info][gc] Using G1`）。
2. `D:\MINECRAFT\PCL\Log1.txt` 完整命令行不再含 `-XX:+UseG1GC` / `G1HeapRegionSize` / `MaxGCPauseMillis`，出现 `-XX:+UseZGC -XX:+ZGenerational`。
3. 进世界后 `/spark tps` 观察是否有 GC 引起的 tick 尖峰；A/B 只认 gc.log + spark，不凭手感。

## 回滚与风险

- 一键回滚（先关闭 PCL2 与游戏）：
  `powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\27063\mcopt\rollback-gc.ps1`
- ZGC 额外占用物理内存（染色指针多重映射 + 并发 GC 线程）；堆 10 GB / 物理 32 GB 尚可，若出现明显 swap 或更卡立即回滚。
- 分代 ZGC 在 JDK 21 为 experimental（故保留 `UnlockExperimentalVMOptions`）；首次启动可能多等几秒属正常。
- 该 27 GB 存档备份是「2026-10-17 23:22 的干净快照点」，之后的大工程会让它过时。
