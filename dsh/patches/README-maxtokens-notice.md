# 隐藏「已达到输出 token 上限」通知（turn-max-tokens）

日期：2026-10-03 · 脚本：`~/.dsh/storages/tools/patch-maxtokens-notice.py`
state：`~/.dsh/storages/maxtokens-notice-patch.json`

## 症状

用户侧看到（同一段 UI 文本，抄下来时两行相邻）：

```
已完成，用时 3分2秒
已达到输出 token 上限回答被截断，已有输出保留在对话中。发送"继续"可让模型接着输出。
```

「已完成，用时 X」是正常的 turn 完成标记（i18n `message.turnProcess.took`，`client.js:5423`），
**不要动**。要藏的是第二行。

## 根因链（逐字，全部来自 0.2.0-rc.2 的 client.js）

1. UI 节点的唯一触发条件 = `turn/end` 事件 `reason.kind === "max-tokens"`：
   - `@deepseek-ai/dsh-client-ui-chat/lib/client.js:9920`
     `if (match.event.type !== "turn/end" || match.event.data.reason.kind !== "max-tokens") return void 0;`
   - `:9932` `if (event.type === "turn/end" && event.data.reason.kind === "max-tokens") return {`
     （notice definition `kind: "turn-max-tokens"`）
2. 文案：`:5527` `"message.maxTokens": "已达到输出 token 上限"`、`:5528` `"message.maxTokens.hint": "回答被截断，…"`。
3. `max-tokens` 这个 reason 的来源是 provider 的 `stopReason:"length"`：
   - `dsh-llm-pi-ai/lib/index.js:1422` `case "length": return { kind: "max-tokens" };`
   - `dsh-llm-deepseek/lib/index.js:1906` `case "max_tokens": return { kind: "max-tokens" };`
4. 实测（用户会话 `session-b65a9a67-80a1-403c-b899-45b0ac351801`，turn 15，13:36:43→13:39:46）：
   该 turn 的 `request/header.data.header.config` 是
   `{provider:"commandcode-goat", model:"deepseek/deepseek-v4.1-flash", reasoningEffort:"high", maxTokens:262144}`
   —— **预算 262144，最后一步 completion 只有 2899 tokens**，却在 13:39:46 收到 `turn/end {"kind":"max-tokens"}`。
   同 turn 内还并存一次 `assistant/attempt` 的
   `{"kind":"error","failure":{"message":"upstream stream ended before a completion event; this turn may be incomplete","code":"TRANSPORT"}}`
   + 自动 `llm/retry`（1/8）+ gateway 侧 `STREAM-ERR id=154 key=163 upstream aborted`。
   ⇒ 这条通知是**上游提前收流却标了 length** 的产物，不是真的耗尽预算。

## 判据：为什么「藏通知」是合法做法

- 通知不承担任何功能，只是一段提示文本；它的 `继续` 只是让用户手动发一句「继续」。
- 截断事实**仍然完整落盘**：session 事件里 `turn/end` 的 reason 原样保留，gateway 日志里有 `usage=`；
  诊断能力零损失，只是不再在聊天流里插一个节点。
- harness 内部语义（`finish.kind === "max-tokens"`、`dsh-llm` 里 max-tokens 时丢 tool-call 块的行为）
  **一律不动** —— 改了会破坏 tool-call 处理。

## 改法

等长替换，只碰 **UI 判定的两处带引号字面量**：`"max-tokens"` → `"max-tokenz"`（12 B → 12 B，纯 ASCII），
两个 anchor：

```
reason.kind !== "max-tokens") return void 0;
reason.kind === "max-tokens") return {
```

anchor 带 `reason.kind` 前缀是必要的：asar 里还有 `finish.kind === "max-tokens") return { kind: "max-tokens" }`
（harness 内部，偏移 14468205）**必须保持不变**；`"max-tokens"` 在 asar 里共 29 处、`"turn-max-tokens"` 8 处，
盲替换会破坏语义。

两个 target（两份都要打：desktop 走 asar 内核心插件，web 走 npm-js；`~/.dsh/profiles/*/node_modules` 下
没有 `dsh-client-ui-chat` 副本）：

| target | 路径 | 大小 | anchor 偏移 |
|---|---|---|---|
| npm-js | `%APPDATA%\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\dsh-client-ui-chat\lib\client.js` | 565455 B | 464175 / 464564 |
| desktop-asar | `C:\Users\27063\AppData\Local\Programs\DeepSeek Harness\resources\app.asar` | 121348951 B | 19677465 / 19677854 |

asar 头里每个条目存 offset+size ⇒ **只能等长替换**，改长度会让其后所有条目错位。

## 验证链（实测，全部 PASS）

1. `--check`：4 个 anchor 的 `count == 1`。
2. `--apply`：npm-js 565455 B、asar 121348951 B，长度不变。
3. `--verify`：
   - 两文件 old anchor count=0、new anchor count=1；
   - `node --check` npm-js：OK；
   - npm-js 与备份**逐字节 diff = 2 处**（`s`→`z` ×2），且全部落在两 anchor 窗口内；
   - asar 内部 `finish.kind === "max-tokens"` 语义 count 仍为 1、`kind: "turn-max-tokens"` 定义仍在；
   - asar header JSON 可解析（5 个顶层条目，header 3392048 B，文件 121348951 B）。
4. 幂等：state 存在时再 `--apply` 直接拒绝。
5. round-trip：`--restore` → npm md5 `612e1b6f2acc03ac4a8ded1f1f6ba510`、asar md5 `8410f7f8d7e791cfce40161327b808e0`
   （asar 内 `"max-tokens"` 回到 29 处、`"max-tokenz"` 0 处）→ 再 `--apply` → md5 回到
   `2016259497870124adf8285e359f5edf` / `3d867e888059dc91544c3190e40a322d` ⇒ **重放逐字节一致**。

## 生效条件

client bundle 在**渲染进程启动时**加载 ⇒ 需一次 **App 重启**（web 侧则是浏览器刷新）。
与 dsh-context 价目补丁同一批次重启即可。

## 回滚

```
python ~/.dsh/storages/tools/patch-maxtokens-notice.py --restore   # 幂等逆替换 + 删 state
```

## 上游更新会覆盖

npm-js 那份随 `@deepseek-ai/dsh` 升级被覆盖；asar 那份随 App 更新（`app-update.yml` → `nightly`）被覆盖。
两者都只需重跑 `--check` + `--apply`。`--check` 的 anchor count 若不再为 1，说明上游改了这两处 UI 判定，
需要重新定位（搜索 `reason.kind` 附近的 `"max-tokens"` 字面量）。
