---
id: "9e5d1ca9-0083-4f04-8813-71b9f60a4d13"
title: "dsh 记忆链路效率改造落地：mnemon 增量同步 + 三条检索路径路由 + USER.md 分层（2026-10-23）"
description: "2026-10-23 完成的 dsh 记忆链路改造终态：memory-to-mnemon.py 由全量重喂改为 mtime+size+sha256 指纹增量（22s→0.27s、oplog 零空转）的设计细节与边界条件；修正「embedding 闲置」误判，给出 memory_search / mnemon search / mnemon_recall 三条路径的路由表；USER.md 第 4 条由全量清单改为指针后 80%→74% 的分层原则与实测数字；A（混合检索）缓做的理由与遗留小项。上游见文档 d2c6eca2 / 1c10152c。"
status: "active"
created_at: "2026-10-22T14:56:47.493Z"
updated_at: "2026-10-22T14:56:47.493Z"
content_hash: "06e2561ab76f4217a2bb48eccb9db2820912828db02807a95f5d9d14f6d1f906"
source_paths:
  - "storages/tools/memory-to-mnemon.py"
  - "storages/mnemon-sync-state.json"
  - "storages/git-anchors.json"
  - "PLAN.md"
  - ".reasonix/memory/global/memory-system-efficiency-audit-20261022.md"
  - ".reasonix/memory/global/元规则-02-自动记忆规则.md"
session_ids:
  - "bedc10d5-c017-451c-a29c-1330ef918dee"
memory_body_ids:
  []
---

# dsh 记忆链路效率改造落地（2026-10-23）

上游背景与原始诊断见既有文档：
- 文档 `d2c6eca2-14b2-45ce-ab0a-f2bd65862422`（会话 502 / bili compress 硬墙，含 memory 链路审查最初结论与「C→B→A」提案，当时状态为「尚未拍板」）
- 文档 `1c10152c-903f-48df-b23e-2f44c6c126f1`（记忆三层分工与 `memory-to-mnemon.py` 常驻/桥接边界）
- 文档 `1cbe7ce9-d1ef-4674-b0d7-e2cf529077d5`（语料 → mnemon → Linux 的既有同步流程）

本文只记录本次把提案落地后的**终态、设计约束与实测数据**，不回述已在上游文档中的根因。

## 一、C：`memory-to-mnemon.py` 全量重喂 → 指纹增量（已落地验收）

痛点：每轮把所有 `.md` 全扫一遍逐条判重，oplog 5000 条里 4988 条是 `import-skip`（99.8% 空转），单次约 22 s。

实现：
- 状态文件 `~/.dsh/storages/mnemon-sync-state.json`，key = `scope/file`（如 `global/xxx.md`），value = `mtime_ns + size + sha256`。
- 备份：`memory-to-mnemon.py.bak-20261023-pre-incremental`。

保守边界（这几条是设计核心，改动时别破坏）：
1. 无状态文件 ⇒ 自动全量并建立基线（不会因缺状态而漏喂）。
2. `rc≠0` 或 `--dry-run` ⇒ **不写状态**，永远可重放。
3. `--full` 强制全量（状态文件坏掉时的逃生门）。
4. `--only <fact>`（`memory_remember` 实时触发那条路径）成功后**回填指纹**，避免下一次全量再喂一遍。

实测：
| 指标 | 改前 | 改后 |
|---|---|---|
| 全部未变时单次耗时 | ~22 s | **0.27 s** |
| oplog 增长 | +348 条空转 | **+0** |
| 状态条目 | 无 | 306 → 307（新写一条 fact 后立刻出现） |

端到端验证：写 fact `memory-to-mnemon-增量同步-20261023` 后，state 里立即出现 `global/memory-to-mnemon-增量同步-20261023.md`。

## 二、结论修正：不是「embedding 闲置」，是「三条检索路径分工不同」

先前判断「397/398 条 embedding 存而不用」是**错的**。用 `mnemon search`（CLI）跑同一批查询：`上下文窗口 压缩 死锁` 在 `memory_search` 得 0 条，在 `mnemon search` 得 3 条全相关（score 1.0 / 0.83）；`自动压缩什么时候触发` 把 bili 压缩策略类 fact 排前二。

正确图景：
| 路径 | 机制 | 适用 |
|---|---|---|
| `memory_search`（reasonix） | 纯子串，多词须逐个出现 | 已知 fact 名、单个关键词 |
| `mnemon search`（CLI） | 中文分词 + token 打分排序 | 中文自然短句、要按相关度排 |
| `mnemon_recall` | embedding（`nomic-embed-text` via Ollama `:11434`）+ `recallQuality.policy: strict-v1`（low 0.25 / high 0.6） | 只记得意思、不记得用词 |

但 `mnemon` **也不是语义检索**：`为什么会话一直报错打不开` 只命中「报错」邻近主题，未命中 bili 死锁那条 ⇒ 仍是词项匹配，只是分词与排序优于子串。

由此产生的**操作规则**（已写入语料 `元规则-02-自动记忆规则`）：description 必须铺「中文 + 英文术语 + 用户口语说法」三类关键词，name 用「主体-动作-日期」且英文主体前置——因为 description/name 是召回面的唯一杠杆。

## 三、B：USER.md 分层瘦身 80% → 74%（已落地）

改动：第 4 条「当前学业阶段」由全量清单（572 B）改为「一句摘要 + fact 指针」（290 B），明细下沉到 fact `学业进度-2026-09`；同时删掉与第 3 条教学协议重复的「已学连接点」一句。

实测 `USER.md`：3294 B → 3028 B（80% → 74%），条目数 6 不变。

**分层原则**（可复用于其它常驻层瘦身）：
> 常驻层只放**每轮都必须生效**的约束：语言契约、教学/协作协议、不可逆操作授权。
> **会过期**的明细（课程进度、软件版本、项目状态）一律进 fact，常驻层只留「一句摘要 + fact 名指针」。
> 判断标准：这条信息三个月后还成立吗？不成立 ⇒ 它不该住在常驻层。

第 1 条（语言契约 598 B）与第 3 条（协作与教学协议 1011 B）明确不动：行为契约压错一个词就改变执行方式，收益远小于风险。

## 四、A（混合检索）缓做，理由已变

原文提案是 BM25 + 已有 embedding 的混合检索改造。缓做理由在本次实测后从「风险高」变成「优先级低」：问题不在缺向量，而在**用错了检索工具**——把路由规则写进语料，比改 reasonix 源码便宜一个数量级。真要重启 A，先验证 `mnemon search` 在长中文自然句上的漏召回率，再决定是否值得动实现。

## 五、遗留小项（低价值维护，用户未拍板）

- `~/.reasonix/memory/global/MEMORY.md` 索引里 section 标题的硬编码计数（如「（6）」「（17）」）与实际条目数不符。
- 3 条「旧命名版」别名占索引行。
- 二者不影响召回，只影响人读索引的可信度。
