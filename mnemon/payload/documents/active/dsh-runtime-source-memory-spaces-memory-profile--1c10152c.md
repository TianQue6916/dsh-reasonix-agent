---
id: "1c10152c-903f-48df-b23e-2f44c6c126f1"
title: "dsh 记忆三层分工与画像桥修补：runtime Source / memory-spaces 边界、memory_profile 常驻与 REASONIX.md 入语料"
description: "2026-09-30 在 ~/.dsh 完成的记忆分层诊断与 4 处改动（画像 compact 进 runtime USER.md、memory_profile 进 promoted resident 集、dev-tool-search 索引同步、memory-to-mnemon.py 增 reasonix-root scope）的根因、改动点、验证证据、生效边界（需重启 dsh）与遗留的 single-writer 缺口。"
status: "active"
created_at: "2026-09-30T09:40:36.138Z"
updated_at: "2026-09-30T09:40:36.138Z"
content_hash: "4a173c4d20ad290826fad4da1d09afbab8ab2f44a62381fd5f4dcccecf0ed442"
source_paths:
  - ".agent-presets/anchored-standard/tool-bootstrap.mjs"
  - ".agent-presets/anchored-standard/dev-tool-search.mjs"
  - "storages/tools/memory-to-mnemon.py"
session_ids:
  - "6c3e8b7c-0f49-40ed-96cc-46fd936419da"
memory_body_ids:
  []
---

# dsh 记忆三层分工与画像桥修补（2026-09-30）

状态：A 档（画像进 runtime USER.md）与 C 档（两处代码摩擦点）已完成并验证；B 档（reasonix 画像 → runtime Source 的自动同步桥）未做，留给用户决定。相关：`fa611c46-9dc6-42aa-93a8-1002be2468bd`（同属 `tool-bootstrap.mjs` 的既有改动，主题是 subagent catalog/persona，不含记忆分层）。

## 一、根因诊断：dsh 的记忆不是单 store，而是 View 拼出的三个 Source

`dsh-mnemon 0.5.20` + `default-three-tier` Strategy 按 role 拼装：

| role | Source | 数据 | 投影方式 |
|---|---|---|---|
| working-context | `dsh-mnemon-source-runtime` 0.5.11 | `~/.mnemon/runtime/{memories.json,USER.md,MEMORY.md}` | eager 常驻（每轮 snapshot） |
| narrative | `dsh-mnemon-source-documents` 0.5.8 | `~/.mnemon/documents/**` | 每轮 1 次 Documents query（4 results / 6000 chars） |
| durable-evidence | `dsh-mnemon-source-memory-spaces` 0.5.13 + `provider-mnemon-native` | `~/.mnemon/data/default/mnemon.db` | 每轮 2 次 recall（6 results / 4800 chars） |

关键结论：reasonix → mnemon 的唯一桥是 `storages/tools/memory-to-mnemon.py`（每日 12:20 计划任务 + `memory.mjs` 的 `syncToMnemon` 实时 `--only`），而它最后只执行 `mnemon import`，落点**只有 memory-spaces**。因此 reasonix 的 209 条 fact（reference 132 / project 50 / feedback 17 / user 8）只在 recall 命中时进上下文，永远不常驻；而协议（`dsh-mnemon-strategy-default-three-tier/lib/index.js:413-433` 的 `BOUNDED_RUNTIME_MEMORY_PROTOCOL`）规定 **USER.md records who the user is**、hot memory 只能由 `mnemon_runtime_memory` 写、两个 md 是生成投影禁止直改。⇒ 画像层实际是空的（改前仅 1 条语言契约 598/4096B）。

第二个摩擦：`memory_profile`（读 reasonix 4 条核心画像）不在 promoted resident 集，而 persona prefix 点名要求调用它 ⇒ 指令指向一个默认不可见的工具。

## 二、本次改动（4 处）

1. 画像 compact 进 runtime USER.md（3 条 `target=user`，全部经 `mnemon_runtime_memory`，均返回 `memoryReceipt: committed`）：
   - 身份与长期目标（normal）：宁夏大学智能科学与技术 2025-09 入学 → 大二上；「认知系统架构师」；终局 AI 博士 / 以逻辑为基础的 AGI → 通用量子计算 → 受控核聚变；考研 081200 学硕；X1 Carbon G7 + 双系统。
   - 协作与教学协议（critical）：实质任务前先查画像（`memory_profile` 优先）；「本质 → 公式 → 跨学科连接」；不要空洞赞美 / 只给公式不给直觉 / 掩盖核心思想；禁止甩群论・环论・拓扑・非标准分析；先攻后守 / 模板内化 / 双语双链。
   - 当前学业阶段（normal，写明「截至 2026-09-30」）：已完成 6.042J / CSAPP / 6.006 / Strang 线代；大二上 P0 = 6.431 概率论 + CS144，P1 = Boyd 凸优化前 5 章 + Cover 信息论前 6 章。
   - 结果：`~/.mnemon/runtime/USER.md` = 2915/4096 字节，4 条。
2. `.agent-presets/anchored-standard/tool-bootstrap.mjs`：新增 `RESIDENT_MEMORY_TOOLS = ['memory_profile']`（第 151 行），并入第 295 行 promoted keep-set。bootstrap / compaction 阶段不受影响（首请求仍是 Minimal 的 bash + str_replace_editor 一对，issue #11 的 schema anchoring 不动）；未挂载 `memory.mjs` 时只 warn 一次，不崩。
3. `.agent-presets/anchored-standard/dev-tool-search.mjs`：`memory_profile` 从 `UNLOCKABLE_INDEX` 移出（`memory_search / memory_read / memory_remember` 保留在索引），并同步更新 resident 集描述，避免「索引说可解锁、实际已常驻」的误导。
4. `storages/tools/memory-to-mnemon.py`：`discover_scopes` 追加 `("reasonix-root", ~/.reasonix)`，让 `~/.reasonix/REASONIX.md`（reasonix 侧常驻画像摘要：身份角色 / 方舟计划 / 执行清单 / 书目）进入语料，tag `src:reasonix-root`。

## 三、验证证据

- `python storages/tools/memory-to-mnemon.py --dry-run` → `files=217, insights=258`，scopes `{global:207, eecdfd87f26b0ddb:4, project:2, archive:3, reasonix-root:1}`，validation passed；真实 sync 新增 1 条 insight（id `3a306dbe-ba2d-42f4-be3e-1a221507629d`，tags `REASONIX` + `src:reasonix-root`，importance 4），其余 257 条去重跳过。
- `node --check` 两个 `.mjs` OK；`py_compile` OK；`dsh --profile web --dump-config` → rc=0，2175 行，35 处 mnemon/memory-reasonix 引用（零副作用校验）。
- 端到端：本轮定论已写入 canonical 语料 `~/.reasonix/memory/global/dsh-memory-layering-persona-bridge-20260930.md`，实时 sync 进 mnemon（id `758c5fc9-711e-46dc-9057-946ef2b120a3`）。
- 备份：`tool-bootstrap.mjs.bak-20260930-1737-pre-persona-resident`、`memory-to-mnemon.py.bak-20260930-1737-pre-reasonix-root`；`~/.dsh` autocommit 已在 17:38 提交。

## 四、生效边界（易踩）

- runtime 写入下一轮投影即生效（USER.md 部分不需要重启）。
- `tool-bootstrap.mjs` / `dev-tool-search.mjs` 属于 preset 的 `.mjs`，**不参与 HMR，必须重启 dsh 进程**才加载；重启会中断当前 web 会话与微信 bridge，因此本轮未执行，改由用户选 `storages/tools/delayed-restart-dsh.ps1` 或手动重启。

## 五、遗留（B 档）与判断

- 画像的 single writer 未定：reasonix 侧画像更新（`user-persona-*` / `academic-level-*`）不会自动重写 USER.md 的三条 compact 条目，目前靠会话内 `mnemon_runtime_memory` 手改。若要自动化，需要一支「reasonix 画像 → runtime Source」的桥，且不能直改 `memories.json`（协议禁止），只能走 dsh 侧插件写路径。
- `~/.reasonix/REASONIX.md` 里「大一下学期执行清单」已过期（当前为 2026-09-30）；已入库但只作 durable evidence，未进 USER.md。
- 有意未进常驻 USER.md：健康（熬夜 / 久坐）、家庭信息、Linux 侧 `输出规范.md` 的 marktext 流程 —— 前两者每次请求都会发给 provider，判断不宜默认常驻；后者 dsh 前端自带 KaTeX。
