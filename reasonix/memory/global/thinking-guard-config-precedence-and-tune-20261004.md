---
id: mem-9a42ee4fb3f1db6c9ed2999ef78f2985
revision: 1
created_at: "2026-10-04T03:56:42.245Z"
updated_at: "2026-10-04T03:56:42.245Z"
name: thinking-guard-config-precedence-and-tune-20261004
description: "thinking-guard 的配置覆盖层级（bundle patch 被 profile row 覆盖）+ 4 个真 trip session 证据 + 新参数 300000/200000/verbose"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 结论：thinking-guard 从来没被真正禁用过，且 bundle patch 会被 profile row 覆盖

**配置优先级（实证，非推测）**：一个 bundle（如 `@ethanwong-hk/dsh-thinking-guard`）自带
`node_modules/<pkg>/cordis.patch.yml`，它**不是**最终值 —— profile 自己的
`~/.dsh/profiles/<p>/cordis.patch.yml` 里**同 id 的 row 会覆盖它**。
`--dump-config` 里能看到确证注释：`# == @ethanwong-hk/dsh-thinking-guard, patched by C:\Users\27063\.dsh\profiles\web\cordis.patch.yml`
⇒ 最后应用的那一层名在注释里。

**踩的坑**：2026-10-03 22:57 我在两侧 `node_modules/@ethanwong-hk/dsh-thinking-guard/cordis.patch.yml`
把 `enabled` 改成 `false`（脚本 `patch-thinking-guard-disable.py`），**web 侧完全无效** ——
`profiles/web/cordis.patch.yml:1271` 早就有一份 `- id: thinking-guard` 的 row，写的是 `enabled: true`，
它排在 bundle patch 之后 ⇒ **覆盖**。desktop 侧没有那份 row ⇒ desktop 确实一直是禁用的。
⇒ 两侧行为一直不同，且我从 `--dump-config` 里没核对过这一行的最终值。

**真的 trip 过（durable 证据，4 个 session）**：判据 = session 解压文本里含 `思考空转被熔断中止`
或 `source.plugin='thinking-guard'` 的 `user/message`（`notifyContinue()` 注入的文本）：
- 10-01 14:24 `58c0c7e6-fee8-40b1-978c-297675a48cbd`（`thinking-only-timeout` ×10）
- 10-01 19:51 `session-93c8a0ac-8f28-4b16-9812-80a288fa93b5`（+`自动继续当前任务` ×3、`思考空转被熔断中止` ×2）
- 10-02 14:37 `session-a6288d3e-debd-4b5a-b3cf-f555d705537a`（+2/+4）
- **10-04 00:14 `1dc350c2-e541-4fdd-bb48-adc83d92cb7c`（`思考空转被熔断中止` ×6）**
⇒ 推翻 `Desktop\工具箱\会话断点\结果.md` 里「thinking-guard 一次都没出手」的结论。
**注意排除本 session**（`session-a0d5fbf8-…`，13942 次命中全是「读它源码的输出被记进 session」）。

## 参数与理由（2026-10-04 11:55 已落盘两侧）
判据源码 `lib/index.js:381`：`if (noProgress && st.reasoningChars > 0) { const heldMs = Date.now() - st.lastProgressAt; if (heldMs >= cfg.thinkingOnlyMs) trip(agent, st, 'thinking-only-timeout', { heldMs }); }`
（`noProgress = st.textChars === 0 && st.toolCalls === 0`）。**注意 `reasoning-delta` 分支不更新 `lastProgressAt`**，
只有 `text-delta` / `tool-call-delta` / `block-start` 更新 ⇒ 该阈值量的是「多久没产出可见内容」，
所以「45s < 上游 180s 首 chunk 超时 ⇒ 死循环」这个旧推断**是错的**（首 chunk 未到时 `reasoningChars == 0`，判据不触发）。

真问题 = 45s 太短（本机主力 model `deepseek/deepseek-v4.1-flash` 的 maxTokens 是 262144，深度思考 45s 无产出很正常）；
trip 后 `autoContinue` 会 `agent.followup()` 注入「继续。上一回合因思考空转被熔断中止（thinking-only-timeout）…」
并开新 attempt ⇒ 重新计时 ⇒ 再 45s ⇒ 再熔断，用户看到的就是 turn 被莫名中止。

新值（**两侧 profile row 已一致**）：
```yaml
- id: thinking-guard
  config:
    enabled: true
    thinkingOnlyMs: 300000     # 45000 -> 300000（5 min）
    maxThinkingChars: 200000   # 80000 -> 200000（≈50k token）
    repeatThreshold: 3
    sparseMinCount: 30         # 2026-10-01 中文语料校准：与流式复测一致，勿回落 5
    gramDensity: 2.7           # 等效禁用（40 条真实退化上贡献 0 条，却误报 LaTeX 3 例）
    autoContinue: true
    notify: true
    verbose: true              # ← 关键：lib/index.js:299 的 log() 只在 verbose 时输出，
                               #   verbose:false 时「已启用：thinkingOnlyMs=…」永不落盘 ⇒ 无痕迹可验
```
- 落点：`profiles/web/cordis.patch.yml`（改现有 row）+ `profiles/desktop/cordis.patch.yml`（**新增** row，
  之前只有 web 有 ⇒ 两侧分裂的根源）。
- 备份：`profiles/web/cordis.patch.yml.bak-20261004-115555-pre-guard-tune`、
  `profiles/desktop/cordis.patch.yml.bak-20261004-115615-pre-guard-row`；
  另有 `node_modules/@ethanwong-hk/dsh-thinking-guard/cordis.patch.yml.bak-20261004-115226-pre-guard-tune`（同步调参）。
- 验证：`--profile web --dump-config` → 该 row 显示新值 + 「patched by profile」注释 ✓（exit 0 / stderr 0 B）；
  desktop 的 row 抽成临时 overlay 喂给 `--profile web --patch` 也能正常 merge（证明语法与语义 OK，因为
  `--profile desktop` 被 `lib/bin.js:36` 硬拦：`error: profile "desktop" is managed exclusively by the Electron application`）。
- **生效条件 = 两侧重启**（web 3080 与 desktop App；`cordis.patch.yml` 参与 live reload 但 profile row 属于启动期组装）。

## 观测通道（无此则无法验证）
插件 `console.log` / `console.warn` 在 `--profile web` 的 CLI 进程里**看不到**（启动只输出 82 B 一行 URL），
但 `host-stdio.log` 的 host-log-tee 会以 `[out]` 前缀捕获 ⇒ 重启后 grep
`C:\Users\27063\.dsh\logs\host-stdio.log` 应出现 `[thinking-guard] 消息工厂 已就绪` 与
`[thinking-guard] 已启用：thinkingOnlyMs=300000 …`。截至 2026-10-04 11:56 该文件 232537 B 且
`grep -c thinking-guard` = **0**（因配置尚未重启加载，且 desktop 侧本就 disabled）。
`grep -c "^\[tee\] installed"` = 8（多个进程各自装了一份 tee，含 web 3080 pid=26976、desktop host pid=17472）。

## 可复用脚本
`~/.dsh/storages/tools/patch-thinking-guard-tune.py`（`--check/--apply/--verify/--restore`）—— 只改
**node_modules 里那份 bundle patch**，因此对 web **无效**；改 profile row 用它的规则做参照，但落点必须是
`profiles/<p>/cordis.patch.yml`。
