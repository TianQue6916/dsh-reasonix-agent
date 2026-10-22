---
id: mem-a27c5863fa45f1675682d9f2fc1a566a
revision: 1
created_at: "2026-10-04T04:02:13.492Z"
updated_at: "2026-10-04T04:02:13.492Z"
name: mnemon-idlereview-never-ran-20261004
description: "mnemon idleReview 验收：配置侧已生效、但 review 从未真正运行的证据与判据"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 验收结论（2026-10-04）

**配置侧 ✓ 已生效**：`profiles/web/cordis.patch.yml:1211` 的
```yaml
idleReview:
  maxTokens: 32768
```
已 merge 进 runtime —— `node "$APPDATA/npm/node_modules/@deepseek-ai/dsh/lib/bin.js" --profile web --dump-config` 第 **1807-1808 行**可见。备份 `profiles/web/cordis.patch.yml.bak-20261003-132841-pre-mnemon-idlereview`。

**运行侧 ✗ 从未真正跑过（本轮新发现）**：`~/.dsh/storages/session_projcache/sessions/*.json` 的 `mnemonSubagentTokenUsage.val` 在 **1639/1639** 个 session 里都是
```json
{"descriptorSeen": <bool>, "totals": {"uncachedInputTokens":0,"outputTokens":0,"cacheReadTokens":0,"cacheWriteTokens":0}, "last": null}
```
⇒ **mnemon idle review 从未成功执行过**。原来的「4096 被截断所以报 max-tokens 通知」假设**没有被证实**（那批通知另有来源：session-title 的 64-token 请求，见 `finish-length-is-internal-64token-20261004`）。

## 排除的配置原因
`dsh-mnemon/lib/index.js:5525 idleReviewAllowed()` 的每个条件实测都满足：
`lifecycleEnabled: true` / `writeEnabled: true` / `writebackMode: "guided"` / `idleReview.enabled` 默认 true / `idleReviewAttempts < maxPerSession` / `memoryTopology.strategyId === "default-three-tier"`（`:425` 的默认值即 `"default-three-tier"`，profile 没设 `memoryTopology`）。

`idleReviewBlockReason()`（`:2688`）只在 `parent.ctx.get("agentTeams") !== void 0` **且** `parent.ctx.tools.get("spawn_teammate", parent) !== void 0` 时返回 `"agent-team"` —— 本机没装 agentTeams。

## 剩余推断（未实测）
触发窗口太窄。`dsh-mnemon/lib/index.js:54-66 DEFAULT_IDLE_REVIEW`：
`{enabled:true, provider:"spawn", fallback:"spawn", agentTeams:"pause", minIntervalMs:300000, maxPerSession:20, maxContextChars:24000, maxTokens:4096}`。

要同时满足：`agent.status === "idle"` 持续 ≥ `idleReviewMs: 30000`、距上次 review ≥ `minIntervalMs: 300000`（5 分钟）、`reviewActivity().eligible`（`:5606`，按 turn 数 / 用户文本长度 / 工具调用数评分）、`composedByDefault(turn)`。会话被重启或新消息打断 ⇒ `:5496` 的 timer 被清。

## 验收判据（可复现）
```bash
python -c "
import glob,json
for p in glob.glob(r'C:\Users\27063\.dsh\storages\session_projcache\sessions\*.json'):
    r=(json.load(open(p,encoding='utf-8')).get('record') or {}).get('rows') or {}
    v=(r.get('mnemonSubagentTokenUsage') or {}).get('val') or {}
    if (v.get('totals') or {}).get('outputTokens',0)>0: print(p, v)
"
```
`outputTokens > 0` ⇒ review 真跑过。

## 不能用来判 review 的数据源
`~/.mnemon/data/default/mnemon.db` 的 `oplog` 表只记 `import` / `search` / `recall` / `gc` 四类 operation（2899 行：import-skip 2510 / import 361 / search 16 / recall 10 / gc 2）；`insights` 361 条全是 `source: user`（来自 `~/.dsh/logs/memory-to-mnemon.log` 的 `[mnemon-sync]` 同步，不是 review 写入）。review 若写盘会走 `mnemon_runtime_memory` 工具 ⇒ 表现为 `import`，无法区分。
