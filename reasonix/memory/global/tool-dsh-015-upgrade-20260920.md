---
id: mem-9bdcb95c39e0dcc63ce734fad753c5d2
revision: 3
created_at: "2026-09-20T00:53:48.7897327Z"
updated_at: "2026-09-20T01:20:13.1158871Z"
name: tool-dsh-015-upgrade-20260920
title: dsh 0.1.5-rc.2 升级档案（Windows 主力机 2026-09-20）
description: dsh 0.1.1-rc.2 → 0.1.5-rc.2 升级全过程：备份、兼容性核查、四处必改（str_replace_editor 补挂 / sessionEvents 兼容 / persona text→prefix / junction 重建）、插件面核查、headless 与 web preset 双路径端到端验证、回滚法、双机待办
activation: relevant
metadata:
  type: user
  fact_type: reference
  scope: global
---

# dsh 0.1.5-rc.2 升级档案（Windows 主力机，2026-09-20）

## 结论一句话
CLI 调用方式**零变化**（dsh-gate 无需改），但**四处**插件/schema 变化会静默或显式地弄坏功能，其中两处在升级当天就让功能不可用：
① `session.events` 被移除 → headless 锚定**静默退化为全量目录**；
② `dsh-persona` 的 `text` → `prefix` → **preset 整体挂载失败，web 建不出会话**。

## 升级动作
`npm i -g @deepseek-ai/dsh@0.1.5-rc.2`（npm latest；alpha 0.1.6-alpha.2 未采用）。
备份：`~/.dsh/_backup-20260920-upgrade/`（settings.yaml、.env、.agent-presets、两个 profile 的 yml、npm 全局清单、兼容性 dump、探针与验证脚本 `dump-session.mjs` / `web-verification/`）。

## 兼容性核查（升级前实测）
- **CLI 参数未变**：`--profile` / `--patch` / `web` / `plugin` / `--dump-config` 全兼容；新增 sdk / sdk-minimal / acp profile。
- **包清单**：0.1.1 的 196 个包 → 0.1.5 只少 4 个（`dsh-client-runtime`、`dsh-host-apiproxy`、`dsh-tool-subagent-report`、`node-addon-landlock-run`），其余 240 个健在。
- **settings schema 未变**：`id: settings` + `config.path`（dsh-gate 注入点）、`llm-pi-ai` 路由、`fallbacks`、`agent-loop.maxParallelToolCalls` 照旧生效。
- **变了的四处**：① `str_replace_editor` 不再默认挂载；② 会话文件 `session.jsonl.zstd` → `session.v3.jsonl.zstd`（多帧 zstd）；③ `session.events`（数组）→ `snapshotEvents()` + `log`；④ **`dsh-persona` 的 `text` → `prefix`（必填）**。

## 四处必改（均已做）
1. `profiles/headless/cordis.patch.yml`：`insert:` 尾部补挂 `@deepseek-ai/dsh-tool-str-replace-editor`（maxOutputChars: 16000）。不补 → tool-bootstrap 的 keep 集缺工具名 → warnOnce 后暴露**全量 26 工具**，锚定静默失效。
2. `.agent-presets/anchored-standard/compaction-epoch.mjs`：新增导出 `sessionEvents(session)`（优先 snapshotEvents() → 旧 events 数组 → 可迭代 log → 空数组兜底），`scan()` 改用它；`tool-bootstrap.mjs` 的 `unlockedFor()`、`instruction-hint.mjs` 的 `hintIsDurable()` 同步改用。根因：`for (const event of session.events)` 在 0.1.5 抛 TypeError，被 tool-bootstrap 的 catch 吞掉后返回全量目录（修前首轮 26 / 修后 2）。
3. `.agent-presets/anchored-standard/agent.cordis.yml`：`persona` 行 `text:` → **`prefix:`**（0.1.5 schema: `prefix` required、`suffix` default ""、`complete`/`includeRuntimeContext`）。不改 → preset 挂载失败 → web 侧「选择工作区」报 `SessionCreateError: agent-preset/invalid: ... failed to apply loader entry persona: invalid config`，**会话建不出来**；**错误只在浏览器 console，dsh 进程 stdout 无输出**（必须 `page.on('console')` 抓）。
4. junction 维护：`profiles/node_modules/@deepseek-ai/*` 全是指向*当前 dsh 安装目录* 的 junction，**任何 dsh 实例启动都会重建** —— 用临时目录的 dsh 跑一次会把生产 profile 的 249 个链接全改指临时目录；修法：用生产 `dsh --profile headless ...` 跑一次自动改回。另清 9 个无主 junction。

## 插件面核查
- 两个 profile 的 `dependencies` 均**为空**（无树外插件）；bundles 仅内置：[dsh-base, dsh-web-app] / [dsh-base, dsh-headless]。
- **订正**：早期技能/记忆里的「dsh-hooks / dsh-llm-fallbacks / dsh-model-router」已不在 profile 中（LLM 降级现由 settings.yaml `fallbacks:` 承担）；相关技能第五节与 3 处记忆已加订正标注。
- 0.1.5 新增、默认不挂载的可选插件：`dsh-hooks-claude-code`、`dsh-hooks-codex`、`dsh-webhook`、`dsh-webhook-github`、`dsh-http-proxy`、`dsh-acp-app`、`dsh-sdk-app`、`dsh-sdk-minimal`、`dsh-tool-present`、`dsh-session-log-export`。
- preset 7 个 mjs 的事件名核查：agent/pre-step、agent/request、session/event、system-prompt/assemble、compaction/end、assistant/message、tool/call、user/message —— **8/8 存在**；`session.header` 仍为 object。

## 验证证据（全部实测）
- headless 首轮 tools = `pwsh, str_replace_editor`（2 个，与 0.1.1 一致）；带工具任务实跑成功。
- `dsh-gate-conc.ps1`：同步 4s ✅；**异步**（schtasks 脱离会话）派发→4s 完成→产物 13B 落盘 ✅。
- **web preset 端到端（puppeteer + Chrome 131，修复 persona 后）**：选工作区成功建会话（无 SessionCreateError）→ 发消息得到回复（2s / 1.3K tok / 缓存 86%）→ 会话 header `agentPreset=anchored-standard` → **首个 request/header 的 tools = `bash, str_replace_editor`（2 个）** → 全程无 console warning/error。证明 preset 7 插件（含 Windows 上的 `custom-bash`）全链路正常。
- `sessionEvents()` 单元测试四形态通过（snapshotEvents / legacy events / iterable log / 缺字段）；epoch 语义正确。

## 已验证的架构结论
- **preset 是 web 专属路径**：用 `--patch` 在 headless 里 `disabled: true` 掉 profile 的 tool-bootstrap 再 insert `@deepseek-ai/dsh-agent-presets`（配置树正确、插件行确实出现），会话仍拿不到 preset（agentPreset 为空、首轮 26 工具）。
- **web 侧“点了没反应”优先抓浏览器 console**，不要先怀疑 UI 自动化 —— 本次就是被此误导了多轮。

## 坑（新）
本机 bash 工具里 `$env:TEMP` 被 Reasonix 重定向到 `reasonix-session-tmp-*`，与真实 `%TEMP%` 不同 —— 给 dsh 传 `--patch` 路径必须用**绝对真实路径**，否则报 `failed to read overlay`。

## 回滚
`npm i -g @deepseek-ai/dsh@0.1.1-rc.2` + 从备份恢复 settings.yaml / .agent-presets / profiles 的 yml，并把 persona 的 `prefix:` 改回 `text:`（sessionEvents 补丁对 0.1.1 向后兼容，无需回退）。

## 待办（Linux 天阙机）
升级时 Linux（100.79.96.82）offline（已 7 天未上线），双机版本暂不一致。上线后需：升包 + 补挂 str_replace_editor + 打 sessionEvents 补丁 + **改 persona 字段为 prefix** + 重建 junction + 跑两项验证（headless 首轮 2 工具；web 选 preset 能建会话且首轮 2 工具）。

## 细节档案
`dsh-mode` 技能第十一节（四处改动 / 兼容性表 / preset 插件核查 / web 端到端验证复盘 / 坑位）；`dsh-gate` 技能 v2.3.0。脚本：`_backup-20260920-upgrade/dump-session.mjs`、`_backup-20260920-upgrade/web-verification/*.cjs`。
