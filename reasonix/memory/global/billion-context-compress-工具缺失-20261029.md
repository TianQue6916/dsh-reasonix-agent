---
id: mem-338360dd0837c011c6085659ece6e3fe
revision: 2
created_at: "2026-10-28T16:48:03.627Z"
updated_at: "2026-10-28T16:49:27.408Z"
name: billion-context-compress-工具缺失-20261029
description: "bili 的 compress/acp_status 等 5 个工具消失的真因：tool-bootstrap.mjs 的 keep-set 把第三方工具全裁掉；已加 RESIDENT_ACP_TOOLS，需重启"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 根因：**是我们自己的 `tool-bootstrap.mjs` 把 bili 的工具裁掉了**

不是 bili 的 bug，也不是版本不兼容（虽然那些 issue 存在）。

`~/.dsh/.agent-presets/anchored-standard/tool-bootstrap.mjs` 在 `system-prompt/assemble` 里做 keep-set 过滤：

```js
// lib 259-292
const keepTools = (assembled, keep, missingAllowsFullCatalog) => {
  ...
  return { ...assembled, tools: assembled.tools.filter((tool) => keep.has(tool.name)) }
}
// 327 行（改前）
const keep = new Set([...bootstrapTools, ...RESIDENT_DISCOVERY_TOOLS, ...RESIDENT_MEMORY_TOOLS,
                      ...RESIDENT_TASK_TOOLS, ...unlockedFor(context.agent?.session)])
```

keep 里只有 bootstrap 双件 + discovery 三件 + memory_profile + todo_write + 用户手动 unlocked 的。
**第三方的工具一律出局** ⇒ billion-context 的 `compress` / `decompress` / `search_context` / `acp_status` / `acp_cache` 全被 filter 掉。

### 为什么用户感觉"越来越弱"

bili 的 prompt 注入走**另一条路**（`system-prompt` 的 section），不受这个 filter 影响 ⇒
**模型看得到 5 个工具的完整说明书 + `<acp tokens=...>` 标签照常在用，但工具调不到**。
表现就是「说明书还在，功能没了」。

## 修法（已应用）

```js
const RESIDENT_ACP_TOOLS = ['compress', 'decompress', 'search_context', 'acp_status', 'acp_cache']
// 327 行
const keep = new Set([...bootstrapTools, ...RESIDENT_DISCOVERY_TOOLS, ...RESIDENT_MEMORY_TOOLS,
                      ...RESIDENT_TASK_TOOLS, ...RESIDENT_ACP_TOOLS, ...unlockedFor(...)])
```

- 依据：[bili issue #2082](https://github.com/ranxianglei/billion-context/issues/2082) 原文——
  `handlePluginManifest`（`src/plugin.ts:590`）广告的静态工具集 = 这 5 个，「无条件放行」。
  条件工具（`absorb` / `rules` / `ccr retrieve`）依赖 base-config，不硬编码。
- 安全性：`keepTools` 只是 `filter(keep.has)`，名字不存在不会报错（`missingAllowsFullCatalog=false` 只影响 required-name 检查）。
- 备份：`C:/Users/27063/AppData/Local/Temp/tb-pre-acp.mjs`（打 ACP 补丁前的版本）。

**生效条件：`.mjs` 不参与 HMR ⇒ 必须重启 dsh 进程。**

## 顺便澄清：`/compress` ≠ 这个工具

- `/compact`（不是 `/compress`）是 **dsh 原生**的 `@deepseek-ai/dsh-command-compact` 注册的命令（源码 `lib/index.js:95` `name: "compact"`），走 `compaction-basic`（`auto: false`）。
- `compress` 是 **billion-context 的模型工具**，走 ACP 内核，与原生 compaction 是两套。
- 在 UI 敲 `/compress` 会因为命令不存在而**变成普通文本**发给模型。

## 社区已知的相关 issue（另一层风险，不是本次根因）

| issue | 内容 |
|---|---|
| [#2082](https://github.com/ranxianglei/billion-context/issues/2082) | dsh 中工具会突然消失（`isProxyToolFor` 判定 + manifest 门禁） |
| [#3608](https://github.com/ranxianglei/billion-context/issues/3608) | **dsh 0.2.1-rc.2** 装 bili 后整个工具调度器失效，"Cannot read properties of undefined (reading 'prepare')" |
| [#4286](https://github.com/ranxianglei/billion-context/issues/4286) | dsh 集成后请求里工具被裁到 19 个（bash/read/write 消失） |
| [#4627](https://github.com/ranxianglei/billion-context/issues/4627) | `bili dsh web` 启动失败 "resolves from multiple active Loader sources" |

bili 自己也在启动时打过警告：`running @deepseek-ai/dsh v0.2.1-rc.2 — NEWER than the newest build billion-context has tested against (v0.2.0-rc.2)`。
⇒ 即使修好 keep-set，仍可能在 0.2.1-rc.2 上遇到上面这些上游问题。

## 环境事实

- `billion-context` **只装在 desktop**（`dependencies=2, bundles=1`）；web / headless 完全没装。
- 代理：18787，pid 8592，2026-10-29 00:43:07 启动（我升级 0.1.208→0.1.209 后轮换），`curl` → HTTP 200。
- 升级前的旧代理 pid 4920 已优雅退出（日志 `rotating stale proxy ... ours is v0.1.209`）。
