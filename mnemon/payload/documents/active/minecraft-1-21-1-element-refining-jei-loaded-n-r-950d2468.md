---
id: "950d2468-46a5-483f-8eef-a8e846be9d87"
title: "Minecraft 1.21.1「机械动力」element_refining 配方 JEI 可显示性验证：四环链路、Loaded N recipes 硬判据与 crushed_raw_platinum 注册者纠正（2026-10-12）"
description: "1.21.1-NeoForge_21.1.236「机械动力」实例：验证自定义 Create mixing 配方能否被 JEI 显示的完整链路（datapack 启用 → RecipeManager parse → JEI MixingCategory 收录 → JSON 结构合法）与可自动验证的硬判据 `Loaded N recipes` 计数（基准 3320，装 3 条后应 3323）；纠正 `create:crushed_raw_platinum` 由 Create 本体注册而非 createpropulsion；记录 element_refining 落地位点与 sha1。关联 36f6d37a（IPN 洪泛 + 第一版落地）、f446ff3a（第二版配方设计）。"
status: "active"
created_at: "2026-10-11T16:51:20.548Z"
updated_at: "2026-10-11T16:51:20.548Z"
content_hash: "d6796e2ed7c9f83fb36e46c997383692eda6bd2f46cac67959e58bfba6b1d4df"
source_paths:
  - "mcopt/install-transmutation2.ps1"
  - "mcopt/install-transmutation2-bom.ps1"
  - "mcopt/install-transmutation.log"
  - "mcopt/transmutation/pack.mcmeta"
  - "mcopt/verify_jei.py"
session_ids:
  - "2a2582b9-a8e8-449e-b785-a7b59ae22189"
memory_body_ids:
  []
---

# element_refining 配方 JEI 可显示性验证（2026-10-12）

实例：`D:\MINECRAFT\.minecraft\versions\1.21.1-NeoForge_21.1.236\`（NeoForge 21.1.244 client / MC 1.21.1，JEI `jei-1.21.1-neoforge-19.57.0.450.jar`）。

触发问题（用户原文）：**「测试一下,确定jei能显示这个配方是吧」** —— 即 element_refining datapack 新增的 3 条 Create mixing 配方（铜/锌/铂 from renewable）在 JEI 里能否查到。

关联文档：`36f6d37a-2816-4206-81a9-e14ecb856867`（IPN AutoRefill 日志洪泛定位 + 第一版铜/锌三档设计与 B 档落地）、`f446ff3a-a9f1-444a-b119-cedb3583bbe4`（第二版铜/锌/铂三线设计与可再生原料池实测）。**本文只补「落地后能否显示」的验证链与判据**，配方数值与设计理由见上述两篇。

## 一、四环链路：JEI 显示的充分条件（逐环有实证）

| 环 | 机制 | 实证 |
|---|---|---|
| ① datapack 被启用 | 丢进 `saves/<世界>/datapacks/` 的新 pack 进入 enabled 列表 | `level.dat`（压缩 21934 → 解压 110140 B，mtime 2026-10-11 23:59:37）的 `DataPacks` 段：`Enabled` 含 `vanilla` / `file/CDDP` / `file/Custom_Discs_DP.zip`，`Disabled` 为空。⚠️ 该 strings 截取范围内未见 `element_refining` 字样，最终以环②计数为准（见下）。 |
| ② recipe 被 parse | `RecipeManager` 全量读取，失败会打 `Parsing error loading recipe` | `logs/latest.log:855` = `Loaded 3320 recipes`；全日志 `Parsing error loading recipe` **0 条**。日志里唯一的 recipe 相关报错是 Realms 的 `Failed to parse into SignedJWT`（与本任务无关）。 |
| ③ JEI 收录 | `MixingCategory` 泛型是 `BasinRecipe`（`MixingRecipe` 的上位类型），JEI 按 recipe type 全量喂给 category，不按具体 recipe class 过滤 | `MixingCategory.standard(CreateRecipeCategory$Info<BasinRecipe>)`；`draw(BasinRecipe, IRecipeSlotsView, GuiGraphics, double, double)` 内部调用 `BasinRecipe.getRequiredHeat()`。三个工厂方法 `standard` / `autoShapeless` / `autoBrewing` 共用同一泛型。 |
| ④ 自定义 JSON 结构合法 | key 集合必须落在原生已知形态内 | 原生 `data/create/recipe/mixing/` 14 条的 key sig 分布：`['heat_requirement','ingredients','results','type']` × 6、`['amount','fluid','type']` × 7、result 唯一形态 `['count','id']` —— 自定义 3 条全落在已知形态内，**0 个未知 key**。 |

## 二、硬判据：`Loaded N recipes` 的条数

**关键可自动验证点**：`RecipeManager` 每次资源重载都会打印 `Loaded N recipes`（同一行会随世界进入 / 游戏内 `/reload` 重新打印）。

- **干净基准 = 3320**：用户 2026-10-11 21:29:23 那次启动，`mods/` 目录 mtime 为 10-10 14:49、与当前一致，且当时 element_refining 尚未安装（B 档装于 10-12 00:16，第二版 00:41）⇒ 该次「3320」是无自定义 recipe 的基准。
- **预期值 = 3323**：装上 3 条 recipe 后应为 3320 + 3 = 3323。
- **验证动作**：进世界或游戏内 `/reload` 后读 `latest.log` 里最新一行 `Loaded N recipes`，比对是否为 3323。
- 截至本文记录，实机确认（进入世界 + `/reload` + JEI 搜索）**尚未完成**，静态链已完备。

游戏内自测路径：JEI 搜 **粉碎粗铜 / 粉碎粗锌 / 粉碎粗铂** → 按 `U`（uses，即「用途/来源」）→ 出现 **Create 混合器** 条目；铜（heated）显示黑锅，锌与铂（superheated）带蓝火标记。

## 三、事实纠正：`create:crushed_raw_platinum` 的注册者是 Create 本体

此前（第一版结论期）曾称「铂配方要有 createpropulsion 才能用」，**该说法错误**。实测：

- `assets/create/lang/en_us.json` 与 `zh_cn.json` 都含 `item.create.crushed_raw_platinum` = `"Crushed Raw Platinum"` / `"粉碎粗铂"`；
- `assets/create/models/item/crushed_raw_platinum.json` 与 `textures/item/crushed_raw_platinum.png` 都在 create jar 内；
- `com/simibubi/create/AllItems.class` 常量池含 `PLATINUM` / `CRUSHED_PLATINUM` / `CRUSHED_RAW_MATERIALS` / 前缀 `crushed_raw_`（前缀拼接式注册）；
- createpropulsion jar 内 `crushed_raw_platinum` 字符串 **0 命中**，它只提供 `platinum_ingot`（`dev/propulsionteam/propulsionsimulated/registries/PropulsionItems.class`）。

⇒ **队友只要有 Create，该铂配方就能看、能合。** createpropulsion 只负责下游那半段：`data/createpropulsion/recipe/smelting/platinum_ingot_from_crushed_raw_platinum.json` 把粗铂炼成铂锭；缺了它粗铂合得出但炼不成锭。

## 四、落地位点与校验值

- datapack 目录：`saves/机械动力/datapacks/element_refining/`，含 `pack.mcmeta`（149 B，sha1 `05EDC0D495A13D48FA41F58DD97E41D37CAFF6A0`）+ `data/element_refining/recipe/mixing/{copper,zinc,platinum}_from_renewable.json`。
- 安装脚本产物与日志：`mcopt/install-transmutation.ps1` → `install-transmutation2.ps1` / `install-transmutation2-bom.ps1`（BOM 版），运行日志 `mcopt/install-transmutation.log` 记录 `RESULT: OK`、`IsAdmin = True`、`java running = 0`。
- recipe sha1：`copper_from_renewable.json` 825 B `23DC470781AD9626601E362C38669AEE6CE09E72`；`platinum_from_renewable.json` 1805 B `953C520AF985DE386153CC965AB6C0099CDE0AB1`；`zinc_from_renewable.json` 1087 B `B76E410E360C70D3F2B5CF3C6D1C22790B4F60A7`。
- 同目录另有 `CDDP` 与 `Custom_Discs_DP.zip`（非本次产物）。注意 pack 的 namespace 在落地后从早期设计的 `tianque` 变为 `element_refining`，旧第一版脚本引用的是 `mcopt/transmutation/data/tianque/recipe/mixing/*`。

## 五、排查套路小结（可复用）

自定义配方「游戏里看不到」时按序查：**① `level.dat` 的 `DataPacks.Enabled` 是否收录该 pack → ② `latest.log` 的 `Loaded N recipes` 计数是否 +k 且无 `Parsing error loading recipe` → ③ 该 recipe type 在目标 JEI category 的泛型类型链上（如 Create 全部走 `BasinRecipe`）→ ④ 自定义 JSON 的 key 集合是否落在原生同类 recipe 的已知形态内。** ①③④ 是静态检查，②是唯一一个能自动、客观判定「装进去了没有」的硬指标。

## 六、顺带观察（归属见 36f6d37a）

`logs/latest.log` 已膨胀到 **1958528 行 / 384 MB**（10-10 那次仅 19 MB）：其中 logger 为 `STDERR` 的行 1956496 行（99.9%），`IndexOutOfBoundsException` 出现 50166 次；50166 × 约 39 行栈 ≈ 1956496，完全吻合 ⇒ IPN（`InventoryProfilesNext`）`AutoRefillHandler$ItemSlotMonitor` 每 tick 抛异常的 bug 仍在运行，且比上次严重约 21 倍。该问题不影响游戏逻辑，仅刷日志；详细定位与关闭方式见 `36f6d37a-2816-4206-81a9-e14ecb856867`。附带噪声：该超长 `latest.log` 中的 recipe 相关行抽取（约 384 MB）耗时显著，后续排查优先用 gzip 归档（`logs/debug-*.log.gz`）而非未压缩 `latest.log`。
