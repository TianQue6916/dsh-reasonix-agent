---
id: mem-78453986a1a0b2208001aeb6ea67ed16
revision: 1
created_at: "2026-10-28T11:35:54.425Z"
updated_at: "2026-10-28T11:35:54.425Z"
name: dsh-session-age-warn-插件-20261028
description: "新插件 session-age-warn：会话累计 200 步后提醒换会话（长会话污染对策），两 profile 已挂载，需重启生效"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 是什么（2026-10-28 新增，用户拍板「会话水位提醒」）

新插件：`~/.dsh/.agent-presets/anchored-standard/session-age-warn.mjs`（129 行）

挂 `agent/pre-step`，按 session 累计步数在越线时**注入一句话**（不改历史、不压对话）：

| 配置 | 默认 | 含义 |
|---|---|---|
| `softSteps` | 200 | 累计到多少步后第一次提醒 |
| `reWarnEvery` | 80 | 首次之后每多少步最多再提醒一次 |
| `skipSubagents` | true | 子 agent 不提醒（任务本来就短） |

两个 profile patch 都已挂载，`allowKinds` 也已加入（否则第一轮会被 `context-gate` 剥掉）。

## 为什么选它（而不是另外两个候选）

用户给的三个候选里选了这个，理由写进决策：

| 方案 | 否决理由 |
|---|---|
| 自动 compaction（`compaction-basic.auto: true`） | 会压掉对话，用户踩过「上下文突然消失」的坑（token-meter 账本虚高导致真实占用 10-16% 就触发） |
| 退化块折叠（从历史删 reasoning） | 要改 transcript，影响 prefix cache 与会话一致性，风险最高 |
| **会话水位提醒** | 只注入一句话，不动任何历史 |

## 依据（社区实测）

`walksls/dsh-degeneration-kit` 跑 493 个会话日志：**24 个真退化块里 18 个回合正常结束**，只在思考里烂。
[社区 FAQ](https://dsh-ai.com/faq/762/)：「长会话出现空转时及时新建会话，避免退化思考反复回传累积」。
[eogee 复盘](https://eogee.com/article/172)：一轮 4927 行思考 98.6% 是重复，「执行。」出现 1254 次，最后靠 max_tokens 硬掐断。

⇒ 退化是 **context-saturation 的症状**，不是某个瞬间的 bug。所以「在会话变长时提醒换会话」比「已经烂了之后才打断」更接近根因。

## 实现要点（写插件时别再踩）

1. **handler 签名必须是 `(payload, next)` 且必须 `await next()`** —— 这是 cordis waterfall 契约，不调 `next()` 会否决整条内层链（`concurrency-discipline` 就是这么把 plan-anchor / thinking-anchor / git-context 全吃掉的事故，见 fact `dsh-concurrency-discipline-waterfall-veto-bug-20261028`）。
2. 用 `{ prepend: true }` 抢最外层。
3. 注入前先删掉自己的旧消息（`isOwnMessage` 只认 `source.kind === 'session-age-warn'`），避免累积成噪声。
4. 历史里已有逐字节相同的副本时只更新水位、不重复插入（省 prefix cache）。

## 验证方式（可复现，不启动 dsh）

用 cordis 直接跑 waterfall，同时挂 `plan-anchor` 以确认不被否决：

```js
const ctx = new Context();
(await import('.../session-age-warn.mjs')).apply(ctx, { sessionAgeWarn: { softSteps: 5, reWarnEvery: 3 } });
(await import('.../plan-anchor.mjs')).apply(ctx, { enabled: true, perSession: false });
// 跑 12 步，看 session-age-warn 是否只在 5 / 8 / 11 出现，且 plan-anchor 每步都在
```

实测结果：`step 5/8/11 → session-age-warn 出现，plan-anchor 全程在`；subagent 跑 8 步 `warned` 保持不变。

## 生效条件

`.mjs` **不参与 HMR** ⇒ 必须重启 dsh 进程。
`cordis.patch.yml` 的 config 是 live 的，但新插件首次加载仍需重启。

`--dump-config` 验证（web 侧已过）：
```bash
dsh --profile web --dump-config | grep -A8 'session-age-warn'
```
