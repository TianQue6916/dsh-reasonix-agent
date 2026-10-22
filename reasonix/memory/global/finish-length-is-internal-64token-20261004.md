---
id: mem-6aa60f15eef99c974e1ccfb436616db7
revision: 2
created_at: "2026-10-04T03:02:16.825Z"
updated_at: "2026-10-04T03:20:34.819Z"
name: finish-length-is-internal-64token-20261004
description: "gateway finish=length 全部来自 dsh session-title 的 64-token 辅助请求；已把 maxOutputTokens 提到 512"
metadata:
  type: user
  fact_type: reference
  scope: global
---

# finish=length 真凶 = session-title 的 64-token 辅助请求（已修）

## 结论（2026-10-04 更正：来源已完全定位）
gateway 日志里所有 `finish=length` **不是**长 prompt 被上游截断，也**不是**裸 LLM 调用，
而是 dsh 的 **session title 生成请求**：上游 `@deepseek-ai/dsh-base` 给
`@deepseek-ai/dsh-session-title-first-prompt-llm` 的默认 `maxOutputTokens` 就是 **64**，
而 title 请求**继承主 session 的 route**（默认 thinking enabled）⇒ reasoning 吃光 64 token
预算 ⇒ 上游回 `finish_reason:"length"` ⇒ dsh 抛
`session-title-llm: title output reached maxOutputTokens`，标题永远拿不到可见文本。

## 全量证据
`cd /d/Toolbox/goat-gateway && grep -h "finish=length" logs/gateway-*.log` —— **只有 4 条**，
全部特征一致（`completion_tokens == reasoning_tokens == 64`、prompt 141–192、单发）：
- `2026-09-30T15:15:47.737Z id=2 key=163 sess=7f6c85d1 p=168 c=64 reas=64 6636ms`
- `2026-10-04T02:21:42.839Z id=7663 key=qq sess=de3cb800 p=175 c=64 reas=64 3431ms`
- `2026-10-04T02:27:20.897Z id=7767 key=qq sess=1b27c268 p=192 c=64 reas=64 2675ms`
- `2026-10-04T02:57:56.229Z id=7868 key=qq sess=8f569654 p=141 c=64 reas=64 3197ms`

近期 finish 分布：**535 tool_calls / 16 stop / 4 length** ⇒ length 仅 0.7%。

## session 侧取证（决定性）
`node %APPDATA%/npm/node_modules/@deepseek-ai/dsh/lib/bin.js --profile web --dump-config` 第 29–41 行：
```
- id: session-title
  name: '@deepseek-ai/dsh-session-title'
  config: {fallbackMaxWords: 5, fallbackMaxBytes: 40, maxTitleBytes: 80}
- id: session-title-llm
  name: '@deepseek-ai/dsh-session-title-first-prompt-llm'
  config: {targetWords: 5, targetCjkCharacters: 10, maxInputBytes: 4096, maxOutputTokens: 64, timeoutMs: 60000}
```
1070 个 `~/.dsh/sessions/*/*/session.v4.jsonl.zstd` 中 **889 个含 `session/title-llm-request`**；
把每条该事件解出来后：**`maxTokens` 分布 = {64: 888, None: 27}**（27 个 None 是「我读源码的输出被记进 session」的误命中）；
**route 分布 = {commandcode-goat / deepseek/deepseek-v4.1-flash: 875, others: 13}**。

## 传播链（源码位置）
`%APPDATA%\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\dsh-session-title-llm\lib\index.js`：
- `SessionTitleLlmConfigFields` 七项**全部 `.required()`，无 library default** ⇒ 64 来自 profile bundle 的声明；
- `resolveRoute(config, request)`：配了 provider+model 就用它，否则 `return request.route`（= session 里 `request/header` 记下的 route）；
- `generateSessionTitleWithLlm(...)` 里 `options = deepFreeze({…, maxTokens: config.maxOutputTokens, purpose: "session-title", …})`，
  随后 `request.session.append("session/title-llm-request", {titleProvider, messageSeqs, route, system, messages, maxTokens})`；
- `finishError(finish)`：`case "max-tokens": return new Error("session-title-llm: title output reached maxOutputTokens")`。
`@deepseek-ai/dsh-session-title-first-prompt-llm/lib/index.js`（1356 B）：`inject = ["sessionTitle","llm","sessions"]`，
provider id = `"session-title-first-prompt-llm"`，只取 `messages[0]`。
`grep -n "session-title" profiles/{web,desktop}/cordis.patch.yml profiles/{web,desktop}/package.json` = **0 命中**
⇒ 这两个 row 来自上游 bundle，不是我配的。

## 修复（已落盘，待重启生效）
`~/.dsh/profiles/{web,desktop}/cordis.patch.yml` **末尾各追加**：
```yaml
- id: session-title-llm
  name: '@deepseek-ai/dsh-session-title-first-prompt-llm'
  config:
    targetWords: 5
    targetCjkCharacters: 10
    maxInputBytes: 4096
    maxOutputTokens: 512
    timeoutMs: 60000
```
验证：web `--dump-config` 输出里该 row 变成 `maxOutputTokens: 512`（exit=0 / stderr 0 B），
其上方正是 `# == @deepseek-ai/dsh-base, patched by …profiles\web\cordis.patch.yml`
⇒ **profile patch 对上游 row 的 config 是 merge/替换语义，已验证**。
两侧 YAML 用带 `!!js` 豁免的自定义 loader（`JS.add_multi_constructor('tag:yaml.org,2002:js', lambda…: None)`）解析 OK。
备份：`profiles/{web,desktop}/cordis.patch.yml.bak-20261004-pre-title-maxtokens`
（web 65884 → 66875 B，desktop 64036 → 65027 B）。

## 待验收
重启 web 进程与 desktop App 后，新 session 的 `session/title-llm-request` 事件里 `maxTokens` 应为 **512**，
且 gateway 不再出现 `completion_tokens == reasoning_tokens == 64` 的 finish=length。

## 相关
- 同一 symptom 的另一半（UI 通知抑制）已由 `dsh-maxtokens-notice-suppress-patch-20261003` 处理；
  该补丁 **2026-10-04 复核仍在位**：npm-js `client.js`(565455 B) `max-tokenz` ×2、
  asar(121348951 B) `max-tokenz` ×2（`--check` 找原字符串当然 0 命中，非回归）。
- `sessionFingerprint`（`gateway.mjs:533`）优先读 `x-reasonix-session-id` / `x-session-id` / `x-conversation-id` / `x-topic-id`，
  否则用消息指纹 ⇒ gateway 的 8 位 `sess=` **不对应任何 dsh session id**，不能拿它做关联。
