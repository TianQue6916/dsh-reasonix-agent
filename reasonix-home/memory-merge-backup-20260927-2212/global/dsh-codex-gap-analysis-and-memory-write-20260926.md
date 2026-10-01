---
id: mem-fbd7765d9712fb4415f42c322de99d8d
revision: 1
created_at: "2026-09-26T15:14:47.614Z"
updated_at: "2026-09-26T15:14:47.614Z"
name: dsh-codex-gap-analysis-and-memory-write-20260926
description: "dsh 对标 Codex 的缺口清单（sqlite schema 实证）+ 记忆写入能力上线：memory_remember 打通 dsh 到 reasonix 的写入"
metadata:
  type: user
  fact_type: reference
  scope: global
---

# dsh ⇄ Codex 缺口分析 + 记忆写入上线（2026-09-26）

## 一、Codex 有 / dsh 没有（从 `~/.codex/sqlite` 的 schema 实证）

Codex Desktop v26.609.4994.0（2026-06-15 装，**至今零使用**：threads / memories / goals / automations 全为 0）。

| Codex 表 | 能力 | dsh 现状 |
|---|---|---|
| `memories_1.stage1_outputs` | 从 rollout 自动蒸馏 raw_memory + summary，配 `jobs` 表后台跑 | 官方无；本机已自建 memory.mjs 补上 |
| `goals_1.thread_goals` | goal 带 status，含 `usage_limited` / `budget_limited` | dsh-goal 有，**无预算 / 额度维度** |
| `state_5.threads` | 统一 thread 索引（rollout_path / cwd / title / model_provider） | **无统一索引**：dsh 会话按 cwd 散在 7 个目录，`C:\Windows\system32` 占 633 个 |
| `state_5.thread_spawn_edges` | 父子线程持久化关系 | dsh-subagent 有，无持久化图 |
| `state_5.thread_dynamic_tools` | 运行中注册工具 | dsh-tool-cordis 只有 2 个只读 inspect |
| `state_5.agent_jobs` | CSV 进 / CSV 出 + output_schema | dsh-jobs 形态不同 |
| `codex-dev.automations` | rrule 定时 + runs + inbox | dsh-schedule 已覆盖 |
| `state_5.remote_control_enrollments` | websocket 被控（远程接管） | 无（只有 webhook / webhook-github） |
| `computer-use/` | Computer Use | 0.1.7 声称有；本机 234 个包里搜不到对应包 |

**互操作是单向的**：dsh 能把 Codex 当子代理（preset 里的 `tool-subagent-codex`，provider: codex，当前 disabled），Codex 无反向机制。

## 二、行为回顾（121 条记忆 + 4446 条 usage + 约 967 个会话）

- **知识资产大半在 AI 工具链运维本身**：reasonix 28 条、dsh 22、工具 19、技能 18、goat 15、双机 8 —— 远超学科内容（数学 5、CSAPP 4）
- token 成本（usage.jsonl，2026-05-25 → 07-13）：总 10.17 亿 token、$6.00、cache 命中 98.7%；最贵单会话 4.9 亿 token / 1207 req
- dsh 会话碎片化：7 个 cwd 目录，system32 一个目录就 633 个
- 优先级（按行为数据筛）：P0 记忆写入 + thread 统一索引；P1 goal 预算维度 + CSV 批处理；P2 remote control

## 三、本轮上线：记忆写入（memory_remember）

- 文件：`~/.dsh/.agent-presets/anchored-standard/memory.mjs`（v2，只读 → 读写）
- 挂载：`~/.dsh/profiles/web/cordis.patch.yml` → `preset-anchored-standard` → plugins（0.1.7 起 `.agent-presets/` 目录不再被扫描，必须写在这条 declaration row 里）
- 三个工具：`memory_search` / `memory_read` / `memory_remember`
- 写入 frontmatter 与 reasonix 自己的 remember 工具**完全一致**：id / revision / created_at / updated_at / name / description / metadata{type, fact_type, scope}；同名即 upsert（revision + 1）
- 索引维护：MEMORY.md 里同名行就地更新，否则追加到本插件专属区段 `## 十一、dsh 侧新增（自动维护）`（不存在则建于 `## 归档说明` 之前）；首次写入前把 MEMORY.md 备份为 `MEMORY.md.bak-pre-dsh-write`
- 原子写（tmp + rename）；不写 reasonix 的分类区，避免破坏官方索引结构
- 实测：临时目录端到端全绿（create / upsert / scope 校验 / 索引新 section / 搜索读取闭环）
- 未做：自动蒸馏（Codex `stage1_outputs` 的对应物，需要 LLM 调用，留待二阶段）

## 四、顺带发现

- `web_search` 当前不可用：HTTP 402（DeepSeek 官方余额不足）。它走 `api.deepseek.com/anthropic/v1/messages`，与 GOAT 网关是两条独立线；修法在 Settings > Plugins > Plugin configuration > Web search 换 endpoint
- 语言契约已写入 persona（`complete: true` 使其成为唯一 system prompt）：中文为主 + 英文术语保留 + 思考链中文；回滚备份 `cordis.patch.yml.bak-20260926-pre-persona-lang`
