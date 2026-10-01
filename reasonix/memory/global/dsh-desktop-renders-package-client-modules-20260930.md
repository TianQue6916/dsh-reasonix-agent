---
id: mem-b1f3e9cefc28387d024b0657d4763d2c
revision: 1
created_at: "2026-09-30T13:18:42.508Z"
updated_at: "2026-09-30T13:18:42.508Z"
name: dsh-desktop-renders-package-client-modules-20260930
description: "实测确认 Electron 桌面端会渲染 package-declared client module（thinking-language 的 Settings 页已出现）"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 结论
dsh 桌面端（Electron, resources/app.asar）**会渲染 package 声明的 client bundle**。

## 证据
2026-09-30 用户重启桌面端后确认：`Settings → 思考语言` 这一页正常出现。
该页来自 `@local/dsh-thinking-language` 的 `lib/client.js`，通过 `package.json` 的
`dsh.client.inject: ["slots"]` + `platform: "web"` 声明，用 `settings.section` slot 注册。

此前该条被标为「未验证」（因为担心 Electron 前端只加载内置模块）。现在闭环：
**`platform: "web"` 不是「只能跑在 web profile」的意思，桌面端同样加载。**

## 边界（不变）
- profile 的 `cordis.patch.yml` → 参与 `patchReload: live` HMR，开新会话即生效。
- `.agent-presets/**` 的 `.mjs` 与 node_modules 里的 client bundle → **不参与 HMR**，装完必须重启进程一次。
- 但重启只影响「首次加载」；之后插件自身的运行时开关（如 thinking-language 的语言切换）走 HTTP route，请求级生效，不用再重启。

## 已知会覆盖的路径
`app-update.yml` → `https://download.deepseek.com/dsh-desk/feeds/win-x64/`，`channel: nightly`。
官方桌面端更新只重写 asar，不会碰 `~/.dsh`（DSH_HOME），所以 profile 侧改动安全；
但若曾把 patch 打进 asar（如 reasoning-autofold），更新后会丢失，需 post-update 重打。
