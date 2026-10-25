---
id: "ccaf7418-968f-43b9-b194-486ffe04727c"
title: "dsh 桌面端（Electron）独立 desktop profile 移植：根因、Electron 独占守卫与验收方法"
description: "2026-09-30 完成的桌面端\"插件/网关/preset 全部消失\"根因定位：Electron 应用使用独立 ~/.dsh/profiles/desktop（与 profiles/web 互不相通）；含 4 类需移植文件、Electron 独占 profile 的硬编码守卫、桌面端只在文件缺失时创建模板（md5 指纹验证法）、wechat-bridge plugin.log 作为插件加载的排他性验收证据、以及尚待用户在桌面端发消息的端到端验证清单与回滚点。"
status: "active"
created_at: "2026-09-30T05:39:19.836Z"
updated_at: "2026-09-30T05:39:19.836Z"
content_hash: "c56258e62175872360801ca95a3c02616cb8eb63396fbbbc7f8839f30c5926c1"
source_paths:
  - "profiles/desktop/package.json"
  - "profiles/desktop/pnpm-workspace.yaml"
  - "profiles/desktop/compatibility.json"
  - "profiles/desktop/cordis.patch.yml"
  - "profiles/web/cordis.patch.yml"
  - "backups/desktop-my-fullport-133452"
  - "profiles/desktop/_bak-pre-fullport-20260930-133243"
  - "wechat-bridge/plugin.log"
session_ids:
  - "6ff72911-6d84-4b1a-b178-8946c2924a8c"
memory_body_ids:
  []
---

# 桌面端 desktop profile 全量移植（2026-09-30）

## 现象与根因

桌面端（Electron 版 DeepSeek Harness）打开后"插件、网关、preset 全都没有"，但全局 `dsh web`（127.0.0.1:3080）一切正常。

根因：**桌面端使用独立的 profile 目录 `~/.dsh/profiles/desktop`**，该目录由桌面端自己在 13:28 首次启动时新建为空壳；而长期积累的插件、网关配置、agent preset 全在 **`~/.dsh/profiles/web`**。两个 profile 互不相通，不是安装或版本问题。

版本前提已具备：桌面端自带 dsh 与全局版本同为 **0.2.0-rc.2**（`resources/runtime/primary-runtime/runtime.json` 的 `desktopVersion`），因此插件兼容性天然满足。

## 关键机制（三个实测结论）

### 1. desktop profile 由 Electron 独占，命令行无法操作

从 `app.asar`（`AppData/Local/Programs/DeepSeek Harness/resources/app.asar`）挖出的硬编码守卫：

```js
if (profile.toLowerCase() === "desktop")
  program.error('error: profile "desktop" is managed exclusively by the Electron application');
```

后果：`dsh --profile desktop ...` 一律被拒 ⇒ **desktop profile 的登录态、路由注册等只能由桌面端自身启动来验证**，命令行无法代跑、无法查询。桌面端 Host 端口（实测 19387 / 7138）均要求认证，未带 token 时返回 401，token 在 Electron 内部，因此不能用本地 HTTP 探测替代验证。

### 2. 桌面端只在文件缺失时创建模板，绝不重写已有文件

验证方法（可复用）：改完文件后，**先对目标文件取 md5 指纹 → 完全杀掉桌面端全部进程 → 重启 → 再取一次指纹逐一比对**。

实测结果：重启前后 `package.json` / `cordis.patch.yml` / `compatibility.json` 三个指纹完全一致 ⇒ 移植的配置被接受，不会被桌面端覆盖回模板。这消除了"改动会不会在下次启动时被抹掉"的风险。

### 3. 插件是否被桌面端加载：用全局 plugin.log 做排他性验收

`~/.dsh/wechat-bridge/plugin.log` 是**全局的**（走 `DATA_DIR=~/.dsh/wechat-bridge`，不按 profile 分），因此可作交叉证据：

```
[2026-09-30T05:35:24.717Z] web panel routes registered {"count":17}
```

UTC `05:35:24` = 本地 `13:35:24`，桌面端 Host 启动于 `13:35:22`，而当时 3080 那个实例没有重启 ⇒ 该条记录**只可能来自桌面端**，即桌面端确实加载了 `@lanbaolu/dsh-wechat-bridge` 并注册了 17 条面板路由。

相反地，`AppData/Roaming/@deepseek-ai/dsh-desktop/logs` 目录为空（13:28 创建、无文件）说明桌面端启动未写任何错误——是好信号但不构成正面证据，不要把它当成加载成功的凭证。

## 移植内容（`profiles/web` → `profiles/desktop`）

1. **`package.json`** — 9 个插件依赖 + 11 个 bundles + `patchReload: live`
2. **`pnpm-workspace.yaml`** — 必须带上 `minimumReleaseAgeExclude`，否则 pnpm 的 `minimumReleaseAge` 策略会拦住新包
3. **`compatibility.json`** — 豁免记录，其 key 正好是 `0.2.0-rc.2`，与桌面端版本匹配
4. **`cordis.patch.yml`** — web 全量（1087 行）+ 26 行桌面端专属覆盖

两处**不能覆盖**的桌面端状态位：

- `ui-settings-account` 的 `step: done` / `completion: api-key` —— 桌面端"首次引导已完成"标记，覆盖会重跑引导流程
- `ui-chat` 合并为 `{transcriptView: verbose, performanceUsage: detailed}` —— 既符合用户习惯，也兼容桌面端默认

依赖安装：`pnpm install` → `+116 packages`，13.7s，`exit=0`（复用 pnpm store 中 104 个包）。

## 数据层无需移植（本来全局共享）

`skills` / `sessions` / `storages` / `~/.mnemon` / `~/.dsh/.agent-presets` 均为全局。patch yml 中 preset 的相对路径 `../../.agent-presets/anchored-standard/*.mjs` 从 `profiles/desktop/` 上溯两级同样落在 `~/.dsh/`，与 `profiles/web/` 的解析基准一致。

环境变量方面：`llm-pi-ai` 配的是 `apiKeyEnv: COMMANDCODE_API_KEY`，该变量在 User / Machine / Process **三级均未设置**，但**属正常**——`dsh web` 同样未设置且一直可用，因为网关是本地服务、不校验入站 key（不带 Authorization 的 curl 也返回 200）。桌面端与 web 前置条件对等，无需补设环境变量。

## 待验证项（残缺部分）

本轮只完成到"桌面端加载了插件"。以下三项需**用户在桌面端发一条消息**后才能验证，因为命令行与本地 HTTP 都被阻断：

1. 网关连通：桌面端 Host 是否连上 `127.0.0.1:8788`（当前 `~/.dsh/sessions` 无新 session，Host 也没有到 8788 的连接）
2. preset 生效：新 session 的 `agentPreset` 是否为 `anchored-standard`、tools 中是否含 `skill_search` / `skill_load`
3. UI 侧边栏入口：replay / dshmarket / goat-panel / 微信面板

会话文件读取提示：`session.v4.jsonl.zstd` 是 concatenated-frame zstd，读 header 需处理**第一个** frame；用 `createdAt` 与 `agentPreset` 可区分新旧会话，避免把当前会话误判为桌面端新建。

## 回滚点

- 移植后的版本备份：`~/.dsh/backups/desktop-my-fullport-133452/`
- 桌面端原始模板：`~/.dsh/profiles/desktop/_bak-pre-fullport-20260930-133243/`

## 相关文档

- `c680d4e6-4b89-46d4-b9cd-01f89ce57483` — wechat-bridge 迁移与插件挂载验证方法（本轮的 plugin.log 验收手法与之同源）
- `fa611c46-9dc6-42aa-93a8-1002be2468bd` — `.agent-presets/anchored-standard` 内各 hook 的实现与验证程序
