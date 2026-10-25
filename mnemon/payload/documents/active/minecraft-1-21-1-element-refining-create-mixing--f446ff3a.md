---
id: "f446ff3a-a9f1-444a-b119-cedb3583bbe4"
title: "Minecraft 1.21.1「机械动力」element_refining 第二版配方设计：铜/锌/铂三条 Create mixing 线、可再生原料池实测与黑曜石粉末产量阀门（2026-10-12）"
description: "1.21.1-NeoForge_21.1.236「机械动力」实例的 element_refining 替换方案（第二版）：三根可再生原料（圆石/岩浆/黑曜石）的 jar 内 recipe JSON 实测池、铜 heated / 锌 superheated / 铂 superheated 三条 Create mixing 配方槽位表与折算产量、锌守恒下界 k≥9 的推导、粉末黑曜石作 144/h 产量阀门的机制、以及「铂必须单独做」对旧文档 36f6d37a 结论的修正。状态：方案已出、待用户拍板档位与 tag 化。"
status: "active"
created_at: "2026-10-11T16:32:32.724Z"
updated_at: "2026-10-11T16:32:32.724Z"
content_hash: "f7f80ac36f02a292eb07e96b13865aafba7621dca9c3137222f3b93b2943e260"
source_paths:
  - "mcopt/install-transmutation.ps1"
  - "mcopt/transmutation/pack.mcmeta"
session_ids:
  - "416d61f8-d7ac-493b-a96f-b11fc59d016f"
memory_body_ids:
  []
---

# element_refining 第二版配方设计（铜 / 锌 / 铂）

> 关联文档：`36f6d37a-2816-4206-81a9-e14ecb856867`（第一版：铜/锌三档设计与 B 档落地、IPN 日志洪泛）。**本文修正该文档中「铂不做」的结论**（理由见下文「铂」一节），并在其基础上补齐可再生原料池实测与三条完整配方。本文不覆盖、不修改该文档。

## 状态与范围

- 实例：`D:\MINECRAFT\.minecraft\versions\1.21.1-NeoForge_21.1.236\saves\机械动力\`（datapack 落地目录需 UAC 提权）。
- 目标：用 datapack 覆盖存档现有的 `element_refining` 配方，做成「只用可再生产物」的铜 / 锌 / 铂粉碎粗料产线。
- 证据来源：`create-1.21.1-6.0.10.jar` 与 `createpropulsion-1.1.5.jar` 内 `data/**/recipe/**.json` 实测。
- **进度状态（截至本 checkpoint）**：方案已交付，用户尚未拍板档位、tag 化与否、铂岩浆量；落地实现由助手执行。已装的旧 B 档配方待最终拍板后替换。

## 一、可再生原料池

整套系统只有三个「根」，其余全是下游：

| 根 | 来源 |
|---|---|
| `minecraft:cobblestone` | 岩浆 + 水 |
| `minecraft:lava` | `mixing/lava_from_cobble.json`：`tag: c:cobblestones` ×1 + **superheated** → 50 mB |
| `minecraft:obsidian` | 岩浆 + 水 |

jar 内实测（原文 JSON 摘要，非转述）：

| 产物 | 配方 | 关键参数 |
|---|---|---|
| `minecraft:gravel` | `milling/cobblestone.json` | processing_time 250 |
| `minecraft:flint` | `milling/gravel.json` | 250 |
| `minecraft:sand` | `crushing/gravel.json` | 250；另 10% flint、5% clay_ball |
| `minecraft:clay_ball` | `splashing/sand.json` | 25% |
| `minecraft:red_sand` | `milling/terracotta.json` / `milling/granite.json` | 200 |
| `minecraft:andesite` | `compacting/andesite_from_flint.json` | 2 flint + 1 gravel + 100 mB lava |
| `create:powdered_obsidian` | `crushing/obsidian.json` | **processing_time 500**；另 75% 回 obsidian |
| `minecraft:gold_nugget` | `splashing/red_sand.json` | 12.5% ×3（用户自有那条线） |
| `minecraft:iron_nugget` | `splashing/gravel.json` 12.5% / `crushing/crimsite.json` 40% / `crushing/tuff.json` 10% | — |
| `create:crushed_raw_*`（矿石直出） | `crushing/{crimsite,veridium,ochrum,asurine}.json` | 40% / 80% / 20% / 30% |
| `create:cinder_flour` | `crushing/netherrack.json` | 1 + 50%；带 `neoforge:mod_loaded exnihilosequentia` 取反条件 |
| `minecraft:gunpowder` | `filling/gunpowder.json` | cinder_flour + 25 mB harming 药水；另有 createbigcannons `gunpowder_from_pinches` 9:1 |
| `create:zinc_nugget`（拆分） | `splashing/crushed_raw_zinc.json` | 9 粒 |
| `create:powdered_obsidian` 相关 | `milling/clay.json`→4 clay_ball(50t)、`milling/dripstone_block.json`→clay_ball(250t)、`milling/sandstone.json`→sand(150t)、`milling/andesite.json`→cobblestone(200t) | — |

**注**：`milling/limestone.json`、`compacting/limestone.json`、`crushing/andesite.json` 在 `create` jar 中 **MISS**（不存在）。

## 二、三条配方（投料全部为可再生产物）

Create mixing 的 ingredient 是**全消耗列表**，没有「任选其一」语义。

### 铜 —— `heated`

| 投料 | 量 |
|---|---|
| `tag: c:nuggets/iron` | 4 |
| `minecraft:gravel` | 6 |
| `minecraft:flint` | 2 |
| `minecraft:clay_ball` | 1 |
| `create:powdered_obsidian` | **3** |
| `minecraft:lava` | 250 mB |

→ 1 `create:crushed_raw_copper` ⇒ **48 锭/h/台**

### 锌 —— `superheated`

| 投料 | 量 |
|---|---|
| `create:andesite_alloy` | **9** |
| `minecraft:gravel` | 2 |
| `minecraft:red_sand` | 1 |
| `minecraft:gunpowder` | 1 |
| `create:powdered_obsidian` | **6** |
| `minecraft:lava` | 250 mB |

→ 1 `create:crushed_raw_zinc` ⇒ **24 锭/h/台**

### 铂 —— `superheated`

| 投料 | 量 |
|---|---|
| `minecraft:gold_nugget` | 16 |
| `create:andesite_alloy` | 4 |
| `minecraft:gunpowder` | 2 |
| `create:powdered_obsidian` | **9** |
| `minecraft:lava` | 500 mB |

→ 1 `create:crushed_raw_platinum` ⇒ **16 锭/h/台**（成本 16 金粒 ≈ 1.78 金锭/铂锭）

三条产物只给 `crushed_raw_*`，下游沿用整合包原生线：`smelting/*_ingot_from_crushed.json` → 1 锭、`splashing/crushed_raw_*.json` → 9 粒 + 副产。**配方本身不新增任何下游**。

## 三、两个硬约束（设计理由，不可省）

### 1. 黑曜石粉末 = 产量阀门（物理封顶）

`create:powdered_obsidian` 只有**一个产出配方**（`crushing/obsidian.json`）和**一个消耗配方**（本设计），模板产量固定：一台粉碎轮 500 tick/个 ⇒ **144 个/h/台 封顶**。

⇒ **产量 = 144 ÷ 粉末数**，加多少原料都绕不过去；因此它被用作唯一的档位旋钮，而不是装饰性成本。

### 2. 锌守恒下界 k ≥ 9（回应「安山合金为什么不能用」）

安山合金来源：`mixing/andesite_alloy_from_zinc.json` = 1 `minecraft:andesite` + 1 `tag: c:nuggets/zinc` → 1 `create:andesite_alloy`（铁粒版 `mixing/andesite_alloy.json` 同理，只是换成 `c:nuggets/iron`）。

⇒ k 个安山合金**最多**只含 k 个锌粒。

产物侧：`crushed_raw_zinc` → `splashing/crushed_raw_zinc.json` → **9 `create:zinc_nugget`** = 1 锌锭。

- k = 9：9 粒进、9 粒出，净零，只烧掉 9 个安山岩 ⇒ **不放大**（即唯一不产生净锌收益的下界）。
- k = 8：8 进 9 出 ⇒ **1.125 倍/轮**，一台机器即可把锌刷到溢出。
- 玩家若改用铁粒版造合金，k=9 时 9 合金 = 9 铁粒 ⇒ 退化为干净的「铁 → 锌」。

**同类自指放大器必须杜绝**：铜配方不含任何铜制品（铜粒 →1 粗铜 → 9 铜粒 = 8 倍放大器）；铂配方不含任何铂制品。

## 四、铂：推翻第一版「不做铂」的结论

- `createpropulsion-1.1.5.jar` 覆盖了 `create-1.21.1-6.0.10.jar` 的同名 `data/create/recipe/splashing/crushed_raw_gold.json`，内容为：1 `create:crushed_raw_gold` → 9 `minecraft:gold_nugget` + 50% quartz + **5% `createpropulsion:platinum_nugget`**。
- 但该伴生线吃的是 `create:crushed_raw_gold`，而用户自家产线只出 `minecraft:gold_nugget`，**两条不通车** ⇒ 铂无法靠该伴生配方获得，必须按用户要求单独做配方。
- createpropulsion 铂侧另存在的原生配方（供下游衔接）：`smelting/blasting platinum_ingot_from_{platinum_ore,deepslate_platinum_ore,raw_platinum,crushed_raw_platinum}`、`crushing/{platinum_ore,deepslate_platinum_ore,raw_platinum_block}`、`pressing/platinum_sheet`、`crafting/platinum_*`（block/nugget/fluid_tank/fluid_vessel，含 `create_connected` 兼容条件）、`deploying`+`item_application/platinum_casing`。

## 五、待用户拍板项（本 checkpoint 时的开放决策）

1. **档位**：只改 `powdered_obsidian` 数量。松档（铜 2 / 锌 4 / 铂 6）≈ 72/36/24 锭/h；严档（铜 6 / 锌 9 / 铂 18）≈ 24/16/8 锭/h。
2. **tag 化原料**：在 datapack 定义 `data/tianque/tags/item/silica_feedstock.json` = [gravel, sand, flint]，配方槽写 `{"tag":"tianque:silica_feedstock"}`，让一格吃多种料（Create mixing 无 OR 语义，这是唯一技术解法）。
3. **铂的 500 mB 岩浆**是否过高（= 10 圆石 / 铂锭）。

拍板后由助手落地写入 datapack（需 UAC 提权，动手前先说明写入内容）。
