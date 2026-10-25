---
id: "628e53eb-1b71-4d59-9e76-97d471ea965f"
title: "/compact 仍失败（2026-10-17）：allowDshCompaction 放行后失败点已转移到 dsh 侧（无 compaction/* 事件 + summary stage 兜底异常）"
description: "2026-10-17 续查：bili dsh.allowDshCompaction=true 已生效（日志由 REFUSED 变为 relaying verbatim/DIRECT），但 /compact 仍报 \"Compaction could not produce a useful summary\"；定位到 dsh-compaction-basic 的 summary 兜底分支与 session 无 compaction/* 事件，并提出 baseURL 直连 gateway:8788 的分治验证。修正 0bb2e36f 的\"放行即解决\"结论。"
status: "active"
created_at: "2026-10-17T14:42:06.424Z"
updated_at: "2026-10-17T14:42:06.424Z"
content_hash: "91b6c102513ebaa324b1bc564843ea1964e63d4de989639257b5294aac9d19dc"
source_paths:
  - ".config/billion-context/billion-context.json"
  - "profiles/desktop/cordis.patch.yml"
  - "AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-compaction-basic/lib/index.js"
  - "AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-command-compact/lib/index.js"
session_ids:
  - "f7174fbd-e39f-4610-bdf4-a129270ae9e2"
memory_body_ids:
  []
---

# /compact 仍失败（2026-10-17）：失败点已从 bili 转移到 dsh 侧

承接并**修正** 文档 `0bb2e36f-ef0d-4ea1-b110-bc7f0e68eed8`（结论「allowDshCompaction 放行手动 /compact」）与 `3912c06c-b67c-42a0-bf41-3b3ad3142d42`（Compaction could not produce a useful summary 根因）。放行**确实生效了**，但 `/compact` 依然失败，失败原因换了。

## 1. bili 层开关已生效（确认）

`C:\Users\27063\.config\billion-context\billion-context.json`：

```json
{
  "providers": {},
  "compress": { "nudgeGrowthTokens": 150000, "preserveRecentTokens": 20000, "preserveRecentMessages": 10, "injectNudge": false, "maxContextLimit": "60%" },
  "dsh": { "allowDshCompaction": true }
}
```

状态断言（改前 → 改后）：

```
改前：allowDshCompaction = {"enabled": false, "source": null}
改后：allowDshCompaction = {"enabled": true,  "source": "file"}
```

`source: "file"` ⇒ 认的是配置文件值，不是 `BILI_ALLOW_DSH_COMPACTION` 环境变量、也不是默认值。bili 源码：`allowDshCompactionState(env)` 优先 `env.BILI_ALLOW_DSH_COMPACTION`，否则读 `loadConfigFile().dsh?.allowDshCompaction === true`；另有 legacy 顶层 `allowDshCompaction` 归一化（`normalizeLegacyAllowDshCompaction`），两者并存时 `dsh.*` 胜出并 log warn。

## 2. 操作事实：kill bili 后必须手动确认存活

```
=== kill bili ===
killing 16788
not auto-relaunched -> starting manually
bili ALIVE pid=28896
```

三次 kill 只有第一次由 dsh 自动拉起 ⇒ **kill bili 后必须自己确认它活着**，否则 dsh 与上游直接断流。

## 3. bili 日志对照：REFUSED 消失（开关生效的铁证）

改前（CST 2026-10-16 16:45:11 = `08:45:11Z`，也见 `04:10:47Z`/`04:10:54Z`）：

```
[passthrough] dsh native compaction call identified on the unattributed passthrough lane (#1117/#2709) — REFUSED, not forwarded: bili owns compression on this lane; ...
passthrough refusals so far: 1
```

改后（10-17）：

```
14:22:55.726Z [warn] [dsh-client] bili-native-dsh: model request sent DIRECT (uncompressed) — takeover gate refused http://127.0.0.1:8788/v1/chat/completions: no active initiator attribution (agentless/background lane, third-party in-process caller, or stale attribution after host resume?) — refusals so far: 1
14:22:55.806Z [debug] passthrough: POST <unparseable-url> — unattributed in-process caller (#1117), relaying verbatim
14:23:07.926Z [debug] passthrough: POST <unparseable-url> — ... relaying verbatim
14:23:15.839Z [debug] passthrough: POST <unparseable-url> — ... relaying verbatim
```

**`REFUSED` 不再出现，改为 `relaying verbatim`（原样转发）。** 相关常量/判定（bili 打包产物）：`DSH_CHECKPOINT_OPEN_TAG="<compacted-summary>"`、`DSH_CHECKPOINT_PREAMBLE_PREFIX="This is an automatically generated checkpoint condensing..."`、`DSH_LOCAL_COMPACTION_MIN_MISSING=8`、`carriesDshLocalCompactionSummary(msgs,knownIds)`、`dshCompactionRefusal(protocol)`、`REFUSAL_MESSAGE`（含 opt-in 提示 `"allowDshCompaction": true` / `BILI_ALLOW_DSH_COMPACTION=1`，#2028）。

## 4. 失败点定位：dsh 侧 summary stage 兜底分支

用户在 shell 里点的 `/compact` 两次返回：

```
Compaction could not produce a useful summary. The attempt is recorded in the session log.
```

文案出处 `C:\Users\27063\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\dsh-command-compact\lib\index.js`（`USAGE = "Usage: /compact (no arguments)"`，`inject = ["commands","compaction"]`），`expectedFailure(error)` 的 `switch (error.code)`：`busy` / `cancelled` / `changed` / `summary` / `commit` → 文本，其中 `case "summary"` 就是这句。

抛点 `C:\Users\27063\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\dsh-compaction-basic\lib\index.js`（size 49448，偏移 @26357）：

```js
function throwManualFailure(failure) {
	if (failure.stage === "commit") throw new ManualCompactionError("commit", "manual compaction did not commit cleanly", { cause: failure.error });
	if (failure.error instanceof SurfaceChangedError) throw new ManualCompactionError("changed", "the compacted history changed during manual compaction", { cause: failure.error });
	throw new ManualCompactionError("summary", "manual compaction could not produce a smaller summary", { cause: failure.error });
}
```

⇒ 观察到的是**最后那个兜底分支**：摘要（summary）阶段抛出任意异常，且既不是 `commit` 也不是 `changed`（`SurfaceChangedError`）。

## 5. 决定性反证：session 里没有任何 `compaction/*` 事件

同一 index.js 的 `compactRegion` 中，`session.append("compaction/start", lifecycle)` 位于 `try` **之前** ⇒ 只要走到 `compactRegion` 就必然留痕。

实际扫描三个当期活跃 session（`C:\Users\27063\.dsh\sessions\--C-Users-27063--\`）：

```
=== session-a0d5fbf8-0fb1-419e-9baf-d95df0190144  mtime=10-17 22:39  events=0
=== session-cb03454a-4703-4718-884e-50...          mtime=10-17 22:23  events=0
=== session-81076132-69dc-4447-869a-55...          mtime=10-17 22:23  events=0
```

主 session 文件 `session-a0d5fbf8-0fb1-419e-9baf-d95df0190144\session.v4.jsonl.zstd`：41 429 980 B，34571 行，其中 1499 行含 "compaction"（多为历史 assistant/reasoning 文本），但 `compaction/*` 结构化事件为 0。

**⇒ 手动压缩在写第一个事件之前就失败了；「The attempt is recorded in the session log」并不成立。**

## 6. 可疑点与下一步（尚未执行）

- bili 收到一个它解析不了的 URL（`<unparseable-url>`）后「原样转发」；解析不了的 URL 原样转发可能落到错误路径，导致 summarizer 拿不到结果 —— 与「summary 阶段抛任意异常」吻合。
- **分治验证（改一行、可逆）**：链路现为 `dsh → bili:18787 → gateway:8788 → upstream`，临时把 dsh provider 的 `baseURL` 从 18787 改为直连 8788（`~/.dsh/profiles/desktop/cordis.patch.yml`，profile patch 走 HMR，**开新 session 即生效**），再点一次 `/compact`：
  - 成功 ⇒ 问题在 bili 的 passthrough 路由（不拦了但转发错了地方）→ 查 bili URL 解析；
  - 仍失败 ⇒ 与 bili 无关，是 dsh summarizer 或上游 → 查 dsh 侧。
  验证完改回。
- bili 版本 `0.1.197`，`2026-10-17T14:27:10.371Z [update] new version found: 0.1.197 → 0.1.198, downloading…`（升级可能改变上述行为，留意）。
- `~/.dsh/logs/host-stdio.log`（10 299 208 B）中与 compaction 相关的命中只有无关的 `deepseek-account /api/v0/users/get_user_summary` 调用；`bili.log` 在 10-17 除上述 passthrough/DIRECT 行外没有 compaction/summary 记录。
