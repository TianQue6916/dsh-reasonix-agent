---
id: "cab1ac23-02b0-4ab7-b36f-5b47612c7b71"
title: "session-age-warn 插件（长会话水位提醒）实现交接：thinking-guard 选型否决、双 profile allowKinds 同步、CRLF patch 陷阱"
description: "2026-10-28 新增 anchored-standard 插件 session-age-warn.mjs（agent/pre-step，softSteps 200 / reWarnEvery 80 / skipSubagents）：治 context rot 而非硬打断。含 thinking-guard 被社区证据否决的理由、allowKinds 不同步会被 context-gate 移除、cordis.patch.yml CRLF 混行导致字节替换失败的实操陷阱，以及待重启生效的 4 项改动清单。"
status: "active"
created_at: "2026-10-28T11:42:02.856Z"
updated_at: "2026-10-28T11:42:02.856Z"
content_hash: "7a41ba1d26b8dfe64a64b2e2cf23c16608630c14fbfe2d0bcbe490bc90f62c17"
source_paths:
  - ".agent-presets/anchored-standard/session-age-warn.mjs"
  - "profiles/desktop/cordis.patch.yml"
  - "profiles/web/cordis.patch.yml"
  - ".agent-presets/anchored-standard/concurrency-discipline.mjs"
session_ids:
  - "5303d8fe-a151-4d1d-a016-3ab996b97251"
memory_body_ids:
  []
---

# session-age-warn：长会话水位提醒插件（2026-10-28 实现交接）

前序上下文见 `b4a7aa94`（注入链断裂根因 + per-session plan 改造）与 `7ffee013`（plan-anchor 实现交接）。本文只记录本轮**新增**的插件与选型结论。

## 为什么不是 thinking-guard（选型否决）

用户原本的配置方向是打开 `dsh-thinking-guard`（重复思考硬 cancel）。社区调研后**建议相反**，理由三条：

1. **维护度差距**：thinking-guard 3 star、1 个 open issue、最后推送 2026-09-28；同类 `dsh-loop-guard` 20 star、2026-10-23 仍在更新，README 有 2,973 条真实文本的零误报实测。dshbase 上 thinking-guard 标注为「未验证 · 尚未完成安装测试」。
2. **挂载点差异**：thinking-guard 挂 `agent/assistant-stream`，是**事后**计数（token 已在烧）；loop-guard 挂 `llm/stream` 瀑布流内部，命中即切断底层 HTTP 请求，且 `escalate` 有 `warn / steer / cancel` 三档而非只有硬 cancel。
3. **光打断不解决根因**：dsh-degeneration-kit 作者统计 493 个会话日志 —— 24 个真退化块里 **18 个回合正常结束**，只在思考里烂；上下文越长越容易陷进「我要做 X」的空转且回合看起来仍成功。有复盘案例：4927 行思考 98.6% 重复、最后靠 max_tokens 硬掐断。

结论采用 **C 方案**：保持 thinking-guard 关闭，先解决「长会话污染」——直击 context-saturation 这个根因，代价是接受「勤开新会话」。若之后要自动化保护，再上 loop-guard。

## 插件实现

`~/.dsh/.agent-presets/anchored-standard/session-age-warn.mjs`（129 行），挂 `agent/pre-step`：

| config | 默认值 | 含义 |
|---|---|---|
| `softSteps` | 200 | 累计步数后首次提醒 |
| `reWarnEvery` | 80 | 之后每 80 步最多再提醒一次 |
| `skipSubagents` | true | 子 agent 不提醒 |

提醒文本明确说明「长会话为何不可靠」，给出收尾顺序：先写进展进 plan → 把「下一步」收窄到 1–3 条 → 开新会话；末尾补「任务还剩很多步就忽略本条」，避免变成无意义打断。

设计上刻意**不选**自动 compaction、退化块折叠：前者会压掉对话（踩过「上下文突然消失」），后者要改 transcript 影响 prefix cache。本插件只注入一句话，不动历史。

## 两个必须遵守的实操约束

1. **`allowKinds` 必须同步**。`session-age-warn` 要加进 `context-gate` 的 `allowKinds`（desktop 与 web **两个** profile 都要加），否则第一轮注入会被 context-gate 移除。desktop 侧是 YAML 数组块，web 侧是单行 flow 数组。
2. **patch 的 CRLF 陷阱**。`profiles/desktop/cordis.patch.yml` 是 CRLF 1664 / bare-LF 12 混行文件；用 Python 以 `\n` 拼接的 needle 做 `bytes.replace` 会静默 0 命中（AssertionError: 0）。定位与替换时要按 `\r\n` 构造字节串，或先确认命中再写回。

## 验证方式

用 cordis 直接跑 waterfall 并同时挂 `plan-anchor`，确认不否决内层链：

```
step 1–4  → ["runtime-context","plan-anchor"]
step 5    → ["runtime-context","session-age-warn","plan-anchor"]  ← 首次提醒
step 8    → 再次出现（reWarn）
```

- plan-anchor 每步都在（没有重演 concurrency-discipline 的 prepend veto bug）
- subagent 跑 8 步，`warned` 统计不变
- `dsh --profile web --dump-config` 确认插件行与 `allowKinds` 同时出现

## 交付后仍未生效的改动（需重启）

`.mjs` 不参与 HMR。本轮进程启动于 17:29:33，而改动晚于该时刻（thinking-guard 文件改于 19:18:44，晚 1h49m），故磁盘上有 4 项待重启生效：

1. `session-age-warn.mjs`（新插件）
2. thinking-guard 的 cancel kind 修复（在 `node_modules` 内）
3. concurrency-discipline 降频配置（patch 是 live，理论上已生效）
4. tool-bootstrap 的 `todo_write` 常驻（patch 是 live，可能已生效）

验收要点：重启后确认 `session-age-warn` 出现在 web/desktop 的 dump-config 中，且第 200 步前后的上下文尾部确实出现水位提醒、子 agent 不出现。
