---
id: mem-cf60e63e1e5baf91c118ef61e4a4e61c
revision: 1
created_at: "2026-10-07T04:49:04.103Z"
updated_at: "2026-10-07T04:49:04.103Z"
name: dsh-desktop-blank-conversation-pane-null-source-guard-20261007
description: "dsh desktop 会话页全黑的根因（source.kind 无判空）与 13 处 null-guard 修复 + 生效条件"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 症状
desktop App 里会话内容区**全黑**（tabs「对话/轨迹/版本/上下文/Replay」仍在），多个会话都复现；用户原话「我这边突然看不到上下文了」「又不出现上下文了」「好几个对话都是这样」。

## 根因（唯一，2026-10-07 实测）
`dsh-client-ui-chat/lib/client.js:5187` 的 `ChatView` 在 render 期 useMemo 里无条件读 `message.source.kind`：
```js
const inboxSteering = react.useMemo(() => inbox?.["next-step"].filter((m) => m.source.kind === "user") ?? [], [inbox]);
```
收到一条 `source: null` 的 inbox 消息即抛 `TypeError: Cannot read properties of null (reading 'kind')` ⇒ `dsh-client-ui-renderer/lib/client.js:618` 的 `SlotErrorBoundary` 隔离该 entry、`render()` 返回空 `<div data-slot-error="conversation.view">` ⇒ 全黑。

crash log（`%APPDATA%/@deepseek-ai/dsh-desktop/logs/crash-2026-10-06T16-14-06-734Z-renderer.log`，25.6 KB）逐字，各 3 次：
```
slot entry crashed in 'conversation.view': TypeError: Cannot read properties of null (reading 'kind')
[session-controller] event feed subscriber failed: TypeError: Cannot read properties of null (reading 'kind')
```

## 修复（containment）
脚本 `~/.dsh/storages/tools/patch-dsh-null-source-guard.mjs`（`--check` / `--apply` / `--verify` / `--restore`，幂等：`source?.kind` 不含子串 `source.kind`）。
把 13 处 `source.kind` → `source?.kind`：
- `dsh-client-ui-chat/lib/client.js` 8 处（`:5084 :5187 :5203 :8951 :9201 :9250 :9278 :5222`）
- `dsh-client-ui-conversation/lib/client.js` 2 处（`:15381 :15384`）
- `dsh-api-session-controller/lib/client.js` 2 处（`:2184 :2197`）
- `dsh-client-ui-trajectory/lib/client.js` 2 处（`:1032 :1242`）

语义保真：每个后续解引用都被 `||` 短路或 `&&` 保护 ⇒ null 走「非 user 消息」既有分支。
备份：各 `lib/client.js.bak-20261007-pre-null-source-guard`。`node --check` 全绿、`--verify` 全 PASS。

## 生效路径（关键）
插件**不打包进 app.asar**。renderer 的 bundle URL（crash log 里）为
`dsh-app://app/plugins/??<packages>&rev=<hash>:<line>`
明确列了这 4 个包，且都经
`~/.dsh/profiles/node_modules/@deepseek-ai/<pkg>/lib/client.js` → symlink →
`%APPDATA%/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/<pkg>/lib/client.js`
加载 ⇒ **改全局 npm 那份 = 同时影响 web 与 desktop；重启 App 即生效（bundle `rev=` 会变）**。
asar 内也有一份同名文件（`/dsh/node_modules/@deepseek-ai/dsh-client-ui-chat/lib/client.js`，565053 B），但那是内嵌 runtime，不是 renderer 加载的那份。

## 未决（治本）
`source: null` 的**注入源未定位**。扫了 4 个 crash 相关 session 的持久化事件流（`5cc47bcb` 4853 / `9cf09938` 3142 / `a0d5fbf8` 31830 / `c424a630` 823 events）：`data.source = null` 与 `inserted[*].source` 缺失/为 null **全部为 0** ⇒ null 出在**运行时投影**（inbox projection / optimistic pending submission），不在磁盘事件流上。

## 社区先例（同形状）
`yjh051108/dsh-agi-harness#16`：插件注入了没有 `id`/`source` 的消息，harness 无判空读取 `message.source.kind`。

## 相关
- `@mingozhou/dsh-replay` 的注释已明说「桌面端（Electron）的前端资源打包在 `resources/app.asar` 内，不读 node_modules」—— 该说法只对**部分**前端资源成立；`dsh-client-ui-*` 这批插件走 `dsh-app://app/plugins/` 运行时 bundle，读的是 node_modules。
- 回滚：`node ~/.dsh/storages/tools/patch-dsh-null-source-guard.mjs --restore`
- 关键文件行数：`dsh-client-ui-chat/lib/client.js` 13480 行 / `dsh-client-ui-renderer/lib/client.js:618` `SlotErrorBoundary`。

截至 2026-10-07 12:5x CST。restore 后需重启 App。
</body>
<parameter name="scope">global
