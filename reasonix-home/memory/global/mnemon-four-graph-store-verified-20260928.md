---
id: mem-d9a133881211fb8ebef06a8d8ca3ce21
revision: 1
created_at: "2026-09-27T16:26:08.693Z"
updated_at: "2026-09-27T16:26:08.693Z"
name: mnemon-four-graph-store-verified-20260928
description: "four-graph store 的实证：直查 mnemon.db 的 edges 表得出四种 edge_type（entity 81.8% / semantic 9.6% / temporal 7.1% / causal 1.5%）的分布与权重，补齐 objective 四项点名能力的最后一项硬证据；含\"绕开 CLI 汇总、直查持久化层\"的验证方法论"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 一、four-graph store 的实证（2026-09-28 round 11）

`mnemon link --help` 给出边类型定义：
> `--type string  edge type (**causal|entity|semantic|supersedes|temporal**) (default "semantic")`

**库里实际分布**（直接查 SQLite `mnemon.db` 的 `edges` 表）：
```
边总数 5498，按 edge_type 分布：
  entity      4498  (81.8%)  avg_weight=1.0
  semantic     528  ( 9.6%)  avg_weight=0.857
  temporal     388  ( 7.1%)  avg_weight=1.0
  causal        84  ( 1.5%)  avg_weight=0.212

涉及节点: source 195 / target 195      insights: 195
```

**判读**：
- **four-graph = entity / semantic / temporal / causal** 四种，**全部存在且都在被使用** ✅
- `supersedes` 未出现 —— 那是**手动 `link` 才会用**的类型（自动流程不产生）
- `causal` 的 `avg_weight` 只有 **0.212**（远低于其他三种的 0.857~1.0）→ **说明它是低置信度的推断边**，这也解释了为什么它占比最小
- **每个 insight 平均 28.2 条边**（5498 / 195），图密度很高，主要来自 entity 抽取

## 二、库结构（便于直接查证，绕过 CLI）

```sql
-- 表：edges / insights / oplog / sqlite_sequence
SELECT source_id, target_id, edge_type, weight, metadata, created_at FROM edges;
-- 注意列名是 edge_type，不是 type
SELECT edge_type, COUNT(*), ROUND(AVG(weight),3) FROM edges GROUP BY edge_type ORDER BY 2 DESC;
```

**直查 SQLite 比 CLI 更方便**（CLI 的 `status` 只给汇总数，不给类型分布）：
```python
import sqlite3
con = sqlite3.connect(r'C:\Users\27063\.mnemon\data\default\mnemon.db')
```

## 三、objective 四项点名能力的核对（全部有硬证据）

| 点名能力 | 证据 |
|---|---|
| host binary `@mnemon-dev/mnemon` 0.2.9 | `mnemon version 0.2.9`；`mnemon_status` 返回 `version: 0.2.9` / `commandFound: true` |
| `dsh-mnemon` 0.5.16 | 装在 web profile 并手工加进 `bundles`；`--dump-config` 三层结构可见；`mnemon_status` 实调通过 |
| **four-graph store** | **本轮实证：edges 表 5498 条，四种 edge_type 齐全**（见上） |
| intent-aware recall | `recall --help` 的 intent 机制；实测 `matched_via` 出现 `entity` / `temporal`；**限制**：中文陈述式短语会 fallback 到 GENERAL |
| importance decay | `gc --threshold 0.5`（归一化，≈importance 2.5）；修掉"全员 importance=4 导致全员免疫"后，候选 `eff=0.225` 出现 |
| 自动去重 | 全量重喂幂等：第二次 import `skipped: 190 + added 3` |

## 四、方法论：怎么验"机制存在"而不是"配置存在"

本轮的可复用做法 —— **绕开 CLI 的汇总输出，直接查它的持久化层**：
1. CLI `--help` 拿**枚举定义**（如 edge type 的五种取值）
2. 直接查 **SQLite 表**拿**实际分布**（而不是看有没有这个字段）
3. 用**分布比例 + 权重**判断哪条路径真的在工作（`causal` 权重 0.212 说明它只是低置信推断，不是主力）

**只验"配置里有"是不够的** —— 前几轮已经证明过两次（`output_schema` 漏做、#5 是半成品）。
