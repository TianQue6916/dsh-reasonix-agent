---
id: "36f6d37a-2816-4206-81a9-e14ecb856867"
title: "Minecraft 1.21.1「机械动力」整合包：IPN AutoRefill 日志洪泛定位 + element_refining 自定义配方（铜/锌）设计与落地（2026-10-11/12）"
description: "1.21.1-NeoForge_21.1.236「机械动力」实例：IPN AutoRefill 触发 IndexOutOfBoundsException 每秒 50 次的定位与处置；aeroportals 事件驱动性判据；element_refining datapack（铁粒+黑曜石粉末+岩浆 → 粉碎粗铜/锌）三档配方设计与 B 档落地、c: tag 存在性实测、铂不做的理由。关联 753fc018（LegacyRandomSource 崩溃取证）。"
status: "active"
created_at: "2026-10-11T16:19:31.563Z"
updated_at: "2026-10-11T16:19:31.563Z"
content_hash: "68cc18c343aa5aeca28e34a28481b222816caafa3812db0195e818b44e304463"
source_paths:
  - "mcopt/transmutation/pack.mcmeta"
  - "mcopt/transmutation/data/tianque/recipe/mixing/copper_from_iron_gold.json"
  - "mcopt/transmutation/data/tianque/recipe/mixing/zinc_from_iron_gunpowder.json"
  - "mcopt/install-transmutation.ps1"
  - "mcopt/install-transmutation-bom.ps1"
session_ids:
  - "e19a60ef-1fc1-432d-adad-fd005232c254"
memory_body_ids:
  []
---

# IPN 日志洪泛 + element_refining 自定义配方（2026-10-11/12）

实例：`D:\MINECRAFT\.minecraft\versions\1.21.1-NeoForge_21.1.236\saves\机械动力\`（NeoForge 21.1.236 客户端；另见 `neoforge-21.1.244-*.jar` 升级材料）。
相关既有文档：LegacyRandomSource 多线程崩溃取证 = `753fc018-2fd4-4fad-851d-d61e682e45c9`；tick 掉帧取证 = `d43e5f2d-0674-4b46-9fc4-61a7dcbd0847`。本文记录另两条独立线索与一次配方落地。

## 1. 日志洪泛：IPN AutoRefill（P0，未处置）

证据（`latest.log` 19 MB 统计）：
- 91689 条 `STDERR`；其中 **2351 份**同一个异常：`IndexOutOfBoundsException: Index 53 out of bounds for length 46`
- 起始时间 **22:29:16**，之后每秒约 50 次
- 判据：22:29:16 之前没有该异常 ⇒ 由「打开某个 GUI」触发；该界面只有 46 个 slot，IPN 却取第 53 个。Create / Aeronautics 改变了菜单槽位布局，IPN 2.2.5 未跟上。
- 处置建议：关闭 IPN 的 AutoRefill（不影响其核心「一键整理」功能），零成本可逆。

## 2. aeroportals 涉嫌判据（事件驱动）

`aeroportals-1.21.1-1.3.3.jar`：503895 B，authors `breakinblocks`，license `PolyForm Shield 1.0.0 AND PolyForm Perimeter 1.0.0`，158 classes。
mods.toml 依赖：`neoforge [21.1.0,)` / `minecraft [1.21.1,1.22)` / `sable [2.0.3,3)` / `create [6.0,)` / `kubejs [2101.7,)`。
关键 class：`api/SubLevelPreTransferEvent`、`api/SubLevelTransferEvent$PlotMove`、`compat/CreateAssemblyCarrier`、`compat/CreateContraptionCompat$KineticSnapshot`、`compat/AeronauticsBalloonFixup`、`api/nbt/BuiltinNbtFixups`、`compat/CreateEnderGatewayCompat`。

结论：它是该整合包中**唯一把 Sable sub-level（plot）整体跨维度搬运的 mod**，且带 NBT fixer 与动能快照 —— 比 Sable / DH 的「可能在别的线程碰 level」更具体。
**但必须用事件驱动性打折**：未建过 AeroPortals 传送门、未让飞艇穿过，则这些代码路径不执行 ⇒ 不能算嫌疑，不应移除。移走它是一次零成本对照实验，前提是用户确实用过该功能。

## 3. element_refining datapack（铜/锌，方案 B 已安装）

### 落地位置与构成
- 源：`C:\Users\27063\mcopt\transmutation\`（`pack.mcmeta` + `data/tianque/recipe/mixing/*.json`）
- 游戏内：`D:\MINECRAFT\.minecraft\versions\1.21.1-NeoForge_21.1.236\saves\机械动力\datapacks\element_refining\`
- 安装脚本：`C:\Users\27063\mcopt\install-transmutation.ps1`（提权拷贝 + sha1 校验）；BOM 版 `install-transmutation-bom.ps1`（2078 chars，头 `\xef\xbb\xbf`）
- `pack.mcmeta`：`pack_format = 48`
- 不碰 `level.dat`、不碰已有机器；改数值只需改 JSON 后 `/reload`；整个撤掉 = 删除 `datapacks\element_refining\`

已装 B 档配方（`create:mixing`）：
- `copper_from_iron_gold.json`：`heated`，3×`create:powdered_obsidian` + 8×`c:nuggets/iron` + 1×`c:nuggets/gold` + 250mb `minecraft:lava` → 1×`create:crushed_raw_copper`
- `zinc_from_iron_gunpowder.json`：`superheated`，9×`create:powdered_obsidian` + 4×`c:nuggets/iron` + 2×`minecraft:gunpowder` + 250mb `minecraft:lava` → 1×`create:crushed_raw_zinc`
- 自检不变量：ingredient 上**不得**带 `count`（`has-count-on-ingredient = 0`），数量靠重复条目表达。
- 安装校验 sha1：`pack.mcmeta` 9C0AFF76A4DE11B31428260DC8957BC1E5D53F70；copper EA34FB00558569E5AFDC64A08E783B068D368E75；zinc D7D2A05713AE0DCB9E3A23E947A793850A149B1D

### 三条不动的设计理由
1. **只产 `crushed_raw_*`**：`create:crushed_raw_copper` / `_zinc` 已有完整原版下游，无需自写 —— `smelting/copper_ingot_from_crushed.json`（1 锭）、`blasting/...`、`splashing/crushed_raw_copper.json`（9 copper_nugget + 50% clay_ball）、`splashing/crushed_raw_zinc.json`（9 zinc_nugget + 25% gunpowder）。
2. **黑曜石粉末当产量阀门**：唯一产出路径 `crushing/obsidian.json`（`processing_time: 500` ⇒ 144 个/h/台粉碎轮），唯一原版消耗方 `sequenced_assembly/sturdy_sheet.json`。⇒ 产量 = 144 ÷ 粉末数，上限由玩家建了几台粉碎轮决定（基建换产量）。
3. **250mb 岩浆当熔融介质**：`mixing/lava_from_cobble.json` = 1 圆石 + superheated → 50mb ⇒ 每次混合的 250mb 背后是 5 圆石 + 一次 superheated 搅拌，岩浆环自然成为主要瓶颈。

### 三档与锚点
| 档 | 铜粉末（heated） | 锌粉末（superheated） | 产量 |
|---|---|---|---|
| A 严 | 9（+8 铁粒 +2 金粒） | 27（+8 铁粒 +4 火药） | 铜 16/h，锌 5.3/h |
| **B 等速（已装）** | 3（+8 铁粒 +1 金粒） | 9（+4 铁粒 +2 火药） | 铜 48/h，锌 16/h |
| C 松 | 1（+8 铁粒 +1 金粒） | 3（+4 铁粒 +2 火药） | 铜 144/h，锌 48/h |

锚点：铜手动挖 ≈ 50–150 锭/h，锌 ≈ 20–50 锭/h。B 档「机器 ≈ 人」⇒ 是替代而非碾压，故选 B。
铁粒 / 金粒 / 火药只是描述性原料，不构成瓶颈；唯一平衡旋钮是粉末数。

### tag 存在性实测
- `c:nuggets/iron`、`c:nuggets/gold` ✓ 在 `neoforge-21.1.244-universal.jar` 的 `data/c/tags/item/nuggets/`（client jar 内 0 个）
- `c:dusts/obsidian`、`c:nuggets/zinc`、`c:nuggets/copper`、`c:nuggets/brass` ✓ 在 create jar
- create 配方共使用 **115 个** distinct `c:` tag；`c:plates/platinum`、`c:ingots/platinum` 被 **0 个**配方使用

### 为什么不做铂
`createpropulsion` 已有原生再生线：`splashing/crushed_raw_gold.json` → 9 gold_nugget + 50% quartz + **5% `createpropulsion:platinum_nugget`** ⇒ 约 180 粉碎粗金 ≈ 1 铂锭。加配方要么更便宜（破坏平衡）要么更贵（无人使用）。

### 为什么安山合金不能当原料
`create:andesite_alloy` 的 `mixing/andesite_alloy_from_zinc.json` = 安山岩 + `c:nuggets/zinc`。用它当锌原料构成自指（锌 → 安山合金 → 锌），会造出零消耗循环。

## 4. 待决 / 未完成
- 用户尚未选定 A / B / C 档（B 已抢跑落地，改档成本 = 重写 2 个 JSON + 一次提权拷贝 ≈ 10 秒，代价为零）。
- IPN AutoRefill 关闭动作在用户侧，未执行。
- aeroportals 是否移入 `mods-disabled\` 取决于用户是否用过传送门功能。
- `racetrace` 定制 agent（改启动参数采样 random 崩溃）暂缓，触发判据：aeroportals 移走后 3 天内仍崩 ≥1 次。
