---
id: mem-352ce2fe4a616ab9b03b2e05d48e4c46
revision: 1
created_at: "2026-09-30T01:50:08.943Z"
updated_at: "2026-09-30T01:50:08.943Z"
name: wechat-bot-migration-to-dsh-step1-20260930
description: "微信 bot 迁 dsh 第 1 步完成：包+凭据+bundle+autoStart 覆盖+挂载已验证，只差停 reasonix 开 daemon"
metadata:
  type: user
  fact_type: project
  scope: global
---

# 微信 bot 迁入 dsh：第 1 步完成（2026-09-30）

用户要求：「之前那个微信 bot…现在我需要你把它放到 dsh 上面，注意吸取社区经验」

## 已选插件
`@lanbaolu/dsh-wechat-bridge`（latest **0.9.1**，2026-09-29；此前调研装过 0.9.0）。
- 官方 iLink 协议：`DEFAULT_BASE_URL = https://ilinkai.weixin.qq.com`（与 reasonix 侧同一端点）
- 自带 `cordis.patch.yml`（`dsh.bundle.patch`），所以进 bundles 即挂载
- `inject = ['tools','agents','agentDefaultModel','agentPresets']`；含 Web 管理面板（`lib/client.js`）
- 备选 `AbcdefgXW/dsh-msg-hub`；`pan17/dsh-wechat` 已出局

## 凭据：字段改名即可，不需要重新扫码
两侧同一个官方 iLink，只是 schema 不同：

| 插件要的（`login.js:72-75`） | reasonix 有的 |
|---|---|
| `accountId` | 只在**文件名**里（`cf29d3b9eb6f@im.bot.json`） |
| `botToken` | `token` |
| `baseUrl` | `base_url` |
| `userId` | `user_id` |

**目标目录**：`DATA_DIR = process.env.DSH_BRIDGE_DATA_DIR || $DSH_HOME/wechat-bridge`
⇒ 默认 `~/.dsh/wechat-bridge/`，账号在 `accounts/{accountId}.json`，context tokens 在
`context-tokens.json`，格式 `{tokens:{...}, updatedAt}`（**包一层 `tokens`**；reasonix 是扁平 map，
在 `weixin/accounts/default.context-tokens.json`）。

## 两个坑（都已在脚本里处理）
1. **reasonix 把同一个 bot 存了两份**：`default.json` 与 `cf29d3b9eb6f@im.bot.json`
   **token 字节相同、mtime 相同**。插件的 `loadLatestAccount()` 按 mtime 选、tie 由
   `readdir` 顺序决定 ⇒ 若落到 `default.json`，`accountId` 会变成字面量 `"default"`，
   而 `main.js:485/493` 把它喂给 session store 和 sender。
   **只保留一个文件**，优先取形如 `@im.bot` 的 id。
2. context-tokens 的文件名与包装结构都不同（见上）。

## 已完成（全程未碰 reasonix 侧，微信照常服务）
- 包安装：`dsh plugin --profile web add @lanbaolu/dsh-wechat-bridge@0.9.1`
  - ⚠️ 该命令**只改 dependencies，不写 `dsh.profile.bundles`**（bundles 要手改）；
    且它末步会 `exit 143`（SIGTERM），但 pnpm 本身已 `Done`，profile 未受损
    （证据：`--dump-config` 前后都是 76639 bytes）
- 凭据迁移：`storages/tools/migrate-reasonix-wechat-credentials.mjs`（`--dry-run` 支持，去重，不打印凭据值）
  → 产物 `~/.dsh/wechat-bridge/accounts/cf29d3b9eb6f@im.bot.json` +
    `~/.dsh/wechat-bridge/context-tokens.json`；契约校验 `accountId/botToken/baseUrl/userId` 全 ok
- bundle 注册进 `profiles/web/package.json`
- **patch 层覆盖 autoStart**：插件自带 patch 是 `autoStart: true`，在我们的
  `profiles/web/cordis.patch.yml` 末尾加同 `- id: dsh-wechat-bridge` 的 row（**replace 语义**，
  必须把其余 config 字段原样带上）设为 **`autoStart: false`**。
  `--dump-config` 出现 `# == @lanbaolu/dsh-wechat-bridge, patched by …/cordis.patch.yml` ✓

## 挂载已验证（不碰 3080）
1. 模块可 import：`name` / `apply: function` 正常
2. **临时实例** `--profile web --port 3099 --no-open` 起得来，输出 `dsh web: http://127.0.0.1:3099/?token=…`
3. **零 wechat-bridge 报错**（日志里唯一的错是既有的 `dsh-remote` `CODEX_BINARY_UNAVAILABLE` /
   `ACCOUNT_AUTH_REQUIRED`，与本插件无关）
4. 正面证据：`~/.dsh/wechat-bridge/plugin.log` 由该实例创建（09:48 时间戳）

⇒ 加 bundle 后重启 dsh 不会因此起不来。

## 仍差最后一步（需要用户决定时机：有几十秒中断）
`autoStart` 改 true（或从 Web 面板手动启动 daemon）之前，**必须先停 reasonix 侧**：
`storages/tools/weixin-bot-switch.ps1 -Mode ToDsh`（含 Status/回滚 `-Mode ToReasonix`）。
原因：同机两套 gateway 会**双响应**（同一条微信回两次）；reasonix 的 leader election
每分钟 ping 的是**另一台机器**，管不了同机第二个 harness。
截至 2026-09-30：`reasonix-bot.exe`（PID 10720）仍在跑，微信仍由 reasonix 侧服务。
