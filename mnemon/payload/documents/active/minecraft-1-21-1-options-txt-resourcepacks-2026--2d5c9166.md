---
id: "2d5c9166-72b6-4fc4-9c64-36bec2b93d38"
title: "Minecraft 1.21.1 整合包「汉化全部回归英文」根因：options.txt 的 resourcePacks 被清空（2026-10-23）"
description: "1.21.1-NeoForge_21.1.236 实例上「所有 mod 汉化变回英文」的取证：根因是 options.txt 第 51 行 resourcePacks:[] 连 mod_resources 一起丢失（非翻译文件损坏）；含备份/提权写入/重载日志验证三段的可复用修复流程，以及 datapack recipe 生效的 3320→3323 判据。"
status: "active"
created_at: "2026-10-23T13:38:17.499Z"
updated_at: "2026-10-23T13:38:17.499Z"
content_hash: "a0f8bffb03a3ea0e6b04482f9af77521907e639d2d7991c355c504dac2b70f60"
source_paths:
  []
session_ids:
  - "88a83edd-6675-4fc1-afe2-7914c6faa2bb"
memory_body_ids:
  []
---

# 背景与范围

实例：`D:\MINECRAFT\.minecraft\versions\1.21.1-NeoForge_21.1.236`（NeoForge 21.1.236 / MC 1.21.1，PCL2 启动）。
症状：用户反馈「之前翻译过的所有 mod 的 UI 与游戏内介绍都回归原版英文」。

相关既有文档：Sable 2.0.6 + Create: Aeronautics 1.3.2 的蓝图 / 断裂调查见
`f63f9505-9471-4383-8877-9b4e0c9ac3bc`（同一实例，不同主题）。

# 根因（与直觉相反）

**不是翻译文件丢了**，而是资源包列表被整体清空：

```
options.txt:51  resourcePacks:[]
options.txt:52  incompatibleResourcePacks:[]
options.txt:54  lang:zh_cn
```

历史对比（把多个 `options.txt.bak*` 的该行拉出来）：

| 文件 | mtime | resourcePacks |
|---|---|---|
| `options.txt.bak` | 2026-07-30 | `["vanilla","mod_resources","file/CDRP"]` |
| `options.txt.bak-20260816-162207` | 2026-08-16 | `["vanilla","mod_resources"]` |
| `options.txt.bak-20261004-pre-langpack` | 2026-10-04 | `["vanilla","mod_resources"]` |
| `options.txt`（故障态） | 2026-10-23 21:25 | `[]` |

`mod_resources` 是**所有 mod 自带 assets 的伪资源包**。它一旦从列表消失，
表现不是「少了某个汉化包」，而是**整合包里所有自带 `zh_cn.json` 的 mod 一起退回英文**——
这正是用户描述「全都回归原版」而非「某几个 mod 变英文」的原因。这是该症状的鉴别点。

汉化 zip 本身完好：`resourcepacks/[汉化] Create整合包汉化补全 v1.zip`，36823 B，
`pack_format: 34`、`supported_formats: 15–99`，内含 11 个 mod 的 `assets/<modid>/lang/zh_cn.json`
（aeronautics_display_link_fix / bblcore / charginggadgets / create_radar / create_train_physics /
createharmonics / createpropulsion / players / powergrid / shield_generators / veinmining）。
即「包没坏、没被删、格式也没过期」。

# 修复流程（可复用）

1. 先备份：`options.txt.bak-<yyyymmdd-HHMMSS>-pre-rp-fix`。
2. 改第 51 行为：
   `resourcePacks:["vanilla","mod_resources","file/[汉化] Create整合包汉化补全 v1"]`
   —— 目录型/zip 型放在 `resourcepacks/` 下的包，ID 形式是 `file/<不含扩展名的文件名>`。
3. **权限坑**：该实例在 `D:\`，普通进程直接写 `options.txt` 会
   `PermissionError: [Errno 13]`（`cp`/`touch` 同样 denied）。实测可行路径是用
   `pwsh -Verb RunAs` 提权后再写。写前先确认没有 java/javaw 在跑（否则退出时会被覆盖）。
4. 写入后必须回读确认整行，不能只看脚本「打印成功」。

# 验证判据（不要用「看起来是中文」这种主观判断）

- 资源包是否真的被加载：grep 启动日志里的
  `Reloading ResourceManager: vanilla, mod_resources, mod/sodium, ...`
  这一行是否出现 `file/[汉化] Create整合包汉化补全 v1`。
  **注意时序**：`options.txt` 是在启动**之后**改的，所以当次会话读到的仍是旧值，
  该行不含汉化包属于预期，必须**再启动一次**才能验证通过。
- datapack 是否生效：`RecipeManager/]: Loaded N recipes`，基准 3320 → 装后 **3323**（+3，
  对应铜/锌/铂三条 `create:mixing`），说明 datapack 确实在跑、JEI 会按 recipe type 收录。

# 同批排查的其他结论（简）

- 汉化 zip 之外的候选位置：`D:\MINECRAFT\.minecraft\resourcepacks\`（gameDir 根）与
  实例目录下 `resourcepacks/` 是**两个不同目录**，只放对其中一个会导致「文件在但游戏不列」。
- `schematics/` 下自造的 `seg_01..10_y0x00.nbt`（10 段，11:08 写入）与
  `飞艇.nbt`、`磁石导弹引信.nbt` 等并存；Create 支持子目录（`schematics/uploaded/...`），
  「游戏里看不到」需先排除子目录与实例路径不一致，而不是先怀疑文件损坏。
- 结构「断裂」特性缺失的否定取证（`fracture` / `break_apart` / `tear` 在三份 jar 常量池命中 0，
  仅 `SpringBlockEntity.TIME_TO_SNAP` / `snapDistance` 属于弹簧连接件且未暴露 config）
  已记在 `f63f9505-9471-4383-8877-9b4e0c9ac3bc`，本文不重复。
