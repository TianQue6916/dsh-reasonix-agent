---
id: "d43e5f2d-0674-4b46-9fc4-61a7dcbd0847"
title: "Minecraft 1.21.1 整合包 tick 掉帧取证：F3「T:」字段证伪、createharmonics 跨线程粒子洪泛（2026-10-04）"
description: "对 1.21.1-NeoForge_21.1.236 实例「TPS 只有 12.5」说法的逐项取证与证伪：反编译 fiu.class 证明 F3 的 T: 是无人引用的遗留常量、sable config 无 tick rate 选项、Can't keep up 仅 4 次属尖峰、createharmonics 1.1.7 从 coroutine worker 调 addParticle 触发 3724 次 CheckedThreadLocalRandom ERROR、Canary 与 lithium 冲突、/tick query 与 spark 诊断流程与 A/B 验证方案。关联 NeoForge 升级评估 df1aaf62。"
status: "active"
created_at: "2026-10-04T07:35:04.086Z"
updated_at: "2026-10-04T07:35:04.086Z"
content_hash: "5cea3291c955abc3aca02b77a7322ec1d0fb1abc82f5de5f59a9df3033e4043d"
source_paths:
  []
session_ids:
  - "c2f17333-c2c0-4a16-a5eb-ae5259ba4a96"
memory_body_ids:
  []
---

# Minecraft 1.21.1 整合包 tick 掉帧取证（2026-10-04）

## 背景与范围

实例：`D:\MINECRAFT\.minecraft\versions\1.21.1-NeoForge_21.1.236\`（NeoForge 21.1.236，MC 1.21.1）。
起点是一份「F3 显示 `T: 80`，即 tick time 80ms ⇒ 12.5 TPS，需要装 Canary / Physics Tick Rate 配置 / Create: Advanced Optimization」的分析。用户要求逐条核实，而不是转述。

同实例相关文档：NeoForge 21.1.236→21.1.244 升级评估 `df1aaf62-90a1-4241-a234-686dfc78babe`。

## 一、证伪：「T: 80 = tick time」不成立

反编译 `1.21.1-NeoForge_21.1.236.jar` 中的 `fiu.class`（= `DebugScreenOverlay`）：

- 全 jar 含 `'T: '` 字面量的 class 只有 `dej.class` / `dzb.class` / `fgo.class` / `fiu.class` / `we.class`。
- `fiu.class` 常量池中唯一相关项：
  - `#472 = String // P: \u0001. T: \u0001`
  - `#252 = String // FPS + TPS`
  - `#254 = String // FPS`
- **关键**：字节码里没有任何 `ldc #472` —— 该 `P: %s. T: %s` 是**无人引用的遗留常量**。实际被 `ldc` 的是 `#252` / `#254`，它们是 F3 图表（FPS/TPS 曲线）的**标题**。
- `fiu$a.class` 是一个 GC 采样内部类（`GarbageCollectorMXBean` 列表 + 500ms 冷却的 `long a(long)`），与 TPS 显示无关。

⇒ 「T: 就是 tick time」这一步推论**没有字节码依据**，后续所有 TPS 数值推算随之作废。
教训：F3 字段的含义要落到常量池 + `ldc` 引用点上验证，不能凭字面量猜测。

## 二、证伪：配置项不存在 / mod 重复

- `sable-common.toml`（14 项）与 `sable-client.toml`（8 项）逐行核对：**没有** tick rate、物理频率、或「Max Sub-Levels」上限。
- `Canary` = Lithium 的 Forge 移植，与本实例已装的 `lithium-neoforge-0.15.4+mc1.21.1.jar` 功能完全重叠，**安装会冲突**。
- `Create: Advanced Optimization` **已装**：`createadvancedoptimization-1.5.jar`（1.21.1 分支最新版），`config/createadvancedoptimization-server.toml` 中 `enabled = true` 已生效。
- Sable 确实改 F3：`sable.mixins.json` 的 `client` 数组含 `debug_render.DebugScreenOverlayMixin`，方法签名 `public java.util.List<java.lang.String> sable$addDebugInfo(java.util.List<java.lang.String>)`（F3 里的 Sub-Levels 行由它注入）。

## 三、tick 掉帧的真实形态：尖峰而非持续

`logs/latest.log`（8.87 MB，2026-10-04 15:02）中 `Can't keep up!` 共 **4 次**：

```
14:16:31.263  Running 3264ms or 65 ticks behind
14:16:54.471  Running 8222ms or 164 ticks behind
14:20:43.350  Running 2001ms or 40 ticks behind
15:00:21.040  Running 2040ms or 40 ticks behind
```

该 warning 由 server thread 周期性检查产生；若是持续 12.5 TPS，44 分钟内会有数千条。⇒ 判定为**偶发尖峰**，最严重一次落后 8.2 秒。**根因方向不是平均 tick 超时**。

另两个独立观测：

- 进世界耗时 90 秒：`[Render thread/WARN] [ModernFix/]: Total time to load game and open world was 90.15044 seconds`。
- Create 配方索引每次进世界重建：`[Server thread/INFO] [Create]: RecipeTrie of depth 5 with 618 nodes built with 523 variants, 370 ingredients`（14:16:30）。

## 四、明确的开销源：createharmonics 唱片机粒子跨线程 + 日志洪泛

堆栈（`latest.log`，`[DefaultDispatcher-worker-N/ERROR] [CheckedThreadLocalRandom/]`）：

```
java.lang.Throwable: ThreadLocalRandom accessed from a different thread (owner: Render thread)
  at net.minecraft.client.renderer.LevelRenderer.addParticleInternal(LevelRenderer.java:2667)
  at net.minecraft.client.renderer.LevelRenderer.addParticle(LevelRenderer.java:2620)
  at net.minecraft.client.multiplayer.ClientLevel.addParticle(ClientLevel.java:699)
  at createharmonics@1.1.7/me.mochibit.createharmonics.content.kinetics.recordPlayer.RecordPlayerBehaviour$playerParticleJob$1.invokeSuspend(...)
  at createharmonics@1.1.7/me.mochibit.createharmonics.foundation.async.HelperFunsKt$repeatingLaunch$1.invokeSuspend(HelperFuns.kt:66)
  at kotlinx.coroutines.DispatchedTask.run(...)
```

机制：`HelperFunsKt$repeatingLaunch`（HelperFuns.kt:66）是在 kotlinx.coroutines `DispatchedTask` worker 线程上的 coroutine 循环，却调用主线程专属的 `LevelRenderer.addParticle`（内部用 `ThreadLocalRandom`，隐含「仅主线程访问」假设）。`CheckedThreadLocalRandom` 检出 owner 不符后打 ERROR + 完整堆栈。

实测规模：该 ERROR 在 `latest.log` 中出现 **3724 次**，每次约 30 行 stack trace（双重代价：跨线程数据竞争风险 + 同步写日志放大开销）。

堆栈中 mod 帧统计：`minecraft@1.21.1` 11174、`createharmonics@1.1.7` 7448、`unsafe_world_random_access_detector@1.1.3+neoforge` 5586、`iris@1.8.14-beta.1+mc1.21.1` 4。触发类：`RecordPlayerBehaviour$playerParticleJob$` 5586、`HelperFunsKt$repeatingLaunch$` 1862。

`unsafe-world-random-access-detector` 的定位是**诊断工具**（故意把跨线程访问升级为 ERROR），不是性能 mod；它当前在放大问题。

相关 config 无可用开关：`config/createharmonics-client.toml`（`menu_buttons` / `audio_sources` / `audio_effects` / `library` / `debug` 各组）与 `config/createharmonics-server.toml`（`stressValues.v1` 的 jukebox 应力与 `maxSoundRange = 32`，以及各材质唱片 `maxUses_*`）中都没有粒子频率/线程开关。

## 五、可自证、零转述的诊断流程

1. `/tick query` + `/tick query percentile` —— MC 1.21.1 原生，输出 `Average time per tick: Xms (Target: 50ms)` 与 P50/P95/P99。**先做这一步**：若平均 < 50ms，问题不在 tick，方向应转向渲染/加载。
2. `/debug start` → 正常游玩约 10 秒 → `/debug stop` —— 原生 profiler，按类别输出耗时占比。
3. `spark` —— 本实例**未安装**，是唯一能精确定位「某个 mod 的某个方法占多少百分比」的工具（`/spark profiler start` → 30s → stop → 出火焰图链接）。

## 六、下一步实验（可逆、能证伪）

- **A/B 验证粒子 bug（最高性价比）**：把 `createharmonics-neoforge-1.21.1-1.1.7.jar` 临时移到 `mods-disabled/`，跑相同场景，对比 `Can't keep up!` 次数与日志体积。**未做此实验前，第四节只是「高度可疑」而非「已确证」**。
- 不要安装 Canary（与 lithium 冲突）；`unsafe-world-random-access-detector` 完成定位后可以移除。

## 未决

- 原始 F3 截图未见到（先前只有他人对该截图的解读），`Sub-Levels` 行以外的字段含义未逐条核对。
- 尖峰的最终根因（GC、DH shader 加载、区块/物理峰值）尚未由 `/tick query percentile` 或 spark 定论；日志中尖峰前的 14 行多为 DistantHorizons shader 加载噪声，不足以归因。
