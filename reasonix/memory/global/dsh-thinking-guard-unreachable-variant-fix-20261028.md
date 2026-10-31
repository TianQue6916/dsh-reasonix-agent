---
id: mem-cfa1cf56c528778ddf76dd26c203f0e9
revision: 1
created_at: "2026-10-28T11:19:22.257Z"
updated_at: "2026-10-28T11:19:22.257Z"
name: dsh-thinking-guard-unreachable-variant-fix-20261028
description: "thinking-guard 熔断后注入说明必然失败的根因（cancel 传自定义 kind 撞 assertNever）与修法，注意 node_modules 改动会被 pnpm install 覆盖"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 根因（2026-10-28 定位并修复）

`@ethanwong-hk/dsh-thinking-guard@1.0.2` 的 `trip()` 调用：

```js
agent.cancel({ kind: 'thinking-guard', reason, detail, sessionId });
```

`dsh-agent-loop` 的 `abortedCancelCause()`（`lib/index.js:731-743`）对 `signal.reason` 做：

```js
switch (cause.kind) {
  case "user": case "parent": case "disposed": return { kind: cause.kind };
  case "hook": return { kind: "hook", reason: cause.reason };
  default: return assertNever(cause);   // ← 抛 unreachable variant
}
```

**只白名单 `user / parent / disposed / hook` 四种**。第三方插件传自定义 kind 必然炸。

## 症状链

1. `cancel()` 本身能中止当前活动（熔断生效）。
2. 但随后 `notify()` → `agent.followup(message)` 会进 driver，driver 的 catch 里调 `abortedCancelCause(signal)` → `assertNever` 抛错 → 冒泡回 `notify` 的 catch。
3. 日志只剩 `[thinking-guard] 注入说明失败： unreachable variant: {"kind":"thinking-guard",...}`。
   **用户看不到任何熔断原因说明** —— 这就是「被中断四次却不知道为什么」的直接原因。
4. 顺带 `turn/end` 的 `aborted.reason` 也永远记不下来。

## 修法（已应用，两 profile 各一份）

```js
agent.cancel({ kind: 'hook', reason: `thinking-guard:${reason}`, detail, sessionId });
```

改用上游白名单里的 `hook` 形式，把自己的 reason 拼进 `reason` 字段。`hook` 分支只复制 `{ kind, reason }`，`detail` / `sessionId` 会被丢弃 —— 无害，它们本来就只是给本插件自己日志看的。

**验证**（复刻 `abortedCancelCause` 逐字语义的最小脚本）：
- 旧 cause `{kind:'thinking-guard',...}` → `THROW: unreachable variant`
- 新 cause `{kind:'hook', reason:'thinking-guard:degenerate-loop'}` → `OK {"kind":"hook","reason":"thinking-guard:degenerate-loop"}`

## ⚠ 维护警告

改的是 **`node_modules` 内的文件**，`pnpm install` / 重装插件会**静默覆盖**：

- `profiles/desktop/node_modules/@ethanwong-hk/dsh-thinking-guard/lib/index.js:366`
- `profiles/web/node_modules/@ethanwong-hk/dsh-thinking-guard/lib/index.js`（同内容）

备份在 `C:/Users/27063/AppData/Local/Temp/tg-{desktop,web}.bak.js`。
**升级 dsh-thinking-guard 后必须重新应用**。理想做法是提 issue 给 ethanwong-hk，或改用 `@mrweicodes/dsh-loop-guard`（它的 cancel 走标准路径）。

## 生效条件

`node_modules` 内的 js **必须重启 dsh 进程**才加载（不参与 HMR）。
