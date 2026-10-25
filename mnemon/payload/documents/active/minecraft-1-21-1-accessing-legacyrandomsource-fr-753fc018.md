---
id: "753fc018-2fd4-4fad-851d-d61e682e45c9"
title: "Minecraft 1.21.1 整合包「Accessing LegacyRandomSource from multiple threads」崩溃取证：AtomicLong CAS 机制、tick 频率与嫌疑 mod 排查边界（2026-10-10）"
description: "1.21.1-NeoForge 客户端 crash-2026-10-10_18.25.32-client.txt 的排查记录：LegacyRandomSource 用 AtomicLong CAS 做乐观锁（get→算→compareAndSet，失败即 athrow），ClientLevel.animateTick 每 tick 约 1334 次 random 读取⇒任何后台线程偶发访问 level.random 几十秒内必撞车；ThreadingDetector 只取 currentThread 栈所以报告里只有受害者 Render thread；createpropulsion-1.1.5.jar blockstate 与方块属性不同步的独立发现；DH/journeymap/sable 嫌疑排序与二分关闭方案。"
status: "active"
created_at: "2026-10-10T10:43:35.872Z"
updated_at: "2026-10-10T10:43:35.872Z"
content_hash: "f3ab7f5e6b20ed1dbafce6249851be2d71efcd0b7bd959c724bb91119b889d77"
source_paths:
  []
session_ids:
  - "00d5b28b-ee85-4dd2-af39-645b84efd553"
memory_body_ids:
  []
---

# 「Accessing LegacyRandomSource from multiple threads」崩溃取证（2026-10-10）

环境：Minecraft 1.21.1 + NeoForge 21.1.236 客户端整合包，gameDir = `D:\MINECRAFT\.minecraft\versions\1.21.1-NeoForge_21.1.236`。
证据文件：`crash-reports/crash-2026-10-10_18.25.32-client.txt`、`logs/latest.log`、`mcopt/gc.log`。

## 1. 崩溃事实

- 描述行：`Description: Accessing LegacyRandomSource from multiple threads`，异常 `java.lang.IllegalStateException: Accessing LegacyRandomSource from multiple threads`（`ReportedException` 包装）。
- 唯一栈（`-- Thread dumps --` 中 `Thread: Render thread`）：
  `ThreadingDetector.makeThreadingException(ThreadingDetector.java:84)` ← `LegacyRandomSource.next(LegacyRandomSource.java:49)` ← `BitRandomSource.nextInt(BitRandomSource.java:27)` ← `ClientLevel.doAnimateTick(ClientLevel.java:400)` ← `ClientLevel.animateTick(ClientLevel.java:378)` ← `Minecraft.tick(Minecraft.java:1899)`
- 时间线：`Client ticks: 1177 ticks / 58.850s`、`Wall uptime: 86.076s` ⇒ 客户端只活了约 1 分 26 秒。
- 堆 `842 MiB / 10240 MiB` ⇒ 非 OOM；MC 走了 `emergencySaveAndCrash(Minecraft.java:868)`，存档结构未损坏。
- `mcopt/gc.log` 显示重启后 uptime 到 `703.337s` ⇒ 重启后稳定跑 11 分钟以上。
- 该次崩溃发生在 Immersive Portals 移除之后（`-- Last reload --` Packs 列表中已无 `mod/immersive_portals`），与传送门那条线无关。

## 2. 机制：LegacyRandomSource 用 AtomicLong CAS 当乐观锁

对 `client-1.21.1-20240808.144430-srg.jar` 的字节码核对：

`ClientLevel.doAnimateTick` 开头即读实例字段 `this.random`（继承自 `Level.random`）：

```
2: getfield      #792  // Field random:Lnet/minecraft/util/RandomSource;
7: invokeinterface #796,2 // InterfaceMethod RandomSource.nextInt:(I)I
```

`LegacyRandomSource.next(int)`：

```
1: getfield      seed:Ljava/util/concurrent/atomic/AtomicLong;
4: AtomicLong.get()J
   ... 算出 newSeed ...
30: AtomicLong.compareAndSet:(JJ)Z
33: ifne 43                 ← 成功直接返回
36: ldc #70 // String "LegacyRandomSource"
39: invokestatic ThreadingDetector.makeThreadingException:(String, Thread)
42: athrow
```

⇒ 没有加锁，而是「读旧值 → 算新值 → CAS」；只要在 `get` 与 `compareAndSet` 之间插入任何一次别的 `next()` 调用（不论线程），CAS 失败即抛异常。

调用频率：`ClientLevel.animateTick(int,int,int)` 内是 `sipush 667` 的循环，每次调两次 `doAnimateTick`（半径 16 与 32）⇒ **每 tick 约 1334 次 random 读取，每秒约 26700 次**。任何后台线程偶尔碰一次 `level.random`，几十秒内撞车几乎必然 —— 这解释了 86 秒即崩。

## 3. 为什么报告里只有 Render thread 一条栈

`ThreadingDetector.makeThreadingException(ThreadingDetector.java:84)` 内部 `ThreadingDetector.java:92 stackTrace(...)` ← `Thread.getStackTrace(Thread.java:2451)` ← `makeThreadingException(...:82)`：只对 `Thread.currentThread()` 取栈；`LegacyRandomSource.next` 传入的第二个参数是 `null`，拿不到肇事线程引用。**⇒ 抢先动过 random 的线程，其栈结构上不可能出现在报告里；可见那条是受害者不是凶手。** 因此无法靠单份 report 点名具体 mod。

## 4. 已排除 / 待定嫌疑

`ClientLevel.java:400` 帧的 `{re:mixin,…}` 后缀列出所有改过 `ClientLevel` 的 mixin（加载顺序）：`createbigcannons → lithium → journeymap → iris → veil.necromancer → sodium(biome) → sodium(map) → offroad → sable ×6 (clip_overwrite / entity.entity_aabb_lookup / particle / plot.container / sublevel_sounds / water_occlusion) → entityculling → architectury`。

已排除：
- Sable 的 `particle.ClientLevelMixin`：其 `sable$subLevelAnimateTick(..., RandomSource, Block, BlockPos$MutableBlockPos)` 用的是传入的 local random 参数（`210: RandomSource.nextFloat`、`243: Mth.randomBetweenInclusive`），不是 `this.random`。
- Distant Horizons：`DistantHorizons-3.3.3-1.21.1-fabric-neoforge.jar` 内 `MixinClientLevel.class` 仅 493 字节、只有一个构造器，是 Fabric 映射名（`net/minecraft/class_638`）空壳，NeoForge 下为死代码；DH 的后台 worldgen 参数用 `ThreadLocal`（`ThreadWorldGenParams_neoforge` 中 `ThreadLocal.get()`），作者知晓多线程问题。

仍待定：`journeymap` / `sodium` / `veil` / `sable` 的 ClientLevelMixin 谁在别处调了 `level.random`。

二分定位顺序（若复发到每周数次）：
1. 关 DistantHorizons（唯一有大规模后台线程池的 mod，LOD world gen）
2. 关 journeymap
3. 关 sable 系（代价最大，会废掉 Create: Aeronautics）

## 5. 处置建议与可选根治

- 现在：不做处理，重启继续玩；崩溃瞬间不要手动 kill java，让 `emergencySaveAndCrash` 跑完。
- 可选根治（约 20 行 mixin）：把 `Level.random` 换成 `RandomSource.createThreadSafe()`（`ThreadSafeLegacyRandomSource`，用真正的锁、无 CAS 检测）。代价：让竞态静默通过而非修好；随机数变非确定性（粒子/音效轻微抖动差异可接受），但若有 mod 用 `level.random` 做严肃计算可能出现难查的诡异行为。

## 6. 附带发现（与本次崩溃无关）

**A. 崩前 30 秒 Server thread 卡顿**
`logs/latest.log`：
```
18:24:27.337 [Server thread/WARN] Can't keep up! Is the server overloaded? Running 3161ms or 63 ticks behind
18:24:51.597 [Server thread/WARN] Can't keep up! Is the server overloaded? Running 9272ms or 185 ticks behind
```
第二次掉 185 tick，与「资源重载 + DH 加载」同窗口，是卡顿问题的直接证据。

**B. `createpropulsion` 224 条 `missing model for variant`**
```
18:24:00.456 [Worker-ResourceReload-10/WARN] BlockStateModelLoader:
  Exception loading blockstate definition: 'createpropulsion:blockstates/tilt_adapter.json'
  missing model for variant: 'createpropulsion:tilt_adapter#aligned_x=true,axis=x,axis_along_first=true,facing=up,positive=true'
```
拆 jar 核对（`[机械动力：推进工程] createpropulsion-1.1.5.jar`）：
- `tilt_adapter.json` 只有 12 个 variant，覆盖 `axis` / `axis_along_first` / `facing` 三个属性，无 `aligned_x`、`positive`，也无 `""` 空 fallback；方块实际有 5 个属性 ⇒ 多数状态查不到模型。`advanced_tilt_adapter.json` 同样只有这 3 个属性。
- 报错里的 `oxidizer.json` / `coral.json` 在 `mods/` 下全部 52 个 jar（含 nested jar-in-jar）中一个都不存在。
- 已排除汉化包：`resourcepacks/[汉化] Create整合包汉化补全 v1.zip` 共 12 条目 = 11 个 `assets/*/lang/zh_cn.json` + `pack.mcmeta`，无任何 blockstates；`resourcepacks/CDRP` 只有 `assets/minecraft/sounds/custom/*` 且 `options.txt` 中未启用（`resourcePacks:["vanilla","mod_resources","file/[汉化] Create整合包汉化补全 v1.zip"]`）。

⇒ 属 `createpropulsion-1.1.5.jar` 自身资源与代码不同步（打包的 blockstate 是旧版本），表现为部分朝向渲染成 missing model，与用户配置、汉化包无关。

## 7. 环境备注（后续排查可复用）

- bundled / nested jar 关系：`sable-neoforge-1.21.1-2.0.6.jar` 内 `META-INF/jarjar/veil-neoforge-1.21.1-4.3.2.jar`；`[机械动力：航空学] create-aeronautics-bundled-1.21.1-*.jar` 内 `dev.simulated_team.simulated.simulated-neoforge-1.21.1-1.3.2.jar`。扫 jar 找资源必须含 nested。
- Modrinth 上 sable 最新为 `2.0.6+mc1.21.1`（2026-10-03），即当前版本；其 repo 无 LegacyRandomSource 相关 open issue（唯一 open：`837` Instant tick cobblestone generator chunkbans）。
- 相关线索来源（外部）：[Alex's Caves #1682 LegacyRandomSource 多线程崩溃](https://github.com/AlexModGuy/AlexsCaves/issues/1682)、[C2ME worldgen threading issues 的检测开关配置](https://github.com/RelativityMC/C2ME-fabric/blob/9ac50bdd8f45844dbc4c7df48ac9ef1de2fefb44/c2me-fixes-worldgen-threading-issues/src/main/java/com/ishland/c2me/fixes/worldgen/threading_issues/common/Config.java)（默认 hard fail，不建议关）。

## 8. 未决

- `journeymap` / `sodium` / `veil` / `sable` 中真正的肇事 mixin 未定位（证据不足，不猜）。
- 是否编写 `Level.random` → `createThreadSafe()` 的 mixin，待用户决定。
- `aeroportals-1.21.1-1.3.3.jar`（飞艇穿下界门）是否保留，待用户回答。
