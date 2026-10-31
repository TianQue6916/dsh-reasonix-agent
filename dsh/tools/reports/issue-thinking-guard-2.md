# 拟提交到 ethanwong-hk/dsh-thinking-guard issue #2 的评论

> 状态：**草稿，未提交**。本机无 `gh` CLI、无 GitHub token。
> 提交前请把下面的正文过一遍；如果要提交，需要 `gh auth login` 或网页粘贴。

## TL;DR

There is a third failure surface in the same 1.0.2 bug: the messages injected on trip still carry the retired v4 `source.kind: 'plugin'` (not `plugin:thinking-guard`), so instead of delivering a notice the plugin either dies at message construction (Windows) or poisons the session's persistence path (Linux). Fix is two characters of value in two literals: `kind: 'plugin'` → `kind: 'plugin:thinking-guard'`.

## The code

Upstream 1.0.2, `lib/index.js` (line numbers from the unpatched tarball; our local copy is pnpm-patched, so there it is 309/334 — same two literals, nothing else changed):

```js
// lib/index.js:248 — trip notice
            const message = createUserMessage({
                content: [{ type: 'text', text }],
                source: {
                    kind: 'plugin',            // <-- retired in v4
                    plugin: 'thinking-guard',
                    form: 'notice',
                    summary: '纯思考空转熔断',
```

```js
// lib/index.js:273 — auto-continue instruction
                }],
                source: {
                    kind: 'plugin',            // <-- retired in v4
                    plugin: 'thinking-guard',
                    form: 'notice',
                    summary: '自动继续当前任务',
```

Both literals are guarded by a `try/catch` that logs and continues, which is why the failure is invisible in the UI and only shows up on one line of stderr.

## What happens on two platforms

The same invalid `source` hits two different validation layers, and the two layers disagree about what to do with it.

| | Windows (`createUserMessage` schema) | Linux (memory append passes, persist rejects) |
|---|---|---|
| Fails at | message construction — the `source.kind` discriminated union has no `'plugin'` variant in v4 | row admission during flush; the in-memory `Session.append` path does not re-run the v4 row validator |
| Log line | `注入说明失败： unreachable variant: {...}` + `注入自动继续指令失败： unreachable variant: {...}` | **nothing** — 2 trips, 0 injection errors |
| What the user sees | trip happens and the step is cancelled, but no notice and no auto-continue: the turn just stops | trip message is accepted into the in-memory buffer, then the flush that carries it is rejected — the queued rows sit in the persistence buffer and are never written |
| Recoverability | clean, the message never existed | worse: the 2 queued messages are stranded, and the session's v4 file is left without them |

Our evidence for the right-hand column is mostly negative, which is the point: on the Linux host we get

```
$ grep -c "熔断 degenerate-loop" ~/.dsh/logs/dsh-web.log   →  2
$ grep -c "注入说明失败"        ~/.dsh/logs/dsh-web.log   →  0
$ grep -c "unreachable variant" ~/.dsh/logs/host-stdio.log → 0
```

while decompressing the two affected sessions' `session.v4.jsonl.zstd` (302 and 57 rows) yields zero rows with `"kind":"plugin"`. So the plugin's own code believed both injections succeeded, and neither row ever reached disk. That divergence between "append succeeded" and "row admitted" is the part we would most like a maintainer's opinion on — it is what turns a rejected row into a stuck buffer rather than a clean error.

Also worth noting: both Linux trips are `sparse-repeat` with a one-or-two-character sample, which is the misclassification covered in the issue title:

```
"kind":"sparse-repeat","sample":"0.","count":8,"share":0.4211}
"kind":"sparse-repeat","sample":"v4.","count":5,"share":0.1923}
```

The Windows trips are the same classifier on a different unit (`"unit":".\n\nGo"`, counts 107 / 58 / 120), so the two symptoms are not independent bugs — the misclassification is what makes the bad `source` reachable in the first place.

## Why it's not just cosmetic

A `source.kind` that the current schema no longer knows is a cross-version hazard, not a log-hygiene issue: it survives in the plugin's own code long after the format moved on, and it fails *differently* depending on which layer happens to validate first. We ran into the same class of breakage reported elsewhere while triaging this; we have not audited each of these, but they line up with the same v3→v4 source-shape transition:

- https://codeberg.org/zelin2001/dsh-memory-md
- https://github.com/vlln/dsh-autofork/commit/cb7b2f4b53a203a9bea23b7d491630c5bc2ff30c
- https://github.com/QSWWLTN/dsh-UEAssetsOperator/issues/3

The practical consequence here is a silent one: `autoContinue` is documented as a way to hand control back to the model, and on Windows it never runs — the exact case it exists for is the case where it is guaranteed to throw.

## The one-line fix

```diff
-                    kind: 'plugin',
+                    kind: 'plugin:thinking-guard',
```

in both places (248 and 273 upstream). This is not a new convention — it is precisely what the v3→v4 migrator already does to the *same* wrapper when it rewrites historical log rows: it reads `source.kind === 'plugin'` plus `source.plugin === 'thinking-guard'` and emits `kind: 'plugin:thinking-guard'`. The plugin writing new rows simply never went through that path, so old rows and new rows end up with two different encodings of the same thing, and only the old one is accepted.

## A second, separate issue worth fixing

While collecting the above we noticed that `enabled: false` in the plugin config does not appear to be honored: our profile sets it (`config: { enabled: false, thinkingOnlyMs: 300000, ... }`) and every startup still logs

```
[thinking-guard] 已启用：thinkingOnlyMs=300000 maxThinkingChars=200000 repeatThreshold=3 noveltyWindow=4096 noveltyThreshold=0.2
```

six times across six boots. Reading the source, `apply()` does `mergeConfig(config)` and `onStream()` does guard on `if (!cfg.enabled) return;`, so the runtime gate looks right — but the "已启用" line at the end of `apply()` prints unconditionally and never consults `cfg.enabled`, so at minimum the log is lying about state. Whether the config object actually arrives at `apply()` on our side, or whether this is only a misleading log line, we cannot tell from the outside and it needs your confirmation. This one is independent of the `source.kind` bug and probably deserves its own issue if it reproduces for you — we are reporting it here only because it made triage harder (we could not tell from the logs whether the guard was on).

Happy to open a PR with the two-literal change if you want it — say the word and we will send it with the platform matrix above as the test description.
