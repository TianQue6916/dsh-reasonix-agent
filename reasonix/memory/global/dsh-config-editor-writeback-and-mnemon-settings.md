---
id: mem-1b39210bf7e371c96f4582c32b347081
revision: 1
created_at: "2026-09-28T10:52:49.581Z"
updated_at: "2026-09-28T10:52:49.581Z"
name: dsh-config-editor-writeback-and-mnemon-settings
description: "DSH config-editor 写回机制全解 + 2026-09-28 18:50 一次真实 UI 写入的现场证据：entries() 的两个硬过滤（parent 必须 include、id 必须唯一，重复即静默消失）、三支写入逻辑、写完回读校验与回滚、以及「insert 里的 row 永远不是宿主」这条踩坑点"
metadata:
  type: user
  fact_type: reference
  scope: global
---

# DSH config-editor 的写回机制 与「记忆系统设置改不了」的现场证据（2026-09-28）

## 先给结论：**UI 写入路径是通的**，有直接现场证据

`~/.dsh/profiles/web/cordis.patch.yml` 在 **2026-09-28 18:50:32** 被 DSH 自己重写了一次：
```
>     memoryView:                       ← 整段被移到 config 中部（原来在末尾）
>       strategyTypeId: default-three-tier
>       entries:
>         include:mnemon-strategy-auto-capture:  {enabled: true, config: {}}
>         include:mnemon-strategy-scoped:        {enabled: true, config: {}}   ← 这一行是新的
```
`mnemon-strategy-scoped` 是 UI 里的一个开关 ⇒ **点一下真的写进了文件**。

历史对照（`profiles/web/cordis.patch.yml` 的备份里 `^- id: mnemon$` 出现次数）：
9/24 0 · 9/25 0 · 9/26 0 · 9/27 0 · **9/28 13:04 起 = 1**（那天我加了完整的 `- id: mnemon` override 并把 `remoteAccess` 从 read-only 改成 trusted-host）。

## config-editor 的实现（`@deepseek-ai/dsh-config-editor/lib/index.js`）

- `documentPath` = `profileContext.patchPath`，即 **`profiles/<name>/cordis.patch.yml`**（只改这一层）
- **`entries()` 有两个硬过滤**，决定了"哪些 entry 在 UI 上可配置"：
  1. `entry.parent.tree.ctx.fiber.entry?.id === "include"` —— 必须是 include 层的子节点
  2. **`id` 必须全局唯一** —— 重复 id 的 entry 会被**整体剔除**（不是报错，是静默消失）
- `edit()` 的写入分三支：
  - `next` 与 `inherited` 深度相等 → **删掉**该 row 的 `config`（甚至删整行）
  - 找不到宿主 row（`index < 0`）→ `document.add({id, name, config: next})` **新建顶层 row**
  - 找到 → `document.setIn([index, "config"], next)` **整体替换**（不是深合并）
- 定位宿主行的条件：`id` 相等 **且 `!item.has("insert")`**，且有 `name` 时 `name` 也要相等
  ⇒ **写在 `- insert:` 列表里的 row 永远不是宿主**；宿主必须是顶层 `- id: X` 形式
- 全程包在 `withFileLock(profile/package.json)` + `hmr.runExclusive()` 里
- **写完有回读校验**：拿新文件重新 `composeEntries([patches])`，读回的 config 必须 deepEqual `next`，否则
  抛 `Configuration for "<id>" is overridden by a home patch or command-line overlay` **并原子回滚**
  ⇒ 所以 home 层 `~/.dsh/cordis.patch.yml`（它 outranks profile 层）或 `--patch` overlay 里若有同 id 的 config，UI 会**明确报这个错**

## 三条可复用的推论

1. **"UI 改不动某个插件的设置" 的第一诊断动作**：数一数 `profiles/<name>/cordis.patch.yml` 里该 id 的顶层 row 有几个、`insert` 里有没有同 id。**id 重复会让 entry 从 UI 上静默消失**（不报错）。
2. **`cordis.patch.yml` 是 DSH 自己也会写的文件** —— 它会重排字段顺序、重新格式化。所以：判断"是否被改过"不能只看 diff 的行序；手工编辑时要先接受它会被重排。
3. **插件包自带的 `cordis.patch.yml` 用 `- insert:` 挂载，profile 层的 override 必须用顶层 `- id:` 形式** —— 两者语义不同（insert = 新增，id = 替换），混用会导致"配置写了但不生效 / UI 里找不到"。
