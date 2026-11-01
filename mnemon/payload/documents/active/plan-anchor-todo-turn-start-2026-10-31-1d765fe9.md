---
id: "1d765fe9-814b-4608-b7a8-cf3c47123eff"
title: "plan-anchor 的 todo 投影与「陈旧提醒」实现：两个设计错误的实测证据、去重窗口的 turn/start 边界、社区依据与外部回滚教训（2026-10-31）"
description: "2026-10-31 plan-anchor.mjs 第二轮迭代：todosOf 只抽「下一步」导致 UI completed 恒为 0 的设计错误及其解压 session log 得到的 done 0→5 硬证据；todo/write 去重因只看 log 末条而每步触发（10–25s 一条），改为从尾部向前扫到 turn/start 修复；新增 staleHint/WRITE_TOOLS/staleLead 的「本轮干了写活却没更新 plan」注入式提醒（判据、once-per-turn、社区三处依据 planning-with-files v3 / issue #239 systemMessage 通道坑 / Kimi Code todo 机制），以及外部进程回滚未提交改动 ⇒「改完立刻 commit、不跨步骤」的实操教训。提交 40ddcc8 / e938144 / b279ea3。前序见 b4a7aa94。"
status: "active"
created_at: "2026-10-31T15:29:11.368Z"
updated_at: "2026-10-31T15:29:11.368Z"
content_hash: "ef4e51a4a00e5bfdeb1d0d1229a61e71a9e02bc632fc03f7d53936515a8dd861"
source_paths:
  - ".agent-presets/anchored-standard/plan-anchor.mjs"
session_ids:
  - "a0adbf30-e390-4f66-aeb9-892e55403c4f"
memory_body_ids:
  []
---

# plan-anchor：todo 投影 + 陈旧提醒（2026-10-31 第二轮迭代）

前序：`b4a7aa94`（注入链断裂根因、per-session plan、todo_write 常驻改造）、`cab1ac23`（session-age-warn）。
本文只记这一轮**新增**的设计错误、实测证据与修复；实现全部落在 `.agent-presets/anchored-standard/plan-anchor.mjs`。

**状态**：代码落盘、`node --check` + 单测通过、已提交；`.mjs` 不参与 HMR，**需重启 dsh 才生效**。

## 1. 设计错误 1：只抽「下一步」，不抽「已完成」

初版 `todosOf` 只把 plan 的 `## 下一步` 段映射成 todo 列表，`## 已完成` 完全不读。后果是 UI 永远没有 `completed` 计数 —— 活干完了看起来毫无进展。

修法（提交 `40ddcc8`）：`todosOf` 同时抽两段。

- `## 已完成` → `status: 'completed'`，**只取最近 5 条**（`maxCompleted`）；把全部历史映射进去会让 TodoPanel 变成滚动日志，反而看不见当前该干的事。
- `## 下一步` → 第一条 `in_progress`，其余 `pending`；dsh 有「最多一个 in_progress」约束，多个 `in_progress` 自动降级。
- 顺手清理 markdown 强调符、反引号、checklist 的 `[x]`（TodoPanel 是纯文本渲染）。
- 拿不到段 / 段里没条目 → 返回 `null`，调用方**跳过投影**而不是清空用户已有列表。

### 硬证据：解压 session log 数出来的，不是推测

`.agent-presets/*.mjs` 的 session log 是 `session.v4.jsonl.zstd`（`~/.dsh/sessions/--C-Users-27063--/session-<id>/`）。验证手段：

- 系统自带 `node zstandard` 可用（`/d/miniconda/Library/bin/zstd` 亦在，`python zstandard 0.25.0`）；文件头 magic `28 b5 2f fd` 确认是 zstd 而不是别的封装。
- 解压后逐行 `JSON.parse`，筛 `type === 'todo/write'`，统计每条 `data.todos` 的 completed / in_progress / pending。

实测（同一会话，进程在 10-31 12:08:36 重启）：

```
seq    时间              done/active/pending
 977  10-30 15:03:44     0 / 1 / 1        ← 旧版，done 恒 0
 …    （共 6 条，全是 0 / 1 / 1）
──────── 重启 10-31 12:08:36 ────────
1040  10-31 23:14:18     5 / 1 / 2        ← 新版
 …    （共 7 条，全部 5 / 1 / 2）
```

`done 0 → 5` 就是「只抽下一步」这个错误的实际后果，修复已验证。

## 2. 新暴露的问题：去重没生效（每步一条，不是每轮一条）

7 条事件落在 23:14:18 ~ 23:15:44，间隔 10–25 秒 —— 是**每步**投一次，每步约 800 B 的 8 条 todo 白塞进 session log。

根因（初版去重太天真）：

```js
const last = log[log.length - 1]
const covered = last.type === 'todo/write' && …   // pre-step 时最后一条永远是上一步的响应 ⇒ 恒 false
```

修法（提交 `e938144`）：从尾部**向前**扫，遇到 `turn/start` 即停。

```js
for (let i = log.length - 1; i >= Math.max(0, log.length - 200); i -= 1) {
  const ev = log[i]
  if (ev?.type === 'turn/start') break          // 本轮还没投过（projection 已重置）
  if (ev?.type === 'todo/write') { covered = JSON.stringify(ev.data?.todos) === key; break }
}
```

`turn/start` 是天然的「本轮已重置」标记；只扫尾部 200 条，长会话不 O(n)。
顺带确认一件此前只能运行时验证的事：**`agent.session.log` 在 hook（`agent/pre-step`）里是同步可读的**。

## 3. 新增：陈旧提醒（staleHint / WRITE_TOOLS / staleLead，提交 `b279ea3`）

待拍板的问题是「模型干完活不更新 plan」。选了**注入侧标陈旧**而非改 agent loop 终止行为（Stop gate 留给真有证据时再说）—— 一行字、零风险。

判据全部取自 session.log **现成**字段，不新增状态：

- 当前轮次 = 最后一条 `turn/start` 的 `data.turn`（事件自带，用不着数）
- 本轮干活量 = `turn/start` 之后 `tool/call` 中 `name ∈ WRITE_TOOLS` 的条数
- 落笔判据 = plan 文件 `mtime >= 本轮开始时刻`

三条同时成立才提醒：**本轮干过写活** ∧ **本轮没落笔** ∧ **本轮还没提醒过**（`staleSeen` 按会话记轮次号，每轮最多一次）。触发方式是把注入的 `lead` 换成提醒文案（纯注入通道，不改消息流结构）。检测本身包在 try/catch 里 —— 提醒机制绝不能反过来影响注入。

`WRITE_TOOLS` 白名单含 `bash` 与编辑器类，不含只读工具。12 条单测覆盖陈旧 / 只读 / 无调用 / 已更新 / 跨轮不计入 / 空 log / 非数组 / 文件不存在 / 文案内容 / 白名单正反两面。

### 社区依据（三处，直接决定实现形态）

1. **`PostToolUse` nudge 是主流，不是 Stop hook** —— planning-with-files v3 的 hook 表在 Write/Edit/Bash 之后读 `task_plan.md` 刷新目标，剂量写明「once per turn」「off read-only tools」。dsh 里 `agent/pre-step` 是等价注入点，不必新开 hook 事件。
2. **提醒发错通道 = 白提醒** —— planning-with-files issue #239：nudge 原来发成 `systemMessage`，而那是**显示给用户看**的警告，模型根本没收到；改成进模型上下文才生效。所以这里走注入通道，不是 UI 提示。
3. **有独立于工具的陈旧提醒先例** —— Kimi Code 的 TodoList 机制里 stale reminder 独立于 todo 工具本身、在 agent loop 里跑；与本插件「投影在 pre-step、提醒也在 pre-step」同构。

## 4. 实操教训：外部进程会回滚未提交的改动

第一遍改完（`node --check` 过、单测过），下一条命令一看工作区已经回到 HEAD —— 有外部自动化（形如 `test: mixed domains` 的钩子）重置了未提交改动；`git status` 里只剩无关的 `plans/_probe_g.md`、`tmp/_probe_f.py` 暂存项。

**结论：改完立刻 commit，不跨步骤。** 第二遍改完就在同一条命令里 `git commit`。
附带约束：`.dsh` 仓库的 pre-commit 钩子会拒绝「暂存区混多个主题域」（preset 代码 vs plans/tmp 草稿），按域分批提交，或让 dsh-autocommit 去提交它自己那几个目录。

## 5. 待验收（需重启后确认）

1. `todo/write` 事件密度从「每步一条」降到「每轮一条」—— 重启后解压对应 `session.v4.jsonl.zstd` 再数一遍间隔。
2. 故意干几轮写活不动 plan，看注入的 `lead` 里是否出现带次数与分钟的 ⚠️ 提醒。
