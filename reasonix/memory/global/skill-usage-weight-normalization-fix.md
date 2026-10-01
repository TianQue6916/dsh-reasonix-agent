---
id: mem-71f781463b9fb2b6dc27ab4c2ef6e61e
revision: 1
created_at: "2026-09-28T04:48:14.678Z"
updated_at: "2026-09-28T04:48:14.678Z"
name: skill-usage-weight-normalization-fix
description: "skill_search 用量权重的量纲缺陷与归一化修复（含改前改后量化对比、可复用抽函数验证法）"
metadata:
  type: user
  fact_type: reference
  scope: global
---

# skill_search 用量权重：归一化修复（2026-09-28）

## 用户要求

「技能的调用权重（积极性）我还想加入这个调用的次数和调用的时间远近」→ 已实现，但原实现有量纲缺陷，本轮修正。

## 缺陷（量化实证）

原实现：
```js
function usageScore(entry, now) {
  const frequency = Math.log1p(entry.loads ?? 0)
  const ageDays = Math.max(0, (now - (entry.lastUsedAt ?? 0)) / 86400000)
  return frequency + Math.exp(-ageDays / RECENCY_HALF_LIFE_DAYS)   // ← 无界
}
```
排序为 `match + USAGE_WEIGHT * usage`，`match = nameHits / wanted.length ∈ [0,1]`、`USAGE_WEIGHT = 0.6`。
**量纲不可比**：usage 无上界，而 match ≤ 1。

实测（同一份代码，改前 / 改后）：

| 场景 | 改前 score | 改后 score |
|---|---|---|
| 完美匹配 / 从未用过 | 1.000 | 1.000 |
| 零匹配 / 用过 1 次(今天) | **1.016（反超）** | 0.322 |
| 零匹配 / 用过 100 次(今天) | **3.369（反超）** | 0.600 |
| 完美匹配 / 30 天前用过 5 次 | 2.145 | 1.240 |

临界 `loads ≈ 0.95` —— **用过一次就能压过任何文本匹配差异**，与文件自己的注释
「a frequently or recently used skill floats up, but a strictly better textual match still wins」**相反**。

## 修法

两项都归一到 [0,1]，新增 `FREQUENCY_SATURATION_LOADS = 20`：
```js
const frequency = Math.min(1, Math.log1p(loads) / Math.log1p(FREQUENCY_SATURATION_LOADS))
const recency   = Math.exp(-ageDays / RECENCY_HALF_LIFE_DAYS)
return Math.min(1, 0.6 * frequency + 0.4 * recency)
```
→ `usage ∈ [0,1]` ⇒ `USAGE_WEIGHT * usage ≤ 0.6 < 1.0`，于是「完美匹配」永远赢过「零匹配但常用」；
而权重仍起作用（同为完美匹配时，30 天前用过 5 次的 1.240 > 从未用过的 1.000）。
频率 0.6 / 近因 0.4 的理由：技能是低频资产（账本实测一个月可能才 load 一两次），log1p 压缩后频率项区分度有限。

备份：`skill-search.mjs.bak-20260928-pre-usage-normalize`。

## 验证方式（可复用）

**从真实文件里抽函数来测**，而不是另写一份复现（否则测的是复现而非线上代码）：
```js
const fn = fs.readFileSync(P,'utf8').match(/function usageScore\(entry, now\) \{[\s\S]*?\n\}/)[0]
const u  = new Function('entry','now','const RECENCY_HALF_LIFE_DAYS = 14\n' + fn + '\nreturn usageScore(entry,now)')
```
再对 `.bak-20260928-pre-usage-normalize` 跑同一组用例做前后对比。

## 仍未修（已知，非本次范围）

1. **`match` 只看 `skill.name`**，而过滤用 `name + description + whenToUse` → 靠 description 命中的技能 `match=0`，
   与其它 `match=0` 的技能按 usage 混排。不算错，但无法区分「名字命中」与「描述命中」。
2. **账本 read-modify-write 有竞态**：并发 `skill_load` 会丢更新（原子写只保证不撕裂，不保证不丢）。
3. **账本几乎为空**：上线至今只有 `{"pdf": {"loads": 1}}` 一条 —— 权重机制目前几乎不产生实际差异。
4. `~/.agents/skills`（4 个技能：deja-history / deja-search / hindsight-coding-agent / microsoft-foundry）
   此前不在任何备份 target，本轮已加 `agents` target。
