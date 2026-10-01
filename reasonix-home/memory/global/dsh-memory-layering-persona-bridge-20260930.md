---
id: mem-1b76107db781c29e55954f85ccae4390
revision: 1
created_at: "2026-09-30T09:39:04.504Z"
updated_at: "2026-09-30T09:39:04.504Z"
name: dsh-memory-layering-persona-bridge-20260930
description: "dsh 记忆三层分工定论 + 画像桥修补：reasonix 语料只落 memory-spaces，USER.md 由 runtime Source 独立持有；本次把画像 compact 进 USER.md、让 memory_profile 常驻、把 REASONIX.md 纳入扫描"
metadata:
  type: user
  fact_type: reference
  scope: global
---

# dsh 记忆分层 + 画像桥修补（2026-09-30）

## 一、诊断：为什么「用户画像」层里没有 reasonix 记忆

dsh 的记忆不是一个 store，而是 View（`dsh-mnemon` 0.5.20 + `default-three-tier` Strategy）按 role 拼的三个 Source：

| role | Source | 数据 | 投影方式 |
|---|---|---|---|
| working-context | `dsh-mnemon-source-runtime` 0.5.11 | `~/.mnemon/runtime/{memories.json,USER.md,MEMORY.md}` | **eager 常驻**（每轮 snapshot） |
| narrative | `dsh-mnemon-source-documents` 0.5.8 | `~/.mnemon/documents/**` | 每轮 1 次 Documents query（4 results / 6000 chars） |
| durable-evidence | `dsh-mnemon-source-memory-spaces` 0.5.13 + `provider-mnemon-native` | `~/.mnemon/data/default/mnemon.db` | 每轮 2 次 recall（6 results / 4800 chars） |

唯一的 reasonix → mnemon 桥是 `~/.dsh/storages/tools/memory-to-mnemon.py`（每日 12:20 计划任务 + `memory.mjs` 的 `syncToMnemon` 实时 `--only`），它最后只执行 `mnemon import`，落点是 **memory-spaces**。

⇒ reasonix 的 209 条 fact（reference 132 / project 50 / feedback 17 / user 8）全部只进 durable-evidence，**只在 recall 命中时进上下文**；而协议（`dsh-mnemon-strategy-default-three-tier/lib/index.js:413-433` 的 `BOUNDED_RUNTIME_MEMORY_PROTOCOL`）明确规定 **USER.md records who the user is**、hot memory 只能用 `mnemon_runtime_memory` 写、两个 md 是生成投影 —— 也就是画像层是空的（改前只有 1 条语言契约 598/4096B）。

第二个摩擦：`memory_profile`（读 reasonix 4 条核心画像）不在 promoted resident 集，persona prefix 却点名要求调用它 ⇒ 指令指向一个默认不可见的工具。

## 二、本次改动（4 处）

1. **画像 compact 进 runtime USER.md**（3 条 `target=user`，经 `mnemon_runtime_memory`）：
   - 身份与长期目标（normal）：宁夏大学智能科学与技术 2025-09 入学 → 大二上；「认知系统架构师」；终局 AI 博士 / 以逻辑为基础的 AGI → 通用量子计算 → 受控核聚变；考研 081200 学硕；X1 Carbon G7 + 双系统。
   - 协作与教学协议（critical）：实质任务前先查画像（`memory_profile` 优先）；「本质 → 公式 → 跨学科连接」；不要空洞赞美 / 只给公式不给直觉 / 掩盖核心思想；禁止甩群论・环论・拓扑・非标准分析；先攻后守 / 模板内化 / 双语双链。
   - 当前学业阶段（normal，写「截至 2026-09-30」）：已完成 6.042J / CSAPP / 6.006 / Strang 线代；大二上 P0 = 6.431 概率论 + CS144，P1 = Boyd 凸优化前 5 章 + Cover 信息论前 6 章。
   - 结果：`~/.mnemon/runtime/USER.md` = 2915/4096 字节，4 条。
2. **`tool-bootstrap.mjs`**：新增 `RESIDENT_MEMORY_TOOLS = ['memory_profile']`，并入 promoted keep-set（bootstrap/compaction 阶段不受影响；未挂载 `memory.mjs` 的 profile 只 warn 一次）。
3. **`dev-tool-search.mjs`**：`memory_profile` 从 `UNLOCKABLE_INDEX` 移出（`memory_search / memory_read / memory_remember` 留在索引），描述里的 resident 集说明同步更新。
4. **`memory-to-mnemon.py`**：`discover_scopes` 追加 `("reasonix-root", ~/.reasonix)` —— 让 `~/.reasonix/REASONIX.md`（reasonix 侧常驻画像摘要：身份角色 / 方舟计划 / 执行清单 / 书目）进入语料，tag `src:reasonix-root`。

## 三、验证与生效边界

- `python memory-to-mnemon.py --dry-run` → `files=217, insights=258`，scopes `{global:207, eecdfd87f26b0ddb:4, project:2, archive:3, reasonix-root:1}`，validation passed。
- 真实 sync → 新增 1 条 insight（id `3a306dbe-ba2d-42f4-be3e-1a221507629d`，tags `REASONIX` + `src:reasonix-root`，importance 4），其余 257 条去重跳过。
- `dsh --profile web --dump-config` → rc=0，2175 行，35 处 mnemon/memory-reasonix 引用（零副作用校验通过）。
- **生效边界**：runtime 写入下一轮投影即生效；但 `tool-bootstrap.mjs` / `dev-tool-search.mjs` 是 preset 的 `.mjs`，**不参与 HMR，必须重启 dsh 进程**才加载。
- 备份：`tool-bootstrap.mjs.bak-20260930-1737-pre-persona-resident`、`memory-to-mnemon.py.bak-20260930-1737-pre-reasonix-root`。

## 四、遗留与后续（B 档）

- 画像的 single writer 尚未定：reasonix 画像更新（`user-persona-*` / `academic-level-*`）不会自动同步进 USER.md 的 compact 条目 —— 现在靠会话内 `mnemon_runtime_memory` 手改。若要自动化，需要一支 `reasonix 画像 → runtime Source` 的桥，且不能直改 memories.json（协议禁止），只能走 dsh 侧插件写路径。
- `REASONIX.md` 里「大一下学期执行清单」是过期内容（现在是 2026-09-30）；已入库但仅作 durable evidence，未进 USER.md。
