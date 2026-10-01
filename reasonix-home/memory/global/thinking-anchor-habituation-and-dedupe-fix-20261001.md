---
id: mem-7de4e6a05b00b7d0217e3d019ae5a3c5
revision: 1
created_at: "2026-10-01T12:02:31.403Z"
updated_at: "2026-10-01T12:02:31.403Z"
name: thinking-anchor-habituation-and-dedupe-fix-20261001
description: "思考链仍是英文的真正根因是 anchor 累积导致的 habituation，已用 dedupe 修复（thinking-anchor + git-context 两个模块）"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 症状
用户报「思考链似乎还是英文」。配置侧全部正常（`~/.dsh/storages/thinking-language.json` = `{"thinking":"zh"}`；两个 profile 的 clause 5 已中立化；`context-gate.allowKinds` 含 `thinking-anchor`；anchor 确实以 `data.source.kind='thinking-anchor'` 落盘）。**不是配置坏了，是剂量问题。**

## 证据（2026-10-01 实测）
- 按 session `createdAt` 切在 `2026-09-30 19:09`（anchor 上线）：BEFORE n=891 首块 CJK 中位 0.000、中文主导首块 2.0%；AFTER n=58 首块中位 0.440、中文主导 44.8%。anchor 有效但过半仍英文。
- 决定性证据在 `~/.dsh/sessions/--C-Users-27063--/session-10ca9bfe-4689-474d-8d7f-cc9c8d8abe30/session.v4.jsonl.zstd` 里同时出现**翻转与回摆**：9-30 20:28–21:49 全英文（0 锚点）；10-01 14:07:23 anchor 首次注入 → 14:00 桶 CJK 中位 0.43；19:30 桶回摆到 0.04。
- 剂量-反应（自变量 = 生成该块时上下文里已累积的 anchor 条数）：cum 0 → 1/48 中文块；cum 1–19 → 19/19（100%）；cum 20–39 → 17/19；**cum 110 → 0/10；cum 120 → 0/5**。
- 机制：transcript 只增不改，而 anchor 每步追加**逐字相同**的一条 ⇒ 必然累积 ⇒ habituation。

## 修复
两个 preset 模块加上「先删掉本行此前注入的全部快照，再追加唯一一条」，回滚开关均为 `config.pruneHistory: false`：
- `~/.dsh/.agent-presets/anchored-standard/thinking-anchor.mjs`（备份 `.bak-20261001-1959-pre-dedupe`）
- `~/.dsh/.agent-presets/anchored-standard/git-context.mjs`（同根因，**更严重**：实测 195 条 / 59884 B = session-10ca9bfe 未压缩正文的 47.1%；且「当前 HEAD / 未提交改动」是**时变**信息，旧快照是过期的错误状态，会给出旧 HEAD hash 误导模型）
两者都导出 `stats = { injected, pruned }` 供现场诊断。

## 顺带修掉的真缺陷
`thinking-anchor.mjs` 原本的 `LANGUAGE_CACHE` 用 `mtimeMs:size` 当缓存键，而 `{"thinking":"zh"}` 与 `{"thinking":"en"}` **恰好同为 17 字节** —— 同毫秒内切换语言会键相同而内容已变，读回上一个语言。已**整个删掉缓存**，改为每 step 直接 `readFileSync`（17 B 文件，代价相对一次采样请求可忽略）。这个缺陷是被自测抓出来的，不修则「运行中切语言」会间歇性失效。

## 验证
- 单测 `~/.dsh/storages/tools/test-thinking-anchor.mjs`：**40 passed / 0 failed**。
- 真实 transcript 回放 `~/.dsh/tmp-probe/replay-prune.mjs`（把 session-10ca9bfe 重建出的 568 条 messages 喂给改后的 `apply()`）：**6/6 PASS**，payload **313581 B → 52039 B（省 83.4%）**；143 条 anchor → 1、202 条 git-context → 1，真实 user 15 条 / assistant 203 条 / dsh-mnemon 5 条一条未动，末条仍是 anchor（贴着采样点）。

## 尚未完成 / 残余缺陷
- `.agent-presets/**/*.mjs` **不进 HMR**（只有 profile `cordis.patch.yml` 是 `patchReload: live`），**必须重启 dsh 进程**新代码才加载；而我跑在该进程里，不能重启自己 ⇒ 重启这一步必须由用户做。
- turn 的**首步** anchor 不在尾部：顺序为 `anchor → dsh-mnemon 注入 → MNEMON SNAPSHOT → git-context → anchor`，即 `dsh-mnemon` 的注入排在 anchor 之后（更内层）。仅首步受影响（mnemon 每 turn 只在首步注入），但首步恰是决定首块语言的关键步。未修。

## 方法论教训
排查「注入没生效」时，别只查配置，要查**剂量**：统计该注入在上下文里累积了多少条。一个逐字重复、每步追加的锚点，在 1–19 条时近乎决定性，堆到 110+ 条就完全失效。
