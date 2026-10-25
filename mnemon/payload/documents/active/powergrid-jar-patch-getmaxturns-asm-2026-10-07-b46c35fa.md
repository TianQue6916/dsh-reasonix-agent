---
id: "b46c35fa-40e8-464f-b4ac-503d58f165ee"
title: "PowerGrid 变压器匝数上限 jar patch：getMaxTurns 唯一来源、ASM 重写偏移重算与验证链（2026-10-07）"
description: "Minecraft 1.21.1 整合包内 [机械动力：交错电网] powergrid-mc1.21.1-0.6.2.jar 的变压器匝数上限修改：getMaxTurns() 是 GUI 与取值唯一来源、Small/Medium <init> 字节码定位（bipush 60 / sipush 240 @offset 2）、用 ASM 9.10.1 重写而非手工改二进制的原因、patcher 与提权安装脚本路径、完整验证链、备份与回滚方式，以及 GUI 精调退化与 N² 电感跨 11 个数量级的实测风险边界。"
status: "active"
created_at: "2026-10-06T16:28:29.271Z"
updated_at: "2026-10-06T16:28:29.271Z"
content_hash: "10898d17d029762be4e55294fc3c673a5349772913778cf69acd2f9fb67d6be7"
source_paths:
  - "mcopt/PatchTfMax.java"
  - "mcopt/install-pgpatch.ps1"
session_ids:
  - "2627826e-b22e-4afc-935b-a16eb9dd0c31"
memory_body_ids:
  []
---

# PowerGrid 变压器匝数上限 jar patch（2026-10-07）

对 Minecraft 1.21.1 整合包内 `[机械动力：交错电网] powergrid-mc1.21.1-0.6.2.jar` 的变压器匝数上限做二进制改写：Small `60 → 32767`、Medium `240 → 32767`。同一环境的相关取证见 d43e5f2d（tick 掉帧）与 df1aaf62（NeoForge 升级）。

## 关键发现：上限只有一个来源

`TransformerWindingScreen.makeBoard(TransformerBlock)` 的字节码显示 `getMaxTurns()` 直接充当值选择板的 `maxValue`：

```java
new ValueSettingsBoard(
    Lang.translateDirect("gui.transformer.turns"),
    block.getMaxTurns(),   // ← maxValue
    10,                    // ← rowStepSize
    List.of(Component.literal("N")),
    new ValueSettingsFormatter(...)
)
```

- `TransformerWindingScreen.<init>` 里 `cap = getMaxTurns() - arg4`，`getClosestCoordinate` 用 `cap` 截断拖出的值 ⇒ GUI 上限、截断阈值、实际接受值三者同源。
- `getMaxTurns()` 全 jar 调用点只有 2 处：`TransformerBlock` 自身 + `TransformerWindingScreen`。改动面天然收敛。
- 上限由子类 `<init>` 透传给 `TransformerBlock.<init>(Properties, int)`：`TransformerSmallBlock` 用 `bipush 60`，`TransformerMediumBlock` 用 `sipush 240`，两者都落在方法内 **offset 2，且方法内无分支指令** ⇒ patch 目标唯一可锚定。
- `NetherTransformerBlock` **不继承 `TransformerBlock`**（走 UUID 配对 + `SplitTransformerControllerWire`），没有匝数概念，未改动。

## 为什么 32767

32767 = `0x7FFF`，是 `sipush` 操作数（2 字节有符号 big-endian）的极限。再往上需 `ldc` 从常量池取整数，超过"指令可直接表达的值域"，且对电网求解已无意义。

## 手法：ASM 重写，不手工插字节

Small 的改动要把 `bipush`（2 字节）换成 `sipush`（3 字节），**方法体净增 1 字节**。手工改二进制会连带影响：`Code` 属性的 `code_length`、`LineNumberTable` 各 `start_pc`、`LocalVariableTable` 的 `start_pc`/`length`、`StackMapTable` 的 `offset_delta`。漏改任一处 ⇒ `VerifyError`，且报错位置会误导排查方向。

用 `ClassReader.EXPAND_FRAMES` + `ClassWriter` 走 visit 回调，所有偏移由 ASM 重算，patcher 只在 `visitIntInsn` 认领目标常量。

- patcher 源码：`mcopt/PatchTfMax.java`（工作区 `C:\Users\27063`），只在 `<init>` 内匹配 `operand == 60` / `== 240`，**命中数 ≠ 2 直接 `exit(3)`**（防止改错方法/改漏）。
- ASM 9.10.1 已在本机 libraries：`D:/MINECRAFT/.minecraft/libraries/org/ow2/asm/asm/9.10.1/asm-9.10.1.jar`（另有 asm-tree / asm-commons / asm-analysis / asm-util 同版本）。
- D 盘为只读来源：先把原 jar 复制到 C 盘工作区（`mcopt/`）再 patch，产物 `powergrid-tfmax.jar`。
- 提权安装脚本：`mcopt/install-pgpatch.ps1`（`Start-Process -Verb RunAs`，先备份再替换，随后从 D 盘重读校验）。

## 验证链（全部为实测输出）

```
patch:      [<init>] 240 -> 32767 (SIPUSH)
            [<init>]  60 -> 32767 (BIPUSH->SIPUSH)
            classes patched: 2
javap 复验: 0: aload_0 / 1: aload_1 / 2: sipush 32767  ← 两个类一致
            （后续偏移 5/8/9/10/13… 全部自动 +1，无错位）
安装:       5738480 B → 5738482 B（+2 = 两处 sipush 净增）
            zip 完整性 testzip() = OK；entries 2532 不变
从 D 盘读回: 两个类均为 sipush 32767 ✓
```

## 备份与回滚

备份：`C:\Users\27063\mcopt\BACKUP-[机械动力：交错电网] powergrid-mc1.21.1-0.6.2.jar.20261007-002626`（5738480 B，原始字节）。回滚 = 把备份 jar 拷回 D 盘原路径。

## 风险边界（已向用户说明，非拒绝改动）

1. **GUI 精调退化**：`rowStepSize = 10` 而值域上限 32767 ⇒ 约 3277 个刻度挤在一个值选择板里，能拖到顶，但拖到精确匝数基本靠手感。若只需 400–600 级自由度，把常量从 32767 改成 1024 会让 GUI 好用得多（改一行重跑 patcher 即可）。
2. **电感按匝数平方增长**：`buildCircuit` 中 `local8 = N_p² × Al`。N 由 240 → 32767 是 136×，`N²` 是约 18600×。Medium 的 `Al = 10.0` ⇒ 自感由 `5.76e5` 升至 `1.07e10`；对应支路导纳约 `1e-10`，而最小元件电阻（`current_gauge` 0.05 Ω）导纳为 20 ⇒ 动态范围跨 **11 个数量级**。double 约 16 位有效数字，理论余量约 5 位，但该 mod config 自带 `plotterRecordNonconvergence` 选项，说明作者已知迭代求解会失手。
   - 判断：正常使用（绕组差在一两个数量级内）无问题；拉到 32767 : 1 这类极端比值可能出现莫名失效。

## 同批次未验证项

同一时段还做了 `immersive-portals-sable-compat-0.5.0.jar`（修 Sable × Immersive Portals 的 mixin priority 撞车）与汉化资源包（已写入 `options.txt`），二者均为纯配置/插件层改动，尚未启动验证。jar patch 是三者中唯一可能"改坏 mod 本体"的改动，启动崩溃时优先回滚它。
