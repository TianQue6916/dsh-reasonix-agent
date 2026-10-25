---
id: "bd99fb07-70d3-4185-a0f5-2c3b6d0fca90"
title: "dsh 升级到 0.2.1-rc.2 前置清理：两条独立升级线、dsh-replay/hooks/ralph 卸载证据与回滚点"
description: "2026-10-23 为升 0.2.1-rc.2 做的清理与调查：桌面端 Electron app.asar 内自带 dsh 运行时（npm 全局 CLI 升级不影响它）两条升级线、nightly feed 实测、dsh-replay（mascot 鲸小深）在 desktop+web 双 profile 的卸载落点、hooks-claude-code Stop hook 25 天停摆与 tool-ralph 零调用的证据链、\"删 patch row = 回官方默认\"的 dump-config 验证结论，以及备份目录/git tag/ROLLBACK 回滚点。含待用户拍板的 A/B/C 桌面端升级方案。"
status: "active"
created_at: "2026-10-22T15:19:34.990Z"
updated_at: "2026-10-22T15:19:34.990Z"
content_hash: "8917a7e3776f6d912e88531ee5822eef5e2307f26faa1c4df55e6d4c93d4cbe1"
source_paths:
  - "profiles/desktop/package.json"
  - "profiles/desktop/cordis.patch.yml"
  - "profiles/web/package.json"
  - "profiles/web/cordis.patch.yml"
  - "profiles/headless/cordis.patch.yml"
  - "backups/pre-0.2.1-rc.2-20261023-2313/ROLLBACK.md"
  - "backups/pre-0.2.1-rc.2-20261023-2313/versions-before.json"
  - "storages/tools/replay-all-patches.mjs"
  - "storages/tools/patch-replay-thinking.mjs"
session_ids:
  - "90af0b39-6a34-4c76-80d6-990ad4466f64"
memory_body_ids:
  []
---

# dsh 升级到 0.2.1-rc.2 的前置清理与调查（2026-10-23）

关联文档：`6471b357-f586-4315-a59d-42143704ee5a`（dsh-replay 前端 patch 运维、app.asar 边界、replay-all-patches 工具）、`ccaf7418-968f-43b9-b194-486ffe04727c`（desktop profile 独立于 web profile 的根因）、`b028b5a5-54fd-4679-aeca-79e8b6d7958a`（desktop profile 手动装 bundle 插件与重启边界）。

## 1. 重要结构认知：dsh 有两条互相独立的升级线

| 线 | 实体 | 当前版本 | 升级方式 |
|---|---|---|---|
| 桌面端（用户实际在用的 GUI） | `C:\Users\27063\AppData\Local\Programs\DeepSeek Harness\DeepSeek Harness.exe`，Electron 44.0.0，`resources/app.asar` **121,348,951 B** | 内嵌 dsh **0.2.0-rc.2** | electron-updater，`resources/app-update.yml`：`provider: generic`，`url: https://download.deepseek.com/dsh-desk/feeds/win-x64/`，`channel: nightly` |
| CLI | npm 全局 `@deepseek-ai/dsh` | **0.2.0-rc.2**，**523 MB / 82 deps** | `npm i -g @deepseek-ai/dsh@<ver>` |

**关键含义：`npm i -g` 升级 CLI 不会让桌面端变成新版** —— 桌面端的 dsh 运行时是打进 `app.asar` 的，两条线必须分别升。

feed 实测：`latest.yml` / `beta.yml` / `alpha.yml` 均 404，只有 `nightly.yml` 返回 200 →
`version: 0.2.1-rc.2`，`deepseek-harness-0.2.1-rc.2-win-x64.exe`，**size 289,385,456 B（约 276 MB）**，附 sha512。

## 2. 已完成的卸载（都改的是磁盘文件，需重启 dsh 生效）

### dsh-replay = 「鲸小深」
`鲸小深` 是 dsh-replay 的 mascot 名，不是第二个插件。全 node_modules 搜「鲸」只命中 `@mingozhou/dsh-replay` 自身（README.md / README.zh.md / `src/client/mascot.tsx` / `lib/types/.../mascot.d.ts` / `i18n.ts.bak-pre-thinking`）。

**desktop 和 web 两个 profile 都装了**，两处都要删：

| 动作 | 位置 |
|---|---|
| 删依赖声明 | `package.json` 的 `dependencies` → `"@mingozhou/dsh-replay": "^0.4.1"` |
| 删 bundle | `dsh.profile.bundles` 数组里的同名行 |
| 删实体 | `node_modules/@mingozhou/dsh-replay` —— desktop **14,316 KB** + web **18,413 KB**（合计 ≈32.7 MB） |
| 备份 | 两份 `package.json.bak-20261023-pre-drop-replay` |

`headless/package.json` 从未引用它。

### dsh-hooks-claude-code：Stop hook 已死 25 天
配置挂在三个 profile 的 `- insert:` 块，`configPath: D:/daily-kit/hooks/hooks.json`，里面只有一个 `Stop` hook 调 `dsh-stop.cmd` → `dsh-stop.sh`（session 结束做 git snapshot + quota 检查）。三条独立证据：

- `stop-hook.log` 最后一条 **2026-09-27 10:38**（25 天无写入）
- `headless-wrap.log` 同样停在 2026-09-27 10:56
- `host-stdio.log` 里 `hooks-claude-code` 出现 **0 次**
- `~/.claude/` 下无 `settings.json` / `hooks.json`（只借 Claude Code 的格式，与本体无关）

它想做的 workspace 快照已被 autocommit（每 20 分钟）+ GitHub 每日备份覆盖 → 删。注释里已注明「configPath 进程启动时读一次，改 hooks.json 必须重启」。

### dsh-tool-ralph：275 turns 里零调用
统计样本：`session-a0d5fbf8`，275 turns / **5520 次**工具调用。排行：bash 4790、str_replace_editor 256、compress 145、memory_remember 131、web_search 45、dev_tool_search 22、memory_search 19、write 10、subagent 4、workflow 5、todo_write 6、**ralph 0**。它挂着 `subagentProvider: spawn / maxRounds: 64`，是活工具但从未被调用 → 删（新版有 `experimental-ralph-bundle` 可随时补回）。

## 3. 删完后 dump-config 的有用结论：删 patch row = 回到官方默认

删除量：desktop/web 各 `hooks-claude-code/insert` 8 行 + `tool-ralph` 5 行；headless 仅 `hooks-claude-code/insert` 6 行。

`dsh --profile <name> --dump-config` 复核：

- web rc=0 / 2427 行：`hooks-claude-code` 彻底消失；**`tool-ralph` 仍剩 4 处**
- headless rc=0 / 1062 行：`tool-ralph` 仍剩 1 处

原因：`tool-ralph` 本来就是 base 配置自带的 row，被删的 5 行只是 preset 里的重复声明（顺带覆盖 `maxRounds: 64`）。⇒ **不需要再写 `disabled: true`**；官方 0.2.1-rc.2 已把 `dsh-tool-ralph` 从依赖移除，升级后 base 更新会自然消失。

## 4. 备份与回滚点

```
backups/pre-0.2.1-rc.2-20261023-2313/    (12 files)
  ROLLBACK.md (862 B)                     ← npm 回滚 / 配置回滚 / git reset 三条命令
  desktop|cordis.patch.yml 75,550 B  cordis.yml 81,751 B  package.json 1,354 B
  web    |cordis.patch.yml 76,061 B  cordis.yml   223 B  package.json 1,062 B
  headless|cordis.patch.yml 23,186 B  cordis.yml   223 B  package.json   278 B
  installed-before.json (987 B)  versions-before.json (2,590 B, 24 条已装版本)
```
备份前基线：desktop 14 deps / 15 bundles，web 10 deps / 11 bundles，headless 1 deps / 3 bundles；全局 dsh 0.2.0-rc.2。另打了 git tag 快照（HEAD `a61227b`）。

## 5. 未决：桌面端怎么升（等用户拍板，勿擅自执行）

- **A** 应用内「检查更新」（nightly 已指向 0.2.1-rc.2）—— 下载 276 MB，装完自动重启，**当前会话会断**
- **B** 下载 exe 后 `/S` 静默安装 —— 同样断会话，但可控、可验 sha512
- **C** 先只升 CLI + 插件，桌面端延后 —— 不断线，但插件是按旧运行时验证的

倾向 C 打底再走 A：配置层/插件层改动都在磁盘上、重启才生效，攒一次重启结清。

## 6. 遗留（不占运行成本，待用户决定是否清）

`~/.dsh/storages/tools/` 下 `patch-replay-pricing.mjs`(7,646 B)、`patch-replay-thinking.mjs`(12,115 B)、`replay-all-patches.mjs`(5,431 B)、`README-replay-pricing.md`(3,022 B) —— 插件已删即为死代码。`D:/daily-kit/hooks/hooks.json` 可留作历史。
