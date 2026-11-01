---
id: "01f4132d-851d-4e51-9097-2db2e7583161"
title: "plan-anchor 每会话独立计划文件落地（subagents=own、isSubagent 恒 undefined 坑）与 PLAN.md → PLAN.d 任务目录拆分"
description: "2026-10-28：用户要求「每个会话窗口自动建一份不可覆盖的 plan.md」。核实 plan-anchor 已用 flag:'wx' 独占创建 per-session 文件，但 subagents:parent 从未生效（isSubagent 恒 undefined）；用户拍板 own 后改双 profile 与 .mjs 默认值并验证。另含 PLAN.md 325KB → 6KB 根 + 7 任务目录的无损拆分结构。"
status: "active"
created_at: "2026-10-28T11:46:19.485Z"
updated_at: "2026-10-28T11:46:19.485Z"
content_hash: "79d9a1dc41034f1ce3d2575c5f987e5b9ed47dd01af78a5f7c6088e3519b9b0e"
source_paths:
  - ".agent-presets/anchored-standard/plan-anchor.mjs"
  - "profiles/desktop/cordis.patch.yml"
  - "profiles/web/cordis.patch.yml"
  - "PLAN.md"
  - "PLAN.d/INDEX.md"
session_ids:
  - "68356775-b34e-422a-8bd5-3e2e15d4eaeb"
memory_body_ids:
  []
---

# plan-anchor 每会话独立计划文件落地 + PLAN.d 任务目录拆分（2026-10-28）

## 1. 用户需求（原话要点）

「一个绘画窗口，每次新对开心绘划要自动建立一个全新的不可被替代的任务模板，就是这个 plan.md」。

此前两轮理解跑偏：先做成了**任务档案级**（`PLAN.d/`，见第 4 节），用户真正要的是**会话级**——每开一个会话窗口，自动多一份专属、不可被他人覆盖的计划文件。

## 2. 现状机制（已存在，实测确认）

`~/.dsh/plans/<session-id>.md`，由 `plan-anchor.mjs` 的 `ensureSessionPlan()` 创建：

- **`writeFileSync(file, template, { flag: 'wx' })`** —— 独占创建；已存在抛 `EEXIST` 并被 `catch {}` 接住，**永不覆盖**（代码注释：「覆盖 = 静默丢用户的任务笔记」）。
- **文件名 = session id**，一 id 一文件，无共享位。
- **注入只读自己那份**：9 份 payload 的 sha256 两两不同；改自己那份，其它 8 份字节级不变。
- 实测时间戳从 19:16 排到 19:32，每开一个窗口多一份，含子 agent（裸 uuid 命名）。

## 3. 缺陷与修复：`subagents: 'parent'` 从未生效

`planOwnerId()` 用 `agent?.isSubagent === true` 判断子 agent，而**该字段在本 dsh 版本里恒为 `undefined`**（同坑已记在 `concurrency-discipline.mjs:82` 的注释：`skipSubagents` 从来没生效过）。因此代码永远走 `return own` —— 配置写 `parent` 与实际行为矛盾，配置在说谎。

用户拍板「**要**」（子 agent 各自一份）后的改动：

| 文件 | 改动 |
|---|---|
| `profiles/desktop/cordis.patch.yml` | `subagents: parent` → `own`，注释同步 |
| `profiles/web/cordis.patch.yml` | 同上 |
| `.agent-presets/anchored-standard/plan-anchor.mjs` | 默认值 `cfg?.subagents ?? 'parent'` → `?? 'own'`；头注释与 `planOwnerId` 注释写入 `isSubagent` 恒 `undefined` 这个坑 |

验证（4 项全过）：

1. `dsh --profile web --dump-config` → `subagents: own`（配置合成正确）。
2. `planOwnerId()` 逻辑单测 5/5 PASS：`own`+真实子 agent、`own`+假设子 agent、`parent`+假设子 agent（拿不到 parent 回落自己）、默认不配+真实子 agent 均返回 child uuid；默认不配+root 返回 root session id。
3. `node --check plan-anchor.mjs` PASS。
4. `profiles/desktop/package.json` 与 `web/package.json` 均 `"patchReload": "live"` —— **patch 改动 HMR，开新会话即生效，无需重启**；`.mjs` 默认值要重启才加载，但已被 patch 的 `own` 覆盖，行为现在就是 own。

## 4. PLAN.md → PLAN.d 任务目录拆分（另一件事，用户先前要求「一个任务一个目录」）

根 `PLAN.md` **325,818 B / 2721 行 → 6,104 B / 74 行（-98.1%）**，内容按任务线拆到 `PLAN.d/`：

```
PLAN.d/INDEX.md                     1,727 B  总索引（只负责导航）
translate/        PLAN.md    850 B + archive.md  87,074 B   在跑
rules-tools/      PLAN.md  2,863 B + archive.md  45,798 B
machine-env/      PLAN.md  1,948 B + archive.md  27,488 B
dsh-client-icon/  PLAN.md  1,790 B + archive.md  29,214 B
dsh-file-write/   PLAN.md    775 B + archive.md 100,641 B
dsh-remote/       PLAN.md    745 B + archive.md   3,014 B
dsh-roadmap/      PLAN.md  1,812 B + archive.md  28,182 B
```

- 每个目录的 `PLAN.md` 是从档案内容生成的 checklist（`[x]` 已完成 / `[ ]` 待办 / `[~]` 无明确状态），附「档案目录」表指向 `archive.md` 的行号。
- `archive.md` 为逐行 verbatim 搬移，一字未改；archive 合计 321,411 B，与切分前 7 卷 322,314 B 相差 903 B（正好是 7 个临时文件头的体积）。
- 混合的根源是 `## 进行中` 这个容器标题（1837 行 / 251 KB 塞了既在跑的翻译任务又早已修完的排查日志），已删除换成索引表。无损核算：49 keep + 2664 分卷 + 1 容器标题 + 7 旧头部说明 = 2721。
- 按任务边界切分修正了 4 处错位：`/compress 全局化` → rules-tools；`渲染崩溃/thinking-guard 待办清单` → dsh-roadmap；`子 agent 并发上限 32` → rules-tools；`待办总账 12:00` → dsh-roadmap。`dsh-remote/archive.md` 因此从 23.8 KB 缩到 3.0 KB。
- 回滚：`cd ~/.dsh && git checkout PLAN.md && rm -rf PLAN.d/`（`PLAN.md` 原本 tracked 且 clean）。

## 5. 未决事项

- `PLAN.d/` 仍是 `?? untracked`，`.gitignore` 未含它。已建议 `git add` 收进 git（321 KB 排查记录，有版本历史才可回滚），用户尚未答复。
- 会话 `5975e549` 的 plan 里「映射见 PLAN 86 / 详见 PLAN 88」指向切分前的旧条目号，需该会话自行更新。
- `dsh-file-write.md`（100 KB）与 `translate.md`（87 KB）仍偏大，建议先不再细切，等实际翻找困难时再说。

## 相关文档

- `b4a7aa94-d8f4-4494-817e-407d1112e249`：concurrency-discipline 注入链断裂与 per-session plan / todo_write 常驻改造（`isSubagent` 坑的首次记录所在）。
- `7ffee013-e0cd-425c-9209-1bce9cc84239`：plan-anchor.mjs 原始实现交接（`flag:'wx'` 与 cordis 注册顺序的出处）。
