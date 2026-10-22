---
id: mem-285cf43e9c0c9833b7f5ffcb524d096e
revision: 1
created_at: "2026-10-03T05:31:43.676Z"
updated_at: "2026-10-03T05:31:43.676Z"
name: mnemon-idle-review-maxtokens-truncation-fix-20261003
description: "dsh-mnemon 后台 review subagent 被 4096 输出上限截断（显示「已达到输出 token 上限」）的根因、修法与验收口径"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 症状
侧栏里若干「其他对话」出现通知「已达到输出 token 上限 / 回答被截断，已有输出保留在对话中。发送"继续"可让模型接着输出。」（用户 m02056 提问）。

## 定性（2026-10-03 取证）
- 该通知是 **dsh 核心 UI** 的 i18n，不是插件：`@deepseek-ai/dsh-client-ui-chat/lib/client.js` 的 `TurnMaxTokensItem`（注释 "Persistent, turn-positioned notice for a turn ended at the output-token cap"），文案键 `message.maxTokens` / `message.maxTokens.hint`；desktop 侧同一字符串还打进 `AppData/Local/Programs/DeepSeek Harness/resources/app.asar`。
- 唯一触发条件：该 turn 的 `turn/end` reason = `{"kind":"max-tokens"}`（上游 `finish_reason=length`）。
- 出问题的「对话」实测是 **dsh-mnemon 的后台 idle checkpoint review subagent**：session 头 `origin=subagent`、`delegationDepth=1`、`parentSession=<主会话>`，`subagent/descriptor.label = "Mnemon idle checkpoint review"`。它们在侧栏里就是一个会话条目，所以看起来像「其他对话」。
- 它们的输出上限只有 **4096**：`request/header.config = {"provider":"commandcode-goat","model":"deepseek/deepseek-v4.1-flash","reasoningEffort":"high","maxTokens":4096}` 且 `adapterDefaults=null`（= 显式下发，不是 adapter 默认，也不是 profile patch 的 262144）。
- 来源：`dsh-mnemon@0.5.21 lib/index.js:63` `DEFAULT_IDLE_REVIEW = {…, maxTokens: 4096}`；config 路径 **`idleReview.maxTokens`**（schema `lib/index.js:225` `IdleReviewSchema.maxTokens`，min 128 / max 131072；`lib/index.js:302`、读取点 `:3969`）；settings UI 的 label 写作 `config.review.maxTokens`，但写回的 key 是 `idleReview`（client.js `reviewOf(value) → value?.idleReview`）。
- 机制：reviewer 先推理再吐 WRITE_SCHEMA 结构化结果，`reasoningEffort: high` 的思维 token 也计入 max_tokens ⇒ 4096 常被思维吃光，正文没写完就被截 ⇒ `finish_reason=length`。
- 计量（2026-10-03）：最新 20 个会话里 `turn/end reason={"kind":"max-tokens"}` 3 次，全落在这类 review subagent 上；当天已跑 6 次 review（11:57 / 12:32 / 12:38 / 12:45 / 13:10 / 13:18），父会话均 `session-b65a9a67`。主对话 maxTokens = 262144，几乎撞不到。

## 修法（已落地）
`~/.dsh/profiles/{web,desktop}/cordis.patch.yml` 的 mnemon 行里，在 `idleReviewMs: 30000` 后加：
```yaml
    idleReview:
      maxTokens: 32768
```
web 61282 → 61819 B、desktop 64122 → 64659 B；备份 `cordis.patch.yml.bak-20261003-132841-pre-mnemon-idlereview`。

## 验证
- `dsh --profile web --dump-config` → exit=0、stderr 空，解析出的 mnemon 段含 `idleReview: maxTokens: 32768`。
- desktop 不能直 dump（`dsh/lib/bin.js:36` 硬守卫），用 `~/.dsh/storages/tools/dump-desktop-config.ps1` 复制成 `desktop-probe` profile + junction node_modules 再 dump → 同样得到 32768。`pwsh` 不在 PATH，要用 `powershell -NoProfile -ExecutionPolicy Bypass -File`。
- **E2E 未验**：review 的 idle timer 只在 **turn 结束后**才武装（`lib/index.js:5532` `composedByDefault(turn)` 后挂 `setTimeout`，`idleReviewMs=30000`，另有 `minIntervalMs=300000`、`maxPerSession=20` 闸门）⇒ 在 turn 内部 `sleep 100` 不会触发。要在一次 turn 结束后 + 30 s idle 才会跑，故验收口径 = 重启 desktop/web 后，核对新 review 会话的 `request/header.config.maxTokens == 32768`。

## 相邻默认值（未动）
- `runtimeMemory.maintenanceMaxTokens` 默认 **8192**（上限 1e6），migration / compaction / document-archive 维护 subagent 用（`lib/index.js:4567 perOpMaxTokens`）。
- 若还想「连文案一起去掉」：要改核心 UI 的 `client.js`（npm 侧）+ desktop `app.asar`，会被 dsh 升级覆盖，属遮症状。
