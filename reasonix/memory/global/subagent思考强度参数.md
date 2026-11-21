---
id: mem-98847f7ae192b2956b86f968ef091613
revision: 1
created_at: "2026-11-20T23:10:43.277Z"
updated_at: "2026-11-20T23:10:43.277Z"
name: subagent思考强度参数
description: "dsh 的 subagent 已可控制思考强度（reasoning_effort），生效需重启 Electron + 开新会话；换 effort ≠ 换模型"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 是什么（2026-11-21 起）

`subagent` 工具新增两个字段：`reasoning_effort`（`low / medium / high / max`）与 `provider` / `model`，并多一个 `list_subagent_models({provider, model})` 用来查 effort 的**实际枚举**。
**effort id 由 adapter 拥有、不许猜** —— 先 `list_subagent_models` 看输出再用。

## 配置在哪（已改好）

`C:\Users\27063\.dsh\profiles\desktop\cordis.patch.yml`（4199 那个 GUI 用的）与 `profiles\web\cordis.patch.yml`，各四处：
- 两处 preset 的 `tool-subagent` 加 `modelSelectionSettings: true`（desktop :769 / :1318；web :703 / :1242）
- 一条 `subagent-model-selection-settings`：`enabled: true` + `allowedModels: [commandcode-goat / deepseek/deepseek-v4.1-flash]`（desktop :1412；web :1333）

备份：`cordis.patch.yml.bak-20261121-0702-pre-subagent-effort`（web）、`...-0704-...`（desktop）。

## 两条生效条件（缺一不生效）

1. **必须重启 Electron** —— `dsh-desktop-host` 没有 patch 热重载路径（`lib/index.js:233` 传 `patchFiles: []`）。
2. **重启后必须开新会话** —— `@deepseek-ai/dsh-tool-subagent/lib/index.js:544-553` 只在 `firstLiveSeq === 0` 的全新会话里读 settings；读到的策略以 `subagent/model-selection-policy` 事件写进该会话后**固定**，恢复旧会话拿不到新字段，子会话从父会话继承。

## 三条边界

1. **白名单只有一条路由**（`commandcode-goat/deepseek-v4.1-flash`）；换别的模型要先加进 `allowedModels`，否则 `assertAllowedModelSelection` 抛 `child LLM route "x/y" is not allowed for this Session`。
2. **`subagent_fork` 没开自选路由** —— fork 的价值是全前缀逐字节复用 KV cache，换 effort 就破了复用。
3. **换模型会删掉继承的 effort**（`dsh-subagent/lib/index.js:329`）：`(provider !== parentProvider || model !== parentModel) && reasoningEffort === undefined` 时 `delete resolved.reasoningEffort`，落回新模型自己的默认强度。

## 用法分档（写进 learn-translate v5.5）

| 任务 | `agent_preset` | `reasoning_effort` |
|---|---|---|
| 写注 / 扩写 / 翻译 | 默认 | 省略（默认 `high`） |
| 概念讲解 / 数学推导 | `learn` | 省略或 `high` |
| 审稿 / 审计（铁律 46） | 默认 | **`"max"`** + prompt 里仍写「以最高思考强度」 |
| 侦察 / 统计 / 落盘 | 默认 | `low` 或 `medium` |

参数管采样预算，措辞管行为方式，**两者不互相替代**。
