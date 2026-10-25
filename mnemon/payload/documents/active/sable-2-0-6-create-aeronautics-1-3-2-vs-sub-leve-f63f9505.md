---
id: "f63f9505-9471-4383-8877-9b4e0c9ac3bc"
title: "Sable 2.0.6 + Create: Aeronautics 1.3.2：蓝图「物理化 vs 纯建筑」的 sub_levels 判据、蓝图获取渠道实测可达性，与「结构断裂」特性缺失的否定取证（2026-10-23）"
description: "1.21.1-NeoForge_21.1.236 实例上的两条调查：①NBT 顶层 sub_levels key 作为「物理化 sub-level 蓝图」判据（对比自造纯建筑 .nbt）；②蓝图去哪找——Modrinth/PCM/CurseForge/Discord 逐站实测与「Modrinth 不是蓝图库」的结论；③代码层否定取证证明当前 Sable 2.0.6 + aeronautics 1.3.2 无结构完整性/自动断裂系统，仅 SpringBlockEntity 的 TIME_TO_SNAP/snapDistance 且未暴露 config。延续 4a5cedc7（工具枪原生 .nbt）与 71420e57（schemtool 拒绝 sub-level）。"
status: "active"
created_at: "2026-10-23T13:24:05.724Z"
updated_at: "2026-10-23T13:24:05.724Z"
content_hash: "dd593ca1816dbff6d379227817cca76b9e219e61246a7e40d0add408b8701ec7"
source_paths:
  - "mods/sable-neoforge-1.21.1-2.0.6.jar"
  - "mods/create-aeronautics-bundled-1.21.1-1.3.2.jar"
  - "mods/create_aeronautics_toolgun-0.3.6.jar"
  - "config/create_aeronautics_toolgun-server.toml"
  - "config/aeronautics-server.toml"
  - "schematicss/飞艇.nbt"
  - "schematicss/red_stone_simulate.nbt"
  - "schematicss/seg_01_y0000.nbt"
session_ids:
  - "62543de2-c8b9-410d-83ee-62749c8a5f43"
memory_body_ids:
  []
---

# 背景与范围

实例 `D:\MINECRAFT\.minecraft\versions\1.21.1-NeoForge_21.1.236`（NeoForge 21.1.236，DataVersion **3955** = 1.21.1）。用户提出两条诉求，本记录只覆盖这两条：

1. 「你造出来的最好是蓝图、非物理化（建筑）」+「飞艇这类蓝图去哪找、哪个网站」
2. 「为什么我的物理结构的**断裂**特性消失了」

前置文档：`4a5cedc7`（工具枪蓝图 = 原生 `.nbt` 放 `schematics/`、无外网约束）、`71420e57`（schemtool 四格式转换、工具枪 `sub_levels` 被 adapter 拒绝）。本文只写增量，不复述它们。

---

# 一、蓝图「物理化 vs 纯建筑」的唯一硬判据：顶层 `sub_levels`

用 NBT parser（gzip → tag tree）把自造的 `seg_01_y0000.nbt` 与用户自己捕获的 `飞艇.nbt` 拆开对比：

| 字段 | `seg_01_y0000.nbt`（自造） | `飞艇.nbt`（用户捕获） | `red_stone_simulate.nbt` |
|---|---|---|---|
| top-level keys | `DataVersion` / `blocks` / `entities` / `palette` / `size` | 同上 **+ `sub_levels`** | 同上（无 `sub_levels`） |
| `size` | `[49, 100, 49]` | — | — |
| `palette` | 3 项，全 vanilla | 更多，含 mod 方块 | 24 项，含 `create:brass_casing` / `sticky_piston` |
| `blocks` | 22000 条，`{pos:[x,y,z], state:n}` | 同结构 | 同结构 |
| `entities` | 空 | — | — |

**判据（三条同时成立即为纯建筑、可被 Schematicannon 直接打印）：**

1. **顶层无 `sub_levels`** —— 该 key 是 Sable / Create: Aeronautics 的私有扩展，用来把整个 sub-level（可移动 contraption）序列化进蓝图。**没有它 = 世界坐标系里的死方块**，不被物理引擎接管、不继承动量。
2. **`palette` 只含 vanilla 方块** —— 零 mod 依赖（自造塔只有 `minecraft:air` / `chiseled_stone_bricks` / `stone_bricks` / `sea_lantern`）。
3. **`blocks` 只存非空气条目 + 整数 `pos`** —— 标准原版结构格式，非 Sable 变体。

注意 `red_stone_simulate.nbt` 反证了「含 mod 方块 ≠ 物理化」：它有 Create 方块但无 `sub_levels`，仍是纯建筑。**`sub_levels` 是唯一分界，不是 mod 方块数量。**

`飞艇.nbt` 是用户在游戏内用 `create_aeronautics_toolgun` 自己捕获的 ⇒ **捕获路径已通**，自造带 `sub_levels` 的蓝图在原理上可行，瓶颈是还没逆出该结构的字节布局。

---

# 二、蓝图去哪找：逐站实测 + 三类渠道

CLI 探测（本机走 DevSidecar `127.0.0.1:31181`）：

| 站点 | CLI 探测 | 判读 |
|---|---|---|
| `modrinth.com` | **200** | 可达 |
| `planetminecraft.com` | **403** | Cloudflare 拦 CLI，**浏览器正常** |
| `curseforge.com` | **403** | 同上 |
| `mcschematics.com` | 000 | 打不通 |
| `github.com` / `raw.githubusercontent.com` / `api.github.com` | 000 | 打不通 |

**按资源类型分流，三类渠道互不重叠：**

1. **纯建筑 / 静态机械蓝图** → **Planet Minecraft**（最大建筑社区，有 `create mod` 分类）、**CurseForge**（有独立 *Schematics* 资源类型）。403 只是反爬，浏览器照常打开。
2. **Create 专用蓝图** → **Modrinth 不是蓝图库**。实测搜 `create schematic` / `create blueprint` 返回的全是功能 mod（`Create: Pattern Schematics`、`EMI: Create Schematics`、`Create: Blueprinted`），不是 `.nbt` 文件本身。别在那里找文件。
3. **飞艇 / 物理化蓝图（带 `sub_levels`）** → 大众站基本没有。原因：依赖私有 NBT 结构，只有装了 Create: Aeronautics 系客户端的玩家能读，版本错配直接崩 ⇒ **流通渠道是 Discord 的 `#schematic` / `#blueprints` 置顶频道**。

**官方入口（从 Modrinth API 元数据实取，未凭记忆）：**

- **Create: Aeronautics** — 仓库 `github.com/Creators-of-Aeronautics/Simulated-Project`，Discord **`https://discord.gg/createaeronautics`**
- **Sable** — 仓库 `github.com/ryanhcode/sable`（wiki 同址），**`discord_url` 与 Aeronautics 完全相同**：`https://discord.gg/createaeronautics` ⇒ 两个项目的社区是同一个 Discord，不用找第二个邀请链接。
- **Sable Photomancy / `sable-schematic-tool`** — 第三方捕获 mod，仓库 `github.com/Rew1nd-dev/sable-schematic-api`（本机 github 000，仓库内容未取到，仅记录存在与定位）。
- `r/CreateMod` 的 sidebar 有社区 Discord 入口（未实测）。

---

# 三、「结构断裂」特性消失：代码层否定取证

这是本次最有复用价值的部分 —— **否定结论可避免未来重复扫 jar**。

扫描范围与结果：

| 目标 | 体积 | 命中 |
|---|---|---|
| `sable-neoforge-1.21.1-2.0.6.jar` | 12.6 MB | 35 处，**全部**是 `damage` / `explosion` / `detach` 一类 |
| bundled 内 `simulated`（`dev.simulated_team.simulated`） | 6.2 MB / 795 class | 71 处，**全部**是 `RenderStateShard` / `snapshot` / rope 渲染 |
| bundled 内 `aeronautics`（`dev.eriksonn.aeronautics`） | 25 MB / 254 class | 46 处，**同样全是渲染 shard** |
| `config/sable*.toml` | — | **不存在**（Sable 2.0.6 无 config 暴露） |
| `config/aeronautics-server.toml` | — | 非注释键只有 `[physics]` / `[blocks]` / `[kinetics.stressValues.v2]`，**无断裂相关** |

**关键判据：`fracture` / `structural integrity` / `break_apart` / `tear` 在三份 jar 的常量池里命中数为 0。** ⇒ 当前装的这套（Sable 2.0.6 + aeronautics 1.3.2）**代码层面不存在「结构完整性 / 自动断裂」系统**，不是被某个 config 关掉了。

**唯一沾到「断」的东西**是 `simulated` 里的 `SpringBlockEntity`：

```
TIME_TO_SNAP   <- SpringBlockEntity.class
snappingTime   <- SpringBlockEntity.class
snapDistance   <- SpringRenderer.class
```

这是**弹簧/连接件**的绷断参数（受拉超 `snapDistance` 或持续 `TIME_TO_SNAP` 后脱开），与「船体被撞裂成两半」是两回事；且 **Sable 2.0.6 未把它们暴露到 config**，想调只能改 jar 或写 mixin。

`config/create_aeronautics_toolgun-server.toml` 的 `allowSave` / `allowQuery` / `allowWeld` / `allowTranslate` / `allowRotate` / `allowDisconnect` 全为 `true`，但 `allowDisconnect` 管的是**能否主动断开 weld 约束**，不是自动断裂。

**未决分岔（用户当时未回答，下次接着问）：**
- **A.** 撞击导致船体自行裂成两个 sub-level（结构完整性判定）→ 则当前 jar 无实现，需回想 Sable 2.0.x 之前装的是哪个版本
- **B.** 弹簧/绳索绷不住脱开 → 即 `SpringBlockEntity` 的 `TIME_TO_SNAP` / `snapDistance`，仅能改 jar / mixin
- **C.** 工具枪 weld 约束断开 → 由 `allowDisconnect` 控制
- **D.** 船体撞碎成掉落物 / sub-level 落地解体

---

# 四、本机相关 mod 实际清单

`mods/`：

- `create_aeronautics_toolgun-0.3.6.jar`（工具枪）
- `create-aeronautics-bundled-1.21.1-1.3.2.jar`（31 MB，jarjar 内嵌三个：`aeronautics` 25018 KB / `offroad` 811 KB / `simulated` 6167 KB）
- `aeronautics_display_link_fix-1.3-1.21.1.jar`
- `aeroportals-1.21.1-1.3.3.jar`
- `flightblocks-sable-compat-1.0.1.jar`
- `sable-neoforge-1.21.1-2.0.6.jar`（12.7 MB，`displayName=Sable`，`description='Interactive moving block structures with physics.'`；依赖 `neoforge` / `minecraft` / `flywheel` / `create` / `sablecompanion` / `sodium` / `scalablelux`）
- `sablecleanup-0.3.0.jar`（164 KB，`Sable Cleanup Tools`，依赖 `sable`）

**方法教训：扫 jar 时要区分 bundled 与 nested jar** —— `create-aeronautics-bundled` 顶层 `classes: 0`、`matches: 0`，真代码全在 `META-INF/jarjar/*.jar` 里，直接扫外层会得出错误的「什么都没有」结论。另有一次性失败：`TypeError: cannot use a bytes pattern on a string-like object` —— 解压后内容是 `str` 时不能用 `bytes` 正则，需统一编码。
