---
id: mem-ec4feba34011e9475b295b92d15a17f4
revision: 1
created_at: "2026-09-25T12:01:23.1966731Z"
updated_at: "2026-09-25T12:01:23.1966731Z"
name: tool-dsh-017rc2-upgrade-20260925
description: dsh 0.1.5-rc.2 → 0.1.7-rc.2 升级全过程档案（2026-09-25）：settings 导入机制/preset declaration 化/包改名三处迁移、headless+web 双路验证证据、未迁移项、回滚法、token 与 session V4 坑
metadata:
  type: user
  fact_type: reference
  scope: global
---

# dsh 0.1.5-rc.2 → 0.1.7-rc.2 升级档案（Windows 主力机，2026-09-25）

## 一句话
升级成功且**已验证可用**（headless + web 双路实证），但 0.1.7 带来 **3 处机制性破坏**，全部已迁移；2 项配置因上游移除无法迁移。

## 升级动作
- `npm i -g @deepseek-ai/dsh@0.1.7-rc.2`（原为 0.1.5-rc.2，10 天前）
- 备份：`~/.dsh/_backup-20260925-upgrade-017rc2/`（settings、.env、.credentials、`.agent-presets` 全量、两 profile 的 yml/package/lock、sessions+storages 121MB、升级前后 dump、npm 清单）
- 旧 0.1.5 备份仍在：`~/.dsh/_backup-20260920-upgrade/`（含验证脚本 web-verification/*.cjs、dump-session*.mjs、zstd 工具）

## 三处机制变更（升级后必须处理）
1. **settings.yaml 机制废除** → `@deepseek-ai/dsh-settings-file` 换成 `dsh-settings`（`disabled: !ctx.get('profileContext')`）。旧 `settings.yaml` 在**首次 Loader 加载完成时被导入一次**（每 section 写入同名 profile 条目），然后改名为 `settings.yaml.imported`。**没有同名条目/被组合拒绝的 section 只留在 .imported 里**（本次：`fallbacks`、`subagent-model-selection` 两项未导入）。
   - 坑：导入只在启动时发生一次。headless 启动先吃了这次导入（配置进了 headless patch），web 侧于是拿不到 provider → **web 出现「连 key 都没有」。修法：把 `settings.yaml.imported` 复制回 `settings.yaml`，再启动一次 web，导入就会写入 web patch。**
2. **`.agent-presets/` 目录扫描废除** → 旧 `dsh-agent-presets` 换成 `dsh-agent-preset-registry` + `dsh-agent-preset`（内置 preset：standard/ptc/minimal/cordis）。自定义 preset 必须是 declaration row：`- id: preset-<id> / name: '@deepseek-ai/dsh-agent-preset' / config: {id, name, description, order, plugins:[...]}`。registry 行 `config.default` 必填。
   - 迁移做法：把 `agent.cordis.yml` 的 entry list 缩进 12 空格后整体作为 `plugins:`，mjs 路径从 `./x.mjs` 改为 `../../.agent-presets/anchored-standard/x.mjs`（相对 profile 目录，已实证可用），并删掉 0.1.7 已移除的包行。
   - 旧目录**未删除**（headless patch 仍引用 `.agent-presets/anchored-standard/tool-bootstrap.mjs`）。
3. **包改名/移除**：`dsh-workflow-worker-thread` → **`dsh-workflow-ptc`**（config: provider: spawn）；`dsh-settings-file`、`dsh-agent-presets`、`dsh-code-runtime(-worker-thread)`、`cordis-plugin-hmr` 均不存在（→ profiles/node_modules 里遗留 6 条断链 junction，已清理）。`dsh-tool-subagent-control/list-agents` 子路径仍有效。

## 迁移落点（本机）
- `~/.dsh/profiles/web/cordis.patch.yml`（1087 行）：`agent-preset-registry.default = anchored-standard` + `preset-anchored-standard`（plugins 446 行逐字来自 agent.cordis.yml）+ `mcp-goatquota` + 导入的 `agent-default-model`/`llm-pi-ai`/`permission`/`agent-loop`/`web-search-deepseek`/`pwsh-sandbox`/`ui-chat`/`ui-settings-general`
- `~/.dsh/profiles/headless/cordis.patch.yml`：原锚定 patch（system-prompt/tool-bootstrap/str-replace-editor/mcp-goatquota） + 导入的 6 个条目
- 备份：`cordis.patch.yml.bak-20260925-before-preset-migrate`、`.bak-20260925-pre-import`

## 验证证据（全部实测）
- headless：`dsh --profile headless "..."` exit=0，模型走 **commandcode-goat**（不再落 deepseek-official 缺 key），首轮 tools = `mcp__goatquota__goat_quota, pwsh, str_replace_editor`（3 个，与 patch 一致 → 锚定有效）
- web（puppeteer + Chrome 131，端口 3080）：建会话 → preset 显示 **Anchored Standard (experimental)** → 发「回答两个字：你好」→ 回复「你好」（1.3K tok、缓存命中 87%、143 tok/s）→ **会话日志首轮 tools = `bash, str_replace_editor`**（web 侧锚定生效）→ 无 console warning/error；GOAT 额度面板仍工作
- 配置树 dump 双 profile exit=0，无 `patch:` / `not found` 报错
- 模型/设置无损审计：settings.yaml.imported 侧 72 个 id **全部**落在 web patch（差集为空）

## 未迁移项（上游变更，非遗漏）
- `fallbacks:`（enabled/rootChain）—— 0.1.7 已无 llm-fallbacks 机制（安装目录全库搜不到 rootChain/fallbackChain），保留在 `.imported`
- `subagent-model-selection:` —— 0.1.7 改为宿主 opt-in：条目 `subagent-model-selection-settings`（`@deepseek-ai/dsh-tool-subagent/model-selection-settings`）+ preset 的 tool-subagent 要加 `modelSelectionSettings: true` 才采样；旧 section 名无同名条目故未导入

## 其他 0.1.7 事实
- **session 日志升级为 `session.v4.jsonl.zstd`（多帧 zstd）**：`zstdDecompressSync` 只解第一帧，必须按 magic `28 b5 2f fd` 切帧逐帧解（旧 v3 会话仍可读，官方有批量迁移工具，未执行）
- **`dsh web` 现在需要 token**：启动日志打印 `http://127.0.0.1:<port>/?token=<...>`，带 token 会种 cookie `dsh-auth-*`；无 token 的 API 请求 401，错误路径 404
- 新增包/能力：`dsh-plugin-manager`（present/tool-plugin-manager 等新工具）、侧边栏终端、定时任务、浏览器后端（Playwright/CDP/Stagehand）、Computer Use、Auto review、MCP SDK v2
- 官方 minimal preset 现在只剩 `persona` + 持久 shell（Windows 上是 `terminal-pwsh`/`persistent-pwsh`，**不再有 str_replace_editor**）；standard 有 19 行；自定义 anchored-standard 保留了自己的设计

## 回滚方法
1. `npm i -g @deepseek-ai/dsh@0.1.5-rc.2`
2. 从 `_backup-20260925-upgrade-017rc2/` 恢复 `settings.yaml`、`.agent-presets/`、`profiles/{web,headless}/cordis.patch.yml`（用 `.bak-20260925-*` 或备份副本）
3. 重启两个 web 实例（3080 / 8136）

## 重启后的实例现状
- 3080：`dsh web --no-open`（pid 变，日志 `~/.dsh/logs/web-3080-20260925.log`，含 token URL）
- 8136：`dsh web --no-open --port 8136`（日志 `web-8136-20260925.log`）
- 旧实例（升级前启动的 0.1.5 代码）已全部停止
