---
id: mem-25916726689ecfa79330491206bbb82b
revision: 1
created_at: "2026-10-27T09:00:23.612Z"
updated_at: "2026-10-27T09:00:23.612Z"
name: idle-loop-guard-injection-ineffective-root-cause
description: "idle-loop-guard 注入无效的三个原因（缺 prepend / 缺 prune / 缺 allowKinds）+ 三次升级阶梯保住任务连续性"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 2026-10-27 实测：纯注入 9 次，一次都没拦住

`idle-loop-guard.log` 原始记录：
```
08:15 FIRE steps=3   textChars=0
08:17 FIRE steps=9   textChars=0
08:36 FIRE steps=3   textChars=0
08:39 FIRE steps=9   textChars=0
08:42 FIRE steps=15  textChars=0
08:44 FIRE steps=21  textChars=0
```
**检测对、注入到了（用户在屏幕上看见过提示）、行为没变。** 模型把那条 user message 当成"又一段上下文"，继续按原计划走。

## 三个必须同时满足的条件

**① `{ prepend: true }` —— 位置决定服从**

`thinking-anchor.mjs` 头注释的实测结论（2026-09-30）：
> 把「思考链用中文」放在 persona / system prompt 里（**无论措辞多硬**）都不管用。
> 指令"在 system prompt 里"这个事实本身不足以保证服从，**位置比措辞重要**。
> 紧贴生成点的位置 —— 比 system prompt 更靠近采样，是这个 harness 里能拿到的最强位置。

`ctx.on('agent/pre-step', h, { prepend: true })` = unshift 到 listener 数组头部 = 抢最外层 = 改写结果最后应用 = 最贴近采样点。

**② 必须 prune 历史**

```js
const kept = decision.messages.filter((m) => m?.source?.kind !== name);
```
transcript 只增不改，不剪会累加成噪声（`thinking-anchor` 的 `pruneHistory` 就是干这个的）。

**③ context-gate 的 `allowKinds` 必须含本插件**

`profiles/*/cordis.patch.yml` 的 `allowKinds: [skill-invocation, thinking-anchor, plan-anchor]` 不含 `idle-loop-guard` ⇒ 首轮（unpromoted）注入会被剥掉。已加进去（desktop/web；headless 没挂 context-gate，不需要）。

## 干预强度阶梯（用户明确要求「介入之后还要让任务继续」）

**不能一上来就 cancel —— 那会把任务打断，用户还得手动续。**

```
第 1 次 FIRE  → prepend 注入 + 提示"这是第 N 次提醒；再犯会直接中止本轮"
第 2 次 FIRE  → 同上（任务仍在跑）
第 3 次 FIRE  → agent.cancel() 兜底
```
`escalateAfter: 3`。前两次保住连续性，第三次才动用中断。

## 为什么不用 autoContinue

`stall-guard.mjs` 的头注释（2026-10-03 定论）：
> 故意不做 autoContinue —— thinking-guard 熔断后注入「继续」→ 新 attempt → 又空转 → 又熔断，
> 形成死循环并让问题看起来更严重。

所以**熔断后不自动续**，而是靠「前两次不熔断、只强力注入」来兼顾连续性和止损。

## 已知小 bug（不影响主判据）

`textChars` 恒为 0 —— `frame.type === 'text-delta'` 没匹配上真实取值。
不影响判定，因为 `maxText===0 || s.stepTextChars <= maxText` 在 0 时恒真，"有没有 tool call"这个主判据依然准确。

## 验收

重启 dsh 后看 `~/.dsh/logs/idle-loop-guard.log`：
```
FIRE sess=... fire#1 ...                        ← 第 1、2 次只警告
ESCALATE sess=... fires=3 steps=N — cancelling  ← 第 3 次才断
```
若只看到 FIRE 没有 ESCALATE 且空转依旧 → `prepend` 仍不够，下一步是把提示塞进 `system-prompt/assemble`（更早一层）。
