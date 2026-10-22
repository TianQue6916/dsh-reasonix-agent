---
id: mem-a0bd74961c8b6df4ce272ae5ee242a82
revision: 1
created_at: "2026-10-22T15:23:05.463Z"
updated_at: "2026-10-22T15:23:05.463Z"
name: dsh-0.2.1-rc.2-升级全景与进度-20261023
description: "dsh 0.2.1-rc.2 升级全景（2026-10-23）：桌面端 Electron 与 npm CLI 是两条独立升级线，桌面端 app.asar 内置自己的 dsh 运行时，nights feeds 已到 0.2.1-rc.2；已完成备份/删 replay/删 hooks+ralph/CLI 升级；待做插件升级（dsh-context 0.63→0.74 风险最高）与三端回归"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 两条独立的升级线（2026-10-23 实测，这是本次适配最关键的认知）
1. **桌面端** = Electron 应用 `DeepSeek Harness.exe`，装在 `C:\Users\27063\AppData\Local\Programs\DeepSeek Harness\`（Electron 44.0.0，`app.asar` 121 MB）。**它 bundle 了自己的 dsh 运行时**（asar 里检出 `0.2.0-rc.2`），并带 `resources/app.asar.unpacked/dsh/node_modules`。
   - 更新器：`resources/app-update.yml` → `provider: generic`, `url: https://download.deepseek.com/dsh-desk/feeds/win-x64/`, `channel: nightly`
   - 实测 `nightly.yml` → `version: 0.2.1-rc.2`，安装包 `deepseek-harness-0.2.1-rc.2-win-x64.exe` **289,385,456 B**（sha512 39POl5os…）
   - 进程名是 `DeepSeek Harness.exe`（不是 node.exe / electron.exe），监听 127.0.0.1:13160 / 13161 / 19387
2. **CLI** = npm 全局 `@deepseek-ai/dsh`（523 MB / 82 deps），管 `dsh` 命令、`--dump-config`、`dsh plugin`。
⇒ **`npm i -g` 不会让桌面端变成新版**，两者要分别升级。profile 插件（`~/.dsh/profiles/*`）两端共用，升级后需重启才加载。

## 版本落差
- dsh 本体：0.2.0-rc.2（2026-09-29）→ **0.2.1-rc.2**（2026-10-17），中间 7 个 alpha + rc.1
- 依赖变化：82 → 86 个包；新增 10 个 experimental/正式包；移除 6 个（`dsh-hooks-claude-code`、`dsh-hooks-codex`、`dsh-experimental-schedule-bundle`、`dsh-tool-ralph`、`dsh-webhook`、`dsh-webhook-github`）
- 新版功能（官方 description）：`experimental-session-search`（Agent 可检索本 workspace 的历史 session）、`experimental-cot-translation-bundle`（expanded reasoning 的机器翻译）、`experimental-terminal-bundle`（shell 跨 tool call 保活）、`experimental-ralph-bundle`、`dsh-schedule` + `dsh-tool-schedule`（agent 级 durable 定时）、`experimental-tool-worktree`、`experimental-session-titles-bundle`、`experimental-plugin-market-bundle`、`experimental-inspector-profile`、`experimental-badge-skill-bundle`
- 底层：`@deepseek-ai/cordis` 4.0.4 → **4.0.5**（第三方插件 peer 要求 `^4.0.1`，仍满足）；schemastery 3.18.4→3.18.5

## 已完成（2026-10-23 23:1x~23:3x）
1. 备份 `~/.dsh/backups/pre-0.2.1-rc.2-20261023-2313/` + git tag `pre-0.2.1-rc.2-20261023-2313`（含 ROLLBACK.md / versions-before.json / installed-before.json）
2. 卸载 `@mingozhou/dsh-replay`（desktop+web，32.7 MB）
3. 删 `dsh-hooks-claude-code`（三 profile insert 块）+ `dsh-tool-ralph`（desktop/web preset row）
4. **CLI 已升到 0.2.1-rc.2**（npm 后台安装完成）

## 待做（重启后）
1. 验证：`dsh --version`；`dsh --profile web --dump-config` rc=0 且不再出现 ralph/hooks
2. 插件升级（第一批 minor/微版本）：dsh-mnemon 0.5.21→0.5.34、dshmarket 1.66.8→1.67.0、dsh-better-sidebar 0.24.1→0.28.0、dsh-quick-toc 0.8.2→0.10.2、dsh-deja 0.21.3→0.23.0、@mingozhou/dsh-replay 已删
3. 插件升级（第二批跨 minor，风险高）：`dsh-context` 0.63.0→**0.74.0**、`ds-harness-remote` 0.4.27→0.5.17
4. 不动：`billion-context` 0.1.204（已最新，且是当天刚修复压缩链的版本）、`@lanbaolu/dsh-wechat-bridge` 0.9.1（已最新）
5. 单独 git 查（npm 404）：`dsh-headroom`（git+https://github.com/giter00/dsh-headroom.git）、`@ethanwong-hk/dsh-thinking-guard`
6. 三端回归：bili `/__bili/sessions` 的 `contextWindow` 必须仍是 **868928**（不是 150000）；mnemon 写入→同步实时；wechat bridge 不双响应

## 教训
pnpm/npm 安装在桌面端运行中做，若中途被打断会留半装状态（比不装更糟）⇒ 插件升级要放在「重启后、桌面端空档」里做。
