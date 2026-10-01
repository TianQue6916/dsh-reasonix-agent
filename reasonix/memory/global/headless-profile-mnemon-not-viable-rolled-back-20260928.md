---
id: mem-5b7fcf3f7144ab12ea7994fbd4f2853f
revision: 1
created_at: "2026-09-27T16:18:02.394Z"
updated_at: "2026-09-27T16:18:02.394Z"
name: headless-profile-mnemon-not-viable-rolled-back-20260928
description: "headless profile 装 mnemon 的实测结论：插件加载成功但工具面不暴露（headless 工具面刻意极简），且引入 connection patch 警告，已完整回滚；含\"包/bundles/工具面\"三层验收判据"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 一、结论：**headless profile 不适合装 mnemon —— 装了也用不上**

**尝试**（2026-09-28 round 7）：`pnpm add dsh-mnemon` 到 headless profile + 手工加进 `bundles`。

**结果**：
- ✅ 插件**加载成功**（`--dump-config` 里三层结构齐全：`mnemon-bundle` / `mnemon-source-runtime` / `mnemon-source-documents` / `mnemon-source-memory-spaces`，line 999~1038）
- ⚠️ 引入一条警告：**`dsh: [dsh-mnemon] patch: entry "connection" not found`**
  —— mnemon 的 `cordis.patch.yml` 第一条是 `- id: connection / inject: [webRuntime, webServer]`，注释写明是**修 Web profile 的**；headless 没有 `connection` entry，所以这条 patch 落空（`insert:` 部分不受影响）
- ❌ **但工具面根本没暴露 mnemon 工具** —— 让 headless 会话去调 `mnemon_status`，它自己的原话是：
  > **「`mnemon_status` 这个 MCP tool 在本 session 没有暴露给我」**，只能退回去跑 CLI `mnemon status`

**根因**：**headless 的工具面是刻意精简的**（省 token）—— 实测只有
`mcp__goatquota__goat_quota` / `pwsh` / `str_replace_editor`（后续请求才追加 `dev_tool_search` / `skill_load` / `skill_search`，再之后 `read` / `write`）。
mnemon 的工具不在这套 bootstrap 集合里，所以插件加载了却**拿不到手**。

**处置：已完整回滚**（`package.json` + `pnpm-lock.yaml` 从 `*.bak-20260928-0016-pre-mnemon` 还原，`node_modules/dsh-mnemon` 删除），回滚后：
```
deps:    ['dsh-plugin-local-search']
bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless', 'dsh-plugin-local-search']
残留:     0
```
headless 冒烟通过（回 `OK`），`connection` 警告消失。

## 二、这条发现的一般化教训

**「插件加载成功」≠「能力可用」** —— 判据必须是**工具面里能看到并能调用**。
三个层次要分开验：
1. **包在 `dependencies` 里**（`pnpm add` 的结果）
2. **行在 `bundles` 里**（`pnpm add` **不会**自动加，必须手工加 —— web 和 headless 都是这个坑）
3. **工具在会话工具面里**（`dev_tool_search` 能列出来 + 实际能调通）

**第 3 层是唯一有意义的判据。** 前两层都通过而第 3 层失败，就是本次的情形。

**推论**：给某个 profile 装插件前，**先确认那个 profile 的工具面策略**。headless（`patchReload: startup` + 极简 bootstrapTools）只适合无状态的批量任务，不适合需要记忆/图检索的交互式能力。

**顺带**：headless 是**每次起新进程**，所以 `patchReload: startup` 对它天然适用 —— 改配置后**下次调用即生效**，不需要"重启"什么长期进程。

## 三、Web profile 的对照（mnemon 在那里是真的可用）

同一时间在 web profile 的实测（详见 `dsh-patchreload-live-new-session-and-mnemon-dsh-side-verified-20260928`）：
- `dev_tool_search` 能列出 `mnemon_recall` / `mnemon_remember` / `mnemon_status` / `mnemon_related` / `mnemon_link` / `mnemon_forget` / `mnemon_memory_bodies` / `mnemon_document_*` / `mnemon_runtime_memory` / `mnemon_view_*` 等 **15+ 个**
- 实调 `mnemon_status` 返回与 CLI 完全一致（`totalInsights 195` / `edgeCount 5498`）
→ **Web profile 才是 mnemon 的正确落点。**
