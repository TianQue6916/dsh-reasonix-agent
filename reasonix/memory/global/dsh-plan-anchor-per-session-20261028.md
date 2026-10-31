---
id: mem-b4d54e0d0fb526fab5953d99807e1e8b
revision: 1
created_at: "2026-10-28T09:08:15.788Z"
updated_at: "2026-10-28T09:08:15.788Z"
name: dsh-plan-anchor-per-session-20261028
description: "plan-anchor 改为 per-session 规划文件（$DSH_HOME/plans/<session-id>.md 自动建档），全局 PLAN.md 降级为长期档案不再注入"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 改了什么（2026-10-28）

用户原话：「plan 这个文件是不是被所有 agent 任务都用了？混到一块了吧？快点修复，给每个会话自动建立独立的任务规划模块」

### 新的注入源

`~/.dsh/.agent-presets/anchored-standard/plan-anchor.mjs` 改为 **per-session**：

| 项 | 值 |
|---|---|
| 文件 | `$DSH_HOME/plans/<session-id>.md` |
| 建档 | 首次注入时自动建骨架（`writeFileSync` + `flag:'wx'` 独占，不覆盖已有内容） |
| 全局 `~/.dsh/PLAN.md` | **降级为「跨会话长期档案」，不再自动注入** |
| `perSession` | `true`（默认） |
| `subagents` | `'parent'`（默认，子 agent 共用父会话文件）/ `'own'` / `'none'` |
| 回落 | 拿不到 session id 或 id 形状非法（正则 `^[A-Za-z0-9_-]{1,128}$`）⇒ 回落全局 PLAN.md（fail-open） |

### 为什么旧的会「混」

全局 PLAN.md 被每个 session 同时注入：① 多任务并行时目标互相污染；② 文件长到 2616 行 / 317 KB，head 永远是同一段；③ 会话结束无从审计。

### 验证方法

```js
// 同一进程内造两个 agent，看注入的 file= 是否不同
const d = await ctx.waterfall('agent/pre-step', { messages:[...], turn:1, step:1, signal:{}, agent }, ...);
d.messages.find(m=>m.source?.kind==='plan-anchor').content[0].text  // 里面 file= 字段
```

已验：两个不同 session id 各自建档、A 的独有内容不出现在 B、无 session id 回落全局、危险 id（`../evil`）被拒并回落。

### 生效条件

**`.agent-presets/**.mjs` 不参与 HMR，必须重启 dsh 进程**（web 侧 pid 需要重启；desktop 要退 App 重开）。profile patch 的 config 行是 `patchReload: live`，但 mjs 本体不是。

### 相关文件

- 改：`.agent-presets/anchored-standard/plan-anchor.mjs`（+185 行）
- 改：`.agent-presets/anchored-standard/concurrency-discipline.mjs`（见 fact `dsh-concurrency-discipline-waterfall-veto-bug-20261028`）
- 改：`profiles/{web,desktop}/cordis.patch.yml` 的 plan-anchor row（加 `perSession: true` / `subagents: parent`）
- 改：`.gitignore` 加 `plans/`
- 备份：`.agent-presets/anchored-standard/plan-anchor.mjs` 原版在 `C:/Users/27063/AppData/Local/Temp/pa.bak.mjs`
