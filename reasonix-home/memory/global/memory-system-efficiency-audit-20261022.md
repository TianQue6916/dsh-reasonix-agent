---
id: mem-4d3a233d4429cc250150d23c6c605ff4
revision: 1
created_at: "2026-10-22T14:36:19.379Z"
updated_at: "2026-10-22T14:36:19.379Z"
name: memory-system-efficiency-audit-20261022
description: "记忆系统 memory 链路审查（2026-10-22）：写入/同步/入库实时且去重有效，但 memory_search 是多词子串匹配而非语义检索——context window 上下文窗口、压缩 compact、语义相近查询常 0 命中，397/398 条 embedding 闲置；oplog 99.8% 空转、edges 33 条/节点过密；已给 description 加检索冗余规范"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 目标
审查 reasonix + mnemon 记忆链路是否高效，2026-10-22 22:59 现场实测。

## 规模实测
- reasonix 语料：334 个 .md / 1.4 MB（global 322、project 7、workspace eecdfd87 5）
- 索引 `memory/global/MEMORY.md`：64.6 KB / 327 行 / 290 条链接 / 12 个 section
- mnemon `~/.mnemon/data/default/mnemon.db`：insights 398、edges 13161、oplog 5000（滚动上限，实际 id 已到 8981）
- 常驻层：USER.md 3293/4096 = **80% 满**；runtime MEMORY.md 4368/10240 = 43%

## 结论：写入链路健康，检索链路低效
1. **写入 → 索引 → mnemon 全链路实时且去重有效**：新 fact 14:32:43 落盘，mnemon `import` 同时刻入库；历史上有 `import-skip` duplicate 记录。
2. **检索是子串匹配，不是语义检索**：`memory_search` 排列组合实测 —
   - `bili` 20 条、`死锁` 3 条、`bili 压缩 死锁` 1 条（精准命中当天新写的）
   - **`上下文窗口` 0 条**、**`bili 压缩 上下文窗口 死锁` 0 条**（语料里有「压低窗口」「形成死锁」，只缺四字连写）
   - `dsh 配置 热重载` → 1 条不相关（真正对口的 dsh 热重载边界那条没召回）
   - 397/398 条 insight 都存了 **3072 维 embedding 但未参与检索** —— 有向量、没用向量
   - 子串串味：`bili` 命中一堆 `bilingual-*`（bili ⊂ bilingual）
3. **同步全量空转**：oplog 5000 条里 `import` 12 条、`import-skip` **4988 条（99.8%）** ⇒ 每轮把所有 md 全扫一遍再逐条判重，没有 mtime/hash 增量。
4. **图过密**：edges 13161 / 398 节点 = **33 条边/节点**；其中 entity 边 10798（82%）、semantic 1327、temporal 786、causal 250；weight 均值 **0.97**（几乎全 1.0）⇒ 自动实体连边权重没有区分度。
5. 冷数据：access_count=0 的 insight 235/398 = 59%（但大部分事实靠常驻层与 PLAN 供给，不经 recall，不能直接当作"无用"）。

## 本次已做的微调
`memory/global/元规则-02-自动记忆规则.md` 追加硬约束「description 的检索冗余」：description 必须铺「中文 + 英文 + 用户口语说法」三类关键词（例：`上下文窗口 context window 窗口`），术语不能只写在正文；`name` 用「主体-动作-日期」且英文主体前置。原理：子串匹配下 description/name 是召回面的唯一杠杆。

## 待决策（未做）
- 混合检索（BM25 + 已有 embedding）改造 → 需动 reasonix 侧实现，根治但风险高
- USER.md 80% 满 → 画像条目瘦身
- 同步改 mtime/hash 增量
- MEMORY.md 索引里硬编码计数（「（6）」「（17）」）与实际条目不符，3 条「旧命名版」别名占行
