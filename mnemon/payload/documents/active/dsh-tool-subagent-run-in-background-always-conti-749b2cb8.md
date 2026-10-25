---
id: "749b2cb8-a422-4b7d-a13a-1758d3bcbc2a"
title: "dsh-tool-subagent run_in_background 双语义解耦（always-continuable patch）：subagent 98% one-shot 的根因与修复"
description: "2026-10-04 定位的「web UI 里 agent 调出的 subagent 全是只读」根因链：resolveDelegationRun 让模型参数推翻 preset 的 continuable 策略 ⇒ 前台 settleForegroundRun 无条件 dispose ⇒ identity.mode=\"one-shot\" ⇒ selectReadOnlySubagent 锁 composer。含 1634 session 的 mode 分布证据、patch 代码与 5 分支路由单测、维护义务（pnpm install 覆盖）、以及「人调 subagent」入口现状（有 catalog/remote 续聊，无 subagent.start）。"
status: "active"
created_at: "2026-10-04T02:40:23.726Z"
updated_at: "2026-10-04T02:40:23.726Z"
content_hash: "d98bda234302716b15503c286944f3511419dca5cc3065638b3ccf88227978e0"
source_paths:
  - ".dsh/profiles/node_modules/@deepseek-ai/dsh-tool-subagent/lib/index.js"
  - ".dsh/.agent-presets/anchored-standard/agent.cordis.yml"
  - ".dsh/storages/tools/patch-tool-subagent-always-continuable.py"
  - ".dsh/patches/README-tool-subagent-always-continuable.md"
  - ".dsh/storages/session_projcache/sessions"
session_ids:
  - "4975890e-0e9c-4c31-adfa-4e919b58c735"
memory_body_ids:
  []
---

# 背景

2026-10-04 在 `~/.dsh` checkout 上完成的 patch。起因：用户在 dsh web UI 里打开 subagent 会话，composer 一律只读，只有 `readonly.oneShot.body` 那条提示。表面像「dsh 不支持跟 subagent 对话」，实际是**路由 flag 把两个正交语义绑在一起**导致 agent 调出的 child 98% 被标记为一次性。

# 根因链（逐跳有证据）

1. preset 已开 continuable：`.dsh/.agent-presets/anchored-standard/agent.cordis.yml:416-428` 里 `backgroundMode: continuable` ⇒ `runInBackground = request.run_in_background ?? true` 默认为真。
2. 但模型会**主动传 `false`**，因为参数的 description（同文件 @428）在诱导：
   > `"Defaults to true. Set false only when your next action depends on the result."`

   模型几乎每次都需要结果 ⇒ 关后台。
3. `dsh-tool-subagent/lib/index.js` 原实现：`run_in_background` 为 false 时走前台。
   ```js
   return { runInBackground: request.run_in_background ?? options.continuable };
   ```
   即：**模型不表态时跟随 preset，模型表态时模型赢** —— 单次调用参数能推翻部署级策略。
4. 前台路径必然消灭 child：`dsh-tool-subagent/lib/index.js:237` 模块注释 *"Foreground calls always dispose the run after collection."*，实现在 `settleForegroundRun` @314：`Promise.allSettled([Promise.resolve().then(() => run.dispose())])`。
5. session 里 `identity.mode` 被记成 `"one-shot"`；client 侧 `@deepseek-ai/dsh-client-ui-subagent` 的 `lib/client.js` 中 `selectReadOnlySubagent`：
   ```js
   if (subagent.address.mode === "one-shot")  return { reason: "one-shot" };
   if (subagent.parentAvailable !== false)    return null;   // null = 不接管 = 可以输入
   return owner.session?.running === true ? null : { reason: "parent-unavailable" };
   ```
   ⇒ 返回 `{reason:"one-shot"}`，composer 只读。

**概念错误（load-bearing 的判断）**：`run_in_background` 一个 flag 背了两个正交语义 —— synchrony（这次要不要等结果）与 liveness（这个 child 还活不活）。「等一个结果、同时让它活着」本来完全成立。前台模型 = 函数调用（call/return，返回即弹栈销毁）；continuable 模型 = actor（自带 session、turn 循环、inbox，可被 `queuePrompt` 追加 turn）。绑在一个 flag 上，「等结果」就必然「杀死它」。

# 证据：1634 个 session 的 mode 分布

扫描源 `~/.dsh/storages/session_projcache/sessions/`（1634 files / 1637 subagent records）：

```
identity.mode -> {'one-shot': 150, 'None': 1481, 'continuable': 3}
```

continuable 只有 3 个，全是人工发起：`5b3c166a`（调研 dsh 微信 iLink 插件, seq=482）、`fda3469e`（调研 dsh computer-use 社区方案, seq=395）、`session-`（Side: New thread, seq=1082）。one-shot 里 `Mnemon idle checkpoint review` 97 个、`Mnemon supervised-writeback` 4 个属后台审查任务（即使前台 dispose 也属预期，不应算作用户 subagent 一次化的证据），其余基本是 agent 每次调 `subagent` 的结果。**continuable : one-shot ≈ 2%**，所以 catalog 里全是只读是必然结果。

注意：`address.mode` / `parentAvailable` 在 records 层全为 `None`（1637/1637），分布只在 `identity.mode` 上可见 —— 排查时别扫错字段。

# 修法（最小改动，让 preset 说了算）

`dsh/profiles/node_modules/@deepseek-ai/dsh-tool-subagent/lib/index.js`：

```js
// 原版
return { runInBackground: request.run_in_background ?? options.continuable };

// patch 后
if (options.continuable) return { runInBackground: true };
return { runInBackground: request.run_in_background ?? false };
```

外加重写 `run_in_background` 的 description，去掉诱导关后台的那句：

> `"Defaults to true, and is forced true in continuable mode: the child stays alive and is addressable afterwards, while this tool still waits for its result when you need it. Set false only to opt out of the survival guarantee where the provider allows it."`

语义边界：continuable 实例下 liveness 被钉死，synchrony 保留（工具仍然 await 结果）；`one-shot` 实例与 `enableRunInBackground: false`（codex/claude-code 行）行为一字未改 —— 分别返回 `{runInBackground:false}`。

# 验证（全部通过）

| 检查 | 结果 |
|---|---|
| `--verify` | PASS（sha256 26a1e804aab4c6f9 → 51fdfddc39aa28cb） |
| `node --check` | SYNTAX OK |
| 5 分支路由单测 | continuable + false/true/省略 → 都 true；one-shot / no-bg + 省略 → false |
| `dsh --profile web --dump-config` | exit=0，stderr 0 bytes（stdout 2224 行） |
| `import('@deepseek-ai/dsh-tool-subagent')` | OK，`exports: Config,apply,inject,name` |

脚本 `~/.dsh/storages/tools/patch-tool-subagent-always-continuable.py`（幂等 / `--check` / `--verify` / `--restore`）；说明 `~/.dsh/patches/README-tool-subagent-always-continuable.md`；备份 `index.js.bak-20261004-103717-pre-always-continuable`；PLAN.md 已记录；提交在 `~/.dsh` git（HEAD `7fdcb37`）。

# 维护义务与已知 trade-off

- **必须重启 web 进程才生效**（当时 3080 那条进程起于 patch 之前）。
- **target 在 `profiles/node_modules/`（共享层，desktop 无独立副本）⇒ 每次 `pnpm install` 都会覆盖，需重跑 `--apply`**。与 thinking-guard patch 同一种维护义务。
- 行为变化：主 agent 调 `subagent` / `subagent_fork` 时总是拿到 `{kind:"continuable", subagentId}` 而非 inline 结果，靠 settle 通知收回。这是 preset 本来就设定的行为，只是模型此前一直绕开；回滚一行 `--restore`。

# 附：人能不能自己调 subagent（同期查证结论）

- **入口本来就在，而且能打字**。`@deepseek-ai/dsh-client-ui-subagent`（package description: *"Subagent conversation catalog, continuation routing UI, and '@' reference source"*）注册三处 UI：`conversation.session.header.actions` → `id:"subagent-catalog"`, `order:-30`（会话头部子代理目录，树形血缘，可跳子会话）、`conversation.session.header.lineage`（面包屑血缘）、`sidebar.right.pane.tab` → key `SUBAGENT_CHAT_ID`（右侧栏 subagent 对话 tab）。
- composer 只在 `mode === "one-shot"` 或 `parentAvailable === false` 时被接管成只读；对应 i18n：`readonly.oneShot.body` = "One-shot tasks do not accept follow-ups; review the full execution record here."、`readonly.body` = "The parent session is offline; reopen it to continue sending messages."
- 人续聊已有官方 remote：`subagent.prompt` payload 只需 `{parentSessionId, childSessionId, mode:"continuable", delivery:"queue"|"steer"}`，**不校验 agent 身份**（`dsh-subagent/lib/index.js:3011` 只查 `this.ctx.agents.get(parentSessionId)`）；底层 `queuePrompt()` @1788 注释 *"Queue one human-authored prompt as a distinct direct-child turn."*
- **但 dsh 没有 `subagent.start` remote** ⇒ 人能续聊、不能新建。这就是社区插件（`dsh-subagent-monitor` ★26 等）清一色只做「监控/跳转/打断」的根因。
- 未决想法（尚未实施）：自建 spawn 入口需往 host 插件挂 `ctx.subagents.startContinuable()`，UI 放 `conversation.input.dock` + 面板，形态与 `dsh-plugin-goat-panel` 同构（host 插件 + client 插件 + patch 三件套）。

相关：`fa611c46-9dc6-42aa-93a8-1002be2468bd`（2026-09-30 的 subagent catalog/persona 与 gateway 403 修复，含自触发 subagent 验证程序）。
