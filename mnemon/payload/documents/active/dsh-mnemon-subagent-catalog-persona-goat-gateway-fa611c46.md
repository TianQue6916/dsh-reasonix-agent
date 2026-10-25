---
id: "fa611c46-9dc6-42aa-93a8-1002be2468bd"
title: "dsh-mnemon subagent catalog/persona 修复与 goat-gateway 403 taxonomy（含自触发 subagent 验证程序）"
description: "2026-09-30 在 ~/.dsh 上完成的四项修复（gateway plan-403 taxonomy、reasoningEfforts 按真实能力、subagent 空 tool catalog、subagent 中文思维链）的根因、机制、验证方法与可复用的自触发真实 mnemon subagent 程序。"
status: "active"
created_at: "2026-09-29T19:09:37.700Z"
updated_at: "2026-09-29T19:09:37.700Z"
content_hash: "6fe9d07b0024f2ee1803d9ff0dc0e24e16ee94f081081056fea441685506d018"
source_paths:
  - ".dsh/.agent-presets/anchored-standard/tool-bootstrap.mjs"
  - ".dsh/.agent-presets/anchored-standard/subagent-language.mjs"
  - ".dsh/profiles/web/cordis.patch.yml"
  - ".dsh/storages/tools/verify-subagent-fix.py"
  - ".dsh/storages/tools/rewrite-model-list.py"
session_ids:
  - "6fdd948e-8bfd-4cba-a815-b6df92e4c945"
memory_body_ids:
  []
---

# 背景

2026-09-30 在 `~/.dsh` checkout（git 版本控制 + autocommit）上收尾的一组修复，
外加一个**不依赖用户点 UI 就能触发真实 mnemon subagent 的可复用验证程序**。
所有结论均由实机命令自测得出，非推断。

---

## 1. goat-gateway 的 plan-403 taxonomy

**现象**：用户侧只见 `503「所有 key 均失败（已尝试 无）」`；`已尝试 无` 来自 `selectKey()` 的 `fresh` 为空。

**根因**：`gateway.mjs` 把 401/402/403/429 一律视作「该 key 不可用」，而
`cooldownMs.unauthorized` 为 `1800000`（30 分钟）。于是一个 **model 级 403 会让整个网关停摆半小时**
（两个 key 同时进入 cooling）。

**修复后分类**：

| 错误 | 含义 | 处理 |
|---|---|---|
| `MODEL_NOT_IN_PLAN` | 套餐不含该 model | **不冷却 key**，返回 403 `gateway_model_not_in_plan` |
| `Authentication failed...` | 该 model 后端 provider 未绑定 | 单列 `authModel` cooldown = 30000ms |
| Cloudflare 1010 / 真 401 / 429 | key 或网络问题 | `unauthorized` 由 1800000ms 收紧为 180000ms |

**验证（可复现）**：`gpt-6-astra → 403`（`cooldownUntil=0`），**紧接着** `deepseek-v4.1-flash → 200`，
重复一轮结果相同。

**文件**：`D:/Toolbox/goat-gateway/gateway.mjs`（`isModelNotInPlan` + plan-403 拦截 + `authModel` 分支）、
`D:/Toolbox/goat-gateway/config.json`（`unauthorized: 180000`、`authModel: 30000`）。

---

## 2. reasoningEfforts 按各 model 真实能力声明

**结果**：84 → **60** 个 model = 14 个真正的 thinking（`off/low/medium/high/xhigh/max`）
+ 46 个 `reasoningEfforts: false` + 0 个缺失。
移除 24 个：10 个 `claude-*`（只支持 `/messages`，实测 `MODEL_NOT_IN_PLAN`）、13 个 plan_blocked、1 个后端未绑定。

**纠正了两个先前搞错的依据**：
- relay 对 `reasoning_effort` **只认 5 档**（`none` / `minimal` 直接 400），
  且该校验在 **relay 层、对所有 model 统一**；
  因此 **pi-ai builtin catalog 的 `thinkingLevelMap` 不能作为声明依据**。
- `commandcode-goat` 不在 pi-ai builtin catalog 中，`base` 恒为 `undefined`，
  其 `reasoningEfforts` 只能手写。

**文件/工具**：`profiles/web/cordis.patch.yml`（models 段重写 + 新 row + 纠正注释）；
`storages/tools/probe-all-models.py`、`storages/tools/rewrite-model-list.py`；验证走 `dump-config`。

---

## 3. subagent 拿到空 tool catalog

**真因**：`tool-bootstrap.mjs` 的 `keepTools` 中 `missingAllowsFullCatalog` 分支。
`toolFilter.allow`（纯 mnemon 工具列表）与 bootstrap keep-set
（`bash`、`str_replace_editor`、`dev_tool_search`、`skill_search`、`skill_load`）求交集后得到 **∅**，
于是 child 的首个 `request/header` 完全不带 `tools` 字段，模型把 tool-call 语法当纯文本输出。

**重要更正**：2026-09-29 02:30 做的 `includeSubagents: true → false` **不是修复，而是加重**
—— 它强迫 subagent 走 promoted 分支，而那条分支必然产出空集。

**修复**：在 `system-prompt/assemble` 开头加 bypass。
**文件**：`.agent-presets/anchored-standard/tool-bootstrap.mjs`。

---

## 4. subagent 的中文思维链

**真因**：`dsh-subagent:517` 针对**同一个 section 名 `deployment:persona-prefix`** 写入 per-child persona，
把 preset persona 顶掉。

**修复**：新增 `subagent-language.mjs`，以**追加**方式注入语言契约
（刻意不替换 —— 被覆盖的那份 persona 里的 completion protocol 是必需的）。
**文件**：`.agent-presets/anchored-standard/subagent-language.mjs`。

**效果：部分生效**。child 的 system prompt `contains 用中文思考: True`，reasoning `cjk=54`；
但首句仍是 `Let me consider: ...`（英文骨架夹中文）。原因：全新会话没有中文 thinking 的历史可跟随，
而 root agent 有大量中文 history 做 in-context 影响 —— 属模型执行力问题，配置层只能做到注入。

---

## 5. 可复用：自触发真实 mnemon subagent 的验证程序

`mnemon_remember` 走 `coordinator.remember(...)`，**不经过 subagent**；
真正 spawn 子代理的路径是 `mnemon_document_manage(action="archive")`：

```js
// archiveDocumentLocked
const { provider, runId, result } = await this.delegate(parent, "document-archive",
    "Plan managed document archive", documentArchivePrompt(document, source, bodies),
    [], DOCUMENT_ARCHIVE_SCHEMA, signal, "spawn", DOCUMENT_ARCHIVE_PERSONA);
```

即 `document_manage(archive)` → `lifecycle.archiveDocument` → `runTaskAgent` → `delegate(..., "spawn", ...)`。
（同类 subagent 触发点还有 `coordinator.archiveDocument` / `coordinator.maintainMetadata`，
以及 5883 行 `superviseResolved → runTaskAgent` 的 supervised-writeback 路径。）

**前置条件**：目标 document 为 `active`；至少一个 `active` 且 `provider.capabilities` 具备
`remember` + `forget` + `writeMode === "exact"` 的 Memory Space；archive 需要 Memory Space namespace grant。
注意 archive **只能从 root request 发起**，`isSubagent(agent)` 时直接报错。

**成功判据**：返回体里 `maintenance.provider === "spawn"`，且 `lineage[]` 含 `destination`
（例：`memory-space:default/item:<uuid>`）—— 表示结构化结果已被记录，
没有抛 `completed without recording its result`。

**回归对比（同一验证程序产出的证据）**：

| | 修复前 `874ccdcd` | 修复后 `cfa4d386` |
|---|---|---|
| `request/header` | 249 字符，**无 `tools` 键** | 653 字符，`tools=['mnemon_subagent_result']` |
| `tool_calls` | **0** | **1** |
| reasoning cjk | 0 | 54 |
| 结果 | `completed without recording its result` | `provider:"spawn"` + `lineage.destination` |

检查手法：抓 child session，看 `request/header` 的 `tools` 键、reasoning 的 CJK 计数、`tool_calls` 数。

---

## 6. 操作教训与残留物

- **跨进程重启**：从 dsh 内部用 `Start-Process` 重启 dsh 会被**级联终止**
  （旧进程被杀后脚本不再继续，曾空转 51 分钟）。此类重启应改用 `schtasks`。
  相关脚本：`storages/tools/delayed-restart-dsh.ps1`。
- **测试痕迹**：验证用的 fixture document `ec8de1b8-5a29-4020-a62b-39d076e6c6e0`
  已归档到 `~/.mnemon/documents/archived/`，并在 `memory-space:default/item:54f1af4b-...`
  写入了一条 cold reference；如需清理可用 `mnemon_forget`。
- **未完成**：key 明文泄漏仍待轮换；思考链「思考时展开、完成后收起」需写 client 插件
  覆盖 `conversation.chat.node` 的 `disclosure` slot（仅靠 CSS 不可行）。
