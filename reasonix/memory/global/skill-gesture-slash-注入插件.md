---
id: mem-5eba0ff7f2e7d38028a25f5c560261ed
revision: 1
created_at: "2026-11-17T10:01:11.708Z"
updated_at: "2026-11-17T10:01:11.708Z"
name: skill-gesture-slash-注入插件
description: "skill-gesture 插件：/name 手势 → skill 正文确定性注入（dsh preset，替代模型自觉调用 skill_load）"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 它解决什么

用户输入 `/name`（消息任意位置）→ 该 skill 的 `SKILL.md` 正文以 `source.kind='skill-invocation'` 的 user message **确定性**进入当前 pre-step 批次。不再等模型自己判断要不要调 `skill_load`。对 `~/.dsh/skills` 下**全部** skill 生效，无需逐个配置。

## 为什么不是别的路（2026-11-17 从 app.asar 挖出）

- `commands/execute` 定义原文：「Parse and execute a known command **without sending it to the model**」→ 注册 `/name` 命令永远不会让正文到达模型。
- `agent.inject(...)` 进的是 **next-step inbox**（下一个 request）。用户那条 `/x` 已在当前批次，用它注入会晚一步 → 所以必须挂 `agent/pre-step` 改 `decision.messages`。
- 原生类型 `SkillInvocationSource { kind:'skill-invocation', name, form:'instructions' }`；`skill_search/skill_load`（skill-search.mjs）的注入形状与此逐字一致，照抄即兼容。
- `context-gate`（preset 第一行）`allowKinds: [skill-invocation]` —— 未晋升会话里**只有这个 kind 能活**，别的 kind 会被剥掉。
- 两条轴分开落实：`user-invocable: false` 挡手势；`disable-model-invocation` **不**参与判断（那轴管模型自动调）。

## 文件与挂载（2026-11-17）

- 插件：`~/.dsh/.agent-presets/anchored-standard/skill-gesture.mjs`（`export const inject = ['skills']`）
- 挂载 4 处：`~/.dsh/profiles/web/cordis.patch.yml` ×2、`~/.dsh/profiles/desktop/cordis.patch.yml` ×2（每处紧跟在 `- id: skill-search` 之后）。备份 `cordis.patch.yml.bak-20261117-pre-skill-gesture`。
- 自测：`node ~/.dsh/.learn/run/skill-gesture.test.mjs` → 40 assertions passed。
- 配置：`skills: [...]` 白名单（省略=全部）；`position: 'any'|'edge'`（edge 只认首尾 token，用于避免「讨论 `/compress` 本身」时误触发）；`enabled: false` 整体关。

## 生效与验证

`.mjs` 不参与 HMR → **必须重启 dsh**。重启后：
`grep -i "skill-gesture" ~/.dsh/logs/host-stdio.log | tail`
`dsh --profile web --dump-config | grep -n skill-gesture`（应有两处）

rollback：删 4 处 row，或恢复 .bak。

## 未验证

`ctx.skills.get()` 在 pre-step 阶段是否可用（skill-search 是在 tool execute 里调的）。失败模式是「不注入、原样放行」+ host-stdio.log 留错，不会吃用户上下文。
