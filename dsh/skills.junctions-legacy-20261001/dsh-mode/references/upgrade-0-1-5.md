> 来源：本技能原 `SKILL.md` 第十一节（2026-10-01 重排时逐字保留，未作压缩）。原文其他章节中的「第十一节」即指本文件。

## 十一、2026-09-20 dsh 0.1.5-rc.2 升级档案（Windows 主力机）

**升级**：`npm i -g @deepseek-ai/dsh@0.1.5-rc.2`（0.1.1-rc.2 → 0.1.5-rc.2，npm latest；alpha 通道当时为 0.1.6-alpha.2，未采用）。
**备份**：`~/.dsh/_backup-20260920-upgrade/`（settings.yaml、.env、整个 .agent-presets、两个 profile 的 yml、npm 全局包清单，以及本次写的一次性工具脚本 `dump-session.mjs` / `scan-zstd.mjs`）。

### 兼容性核查结论（升级前逐项实测）

| 检查项 | 结论 |
|---|---|
| CLI 参数面 | **未变**：`--profile` / `--patch` / `web` / `plugin` / `--dump-config` 全兼容；新增 sdk / sdk-minimal / acp profile |
| 包清单 | 0.1.1 的 196 个 `@deepseek-ai/*` 包 → 0.1.5 只少 4 个（`dsh-client-runtime`、`dsh-host-apiproxy`、`dsh-tool-subagent-report`、`node-addon-landlock-run`），其余 240 个健在；`dsh-llm-pi-ai` / `dsh-llm-deepseek` / `dsh-web-search-deepseek` / `dsh-tool-str-replace-editor` 均在 |
| settings schema | `id: settings` + `config.path`（dsh-gate 的 patch 注入点）未变；`persona` 字段仍有效；`llm-pi-ai` provider 路由、`fallbacks`、`agent-loop.maxParallelToolCalls`、`web-search-deepseek.maxUses` 全部照旧生效（gate 实跑证实） |
| 会话文件 | `session.jsonl.zstd` → **`session.v3.jsonl.zstd`**（旧文件保留可读） |
| session 对象 | **`session.events` 已移除**（0.1.1 是数组）；0.1.5 提供 `snapshotEvents(fromSeq, toSeqExclusive)` + `log`；`session.header` 仍在 |
| 默认工具挂载 | `str_replace_editor` 不再默认挂载（官方改推 `read`/`write`/`edit`），需 profile/patch 显式 insert |
| **persona config** | **`@deepseek-ai/dsh-persona` 的字段 `text` → `prefix`（必填）**，新增 `suffix`。写旧名会让整个 preset 挂载失败（web 建不出会话） |

### 本次改动的四处

1. `~/.dsh/profiles/headless/cordis.patch.yml`：在 `insert:` 尾部补挂 `@deepseek-ai/dsh-tool-str-replace-editor`（`maxOutputChars: 16000`），并加注释说明原因。
2. `~/.dsh/.agent-presets/anchored-standard/compaction-epoch.mjs`：新增导出 `sessionEvents(session)`（优先 `snapshotEvents()` → 兼容旧 `events` → 兼容可迭代 `log` → 兜底空数组），`scan()` 改用它；`tool-bootstrap.mjs` 的 `unlockedFor()`、`instruction-hint.mjs` 的 `hintIsDurable()` 同步改为 `sessionEvents()`。
   - **回归根因**：`for (const event of session.events)` 在 0.1.5 抛 TypeError，被 `tool-bootstrap.mjs` 的 catch 吞掉后返回**全量 26 工具目录** → 锚定静默失效。修前实测首轮 26 工具，修后 2 工具。
3. `~/.dsh/.agent-presets/anchored-standard/agent.cordis.yml`：`persona` 行的 `text:` → **`prefix:`**（0.1.5 的 schema 必填字段），并加注释说明回滚时需改回 `text`。
   - **回归表现**：preset 整体挂载失败 → web 侧「选择工作区」报 `SessionCreateError ... agent-preset/invalid ... failed to apply loader entry persona`，**会话根本建不出来**；错误只出现在浏览器 console，服务端无输出。
4. 清理 9 个失效 junction（见第九节第 7 条），并重建 240 个被临时 CLI 改指到临时目录的 junction（见第九节第 6 条）。

### 升级后验证证据

- headless 首轮 tools = `pwsh, str_replace_editor`（2 个，**与 0.1.1 一致**）；带工具任务实跑成功（pwsh echo 返回）
- `dsh-gate-conc.ps1` 同步调用端到端通过：`-Model deepseek-v4.1-flash -Effort high` → 4s 返回，状态 `✅ 完成`；**异步**（schtasks 脱离会话）派发 → 4s 完成 → 产物 13B 落盘
- web profile 启动正常（端口监听、401 授权围栏、token URL 打印）；240 个插件包全数解析
- **web preset 端到端（2026-09-20 补测，puppeteer + Chrome 131）**：修复 persona 字段后 —— ① 选工作区成功建会话（无 `SessionCreateError`，UI 出现输入区）；② 发一条消息得到回复（2s、1.3K tok、缓存命中 86%）；③ 会话 header `agentPreset=anchored-standard`；④ **首个 `request/header` 的 tools = `bash, str_replace_editor`（2 个）** —— 证明 preset 的 7 个插件（含 Windows 上的 `custom-bash`）在 0.1.5 下全链路正常；⑤ 全程无 console warning/error
- `sessionEvents()` 单元测试四形态通过（snapshotEvents / legacy events / 可迭代 log / 缺字段），epoch 语义正确（compaction/end 后重新计龄）

### 回滚

`npm i -g @deepseek-ai/dsh@0.1.1-rc.2` + 从 `_backup-20260920-upgrade/` 恢复 `settings.yaml`、`.agent-presets/`、`profiles/*/cordis.patch.yml`（`sessionEvents` 补丁对 0.1.1 向后兼容，可不回退）。

### 未完成

Linux 天阙机（100.79.96.82）升级时 **offline（已 7 天未上线）**，双机版本暂不一致（Linux 仍 0.1.1-rc.2）。上线后需同步：`npm i -g @deepseek-ai/dsh@0.1.5-rc.2` + 补挂 `str_replace_editor` + 打同一个 `sessionEvents` 补丁 + 重建 junction + 跑一次锚定验证（若 0.1.5 会话在 Linux 上也变 26 工具，即为未打补丁的表征）。

### preset 插件兼容性核查（anchored-standard 7 个 mjs）

| 插件 | 依赖的 0.1.5 接口 | 核查结果 |
|---|---|---|
| `tool-bootstrap.mjs` | `system-prompt/assemble`、`session/event`、`agent/request`、`ctx.logger` | 事件存在；已改 `sessionEvents()`；headless **实测通过** |
| `context-gate.mjs` | `agent/pre-step`、`system-prompt/assemble`、`session/event`、`ctx.logger` | 事件存在；经 `createEpochPromotion` 间接受益于修复 |
| `compaction-epoch.mjs` | `session.snapshotEvents()` | **本次新增兼容层**（根因所在） |
| `instruction-hint.mjs` | `agent/pre-step`、`session/event`、`ctx.fs`、`user/message` | 事件存在；已改 `sessionEvents()` |
| `skill-search.mjs` | `ctx.skills`、`ctx.tools` | 接口面未变（web 侧验证） |
| `dev-tool-search.mjs` | `ctx.tools` | 接口面未变 |
| `custom-bash.mjs` | `ctx.subprocess`、`ctx.tools`、`session.header.cwd` | `session.header` 仍在（本次探针实测 header 为 object） |

事件名存在性：`agent/pre-step`、`agent/request`、`session/event`、`system-prompt/assemble`、`compaction/end`、`assistant/message`、`tool/call`、`user/message` —— **8/8 在 0.1.5 中存在**（逐名在包内定位到定义处）。

### web preset 路径的验证（已打通，含踩坑复盘）

- **初始症状**：无头浏览器里点「选择工作区」→ 选目录候选后**进不去会话**（页面始终没有输入框）。合成 click、真实 mouse 事件、URL 深链三种方式都试过 —— 当时误判为"UI 自动化难题"。
- **真相**：抓 `page.on('console')` 后才看到根因是 **preset 挂载失败**（`SessionCreateError ... failed to apply loader entry persona: invalid config`）—— 即第 3 处改动（`text` → `prefix`）。**这个错误只在浏览器 console，dsh 进程 stdout 完全没有**。教训：web 侧"点了没反应"要先抓浏览器 console，不要先怀疑 UI 自动化。
- **修复后完整链路**（可复现，脚本存 `_backup-20260920-upgrade/web-verification/preset-e2e.cjs`）：
  1. `dsh web --no-open --port <p>` 启动，从输出取 `?token=...`（token 每次启动都变，必须现取）
  2. `puppeteer.launch({ headless: true, executablePath: '<Chrome 131 路径>' })`（puppeteer 25 自带期望 Chrome 150，本机缓存只有 131，需显式指定；Edge 亦可）
  3. `page.goto(url)` → 等 ~9s → 点「选择工作区」→ 点目录候选（如 `27063`）→ 等 ~6s
  4. 会话页出现 `[contenteditable="true"]` → `click()` 聚焦 → `page.type()` → `keyboard.press('Enter')` → 等 ~25s
  5. 用 `dump-session.mjs` 解压最新 `session.v3.jsonl.zstd`，检查 header 的 `agentPreset` 与首个 `request/header` 的 tools
- **通过判据**：`agentPreset=anchored-standard`、首轮 `tools = [bash, str_replace_editor]`、无 console warning/error
- **另一结论**：**preset 是 web 专属路径，headless 无法承载** —— 用 `--patch` 在 headless 里 `disabled: true` 掉 profile 的 tool-bootstrap 再 insert `@deepseek-ai/dsh-agent-presets`（配置树正确、插件行确实出现），会话仍拿不到 preset（`agentPreset` 为空、首轮 26 工具）。与第九节第 2 条一致。

> ⚠️ 排查脚本（多帧解压）在 `~/.dsh/_backup-20260920-upgrade/dump-session.mjs`，用法：`node dump-session.mjs <session.v3.jsonl.zstd> <out.jsonl>`。
> 另注：本机 `bash` 工具里的 `$env:TEMP` 被 Reasonix 重定向到 `reasonix-session-tmp-*`，与真实 `%TEMP%` 不同 —— 传路径给 dsh 的 `--patch` 时必须用**绝对真实路径**，否则 dsh 报 `failed to read overlay`（本次踩到，一度误导了探针结论）。
