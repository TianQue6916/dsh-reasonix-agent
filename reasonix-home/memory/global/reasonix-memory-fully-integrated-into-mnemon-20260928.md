---
id: mem-b3bb01d5a5b5d0e458cca0284b5845e9
revision: 1
created_at: "2026-09-28T10:21:50.856Z"
updated_at: "2026-09-28T10:21:50.856Z"
name: reasonix-memory-fully-integrated-into-mnemon-20260928
description: "reasonix→mnemon 整合收尾：198 个 fact 全覆盖缺口 0；修掉 memory-to-mnemon.py 只读 global 目录导致 project/ 与 hash scope 从未导入的缺口；并记下「核对覆盖率必须用 frontmatter name 不是文件名」这条把我骗过一次的教训"
metadata:
  type: user
  fact_type: reference
  scope: global
---

# reasonix 记忆已全量整合进 mnemon（2026-09-28 18:20）

## 结论：**198 个 fact 全覆盖，缺口 0**

```
fact 文件 = 198   scope 分布 = {global:189, project:2, eecdfd87f26b0ddb:4, global/.archive:3}
未覆盖 = 0        mnemon total_insights = 244（原 233）  edges = 7339
```

## 修掉的真实缺口：`memory-to-mnemon.py` 只读一个目录

旧版 `--src` 默认 `~/.reasonix/memory/global`，且用 `os.listdir` 不递归 ⇒
**`project/`（2 个）、`eecdfd87f26b0ddb/`（另一个 project scope，4 个）、`global/.archive/`（3 个）里的 fact 从来没进过 mnemon**。

改动（`~/.dsh/storages/tools/memory-to-mnemon.py`，备份 `.bak-20260928-1820-pre-multiscope`）：
1. 新增 `discover_scopes(root)` —— 自动发现 `~/.reasonix/memory/*/` 下所有 scope（跳过 `.` 开头，因为 `.revisions` 是修订历史快照不是记忆本体），`global` 排第一，`global/.archive` 作为 `archive` scope 收尾
2. `build_insights(scopes, only)` 接受 `[(label, dir)]`；`--src` 改为 `action="append"`（memory.mjs 传的单值仍兼容）
3. 非 global 的 fact 打 `src:<label>` tag；**global 不打** ⇒ 既有 189 条行为零变化
4. `label == "archive"` 时 `imp = min(imp, 2)` —— 归档内容必须留在可 decay 区，否则永久 immune 永远不会被 gc 回收
5. 新增 `--memory-root`；日志里多打 `scopes={...}` 分布

`MemoryToMnemon` 计划任务引用的就是这个路径 ⇒ 明天 12:20 起自动按新逻辑跑，不用改任务。

## 关键教训：核对覆盖率必须用 frontmatter 的 `name`，不是文件名

我第一版比对脚本用**文件名**去 grep mnemon，得出"19 个 fact 没导入"的**错误结论**。
真相：`memory-to-mnemon.py` 用 `name = g("name") or f[:-3]` —— **frontmatter 的 `name` 优先**，而本机有大量中文文件名配英文 kebab-case name：

| 文件名 | frontmatter name |
|---|---|
| `元规则-技能路由16条.md` | `skill-routing-rules` |
| `工具-迅雷Base64下载.md` | `thunder-download-method` |
| `学习-MIT-6042J回顾.md` | `mit6042j-review` |
| `学习-MIT-18.100B下载清单.md` | `mit-ocw-18.100b-downloaded` |

→ **判据写错会伪装成覆盖缺口**（这个失效模式在本项目里已复发多次）。

## 三层记忆现在的完整链路

1. **写入**：`memory_remember` → `~/.reasonix/memory/global/<name>.md` + 更新 `MEMORY.md` 索引
2. **实时同步**：`memory.mjs` 的 `syncToMnemon()` detached spawn 上面那个脚本，带 `--only <name> --src <dir>`（18:14:55 实测生效）
3. **每日全量**：`MemoryToMnemon` 12:20 兜底；`MemoryIndexHeal` 12:10 修索引；`ThreadEdgesRefresh` 12:30 重建会话血缘

**reasonix CLI 与桌面版共享同一份语料**：`~/.reasonix/memory` 是指向 `%APPDATA%\reasonix\memory` 的 junction（424 文件，2026-09-27 归一）⇒ dsh 这边写的 fact，reasonix 那边直接可见，反之亦然。
