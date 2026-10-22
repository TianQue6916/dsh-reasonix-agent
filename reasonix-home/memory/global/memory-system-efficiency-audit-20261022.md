---
id: mem-4d3a233d4429cc250150d23c6c605ff4
revision: 2
created_at: "2026-10-22T14:36:19.379Z"
updated_at: "2026-10-22T14:44:05.743Z"
name: memory-system-efficiency-audit-20261022
description: "记忆系统 memory 审查（2026-10-22）：写入/同步/入库健康；三条检索路径分化——memory_search 纯子串多词归零、mnemon search 分词打分良好、mnemon_recall 走 nomic-embed-text 向量+strict-v1；修正「embedding 闲置」的旧结论；同步已改增量、edges 33 条/节点过密、USER.md 80% 满"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 规模（2026-10-22 实测）
- reasonix 语料 334 个 .md / 1.4 MB；索引 `memory/global/MEMORY.md` 64.6 KB / 290 条链接 / 12 section
- mnemon db：insights 398、edges 13161、oplog 5000 滚动（id 已到 8981）
- 常驻层：USER.md 3294/4096 = **80%**；runtime MEMORY.md 4368/10240 = 43%

## 健康的部分
1. 写入 → 索引 → mnemon 全链路实时：新 fact 落盘与 mnemon `import` 同一秒；历史有 `import-skip` duplicate 拦截。
2. `memory_remember` → `memory.mjs` 的 `syncToMnemon()` detached spawn `--only` → 落库，实测 307 条 state 回填成功。

## 三条检索路径分化（关键，上一版结论已修正）
| 路径 | 机制 | 实测 |
|---|---|---|
| `memory_search`（reasonix 侧） | 纯子串；多词要求每个词都出现 | `bili`20 / `死锁`3 / `bili 压缩 死锁`1 ✅；`上下文窗口` ❌0；`bili 压缩 上下文窗口 死锁` ❌0；`dsh 配置 热重载` ≈乱。子串串味：`bili` ⊂ `bilingual` 全命中 |
| `mnemon search`（CLI） | token-based scoring（分词+打分） | 同一批 doc：`上下文窗口 压缩 死锁` → 3 条全相关（score 1.0 / 0.83）；`自动压缩什么时候触发` → bili 压缩策略排前二 ✅；`为什么会话一直报错打不开` → 只命中「报错」邻近主题 ✗（证明它也不是向量语义） |
| `mnemon_recall`（dsh 工具） | embedding（`nomic-embed-text` via Ollama `:11434`）+ `recallQuality.policy: strict-v1`（low 0.25 / high 0.6 / candidateMultiplier 3） | 未做同批对照；397/398 条 insight 都有 embedding |

**修正上一版错误结论**：我说过「397/398 条 embedding 闲置」——错。embedding 由 mnemon 侧 recall 使用；只是 `memory_search` 这个工具本身不走向量。差别在于「你用哪个工具查」，不是「向量没被用」。

## 其他效率项
- 同步全量空转已修：`memory-to-mnemon.py` 加 mtime+size+sha256 增量，二次运行 0.27s、零 oplog 增长（原 22s / +348 条空转）。见 fact `memory-to-mnemon-增量同步-20261023`。
- 图过密：edges 13161 / 398 节点 = 33 条/节点，entity 边 10798（82%），weight 均值 0.97（无区分度）。`mnemon related` 会给一堆近邻。
- 冷数据：access_count=0 的 235/398 = 59%。`recallMode: guided` ⇒ 只有模型主动调 recall 才会计数，不能当"无用"。
- MEMORY.md 索引里 section 标题硬编码计数（「（6）」「（17）」）与实际条目不符；3 条「旧命名版」别名占行。
