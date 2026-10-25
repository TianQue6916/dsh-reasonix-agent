---
id: "26d96fc5-6cfa-4a81-bd34-1466c4452e8c"
title: "IPSable（沉浸式传送门×Sable 兼容）与 Create: Aeronautics 绳索 NPE 崩溃取证：调用链根因、社区 issue 面统计与「移除 IP」建议（2026-10-07）"
description: "1.21.1-NeoForge_21.1.236「机械动力」存档进服即崩的逐层取证：崩因是 IPSable 把 Sable prePhysicsTick 塞进 substep pipeline 后 ServerRopeStrand.reattachConstraints 的 this.constraint 为 null；附 IPSable/IP 社区 issue 面证据（30 issue/21 open、作者自认大量 bug、IP 本体 16 个月零更新、Entity 碰撞 @Redirect 被 Sable 静默覆盖），以及三条处置方案与「不动存档」约束。"
status: "active"
created_at: "2026-10-06T16:42:28.016Z"
updated_at: "2026-10-06T16:42:28.016Z"
content_hash: "e98895a9e56cde8f1319e7e19b56796836e506242e1481f5aa81474e8de48a73"
source_paths:
  []
session_ids:
  - "32385fcd-5183-4308-a9ed-4e7a7cf59e96"
memory_body_ids:
  []
---

# IPSable × Create: Aeronautics 绳索 NPE 崩溃取证（2026-10-07）

## 背景与范围

- 实例：`D:\MINECRAFT\.minecraft\versions\1.21.1-NeoForge_21.1.236\`（NeoForge 21.1.236/21.1.244、fml_loader 4.0.43、modlauncher 11.0.5）
- 受影响存档：`saves/机械动力`（另有 `saves/新的世界`、`saves/新的世界 (1)`）；崩溃时间 2026-10-07 00:31:14
- 直接诱因组合：`[沉浸式传送门xSable兼容] immersive-portals-sable-compat-0.5.0.jar`（IPSable）+ `simulated-neoforge-1.21.1-1.3.2.jar`（Create: Aeronautics 侧，mod id `simulated`）+ `sable-neoforge-1.21.1-2.0.6.jar`
- 用户约束（m00001 附近，本轮原话）：「注意社区经验,最好是别改动我的游戏内容」——任何修法**不得改动存档内方块/实体/机器状态**
- 同一实例的另一条独立线索见文档 d43e5f2d-0674-4b46-9fc4-61a7dcbd0847（tick 掉帧 F3「T:」证伪）

## 硬证据：崩溃原文（crash report 头部 + latest.log）

```
---- Minecraft Crash Report ----
Please make sure this issue is not caused by Sable before reporting it to other mod authors.
Time: 2026-10-07 00:31:14
Description: Sable ticking physics (IPL fused step)

java.lang.NullPointerException: Cannot invoke
"dev.ryanhcode.sable.api.physics.constraint.PhysicsConstraintHandle.setMotor(
   dev.ryanhcode.sable.api.physics.constraint.ConstraintJointAxis, double, double, double, boolean, double)"
because "this.constraint" is null
	at simulated@1.3.2 ServerRopeStrand.reattachConstraints(ServerRopeStrand.java:259)
	at simulated@1.3.2 ServerRopeStrand.prePhysicsTick(ServerRopeStrand.java:334)
	at simulated@1.3.2 ServerLevelRopeManager.physicsTick(ServerLevelRopeManager.java:69)
	at simulated@1.3.2 SimulatedCommonEvents.onPhysicsTick(SimulatedCommonEvents.java:114)
	at sable@2.0.6 SableEventPlatformImpl.lambda$onPhysicsTick$1(SableEventPlatformImpl.java:23)
	at sable@2.0.6 SableEventPublishPlatformImpl.prePhysicsTick(SableEventPublishPlatformImpl.java:35)
	at immersive_portals_core@0.5.0 ipl.sable.atlas.IplFusedStep.preSubstepPhases(IplFusedStep.java:170)
	at immersive_portals_core@0.5.0 ipl.sable.atlas.IplFusedStep.lambda$driveFused$0(IplFusedStep.java:117)
	at immersive_portals_core@0.5.0 ipl.sable.atlas.IplFusedStep.runGuarded(IplFusedStep.java:198)
	at immersive_portals_core@0.5.0 ipl.sable.atlas.IplFusedStep.driveFused(IplFusedStep.java:117)
	at immersive_portals_core@0.5.0 ipl.sable.atlas.IplFusedStep.onTickPipelinePhysics(IplFusedStep.java:64)
	at sable@2.0.6 SubLevelPhysicsSystem.handler$eod000$immersive_portals_core$ipl$fuseStep(SubLevelPhysicsSystem.java:703)
	at sable@2.0.6 SubLevelPhysicsSystem.tickPipelinePhysics(SubLevelPhysicsSystem.java)
	at sable@2.0.6 SubLevelPhysicsSystem.tick(SubLevelPhysicsSystem.java:238)
```

调用链（自下而上，行号即上表）：

```
SubLevelPhysicsSystem.tick(:238)
 └ handler$eod000$immersive_portals_core$ipl$fuseStep(:703)   ← IPSable mixin 换掉 Sable 原生 tick
   └ IplFusedStep.onTickPipelinePhysics(:64) → driveFused(:117) → lambda$driveFused$0
     └ preSubstepPhases(:170) → SableEventPublishPlatformImpl.prePhysicsTick(:35)
       └ SimulatedCommonEvents.onPhysicsTick(:114)
         └ ServerLevelRopeManager.physicsTick(:69)
           └ ServerRopeStrand.prePhysicsTick(:334) → reattachConstraints(:259)  ✗ NPE
```

同日志中紧邻的另一条（非崩溃，但暴露同类冲突）：

```
[Render thread/ERROR] [iPortal/]: Raycast too far
  ... immersive_portals_core BlockGetter.md430d80$immersive_portals_core$lambda$onTraverseBlocks$0$0(BlockGetter.java:1532)
      LimitedLogger.invoke(LimitedLogger.java:51)
      ... ClientLevel.clip
  at effortlessbuilding BuildPipelineClient.getPreviewBlocks(BuildPipelineClient.java:288)
     → BlockPreviewRenderer.render(:65) → RenderHandler.onRenderLevel(:63)
```

## 根因机制

- Sable 原生的 `prePhysicsTick` 是**整 tick 一次**；IPSable 的 `IplFusedStep`（mixin 注入 `SubLevelPhysicsSystem`）把 physics pipeline 改成 **substep 循环**，在每个 substep 前重新发布 `prePhysicsTick`。
- `simulated` 的 `ServerRopeStrand.reattachConstraints`（:259）无条件调用 `this.constraint.setMotor(...)`，**不判 `this.constraint == null`**；时机变成「每 substep 多次」后，在 constraint 尚未建立/已被清掉的窗口内被调用即 NPE。
- 即：这是 **IPSable 改变既有事件时机** × **Aeronautics 绳索侧未防御** 的交叉缺陷，不是单一 mod 的输出错误；`模拟`/`simulated` 侧不判空是必要条件。
- 注意 Sable 崩报模板本身的免责句（"Please make sure this issue is not caused by Sable…"）说明该崩在 Sable 生态里是常见误报归属点。

## 社区经验（用户要求先查的部分）

| 来源 | 要点（逐字或近逐字） |
|---|---|
| IPSable 官方作者 GaMiR9195，2026-07-17，IP 仓库 issue #64 评论 | "We making full support mod … **Where is a lot's of game breaking bugs**, but we already got smooth sub-level mid dimensional teleportation." |
| IPSable issue 面 | 30 issue / **21 open**：跨维度变虚体(#27)、sub-level 不与液体交互(#25)、无碰撞(#24)、把手乱飞(#23)、sub-level 动不了(#22)、性能(#20)、椅子致地形不渲染(#18)、布娃娃碎掉(#17)、**旋转轴承 NPE 崩服(#6，与本次同型，open 三个月无回复)** |
| IPSable #26（2026-08-26，open） | 标题含 Create Aeronautics：官方确认 "Issue 2: Incompatibility with Create Aeronautics: The Velocity sensor does not function"；另有 Create Coasters 三处（螺钉放置失效、Coaster Cart 不连接/不渲染） |
| IP #64, Jakobabs | 日志原文：`@Redirect conflict. Skipping imm_ptl.mixins.json:common.collision.MixinEntity … with priority 1000, already redirected by sable.mixins.json:entity.entity_sublevel_collision.EntityMixin … with priority 1100` —— `Entity` 碰撞这处是 Sable 抢赢、IP 被静默跳过（此前只修好了 `Player` 那处）；结论 "Both mods are redirecting the Entity Collision Mixin which is causing the crash." |
| IP #64, therealKoolant（2026-05-12） | 曾做到 sable+iportals 同存并渲染 portal 与物理 contraption，但 "broke all sable collision with the player"，且 "hard lock the world with a network protocol error kick" |
| IP #64, nwmqpa（2026-06-05） | 第三方补丁 `https://github.com/nwmqpa/ImmersivePortalsNSableCompat`（修了 network packet，sublevel 方块行为未解决）；后其成果并入 IPSable 官方线 |
| IP #64, GaMiR9195（2026-07-17） | 官方线 = `https://github.com/r2smith141/IPSable/releases`，个人仓 `https://github.com/GaMiR9195/immersiveportals-x-sable` |
| Immersive Portals 本体, Modrinth `immersive-portals-neoforge` (zf4Szzx2) 1.21.1 | 仅 5 版；最新 **6.0.7 release 2025-06-18**（其余 6.0.6/6.0.3/6.0.3-alpha3/alpha2 均为 2024 beta/alpha）⇒ 1.21.1 线约 16 个月零更新 |
| IP #64 评论（评论者立场需注意） | "This mod isn't getting updated anymore"；同 thread 有 "i made it up (i was bumping not saying yes)" 这类噪声，引用时只取带日志/仓库链接者 |

**社区一致判断：这不是「装个补丁就好」的缺陷，而是该组合整体未成熟。**

## 存档侧事实（用于证明「移除 mod 不改存档内容」）

- `saves/机械动力/` 结构：`DIM-1`、`DIM1`、`region`、`entities`、`sublevels`、`dimensions`、`data`、`playerdata`、`poi`、`config`、`datapacks`、`serverconfig`、`enxv_aeronautics_server_structures`、`level.dat`
- `data/` 内与本次相关的 SavedData：`aeronautics_unloaded_balloons.dat`(193 B)、`sable_sub_level_occupancy.dat`(158 B)、`sable_sub_level_force_load_tickets.dat`(60 B)、`sable_tracking_points.dat`(1005 B)、`sablecleanup_creators/lifetimes/locations/movement.dat`、`create_tracks.dat`(55471 B)、`powergrid_electric_network_data.dat`、`global_portal.dat`(61 B)
- 用户确实在用 PVC/绳索生态：`aeronautics_unloaded_balloons.dat` 存在 ⇒ 绳索（`simulated:rope` / `serverRope`，Create: Aeronautics 用于拴飞艇、滑索）在存档中已被使用，只是用户口语称「绳子」
- 存档体积侧记：`data/DistantHorizons.sqlite` 约 10.98 GB（Distant Horizons LOD 库，与本次无关）
- 时间线锚点：用户 2026-10-06 23:19 装 IP/IPSable；10-07 00:31 崩

## 结论与处置方案（截至本 checkpoint 用户尚未选择）

判断：**建议放弃 Immersive Portals / IPSable**。理由是修完绳子后仍排着约 10 个同级别 open bug（作者自认），继续打补丁等于拿用户存档当试验场，与用户「别动游戏内容」诉求相反。

- ① **（推荐）把 IPSable 从 `mods/` 移出**：等效少装一个 mod，`saves/机械动力` 的方块/飞艇/气球/电力网络零字节变化，回到 10-06 23:19 之前（可用）状态。原 IP jar 留在 `mods-disabled/` 以便随时放回。代价：无沉浸式传送门。
- ② **换更稳的传送方式**：如 Waystones（传送点，不与 Sable 抢 mixin）；如需再由 agent 评估。
- ③ **用户自行启动验证**：若不崩则说明该绳为特定位置加载触发，尚有讨论余地。

## 待办 / 未决

- 用户需在 ①②③ 间选择；未选择前不得改动 `mods/`、不得写存档。
- 若选 ①，移动范围建议限定 `mods/` 内 IPSable 及其依赖判定，移动后复核启动日志无 `ipl_sable.mixins.json` 加载行。
- 未验证项：`simulated` 侧是否在新版修了 :259 判空；IPSable #6/#26 是否已有 closed 进展——需要时再做一次 bounded 检索。
