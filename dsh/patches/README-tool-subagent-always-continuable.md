# patch: `dsh-tool-subagent` always-continuable

## 为什么

`@deepseek-ai/dsh-tool-subagent` 把「这次要不要等结果」和「这个 child 活不活」绑在同一个
flag (`run_in_background`) 上：

```js
// 原始 (lib/index.js, resolveDelegationRun)
return { runInBackground: request.run_in_background ?? options.continuable };
```

`anchored-standard` preset 已经设了 `backgroundMode: continuable`（`agent.cordis.yml:416-428`），
意图是 child 当 actor 用。但模型会主动传 `run_in_background: false`，于是路由到
`subagents.start(...)` + `settleForegroundRun`，后者无条件 `run.dispose()`：

```js
// lib/index.js:314 settleForegroundRun
const [disposal] = await Promise.allSettled([Promise.resolve().then(() => run.dispose())]);
```

dispose 之后 child 的 session 记录 `mode: "one-shot"`，web UI 的
`selectReadOnlySubagent`（`@deepseek-ai/dsh-client-ui-subagent/lib/client.js`）就把 composer
换成只读提示：

- `readonly.oneShot.body` = "One-shot tasks do not accept follow-ups; review the full execution record here."

用户实测（`~/.dsh/storages/session_projcache/sessions/`，1634 个 session）：
`one-shot` 150 / `continuable` 3 / 无字段 1481 —— agent 调出来的子代理 **98% 用完即弃**。

## 改了什么

1. `resolveDelegationRun`：continuable 模式下**强制** `runInBackground: true`，
   模型无法再用 `run_in_background: false` 推翻。“等不等结果”和“活不活”被解耦——
   工具仍然等（synchrony 保留），但 child 一定拿到 activation（liveness 固定）。
2. `run_in_background` 参数的 description：不再暗示“需要结果就关掉后台”。
   `lib/index.js:432`（patch 后行号）

## 边界

- 只影响 `backgroundMode: continuable` 的 tool 实例（当前是 `subagent` / `subagent_fork` 两行）。
  `enableRunInBackground: false` 的行（`tool-subagent-codex` / `tool-subagent-claude-code`，均 disabled）
  与 one-shot 实例行为完全不变。
- 主 agent 现在**总是**拿到 `{kind:"continuable", subagentId}` 而不是 inline 结果；
  settle 时会收到通知（工具 description 里的 "you are notified when the run settles"）。
  这是 preset 原本就该有的行为，patch 只是堵掉了模型绕开它的那条路。
- 前台 `subagents.start()` 路径在 continuable 实例下变得不可达；one-shot 实例不受影响。

## 操作

```bash
python ~/.dsh/storages/tools/patch-tool-subagent-always-continuable.py --check
python ~/.dsh/storages/tools/patch-tool-subagent-always-continuable.py --apply
python ~/.dsh/storages/tools/patch-tool-subagent-always-continuable.py --verify
python ~/.dsh/storages/tools/patch-tool-subagent-always-continuable.py --restore
```

脚本幂等（认 marker `[patched: always-continuable]`），自动扫
`~/.dsh/profiles/*/node_modules/...` 与 `~/.dsh/profiles/node_modules/...`，按 realpath 去重。
备份命名 `index.js.bak-YYYYMMDD-HHMMSS-pre-always-continuable`。

## 注意

target 在 `node_modules` 里 ⇒ `pnpm install` 会覆盖，需要重跑 `--apply`。
和 `README-thinking-guard-name.md` 同样的维护义务。

## 状态

- 2026-10-04 10:37 apply 通过，`--verify` PASS，`node --check` SYNTAX OK。
- 逻辑单测（5 个分支）全部符合预期。
- **仍需一次 web 进程重启才生效**（3080 那条进程早于本次修改）。
