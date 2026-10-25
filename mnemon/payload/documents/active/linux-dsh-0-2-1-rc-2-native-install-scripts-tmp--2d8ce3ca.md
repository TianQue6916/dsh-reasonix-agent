---
id: "2d8ce3ca-b52c-4931-939f-63f9e9efde1a"
title: "Linux 端 dsh 升级到 0.2.1-rc.2：native install-scripts 补齐、插件双端对齐与 /tmp 依赖 vendor 化"
description: "2026-10-26 凌晨 Linux（Ubuntu，systemd dsh-web.service）从 0.2.0-rc.2 升到 0.2.1-rc.2 的实施记录：npm 全局装 dsh 默认跳过 install scripts 导致 node-pty/koffi 缺 prebuild、需 --allow-scripts 重装；web profile 与 Windows desktop 14 个插件的逐项差异核对；dsh-plugin-message-edit 引用 /tmp/*.tgz 被 systemd-tmpfiles 每日清理的隐患及 vendor 化修复；bili 升级后回归验证结果。"
status: "active"
created_at: "2026-10-25T19:21:21.494Z"
updated_at: "2026-10-25T19:21:21.494Z"
content_hash: "e01ed4ecdcfa3c688910a93732f413b5da62b94a1d4341307533b0f10c139f74"
source_paths:
  - ".dsh/profiles/web/package.json"
  - ".dsh/vendor/dsh-plugin-message-edit-1.2.0-pr7.tgz"
session_ids:
  - "4fae8a64-daaf-46d5-8efb-047115958bba"
memory_body_ids:
  []
---

# Linux 端 dsh 升级到 0.2.1-rc.2（2026-10-26）

**性质**：运维实施 + 双端一致性核对记录。前置文档：`bd99fb07-70d3-4185-a0f5-2c3b6d0fca90`（0.2.1-rc.2 前置清理、两条独立升级线、回滚点）、`878bd757-1e82-4db3-be40-956d74971f80`（Linux goat-gateway 同步修复）、`71f2073f-052c-4fc7-8257-5a2a9453e581`（bili compaction gate 与建会话卡死）。

## 1. 升级前状态与结论

| 端 | 升级前 | 升级后 |
|---|---|---|
| Windows（npm 全局 + desktop asar 内置） | 0.2.1-rc.2 | 0.2.1-rc.2 |
| Linux（npm 全局 `@deepseek-ai/dsh`） | **0.2.0-rc.2** | 0.2.1-rc.2 |

关键事实：**Linux 一直停在 0.2.0-rc.2**，此前误以为已对齐 rc.3。npm registry 上 `latest = 0.2.1-rc.2`、`next = 0.2.1-rc.3`、`alpha = 0.2.1-alpha.5`；Windows desktop 的 Electron asar 内置版本为 0.2.1-rc.2，其 `package.json` 依赖全部锁在 0.2.1-rc.2。因此 Linux 对齐目标取 **0.2.1-rc.2**（与 Windows 一致，且 bili 已验证适配）。

备份：升级前把 profile 的 `package.json` / `cordis.patch.yml` 备份到 `~/dsh-backup-20261026-031410`。

## 2. 坑：npm 全局安装默认跳过 install scripts

第一次 `npm install -g @deepseek-ai/dsh@0.2.1-rc.2` 后版本号正确，但 npm 警告 5 个包带未授权的 install scripts：

```
@deepseek-ai/dsh-subprocess-local (postinstall: ensure-spawn-helper.mjs)
koffi                          (install: cnoke prebuild)
node-pty                       (install + postinstall prebuild)
@google/genai / protobufjs
```

后果：`node-pty` 只剩 win32/linux-arm64 的 prebuilds，x64 的 `pty.node` 缺失 ⇒ 终端能力不可用。修复方式是重装并显式放行：

```bash
npm install -g --allow-scripts=@deepseek-ai/dsh-subprocess-local,koffi,node-pty,@google/genai,protobufjs @deepseek-ai/dsh@0.2.1-rc.2
```

重装后 `changed 613 packages`，`@koromix/koffi-linux-x64/{glibc,musl}`、`node-addon-system-linux-x64`、`sharp-linux-x64` 等 native 实体就位。

**可复用结论**：在 Linux 上装/升 dsh 全局包后，必须核对 `node_modules/node-pty/prebuilds/linux-x64` 与 koffi 的 `linux_x64` 是否真实存在；只看 `dsh --version` 会漏掉 native 缺失。

## 3. 重启与运行态

`systemctl restart dsh-web`（服务 ExecStart 用 `/home/tianque/.local/bin/dsh web --port 3080`，前置 `NODE_OPTIONS=--dns-result-order=ipv4first --no-network-family-autoselection`）。重启期间 journal 出现连续 `Failed with result 'exit-code'` 的重试记录，最终 `active`；`http://<host>:3080` 返回 **401**，属未带 token 的正常鉴权响应，不是故障（同 `71f2073f` 文档中的判定口径）。

启动日志里唯一成片报错来自 `ds-harness-remote`：

```
CODEX_BINARY_UNAVAILABLE / CURSOR_BINARY_UNAVAILABLE
Antigravity binary error: spawn /home/tianque/.local/bin/agy ENOENT
```

这些是远端 agent CLI 未安装的探测噪音，不是插件加载失败。

## 4. 插件双端逐项对齐（14 项）

Linux `~/.dsh/profiles/web` 与 Windows desktop 的插件集合只有两处差异，均合理：

| 插件 | Windows desktop | Linux web |
|---|---|---|
| `@ethanwong-hk/dsh-thinking-guard` | 无 | ^1.0.2 |
| `@lanbaolu/dsh-wechat-bridge` | 0.9.1 | 无（Linux 无微信客户端） |

其余 12 项两端版本一致且 `node_modules` 实体全部存在：`billion-context 0.1.206`、`ds-harness-remote 0.5.17`、`dsh-better-sidebar 0.28.0`、`dsh-context 0.74.0`、`dsh-deja 0.23.0`、`dsh-headroom 0.3.0`（github 形态）、`dsh-mnemon ^0.5.34`、`dsh-plugin-local-search`、`dsh-plugin-message-edit`、`dsh-quick-toc 0.10.2`、`dshmarket 1.67.0`、`@local/dsh-plugin-goat-panel`、`@local/dsh-thinking-language`。

用户提出的「Linux 端有些插件异常」在这一轮**未能定位到具体插件**：能查到的只有 dsh-remote 的 CLI 探测报错与已修复的 /tmp 隐患。

## 5. 定时炸弹：profile 依赖指向 /tmp/*.tgz

`dsh-plugin-message-edit` 原本声明为 `file:/tmp/dsh-plugin-message-edit-1.2.0-pr7.tgz`。Ubuntu 的 `/tmp` 由 `systemd-tmpfiles-clean.timer` 每日清理（实测下次触发在 21 小时后），一旦清理，profile 重装/重建会直接失败。

已修复：把 tgz 复制到 `~/.dsh/vendor/dsh-plugin-message-edit-1.2.0-pr7.tgz`，改 `profiles/web/package.json` 为 `"file:/home/tianque/.dsh/vendor/dsh-plugin-message-edit-1.2.0-pr7.tgz"`，校验 JSON 合法。已展开在 `node_modules/dsh-plugin-message-edit/1.2.0` 的实体不受影响，但后续任何 `npm install` 都依赖新路径。

**可复用结论**：profile 里任何 `file:/tmp/...`、`file:/var/tmp/...` 形式的依赖都应视为待修隐患，统一迁到 `~/.dsh/vendor/`。

## 6. bili 回归验证

升级后 bili 仍正常：`nudge 计数 13`、`/__bili/sessions` 返回 `total=1`、`hasLedger=true`、`newContent=8375`、`contextWindow=1000000`，日志有 `[acp-usage] input=4513 cached=0` 与 `forward POST → http://<gateway>:8788/v1/chat/completions`。此前的「bili 不工作」根因是 gateway 侧 undici fetch 在双栈域名上不回退 IPv4（已单独记录为 memory `linux-gateway-undici-ipv6-timeout`），与 bili 本身无关。

## 7. 遗留（当时未完成）

1. 升级后完整回归验证（18 项 checklist 性质）。
2. wiki 搜索超时未解决。
3. skills / presets 目录接入 Git 版本管理。

## 8. 过程教训

该轮出现了长时间的思考空转（用户在 `m03339` 直接指出「你陷入了思考僵死」），表现为在同一个判断上反复循环。有效止损方式是立即把结论写成「已完成 / 剩下的 / 需要用户澄清的」三段式，并明确列出无法定位的那一项（「Linux 端哪些插件异常」）请用户点名的成本低于自行猜测。
