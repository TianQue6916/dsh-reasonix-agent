---
id: mem-96e25eebda049924eb8016f3e1e9699e
revision: 3
created_at: "2026-09-27T15:30:44.798Z"
updated_at: "2026-09-27T16:23:56.059Z"
name: codex-gap-4-5-filled-agent-jobs-and-thread-edges-20260927
description: "补齐 Codex 缺口 #5：thread-edges.mjs 现在导出真正的父子树（session→workflow→agent），修掉三处静默丢数据的 bug（meta.description 提取、正则捕获组索引 mm[2]→mm[1]、DOT parent 精确匹配），并记录 workflow/subagent 的真实参数结构与 Python 写 JS 的反斜杠坑"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 一、Codex 缺口 #5 真正补齐（2026-09-28 round 9）

**之前只做到"派发记录导出"，且有三处 bug 导致信息丢失/层级错误。现在有真正的父子树。**

**产物**：`~/.dsh/storages/tools/thread-edges.mjs`
```bash
ZSTD_BIN="D:/miniconda/Library/bin/zstd.exe" node thread-edges.mjs \
  --limit 25 --out thread-edges.json --dot thread-edges.dot \
  [--dir <sessions 目录>] [--names subagent,workflow,subagent_fork,ralph]
```

**实测输出**（本机）：
```
扫描 session: 25（失败 0）→ 派发边 5 条
按工具: {"workflow":3, "workflow:agent":2}

# DOT（真正的父子层级）
"a0d5fbf8-…" -> "w0"      # session → workflow「核验近三天 dsh/reasonix 的 64 条努力记录…」
"a0d5fbf8-…" -> "w1"      #            → workflow「最小可用性探测：确认 agent hook 是否可用」
"a0d5fbf8-…" -> "w4"      #            → workflow「单组核验探测，定位失败原因」
"w1" -> "a2"              # workflow → agent「Run the bash command `echo PROBE_OK`…」（虚线）
"w1" -> "a3"              #          → agent「Reply with exactly: PLAIN_OK」
```

## 二、`workflow` / `subagent` 的真实参数结构（关键，之前全猜错了）

```json
{"type":"tool/call","seq":2926,"data":{"turn":26,"step":34,"callId":"…","name":"workflow",
  "arguments":"{\"meta\":{\"name\":\"verify-3day-efforts\",
                          \"description\":\"核验近三天 dsh/reasonix 的 64 条努力记录是否真的成立…\",
                          \"phases\":[{\"title\":\"verify\",\"detail\":\"按主题分组并行核验，每组一个 agent\"}]},
                \"args\":{...},
                \"script\":\"const memdir = args.memdir … await agent(\\\"…\\\", { label: 'probe' })\"}"}}
```

**要点**：
1. **`data.arguments` 是 JSON 字符串**，要二次 `JSON.parse`
2. **任务描述在 `meta.description`**（不是 `args.task`）—— 我原先只认 `args.task ?? args.prompt ?? args.description ?? args.query`，**全落空**，DOT label 是空的
3. **`script` 字段里每个 `agent(...)` 调用 = 一条真实的子线程派发边** ← 这才是"父子线程"的真身
4. `meta.name` 是 workflow 的名字，用它可以**把 agent 边挂回父 workflow**

**判据（重要）**：`subagent` 这个字符串在 `request/header` 帧的**工具定义**里大量出现 ——
**别把工具定义当调用**。必须同时满足：
- `line.startsWith('{"type":"tool/call"')`
- `data.name ∈ {subagent, workflow, subagent_fork, ralph}`

## 三、修掉的三个 bug（都是"静默丢数据"型）

| # | bug | 症状 | 根因 |
|---|---|---|---|
| 1 | 任务提取只认 `args.task` | DOT label 全空 | 真实结构是 `meta.description` |
| 2 | `const quote = mm[2]` | `agent()` 提取 0 条 | 正则 `/agent\s*\(\s*(["'\`])/g` **只有 1 个捕获组**，`mm[2]` 是 `undefined` → `script.indexOf(undefined, start)` 返回 −1 → 不 push |
| 3 | DOT 里 parent 匹配用 task 前缀 | agent 边全挂在 session 下 | `e.parent` 存的是 `meta.name`，`wfNodes` 的 key 却是 `task` → 改用**精确 `k === e.parent`** |

**1 和 2 都是"有输出但不报错"** —— 如果只看"脚本跑通了"，会以为 #5 已完成。**判据必须是"内容对不对"，不是"退没退非零"。**

## 四、🐍 又一次 Python 写 JS 的坑

往 JS 里写 `'\n'` 时，**别把 Python 变量名写进字符串**：
```python
# 错：B 在引号内是字面字符 'B'
"    out.push('  \"' + nid + '[label=\"' + clean(e.tool) + B + 'n' + clean(e.task) + '\"];')"
#       → JS 里出现 `+ B +` → ReferenceError: B is not defined
# 对：在 Python 里完成拼接
"    out.push('  \"' + nid + '[label=\"' + clean(e.tool) + '" + B + "n' + clean(e.task) + '\"];')"
```
**同类坑累计**：heredoc 吃反斜杠（3 次）、替换区间漏闭合括号、Python 变量名写进字符串。**共同解法：改完立刻 `node --check`**。

## 五、语义边界（别当成 Codex 的同款）

dsh 的 subagent **在同一 session 内运行、有自己的 context，但不落独立 session 文件** ——
所以导出的是「**谁派发了哪个子任务**」及其**层级**（session → workflow → agent），
**不是**云端那种独立子线程 ID + 跨 session 的线程树。
