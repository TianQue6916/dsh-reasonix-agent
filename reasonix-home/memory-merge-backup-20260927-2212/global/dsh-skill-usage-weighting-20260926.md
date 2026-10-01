---
id: mem-d494c65d300615fc5f4439e2ecf662e0
revision: 1
created_at: "2026-09-26T15:40:24.593Z"
updated_at: "2026-09-26T15:40:24.593Z"
name: dsh-skill-usage-weighting-20260926
description: "skill_search 加权上线（调用次数 + 时间远近，公式 match + 0.6*(log1p(loads)+exp(-age/14))）；并记录关键事实：两侧历史都没有技能调用数据，账本从零积累"
metadata:
  type: user
  fact_type: reference
  scope: global
---

# dsh skill 使用加权（调用次数 + 时间远近）上线（2026-09-26）

## 一、需求
用户要求：技能的调用权重（积极性）要加入**调用次数**与**调用时间远近**两个维度，用于 `skill_search` 的排序。

## 二、实现（改的是用户自制的 skill-search.mjs）
- 文件：`~/.dsh/.agent-presets/anchored-standard/skill-search.mjs`
- 备份：`skill-search.mjs.bak-20260926-pre-usage-weight`（6656 bytes）

### 账本
- 路径：`~/.dsh/storages/skill-usage.json`
- 结构：`{ version: 1, skills: { <name>: { loads, firstUsedAt, lastUsedAt } } }`
- 写入时机：`skill_load` **成功**后（`await recordSkillUse(name)`），原子写（tmp + rename），best-effort（失败不影响工具调用）

### 排序公式
```
score = match + 0.6 * ( log1p(loads) + exp(-ageDays / 14) )
```
- `match` = 命中 token 在技能 **name** 里的比例（匹配质量优先，保证"搜得准"不被"用得多"压过）
- `USAGE_WEIGHT = 0.6`（usage 只能提升，不能盖过明显更好的文本匹配）
- `RECENCY_HALF_LIFE_DAYS = 14`（14 天半衰期：一次很久以前的使用逐渐失效）
- 次键：技能名字母序（确定性）

### 结果显示
搜索结果行会带上使用标记：`- bilingual-translator [20x, today]: ...`；未用过的技能不显示标记。

## 三、实测（mock ctx，真实服务逻辑）
- 预置 `bilingual-translator`(20 次 / 1 小时前) vs `bilingual-ocw-translator`(1 次 / 55 天前) → **前者浮到前面**（尽管它字母序在后）
- `skill_load` 成功 → 账本写入 `{loads:1, firstUsedAt, lastUsedAt}`，注入消息 1 条
- 空查询 → 列出全部并按 usage 排序
- 未匹配的技能不受影响（`pdf` 与"翻译"不匹配，不出现在结果里）

## 四、关键事实：**两侧历史都没有技能调用数据**
- dsh 侧：扫最近 300 个会话 / 8897 次 `tool/call` → **`skill_load` 0 次**、`skill_search` 仅 7 次
- reasonix 侧：`~/.reasonix/sessions/*.jsonl` 用 `tool.preparing` 事件记录调用，全库无 skill 类调用
→ 结论：**账本只能从零开始积累**，"加权立刻见效"不可能。技能机制在真实工作流里被显式调用的次数极少（reasonix 的技能是自动触发式，本就不产生调用记录）。

## 五、社区对照
`EIGHTfs/dsh-skill-scoreboard`（社区插件）："同时记录按会话去重与每次加载两种次数，统计 skill 工具调用与直接 read skill 文件两种记分来源，设置页三选项卡（Skill 排行 / 会话榜 / 管理）展示，支持分页与记分 JSON 导入导出"。
→ 它做的是**记分 + 展示**；本改动做的是**排序加权**，两者互补。若将来装了 scoreboard，可改成读它的记分 JSON（接口：`DSH_SKILL_USAGE` 已支持指向任意路径）。

## 六、可调参数
`USAGE_WEIGHT`(0.6) / `RECENCY_HALF_LIFE_DAYS`(14) 都在文件顶部，直接改；账本路径可用 `DSH_SKILL_USAGE` 环境变量覆盖。
