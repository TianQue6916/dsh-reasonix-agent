---
id: mem-f29ea0cb43ca2e2b57e5e4cd82aa665e
revision: 1
created_at: "2026-10-27T09:11:31.364Z"
updated_at: "2026-10-27T09:11:31.364Z"
name: agent-cancel-breaks-renderer-steer-instead
description: "agent.cancel 用在「空转」场景会导致前端渲染崩溃（对话区空白、只有轨迹视图可见）；已禁用 idle-loop-guard，教训是社区默认用 steer 不用 cancel"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 现象（2026-10-27 17:4x）
对话窗口不再显示内容，切到「轨迹」视图才看得到 —— 渲染层崩了。

## 根因：`agent.cancel()` 与前端状态不一致

`idle-loop-guard.log` 的现场：
```
09:07:52  ESCALATE sess=…cf fires=3 steps=15 — cancelling turn
09:10:21  FIRE     sess=…cf steps=21 textChars=0 fire#1
09:10:58  installed pid=13800           ← 用户手动重启
```

`agent.cancel({kind:'idle-loop-guard', ...})` 被执行后：
1. turn 被中止
2. **但前端没有对应的渲染分支处理这个 `aborted` cause**
3. 对话区渲染失败，只有「轨迹」视图（原始事件流）还能显示

**这是 `agent.cancel()` 用在「空转」场景的副作用** —— 它本来是为 `stall-guard`（turn 永久冻住、无任何 stream 帧）设计的，那种情况下 UI 本来就不动了，cancel 不会让情况变差；但对「正常在输出、只是没动手」的 turn 用 cancel，前端会拿到一个它没预期的中断。

## 社区早就给了答案（2026-10-27 查证）

`@mrweicodes/dsh-loop-guard` 默认档位是 **`escalate: 'steer'`**，**不是 `cancel`**：
```ts
/** 命中后做什么：'warn' | 'steer'（默认） | 'cancel'。 */
escalate?: 'warn' | 'steer' | 'cancel'
/** 切断时注入一条纠正提示，让模型回到原任务。默认 true。 */
breakCorrection?: boolean
/** 切断后等回合收尾，不等你发话就自动续跑。默认 false。 */
resumeAfterBreak?: boolean
```
它的 FAQ 原文：
> 切断只结束**当前这一次调用**；回合**正常收尾**、会话保持可用，**任务自然继续下去**。

**关键区分**：
| 粒度 | 谁做 | UI 影响 |
|---|---|---|
| 切断当前 LLM call（`breakCorrection`） | loop-guard 默认 | 回合继续，UI 正常 |
| **中止整个 turn（`agent.cancel()`）** | 只有 stall-guard 该用 | **前端可能没有对应渲染分支** |
| 切断后自动续跑（`resumeAfterBreak`） | 可选 | 有死循环风险 |

## 处置
**已把三 profile 的 `idle-loop-guard` 改成 `enabled: false`**（`cordis.patch.yml` 的 config 块）。patch 参与 HMR，**开新会话即生效，不必重启进程**。

## 教训（下次别再犯）
1. **`agent.cancel()` 是重武器**，只在「turn 已经不动了」时用。对「还在正常输出、只是方向错」的 turn 用它，会制造 UI 侧的状态不一致。
2. **社区默认值往往踩过坑**：`escalate` 默认 `steer` 而不是 `cancel`，`resumeAfterBreak` 默认 `false` 而不是 `true` —— 两个默认都是保守的那一侧。
3. 想做「切断当前 call」必须挂在 **`llm/stream`** 层面（loop-guard 就在那），`agent/pre-step` 只能改 messages、切不了流。

## 回滚
把 `enabled: false` 删掉即可重新启用（但**别急着启用** —— 需要先改成纯 steer，去掉 escalate 的 cancel 分支）。
