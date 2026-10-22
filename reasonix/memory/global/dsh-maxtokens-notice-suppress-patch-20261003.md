---
id: mem-8c8d6654cbd55b01405808ae64d4d232
revision: 1
created_at: "2026-10-03T05:47:59.831Z"
updated_at: "2026-10-03T05:47:59.831Z"
name: dsh-maxtokens-notice-suppress-patch-20261003
description: "dsh「已达到输出 token 上限」通知的隐藏补丁（等长替换两处 UI guard + 完整验证与回滚）"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 做了什么
按用户要求隐藏 dsh 聊天流里的「已达到输出 token 上限」通知（notice 节点 `kind: "turn-max-tokens"`）。

## 根因（0.2.0-rc.2，逐字）
- UI 唯一触发条件：`@deepseek-ai/dsh-client-ui-chat/lib/client.js:9920` `if (match.event.type !== "turn/end" || match.event.data.reason.kind !== "max-tokens") return void 0;`；`:9932` `if (event.type === "turn/end" && event.data.reason.kind === "max-tokens") return {`（definition `kind: "turn-max-tokens"`）；文案 i18n `:5527 "message.maxTokens"` / `:5528 "message.maxTokens.hint"`；同一段 UI 里上一行 `已完成，用时 X` = `:5423 "message.turnProcess.took"`，属正常 turn 完成标记，不要动。
- reason 来源：`dsh-llm-pi-ai/lib/index.js:1422 case "length": return { kind: "max-tokens" }`；`dsh-llm-deepseek/lib/index.js:1906 case "max_tokens"`；`dsh-agent-loop/lib/index.js:1151`；`dsh-llm/lib/index.js:1053`（max-tokens 时丢 tool-call 块——内部语义不可动）。
- 实测是**假警报**：用户 `session-b65a9a67-80a1-403c-b899-45b0ac351801` turn 15（13:36:43→13:39:46）`request/header.data.header.config.maxTokens=262144`，最后一步 completion 只有 2899 tokens 却被标 length；同 turn 并存 `assistant/attempt` 的 `{"kind":"error","failure":{"code":"TRANSPORT","message":"upstream stream ended before a completion event; this turn may be incomplete"}}` + `llm/retry` 1/8 + gateway `STREAM-ERR id=154 key=163 upstream aborted`。⇒ 上游提前收流却标 length。

## 改法
只把两处 UI 判定里的 `"max-tokens"` 等长替换成 `"max-tokenz"`（12 B→12 B，纯 ASCII），anchor 必须带 `reason.kind` 前缀（asar 里 `finish.kind === "max-tokens") return { kind: "max-tokens" }` 在偏移 14468205，属 harness 内部语义，不可动；asar 里 `"max-tokens"` 共 29 处、`"turn-max-tokens"` 8 处，盲替换会破坏语义）。
两个 target（`~/.dsh/profiles/*/node_modules` 下没有 `dsh-client-ui-chat` 副本）：
- npm-js `%APPDATA%\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\dsh-client-ui-chat\lib\client.js`（565455 B，偏移 464175 / 464564）
- desktop-asar `C:\Users\27063\AppData\Local\Programs\DeepSeek Harness\resources\app.asar`（121348951 B，偏移 19677465 / 19677854）
脚本 `~/.dsh/storages/tools/patch-maxtokens-notice.py`（`--check/--apply/--verify/--restore`，state `~/.dsh/storages/maxtokens-notice-patch.json`，npm 侧 full-file backup `<client.js>.bak-<ts>-pre-maxtokens-notice`）。

## 验证（全 PASS）
`node --check` OK；npm 与备份逐字节 diff **恰 2 处**（s→z）×2；asar header JSON 可解析（5 顶层条目 / header 3392048 B / 文件 121348951 B）；asar 内部 `finish.kind` 语义 count 仍 1；重复 apply 被 state 拒绝；round-trip 重放 md5 一致：patched npm `2016259497870124adf8285e359f5edf` / asar `3d867e888059dc91544c3190e40a322d`，restored npm `612e1b6f2acc03ac4a8ded1f1f6ba510` / asar `8410f7f8d7e791cfce40161327b808e0`（asar 回到 `"max-tokens"` 29 处）。

## 边界
- client bundle 在渲染进程启动时加载 ⇒ **需一次 App 重启**（web 侧浏览器刷新）才可见；与 dsh-context 价目补丁同批重启。
- 截断事实仍然完整落盘（session 的 `turn/end reason` + gateway `usage=`），诊断能力零损失。
- 官方更新（npm 包 / App nightly）会覆盖这两份，重跑 `--check`+`--apply` 即可；anchor count 不再为 1 说明上游改了这两处 UI 判定。
- 说明文档 `~/.dsh/patches/README-maxtokens-notice.md`；`~/.dsh/PLAN.md` 已记（11753 B / 113 行，sha256 4ea6c837d0df71c8）。

## 同类根因的独立修复（勿混淆）
mnemon idle checkpoint review 的 4096 截断是**另一个**问题（`dsh-mnemon/lib/index.js:63 DEFAULT_IDLE_REVIEW.maxTokens`，已把两 profile 的 `idleReview.maxTokens` 提到 32768）。
