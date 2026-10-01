---
id: mem-9163cf10ed5ce68628f6ad1df09c50b8
revision: 1
created_at: "2026-09-28T07:50:42.634Z"
updated_at: "2026-09-28T07:50:42.634Z"
name: mnemon-acceptance-evidence-20260928
description: "mnemon 三层记忆的逐项验收实证，以及\"不重建生产库\"的判定与依据"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 验收证据（objective (1) 的 9 项逐条落地）
本机：mnemon CLI **0.2.9**（`@mnemon-dev/mnemon`）、`dsh-mnemon` **0.5.16**。

| 验收项 | 实证方式 | 结果 |
|---|---|---|
| intent-aware recall | `mnemon recall "<q>" --verbose` | `为什么…`→**WHY**、`…是什么`→**ENTITY**、`什么时候…`→**WHEN**、纯关键词→**GENERAL**，全部 `intent_source: auto`；带 `anchor_count`/`traversed` 证明走图遍历 |
| importance decay | `mnemon gc --threshold 0.5` | 候选 `effective_importance ≈ 0.22` < 0.5；`gc` 文档确认 immune 规则 = **`importance >= 4` 或 `access_count >= 3`** 永不列出 |
| four-graph store | 直查 `~/.mnemon/data/default/mnemon.db`（`edges` 表） | `entity 5526 / semantic 614 / temporal 448 / causal 68`；`supersedes` 是第 5 种边类型但语料里为 0 —— 所以"four-graph"指**实际有边的 4 类**，说法准确 |
| 删库灾备重建 | `mnemon --data-dir <tmp> import ~/.dsh/storages/mnemon-draft.json` | **18 秒**重建出 219 insights / 6344 边 / db 6.0MB（生产 225 / 6656 / 6.3MB）✅ 一条命令可行 |
| 三层齐备 | session 里 `MNEMON RUNTIME MEMORY SNAPSHOT` 的 user/message 注入 | tier-1 实证（见另一条记忆） |

## 关键判定：**不重建生产库**
生产库与语料已漂移：category `{fact:222, preference:3}` vs 应有 `{context:66, preference:16, fact:137}`；importance `{1:30,2:81,4:89,5:25}` vs `{1:20,2:37,4:131,5:31}`。

**但不重建**，四条依据：
1. `mnemon search` 与 `mnemon recall` **都不支持 category 过滤**（没有 `--category`/`--cat`）→ category 完全不参与检索。
2. importance 只影响 `gc` 的候选集，而 `gc` 是**建议模式**（`actions: {keep, purge}`），不会自动删。
3. **新写入已经按修复后的规则入库** → 生产库会渐进收敛，不需要一次性重灌。
4. 重建的代价：需要停 dsh（sqlite 锁）、丢 6 条"语料已删但库里残留"的 insight、**所有 insight id 全变**（已确认 `~/.mnemon/documents/` 是空的、零 id 引用，但仍是无收益的扰动）。

> 若将来真要重建：备份 `~/.mnemon/data` → `rm -rf ~/.mnemon/data/default` → `mnemon import ~/.dsh/storages/mnemon-draft.json`。18 秒。
