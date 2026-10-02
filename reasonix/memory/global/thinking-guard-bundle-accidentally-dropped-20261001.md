---
id: mem-b1b8f689724123cda79a9a7260538a7d
revision: 1
created_at: "2026-10-02T06:47:10.146Z"
updated_at: "2026-10-02T06:47:10.146Z"
name: thinking-guard-bundle-accidentally-dropped-20261001
description: "10-01 bundles 精简误删 @ethanwong-hk/dsh-thinking-guard，留下悬空 patch row 每次 web boot 报错；10-02 已修"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 事故与修复（2026-10-02 定论）

**症状**：`dsh --profile web --dump-config` 每次在 stderr 报
`dsh: [C:\Users\27063\.dsh\profiles\web\cordis.patch.yml] patch: entry "thinking-guard" not found`（exit 仍为 0，容易被忽略）。

**根因（git 取证坐实）**：commit `214ab5e`（2026-10-01 20:40，我做的「插件体检后精简 bundles」）一次性删了 web bundles 里三条：
`dsh-deja`（有意）、`ds-harness-remote`（有意）、**`@ethanwong-hk/dsh-thinking-guard`（误删）**。
对比 `git show 46ddd0e:profiles/web/package.json`，删除前 bundles 末尾就是 `@ethanwong-hk/dsh-thinking-guard`。
而 `profiles/web/cordis.patch.yml:1181-1218` 那 30 行调参注释 + `- id: thinking-guard / config: {...}` 保留着 ——
patch row 是**修改语义**（不是 `- insert:`），目标 entry 不存在 ⇒ 报 not found，插件从未挂载。

**判定误删而非有意**的依据：patch row 与 `patches/@ethanwong-hk__dsh-thinking-guard@1.0.2.patch`（9861 B, Oct 1 21:43）都留着；
`profiles/web/package.json` 的 `dependencies` 里 `"@ethanwong-hk/dsh-thinking-guard": "^1.0.2"` 也留着；node_modules 目录在。
即「声明该删的三处只删了一处」。desktop 侧从来没有它（package.json / cordis.patch.yml 均零命中）——无需修复。

**修复**：把 `"@ethanwong-hk/dsh-thinking-guard"` 加回 `profiles/web/package.json` 的 `dsh.profile.bundles` **末位**
（还原 46ddd0e 的顺序）。备份 `profiles/web/package.json.bak-<ts>-pre-thinking-guard`。
验证：`dsh --profile web --dump-config` → **exit=0、stderr 空**、line 1867 `# == @ethanwong-hk/dsh-thinking-guard, patched by ...cordis.patch.yml`、line 1868-1869 `- id: thinking-guard / name: dsh-thinking-guard`。

**它是什么**：退化 reasoning 的熔断器。`enabled: true / thinkingOnlyMs: 45000 / maxThinkingChars: 80000 / repeatThreshold: 3 / sparseMinCount: 30 / gramDensity: 2.7（等效禁用）/ autoContinue: true / notify: true`。
`autoContinue: true` = 熔断后自动注入「继续当前任务」——这是**自主继续**能力（B 杠杆）的现成实现，与 `plan-anchor`（A 杠杆：目标常驻）互补。
五档检测：sentence-repeat / sparse-repeat / gram-density（禁用）/ 新增 novelty（窗口 4096、阈值 0.20，疑备援）。
上游 DEFAULTS `sparseMinCount=5 / gramDensity=0.16` 在中文 reasoning 上误报严重（163 样本误熔断 85 = 52.1%），本 profile 已校准到「真实误报 0/163、检出 40/40」。
**教训（写在 patch 注释里的第三次踩坑）**：`离线全量判定 ≠ 插件流式行为`（每 `checkEveryChars=1024` 检查一次），任何阈值必须流式复验。

**待办**：thinking-guard 生效需重启 web 进程；当前 web 侧仍是 2026-10-02 12:48:18 启动的旧进程。
