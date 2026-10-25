---
id: "6471b357-f586-4315-a59d-42143704ee5a"
title: "dsh 前端 patch 运维：pnpm install 冲掉 node_modules patch、app.asar 边界与 replay-all-patches 工具"
description: "2026-09-30 定位「鲸小深 → thinking 在 desktop 复原」的根因：pnpm install 覆盖 node_modules 内 patch，旧脚本 DEFAULT_PKG 只指向 web；含 desktop 前端走 app.asar 所以 reasoning-autofold 无法生效、replay-all-patches.mjs 一键重放/校验、桌面端自写 cordis.patch.yml 的指纹识别。"
status: "active"
created_at: "2026-09-30T09:35:29.822Z"
updated_at: "2026-09-30T09:35:29.822Z"
content_hash: "26d5fc44dd154017f7dc7805cb15a4eb237a0948b7394fc37fcdd8281379bb05"
source_paths:
  - "storages/tools/replay-all-patches.mjs"
  - "storages/tools/patch-replay-thinking.mjs"
  - "profiles/web/node_modules/@mingozhou/dsh-replay/lib/client.js"
  - "profiles/desktop/cordis.patch.yml"
  - "plugins/deja/package.json"
session_ids:
  - "f2cf8f81-1f90-43d6-ae19-dd0e161fe661"
memory_body_ids:
  []
---

# dsh 前端 patch 运维：patch 会在什么情况下悄悄消失

关联文档：`fa611c46-9dc6-42aa-93a8-1002be2468bd`（goat-gateway 403 taxonomy、reasoningEfforts、model list）、
`ccaf7418-968f-43b9-b194-486ffe04727c`（desktop profile 全量移植、cordis.patch.yml md5 指纹验证法）。

## 1. 根因：`pnpm install` 会覆盖 `node_modules` 内的 patch

`@mingozhou/dsh-replay` 的 loading 文案 patch（「鲸小深正在倒带日志…」→ `thinking…`）是直接打在
`profiles/<name>/node_modules/@mingozhou/dsh-replay/lib/client.js` 与 `lib/viewer.js` 上的，
**不是**打在官方包里。因此任何一次在该 profile 下执行 `pnpm install` / 重装依赖都会把 patch 冲掉，
表现就是用户看到的「之前还是好的，现在又回来了」。

实测状态（2026-09-30）：

| profile | ThinkingDots | dshr-thinking CSS | mtime |
|---|---|---|---|
| `profiles/web` | 2 | 2 | 09-28（patch 一直在） |
| `profiles/desktop` | 0 → 2 | 0 → 2 | 09-30 13:33 被 `pnpm install` 冲掉，17:33 重放恢复 |

判别方法：在 `profiles/<name>/node_modules/@mingozhou/dsh-replay/lib/` 下 grep 计数
`ThinkingDots`、`MascotState`、`dshr-thinking`。`MascotState` 仍为 8 而 `ThinkingDots` 为 0，
说明 bundle 未被换掉、只是 patch 丢失，重放即可，不需要重装。

## 2. 第二个坑：旧 patch 脚本的默认路径只指向 web

`patch-replay-thinking.mjs` 的 `DEFAULT_PKG` 写死为
`C:/Users/27063/.dsh/profiles/web/node_modules/@mingozhou/dsh-replay`。
不带参数执行只会重放 web，**desktop 会被静默漏掉**（这正是当时 desktop 一直没恢复的原因）。
要对 desktop 生效必须显式传 `<pkg-dir>`。

## 3. 已固化为一条命令

```
node ~/.dsh/storages/tools/replay-all-patches.mjs          # 全部重放 + 校验
node ~/.dsh/storages/tools/replay-all-patches.mjs --check  # 只报告，不写入
```

它覆盖两处 patch：

1. **replay-thinking**（鲸小深 → `thinking…`）：对 **web 与 desktop 两个 profile 各重放一遍**，
   写入 `lib/client.js` 5 处 + `lib/viewer.js` 5 处，另改 `src/client/mascot.tsx`、`styles.css`、`i18n.ts`。
   脚本自带 `--verify` 幂等模式（已是目标状态时输出 `changed=0`）。
2. **reasoning-autofold**（思考链运行中自动展开）：打在全局 npm 的 dsh 上。

`--check` 常态应为 `ALL OK`。注意脚本自身的告警：desktop 的 Electron 前端在
`resources/app.asar` 内，脚本无法覆盖。

## 4. app.asar 边界：桌面端拿不到 autofold

`resources/app.asar` 内的前端代码**不读** `node_modules`，所以：

| 功能 | web (3080) | 桌面端 (Electron) |
|---|---|---|
| 鲸小深 → `thinking…` | ✅ node_modules patch | ✅ 同样生效（replay 插件的产物走 node_modules） |
| 思考链自动展开/收合 | ✅ 全局 npm 那份已 patch | ❌ **不生效**，那份 patch 打在全局 npm，桌面端用的是 asar 内代码 |

asar 不受 `pnpm install` 影响，但会被官方自动更新覆盖。要把 autofold 带进桌面端只能改
`resources/app.asar`（解包 → 改 `client.js` → 重打包 → 启动验证，需先备份约 121 MB 的 asar）。
**未执行**：当时判断用户同时开着多件未收口的事（微信 bot 迁移、deja 修复待重启、网关刚修完），
改官方打包产物会让「到底是谁弄坏的」难以定位，故选择先不动。

## 5. 顺手确认的环境事实

- **桌面端会自己改写 `profiles/desktop/cordis.patch.yml`**。实测 17:20 一次写入：追加 26 个 model
  entry、删掉 `agent-default-model` 的 `reasoningEffort: high`；md5 由 `ea32d122…` 变为 `d01d5fe3…`，
  行数 1113 → 1193。**手工移植的定制（preset、插件配置、原 60 个 model）未被覆盖，只是被追加**。
  排查「我改的东西变了」时应先用 md5 / 差异行数确认是哪一方写的。
- `plugins/deja/package.json` 有 `name` 无 `version` 会触发 dsh 的 `REQUEST_EXTENSION`（严格校验下
  既非匿名也过不了校验），补 `"version": "0.0.0"` 即可。`PackageIdentityResolver` 有
  **per-process manifest 缓存**，该修复必须重启桌面端才生效；而 `cordis.patch.yml` 的 model list
  改动 `patchReload: live`，开新会话即可生效。

## 6. 复查清单（下次再遇到「功能不见了」）

1. 先区分是 **web** 还是 **desktop**，两个 profile 的 `node_modules` 互不相通。
2. grep `ThinkingDots` / `dshr-thinking` 计数，判断是 patch 丢失还是 bundle 被替换。
3. 跑 `replay-all-patches.mjs --check`；有丢失就跑不带 `--check` 的重放。
4. 若功能涉及 asar 内代码（如 autofold），node_modules patch 无论如何都不会生效。
5. 若文件内容与自己的改动不符，先查 md5 与 mtime，怀疑桌面端/官方更新的写入。
