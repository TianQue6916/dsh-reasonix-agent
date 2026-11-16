---
id: mem-1131574806a5e6879543a70797f0e0ac
revision: 1
created_at: "2026-11-16T07:44:55.447Z"
updated_at: "2026-11-16T07:44:55.447Z"
name: dsh-desktop-插件消失-根因是bundles被重置
description: "dsh 桌面版插件全部消失的真因：package.json 的 dsh.profile.bundles 被 auto-reset 砍成 2 个，与 dependencies / node_modules 无关"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 症状
dsh 桌面版（Web GUI）里第三方插件全部消失：mnemon / dsh-context / dsh-deja / dsh-headroom / ds-harness-remote / dshmarket / better-sidebar / quick-toc / computer-use 等一个都不加载。`ERROR: 插件全没了`。

## 真因
`C:\Users\27063\.dsh\profiles\desktop\package.json` 里 `dsh.profile.bundles` 被重置成只剩 2 个：
```
@deepseek-ai/dsh-base
@deepseek-ai/dsh-web-app
```
原本是 20~21 个（含全部第三方插件）。

**关键机制**：`dependencies` 只负责「装包」，`dsh.profile.bundles` 才决定「加载哪个插件」。
bundles 没了之后，`cordis.patch.yml` 里那 32 条顶层 `- id: xxx`（全是「修改已存在的 entry」）全部 `entry not found`；只有 patch 里 4 个 `- insert:`（tool-probe、preset-anchored-standard 等 .mjs 插件）还能生效 —— 所以表现为「只有 thinking-anchor / tool-probe / host-log-tee 活着，其余全灭」。

## 触发点
- 桌面崩溃对话框第三个按钮「Disable third-party plugins, back up profile patch, and restart」会把 patch 写成 `[]` 并把 bundles 砍成 2 个
- 另有 auto-reset 机制同理（`package.json.bak-20261002-1347-auto-reset` 也是 2 bundles，2026-10-02 已发生过一次）

## 修复
从同目录的 `package.json.bak-<ts>` 备份里取 `dsh.profile.bundles` 数组，恢复进当前 package.json。
bundles 只在 host 启动时读取，`patchReload: live` 管不到它 → 必须重启一次。

已验证可 resolve 的 19 个（2026-11-16）：
base, web-app, @local/dsh-plugin-goat-panel, dsh-plugin-local-search, dsh-headroom, dsh-mnemon, dshmarket, @lanbaolu/dsh-wechat-bridge, @local/dsh-thinking-language, @local/dsh-plugin-fetch-file, dsh-context, billion-context, dsh-quick-toc, dsh-better-sidebar, dsh-plugin-message-edit, @ethanwong-hk/dsh-thinking-guard, ds-harness-remote, @weibaohui/dsh-smart-title, dsh-computer-use-win

`@deepseek-ai/dsh-experimental-voice-input-bundle` 与 `@deepseek-ai/dsh-experimental-session-search` 只在 dsh 运行时目录（`%APPDATA%\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\`）里，从 profile 侧 `import.meta.resolve` 解析不到，暂未加回 bundles。

## 排错时别踩的坑
- 不要用「文本行 Compare-Object」比较 package.json 备份，缩进/尾逗号差异会造成假阳性；按 JSON key 逐项比
- `import.meta.resolve` / ESM 的解析基准是**脚本文件位置**，不是 cwd；拿 `-e` 测也要注意，测包解析必须让脚本落在 profile 目录内或用 `node --input-type=module -e` 配合 cwd
- `node_modules/.pnpm` 为空不等于依赖坏了（hoisted 布局正常如此）
