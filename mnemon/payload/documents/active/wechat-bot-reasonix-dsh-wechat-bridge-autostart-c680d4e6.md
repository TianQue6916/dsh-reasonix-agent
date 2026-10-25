---
id: "c680d4e6-4b89-46d4-b9cd-01f89ce57483"
title: "WeChat bot 从 reasonix 迁入 dsh wechat-bridge：凭据契约映射、autoStart 冲突与插件挂载验证"
description: "2026-09-30 完成的 wechat bot 迁移第 1 步（免扫码的凭据契约转换、双份账号文件的 accountId 陷阱、autoStart 双 gateway 双响应风险与 patch 覆盖、用独立端口临时实例验证插件挂载的可复用方法），以及待用户确认的第 2 步切换与回滚方式。"
status: "active"
created_at: "2026-09-30T01:51:36.578Z"
updated_at: "2026-09-30T01:51:36.578Z"
content_hash: "11be21e65a20ea3cfe87cac0b95d4e8183104aaaf9151c40b1d8d7b9f8054ec6"
source_paths:
  - "profiles/web/cordis.patch.yml"
  - "profiles/web/package.json"
session_ids:
  - "a400c155-df37-4970-8f8c-1079fa5c5cc9"
memory_body_ids:
  []
---

# WeChat bot 从 reasonix 迁入 dsh wechat-bridge

状态（2026-09-30）：**第 1 步已完成并验证**；第 2 步（真正切换流量）等待用户确认。全程未修改 reasonix 侧，微信服务未中断。

目标插件：`@lanbaolu/dsh-wechat-bridge@0.9.1`，数据目录 `~/.dsh/wechat-bridge/`。

---

## 1. 核心结论：不需要重新扫码

两侧读写的是**同一个官方 iLink 端点**，差异只是字段命名与 accountId 的存放方式，因此凭据可以在本地无损转换，无需重走扫码登录。

字段映射（插件侧来源：`lib/bridge/wechat/login.js:72-75` 写入的 `accountData`）：

| 插件需要（`saveAccount`） | reasonix 侧实际存放 |
|---|---|
| `accountId` | **只存在于文件名**（`<botId>@im.bot.json`），文件内容里没有该字段 |
| `botToken` | `token` |
| `baseUrl` | `base_url` |
| `userId` | `user_id` |

插件侧消费点：`lib/bridge/main.js:485`（`botAccountId` → session store）、`main.js:493`（`createSender`）、`main.js:523/800/1130`（pending queue 以 accountId 命名文件）。因此 `accountId` 值错误会一路污染 session store、sender 与队列文件路径。

context token 侧也不同：插件用 `DATA_DIR/context-tokens.json`（`{tokens: {userId: token}, updatedAt}`，另有兼容旧版的单条 `context-token.json`，见 `lib/bridge/main.js:88-150`），而 reasonix 是 `default.context-tokens.json` 的 flat map。

## 2. 踩到的坑：同一 bot 的双份账号文件

reasonix 侧同时存在两份**token 字节相同、mtime 相同**的账号文件（`default.json` 与 `<botId>@im.bot.json`）。插件的 `loadLatestAccount()` 按 mtime 选最新、tie 由 `readdir` 顺序决定 ⇒ 若命中 `default.json`，`accountId` 会退化成字面量 `"default"` 而不是真实 iLink bot id。

处理方式（迁移脚本内）：**按 token 去重，优先保留 `<botId>@im.bot` 形态的 id**，副本显式报告为 skipped。dry-run 与实跑输出都确认只写入了 1 个账号文件。

迁移脚本：`migrate-reasonix-wechat-credentials.mjs`（含 DRY-RUN / MIGRATE 模式，reasonix 侧只读）。写入后用「只打印 key 名与长度、不打印值」的方式做契约校验，得到 `accountId` / `botToken` / `baseUrl` / `userId` / `savedAt` / `migratedFrom` 全部就位的结果，reasonix 侧文件未被改动。

## 3. 关键风险：`autoStart` 与双 gateway 双响应

插件自带的 `cordis.patch.yml` 把 `autoStart` 设为 `true`。若直接挂载并重启 dsh，就会与仍在运行的 `reasonix-bot` 同时处理同一条微信 ⇒ **同一条消息被回两次**。reasonix 的 leader election 每分钟 ping 的是**另一台机器**，因此管不了同机第二个 harness，不能指望它互斥。

因此分两步走：

- 先在 `profiles/web/cordis.patch.yml` 的 patch 层把 `autoStart` 覆盖为 `false`，bundle 先注册进 `profiles/web/package.json` 的 `bundles`（注意 `dsh plugin add` 只改 dependencies，`bundles` 是手动维护的，其它插件也都在里面）。
- 待用户确认后再改为 `true` 完成切换；切换会造成几十秒微信中断。

验证覆盖确实生效的手段：`dump-config` 输出中出现
`# == @lanbaolu/dsh-wechat-bridge, patched by …\profiles\web\cordis.patch.yml` 且该 row 为 `autoStart: false`，同时总字节数正常（其它 row 未被破坏）。

## 4. 可复用方法：验证 plugin 挂载而不影响正在运行的实例

给 `bundles` 加插件后最坏情况是「下次重启 dsh 起不来」，所以必须事前验证。做法：

1. 直接 `import` 插件包，确认导出 `apply` 与 `inject`（本例 `inject: ["tools","agents","agentDefaultModel","agentPresets"]`）。
2. 用**独立端口**（3099，不碰正在服务的 3080）起一个临时 dsh web 实例，确认端口被监听、启动日志里**没有任何目标插件相关报错**。
3. 取插件真的初始化过的正面证据：数据目录出现 `plugin.log`，内容为 `web panel routes registered {"count":17}`。
4. 忽略与本插件无关的既有噪声：本例日志里只有 `dsh-remote` 的 `CODEX_BINARY_UNAVAILABLE` / `ACCOUNT_AUTH_REQUIRED`，属于先前就存在的故障，不构成回归。

## 5. 第 2 步与回滚（待用户决定）

- 切换：`weixin-bot-switch.ps1 -Mode ToDsh` —— 先停 reasonix 侧、确认停干净，再把 `autoStart` 改回 `true`。
- 回滚：`weixin-bot-switch.ps1 -Mode ToReasonix`。
- 执行前人需有准备：会短暂中断微信响应（约几十秒）。

## 6. 相邻待决事项

本机 dsh 为 `0.1.7-rc.2`，npm 上已有 `0.2.0-rc.2`（2026-09-29）。升级会同时影响插件面、patch 语义以及 `node_modules` 内被打的本地 patch，需要先备份 profile 并记回滚点后再评估，不要顺手升级。
