---
id: mem-e4423d326c79eed5fe0eab22c5bd9464
revision: 1
created_at: "2026-09-29T19:55:12.539Z"
updated_at: "2026-09-29T19:55:12.539Z"
name: skill-search-weight-verified-and-false-bug-20260930
description: "skill_search 用量权重实测通过（30 断言）+ 一次「把 tie 当 bug」的伪修复与回退，及真实库 79 skill 的召回上限"
metadata:
  type: user
  fact_type: reference
  scope: global
---

# skill_search 用量权重：实测结论（2026-09-30）

## 用户原话（归档于 dsh-skill-usage-weighting-20260926）
> 「技能的调用权重（积极性）我还想加入这个调用的次数和调用的时间远近两个维度」

⇒ 已实现：`skill_search` 排序 = `match + USAGE_WEIGHT * usage`，`usage ∈ [0,1]`。

## 本轮实测（新测试，30 条断言 ALL PASS）
`~/.dsh/storages/tools/test-skill-search-weight.mjs` —— 无需 dsh 进程、无需重启，
用 fake ctx 直接驱动 `apply(ctx)` 注册的两个 tool。覆盖：
- filter 的 AND + 子串语义；空 query 列出全部
- usage 归一化的正反两面：`loads=2` 时**旧无界公式会翻转（1.759 > 1.600），新公式不会（0.870 < 1.000）**
- `usage(200)=1.0` 饱和 ⇒ 抬升上限恰为 `USAGE_WEIGHT=0.6`
- `usage(0)=0`（旧公式白送 1.0）；单调性；随 age 衰减
- ledger 每次调用重读（无模块级 stale cache）
- `skill_load` 写 ledger + `agent.inject` + 无 agent/未知名字优雅降级
- **真实库端到端**：`~/.dsh/skills` 79 个 skill × 7 个 query

## 🔴 教训：一次「把 tie 当 bug」的伪修复（已回退）
冷启动空 ledger 下搜 `"pdf translate"`，返回 `pdf-tools` 在 `pdf-translator` 之前。
我判为 match bug，把插件改成「name 按词拆开 + 前缀匹配」。**A/B 打脸**：
用 79 个真实 skill × 25 个真实 query 对比新旧两版，**0 个排序有差异** ——
在真实数据上那是个恒等变换，还额外引入回归（跨 `-` 的 token 如 `f-trans` 不再命中）。
**已 `cp` 回退**，只留下教训。

根因：`tokens()` 用 `/[^a-z0-9_-]+/` 分隔，`-`/`_` 留在 token 内，所以 kebab-case 名
整体是一个不透明串。但这只影响**多词 query 下的区分度**，而冷启动时两个 skill 的
`match` 本来就相等 —— **tie 由 `localeCompare` 破是设计，不是 bug**。

**结论：tie 不自动等于 bug。先量测，再重写。**

## 已知限制（量测过，未修，属产品决策）
filter 是 AND + 子串：`haystack = tokens(name+desc+whenToUse).join(' ')`，`haystack.includes(token)`。
- 79 个真实 skill 的 name+description 里**没有任何一个含子串 `translate`**
  （只有 `translator`×3、`translation`×1），也没有 `game`
- ⇒ `skill_search("translate")` 返回 **0**，是正确的 filter 行为，不是故障
- ⇒ 用库里真实使用的词可正常召回：`translator` → `bilingual-ocw-translator,
  bilingual-translator, ocw-lecture-translator`（3 命中）
- 要闭合这个缺口需要 **stemming**（去尾 `-er/-or/-ion/-ing`…），它会**放宽每一个 query 的
  召回面**并有误合并风险（order/ord、paper/pap）——**刻意未做**，等用户拍板。

## 复用提示
`DSH_SKILL_USAGE` 环境变量可把账本指到任意路径（测试靠它隔离）。
账本实测仍近乎空（`{"pdf": {"loads": 1}}`），所以权重机制**目前几乎不产生实际差异** ——
机制已对，数据未积累。
