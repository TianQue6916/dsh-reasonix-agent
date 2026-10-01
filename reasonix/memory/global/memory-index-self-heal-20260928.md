---
id: mem-30a4bd325bbfe92dc8ddf08c7b37876a
revision: 2
created_at: "2026-09-27T16:27:55.627Z"
updated_at: "2026-09-27T17:31:52.269Z"
name: memory-index-self-heal-20260928
description: "「替代手工索引」端到端验收通过：模拟其他 agent 直接写 fact 文件（不走 memory_remember），计划任务 MemoryIndexHeal 自动把索引从 0 补到 1、条目 165→166 并留备份；清理后终态 165 fact / 165 索引 100% 覆盖。含 (1) 的完整验收清单与自动化闭环最终形态"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 一、为什么做这个验收

objective (1) 的要求是「**替代当前自研 markdown + 手工索引方案**」。
Round 12 我写了 `memory-index-heal.mjs` 并注册了计划任务，但**从没验证过它在真实场景下是否真能自愈** ——
真实场景指的是「**其他 agent 直接写 fact 文件、不走 `memory_remember`**」（这正是 round 1 那 8% 索引缺失的成因）。

## 二、端到端验收（2026-09-28）

```bash
# 1) 模拟真实场景：直接写文件，不调用任何工具
printf -- '---\nname: zzz-heal-e2e\ndescription: …\nfact_type: reference\nscope: global\n---\n\n# …\n' \
  > ~/.reasonix/memory/global/ZZZ-heal-e2e.md

# 2) 确认它不在索引里
grep -c "ZZZ-heal-e2e" ~/.reasonix/memory/global/MEMORY.md     # → 0

# 3) 触发计划任务（模拟定时运行）
Start-ScheduledTask -TaskName 'MemoryIndexHeal'
```

**结果**：

| 检查项 | 结果 |
|---|---|
| 任务运行 | `LastRun=09/28/2026 01:31:01  Result=0` |
| 索引是否补上 | `grep -c` **0 → 1** ✅ |
| 条目数 | 165 → **166** |
| 自动备份 | `MEMORY.md.bak-202609271731-pre-index-heal` |

**结论：「替代手工索引」完整达成** —— 外部写入的 fact 会被计划任务自动补进索引，**无需人工干预**。

**清理后终态**：`165 fact / 165 索引条目 / 残留 0`，`memory-index-heal.mjs` dry-run 报「索引已完整，无需动作」。

## 三、(1) 的完整验收清单

| 要求 | 证据 |
|---|---|
| host binary `@mnemon-dev/mnemon` 0.2.9 | `mnemon version 0.2.9`；`mnemon_status` 的 `commandFound: true` |
| `dsh-mnemon` 0.5.16 | 装在 bundles；`--dump-config` 三层结构；`mnemon_status` 实调通过 |
| four-graph store | edges 表 **5868** 条：entity / semantic / temporal / causal 四种齐全 |
| intent-aware recall | `matched_via` 出 `entity` / `temporal`；限制：中文陈述式会 fallback GENERAL |
| importance decay | 修掉"全员 importance=4 导致全员免疫"后，`gc` 候选 `eff=0.225` |
| 自动去重 | 全量重喂幂等：`skipped 190 + added 3` |
| **三层记忆** | runtime `USER.md 599B`+`MEMORY.md 256B`（**snapshot 里可见 entries=1**）；documents 机制在位；spaces 205 insights |
| **替代手工索引** | **本轮端到端验收通过**（外部写入 → 计划任务自动补索引） |
| 灾备可重建 | 删库后一条命令恢复（195→205 insights，embedding 自动 100%） |

## 四、记忆系统的自动化闭环（最终形态）

| 任务 | 时间 | 作用 |
|---|---|---|
| `MemoryIndexHeal` | 12:10 | 扫 fact 文件 → 补录 `MEMORY.md` 索引（**自愈，本轮验收**） |
| `MemoryToMnemon` | 12:20 | 全量重喂 mnemon（**去重幂等**，吸收新 fact 并顺带算 embedding） |
| `ReasonixWorkspaceAutocommit` | 每 2 分钟 | workspace git 自动提交 |
| `ReasonixGitHubBackup` | 23:30 | 脱敏 + 提交 + push |

**手动侧**：`memory_remember`（写 fact + 同步索引）/ `mnemon_runtime_memory`（写热记忆，每轮注入）。

## 五、仍未替代的部分（如实记录，等用户定）

`MEMORY.md` 的 **10 个手工分类 section（一～十）仍是手工的** —— `memory.mjs` 明确 "user-curated sections are never touched"。
新 fact 一律落到第十一节「dsh 侧新增（自动维护）」，**不会按主题自动归类**。
理论上可用 mnemon 的 entity 图自动归类（`top_entities` 已有 deepseek 55 / API 49 / reasonix 39…），
但那要改 `MEMORY.md` 的组织方式（人工分类 → 按实体/时间自动分组），**属体验设计变更**。
