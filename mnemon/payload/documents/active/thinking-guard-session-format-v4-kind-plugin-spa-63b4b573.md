---
id: "63b4b573-fc37-4f02-b0a7-dab235ce4e22"
title: "thinking-guard 误熔断 → 渲染崩溃链条：session format v4 拒绝裸 kind:'plugin' 与 sparse-repeat 误报取证（2026-10-28）"
description: "2026-10-28 桌面/网页渲染整片崩溃的根因链取证：证实后端存活（curl 3080 返 401）、定位到 @ethanwong-hk/dsh-thinking-guard 熔断后注入 source.kind:'plugin' 被 session format v4 admission 拒绝，Linux 落盘阻塞→会话永久写不进；附 sparse-repeat vs novelty 的作者 benchmark（误报 9.2% vs 0.6%）与三端 enabled:false 回滚决策、community 替代插件清单。"
status: "active"
created_at: "2026-10-27T19:04:18.770Z"
updated_at: "2026-10-27T19:04:18.770Z"
content_hash: "8ef9fe3b8d3a38548f712bb8ec06a7a7182598136a3c8a78ffd70afc4fa93c7c"
source_paths:
  - ".dsh/profiles/desktop/cordis.patch.yml"
  - ".dsh/profiles/web/cordis.patch.yml"
  - ".dsh/profiles/node_modules/@ethanwong-hk/dsh-thinking-guard/lib/index.js"
  - ".dsh/logs/idle-loop-guard.log"
  - ".dsh/PLAN.md"
session_ids:
  - "57e2a77b-42e9-4e30-b5c9-f371f5417568"
memory_body_ids:
  []
---

# thinking-guard 误熔断 → 渲染崩溃链条（2026-10-28）

## 触发场景

用户报告「渲染又崩溃了 / 全部都崩溃，所有会话」，起因是在前一轮把 `thinking-guard` 从 `enabled: false` 改成 `true`。

## 第一步先证伪假设：后端没死，是前端渲染崩

```
curl http://127.0.0.1:3080/   →  HTTP 401  (0.0037s)
```

401 = 服务在跑、只要求认证。**因此排查方向从前端渲染层切入是正确的**，不必去救进程。另：日志时间戳停在 02:50 之后再无启动记录 ⇒ 改完配置后 dsh 一次都没真正重启过；`patchReload: live` 只 watch `cordis.patch.yml`，`node_modules` 里的 bundle **不参与 HMR**，必须重启进程才重新加载。这条是「改了配置没反应」的通用陷阱。

## 全盘扫描退役 kind 的结论（含两个假警报）

扫三个 profile 的 `node_modules/**/lib/*.js` 找 `kind: 'plugin'`：

| 包 | 命中 | 判定 |
|---|---|---|
| `@ethanwong-hk/dsh-thinking-guard@1.0.2` | ×2（web/desktop 各 2） | **真雷** |
| `dsh-mnemon@0.5.34` | ×3 | 假警报 |
| `dsh-better-sidebar@0.28.0` | ×2 | 假警报（是注释） |

- `dsh-mnemon` 的 `kind:"plugin"` 属于它自己的 **memory-source 注册表结构体**（`installedPlugin()` 里和 `instanceKey:'plugin:'+entryId`、`provenance`、`descriptor` 一起出现），与 `SessionEvent.source.kind` 无关，纯命名撞车。
- `dsh-better-sidebar` 那两处是注释，且注释内容恰好说明它**已改成** `plugin:dsh-better-sidebar`：

> Session format v4 retired the bare `kind: 'plugin'` + `plugin` pair; a plugin is now identified by its own `plugin:<name>` kind.

**教训：按字符串 grep 找这类雷必须看上下文**，否则会误伤自建的同名字段。

## 根因链

1. **触发点** `sparse-repeat` 判据（`lib/index.js:216` 附近）：`sparseWindow=4000`、`sparseMaxUnit=12`、`sparseMinCount=5`、`sparseMinRatio=0.15`。
   Linux 日志实际命中 `detail={"kind":"sparse-repeat","sample":"0.","count":8,"share":0.4211}` 与 `sample":"v4.","count":5,"share":0.1923}` —— 是列表编号和版本号，不是空转。
2. **熔断动作**：`agent.cancel(...)`（正确）→ `agent.followup(createUserMessage({ source: { kind:'plugin', plugin:'thinking-guard', form:'notice' } }))` ×2（bug）。
3. **v4 admission 拒绝**：dsh 0.1.7 起会话格式 v4，`session-format-v3-to-v4/src/message-sources.ts` 的 `assertV4RowAdmission` 拒绝 `kind==='plugin'`（"refuses retired plugin wrappers"）。
4. **双平台差异**：
   - Windows：`createUserMessage` 的 schema 层就抛 ⇒ 日志 `注入说明失败： unreachable variant`，只中止不注入。
   - Linux：内存 `Session.append` 放行，落盘 `assertV4RowAdmission` 才拒 ⇒ 脏行卡在**持久化缓冲头部**，此后每个 checkpoint fail-closed，该会话再也写不进任何东西。前端从事件流投影不出完整消息 → 渲染状态机卡死/白屏。
5. UI 白屏属于同族症状（`turn/start` 有、对应 message 无的不一致态），可参考既有文档 `92483da9-498b-4f7f-a830-e76b3df7fc66`（同一 slot 层的 `source.kind` 无判空）。

**含义：这类插件 bug 在 Linux 上比 Windows 后果严重得多，因为拦截点更晚。**

## 修法

### 第 1 层（已做）：改 source.kind

```js
kind: 'plugin'  →  kind: 'plugin:thinking-guard'
```

这正是 v3→v4 迁移器对旧日志同一包装的改写结果（社区先例：`vlln/dsh-autofork` commit `cb7b2f4`）。web / desktop / Linux 各 2 处，语法校验通过。
**注意 fallback：`dsh plugin add` 会覆盖，重装后必须重改。**

### 第 2 层（做了但不足以救）：调参压误熔断

按插件作者源码注释里的实测数据（`C:/tmp/fx/`，40 条真实退化 + 163 条正常 reasoning）：

| 判据 | 检出 | 误报 | 中位命中 |
|---|---|---|---|
| novelty（窗口 4096、阈值 0.20） | 40/40 | **0.6%** | 6144 字符 |
| sparse-repeat | 40/40 | **9.2%** | 3072 字符 |

`MEANINGFUL = /[\p{Script=Han}\p{Script=Latin}]/u` 过滤后总误报从 15 例降到 4 例（9.2%→2.5%），仍远高于 novelty。**结论：关 `sparseWindow: 0`，只留 novelty。** 落到了三端 profile 的 `cordis.patch.yml`（desktop 此前没有这一行、走 bundle 自带默认值，会与 web 行为不一致）。

**关键失败点：`source.kind` 修好之后把 `enabled` 打开，渲染照样崩** ⇒ 说明注入路径还有别的问题，不止 v4 source kind。三端回滚 `enabled: false`。

### 最终决策

- 短期：**三端 `enabled: false`**，停止实验（当晚报了三次崩），`source.kind` 修复保留备用。
- 中期若还要防空转，`notify: false` 是核心开关 —— 完全绕开「注入消息」这条崩溃路径，代价是熔断后只有日志、界面无说明；配合 `autoContinue: false`（否则熔断→followup 继续→重新计时→再熔断，形成消耗循环）。

## 关于「loop 空转能不能根治」

**不能。** LLM 是自回归采样器，长上下文里进入高自相似 attractor 是采样过程的固有退化模式，harness 只能观察输出、不能改权重。可做的只有「检测已进入 → 把它踢出来」。任何声称彻底解决 thinking loop 的说法都不成立。

社区四类方案：
1. **事后检测 + 打断**（主流）：`@ethanwong-hk/dsh-thinking-guard`（5 档统计判据）；`@mrweicodes/dsh-loop-guard`（`escalate: 'warn'|'steer'|'cancel'`，`steer` 比 cancel 优雅）；`unknowbug/dsh-thinking-loop-guard`（在 `agent/turn-stopping` 边界检测，不打断流）。
2. **流中修复**：`visiter911/dsh-thinking-guard`（把跑偏的思考块收回思考通道，默认纯透传）。
3. **上下文清理**：`dsh-auto-checkpoint` 到水位压缩。
4. **提示词锚定**：本仓库的 `plan-anchor` / `thinking-anchor` 每步注入目标。

**长期建议换插件**：`thinking-guard` 1.0.2 停在 9-25，`@mrweicodes/dsh-loop-guard` 10-23 仍在更新。

## 升级 rc.4 的前置清单（尚未执行）

时间线：rc.2 2026-10-17T08:36 → rc.3 10-23 → rc.4 10-26。升 rc.4 前需：整目录备份（桌面端 `DeepSeek Harness.exe` + `app.asar` 必须一起换，只换 asar 会崩）、12 个插件逐个验 v4 兼容（上面的扫描脚本 `kind:'plugin'` 必须清零）、`billion-context` 0.1.208 / `ds-harness-remote` 0.5.17 / `dsh-mnemon` 0.5.34 兼容确认、`profiles/desktop/compatibility.json` 版本豁免同步。

## 附：本轮回滚清单

| 改动 | 状态 |
|---|---|
| `dsh-scroll-boost` | 四个 profile 全移除（bundles + node_modules，rc.2 时期装的，疑为「全部崩溃」元凶，升级后先别装回） |
| `idle-loop-guard` | 三端加载块已删（只剩 `allowKinds` 里的名字，不加载） |
| `thinking-guard` source.kind | 三端各 2 处 `plugin:` 前缀 ✓ |
| `thinking-guard` enabled | 三端 `false` |

相关既有文档：`b2d5fd4e-11b1-4266-af11-50fec153e1e9`（thinking-guard 静默死亡 / 熔断阈值 / checkpoint barrier，2026-10-04）、`92483da9-498b-4f7f-a830-e76b3df7fc66`（conversation.view 白屏与 source.kind 无判空）。
