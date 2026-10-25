---
id: "b028b5a5-54fd-4679-aeca-79e8b6d7958a"
title: "DSH desktop profile 手动安装 bundle 型插件：pnpm 挂起规避、bundles 数组补写与重启边界（2026-10-01）"
description: "2026-10-01 在 ~/.dsh/profiles/desktop 用随包 pnpm 手动安装 dsh-plugin-message-edit@1.2.0、dsh-quick-toc@0.8.2、dsh-better-sidebar@0.24.1 的完整操作程序：pnpm add 不写 dsh.profile.bundles 需手工按 installBundle 语义追加、bundle 只在 host 启动时读取故必须重启客户端、pnpm add 挂起的 timeout </dev/null 规避、client inject 依赖存在性预检（better-sidebar 缺 @deepseek-ai/dsh-client-ui-slots）、回滚点与重启后核对清单。"
status: "active"
created_at: "2026-10-01T14:04:29.447Z"
updated_at: "2026-10-01T14:04:29.447Z"
content_hash: "99a8f2460fdcca7bdb9ab050712386a9eab1c419d81ba64d925ac1ae6f0682cb"
source_paths:
  - "profiles/desktop/package.json"
  - "profiles/desktop/package.json.bak-20261001-213025"
  - "profiles/desktop/.plugin-manager"
session_ids:
  - "02f35f1c-92f6-4367-a52e-853348571dd2"
memory_body_ids:
  []
---

# DSH desktop profile 手动安装 bundle 型插件（2026-10-01）

状态：**三个插件已落盘并写入 bundles；归用户重启桌面客户端后核验**。
关联文档：`ccaf7418-968f-43b9-b194-486ffe04727c`（desktop profile 与 profiles/web 互相隔离的根因与移植）、`507f579b-3bc2-4abb-91bb-070771968bf6`（thinking-guard 的 bundle 自动注册链路与「重启才生效」边界，web profile）、`6471b357-f586-4315-a59d-42143704ee5a`（pnpm install 冲掉 node_modules patch）。

## 场景
用户要求把 `dsh-plugin-message-edit@1.2.0`、`dsh-quick-toc@0.8.2`、`dsh-better-sidebar@0.24.1` 装进**桌面端** 的 `~/.dsh/profiles/desktop`（不是 `profiles/web`；两者互不相通）。

## 用哪个 pnpm
- 不要依赖 PATH：PATH 上是 `C:\Program Files\nodejs\node`（v24.15.0）+ `C:\Users\27063\AppData\Roaming\npm\pnpm`。
- 用应用随包 runtime：`resources/runtime/pnpm/bin/pnpm.mjs`，其 `resources/runtime/versions.json` 声明 node `24.18.1` / pnpm `11.7.0`（实际三次安装日志均显示 `pnpm v11.7.0`）。
- 桌面端 host 进程的启动命令行确认了 profile 路径与 runtime 位置：`DeepSeek Harness.exe --expose-internals .../dsh-desktop-host/lib/index.js .../dsh C:\Users\27063\.dsh\profiles\desktop .../runtime/primary-runtime .../runtime/pnpm/bin/pnpm.mjs`。

## 安装程序（三步）
1. 在 `~/.dsh/profiles/desktop` 执行随包 pnpm 的 `add <pkg>@<ver>`。三包均 `exit=0`（quick-toc 1.9s，better-sidebar 16.6s）。
2. `pnpm add` **自动写入** `package.json` 的 `dependencies`（例如 `package.json:16` 出现 `"dsh-plugin-message-edit": "1.2.0"`），但**不会**写 `dsh.profile.bundles`——这一步必须手工补，模拟 app 的 `installBundle` 语义：
   `bundles.includes(name) || bundles.push(name)`（该逻辑可在 app.asar 中定位到，另有 `writeProfileBundles`、`patchReload` 相关片段）。
   补完后 bundles 数组末尾为：`..., 'dsh-context', 'billion-context', 'dsh-plugin-message-edit', 'dsh-quick-toc', 'dsh-better-sidebar'`。
3. 不需要手写 `cordis.patch.yml`：三个包都自带 `dsh.bundle.patch = ./cordis.patch.yml`，靠 bundle 层自动接线。

## 为什么必须重启客户端
bundle 列表是 **host 启动时读取**的；`dsh.profile.patchReload: "live"` 只负责热更新 patch 层，**不会**把新 bundle 拉进来。因此「装完即用」不成立，重启桌面客户端是硬性步骤（session 在磁盘上，不会丢对话）。

## pnpm add 会挂住（重要教训）
第一次 `pnpm add dsh-plugin-message-edit@1.2.0` 直接把工具调用挂死（pnpm 在等输入/网络，且未设超时），用户当时说「你卡死了」。
- 事实核对：**包其实第一次就已经落盘**（`package.json` 已有该依赖），挂住的只是命令返回。
- 规避：改用 `timeout 180 <pnpm> add ... </dev/null` 重跑；后续两个包分别 1.9s / 16.6s 正常结束。
- 结论：在该环境跑 pnpm 一律加超时并把 stdin 重定向到 /dev/null。

## 校验方法（可复用）
- `package.json` 的全部 dependencies 都能在 profile 的 `node_modules` 找到（本次「缺: 无」）。
- 三个包各自都有 `lib/index.js` + `lib/client.js` 入口，且 `exports` 暴露 `.`、`./client`、`./cordis.patch.yml`。
- **client inject 预检**：把每个包 `dsh.client.inject` 的模块名逐个到 `~/.dsh/profiles/node_modules/@deepseek-ai/` 做存在性检查，缺任何一个都可能导致该插件静默不激活。
  - `dsh-plugin-message-edit` inject：`dsh-api-session-controller`、`dsh-client-locale`、`dsh-client-ui-renderer`、`dsh-client-ui-conversation`、`dsh-client-modules` —— 全在。
  - `dsh-quick-toc` inject：`dsh-client-ui-chat`、`dsh-client-ui-conversation`、`dsh-client-ui-layout` —— 全在。
  - `dsh-better-sidebar` inject：`dsh-client-ui-locale`、`dsh-client-ui-slots`、`dsh-client-ui-conversation`、`dsh-client-ui-sidebar-right`、`dsh-client-modules` —— **`@deepseek-ai/dsh-client-ui-slots` 本机 MISSING**（其余四个 present）。这是本次唯一遗留风险；若重启后只有它不生效、日志出现 `failed to import` / `did not activate`，摘掉即可。

## 回滚点
`profiles/desktop/package.json.bak-20261001-213025`（另有 `package.json.bak-20260930-thinklang`、`package.json.bak-20261001-203737-pre-prune-bundles`），配合随包 pnpm `remove` 可回到安装前状态；`~/.dsh` 的 auto-commit（branch main）保留 `package.json` 历史版本。

## 重启后核对清单（用户执行）
1. 设置 → 插件：三个包应出现且 installed / enabled。
2. message-edit：悬停自己发过的消息 → 出现编辑/分叉入口，气泡下带版本计数与树状视图。
3. quick-toc：会话区出现大纲入口（侧边面板 + 全屏，标题/全文/跨会话三档）。
4. better-sidebar：右侧出现可扩展工作台（文件/终端/Git/Tasks 页）。
5. 后续观测：message-edit 用起来后跑 `python ~/.dsh/storages/tools/dsh-fork-audit.py --forks -v`，看 `isSeeded` 是否从 0 变正；若走 `sessions.fork`，则 `dsh-fork-graph` 血缘图那条线有内容可看。

## 环境旁证（同次排查残留，供后续复用）
- `~/.dsh/profiles/desktop/.plugin-manager/` 只有 `logs/` 与 `operation-BBXHr4`、`operation-NeXTLW` 这类操作目录，无 JSON 状态文件；判断安装是否生效不能只看这里。
- 桌面端与 19387 端口的 web 端均需认证：直接请求返回 401（`dsh web authentication required; reopen the URL printed by dsh web.` / `{"ok":false,"error":"unauthorized"}`），不要试图从 `/json/list` 取调试句柄。
