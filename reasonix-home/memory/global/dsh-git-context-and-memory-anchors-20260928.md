---
id: mem-e729b82a0d72cb3b053272667580f123
revision: 2
created_at: "2026-09-28T16:07:27.676Z"
updated_at: "2026-09-28T16:31:19.409Z"
name: dsh-git-context-and-memory-anchors-20260928
description: "「记得自己 git」两半补完 + 自我验证的最短路径：headless 线没有 context-gate 所以第一轮就能验（7 秒），以及 agent.cordis.yml 不被扫描这个静默失效的坑；含全部验收证据与生效时机对照"
metadata:
  type: user
  fact_type: project
  scope: global
---

# 「记得自己 git」两半补完：会话级注入 + 记忆级锚点（2026-09-28）

## B —— 会话级 git 状态注入 `git-context.mjs`

新文件 `~/.dsh/.agent-presets/anchored-standard/git-context.mjs`（159 行，只 import `node:child_process`）。

**做法照官方 `@deepseek-ai/dsh-time-context`**：在 `agent/pre-step` waterfall 里
`const decision = await next()` 然后追加一条消息：
```js
{ role: 'user',
  content: [{ type: 'text', text }],
  source: { kind: 'git-context', form: 'snapshot', sections: [{ name, text }] } }
```
**preset 模块只能 import node 内建模块**（解析根是 preset 目录，没有 node_modules），所以这条消息的形状是**手写**的 —— 不能 import `@deepseek-ai/dsh-llm` 的 `createUserMessage`。

注入文本实测（headless 线，2026-09-28 16:26）：
```
LOCAL GIT STATE (injected by git-context; uncommitted = working tree changes)
C:/Users/27063/.dsh  [branch main  HEAD 9de4ebc  1 uncommitted]
    9de4ebc 2026-09-29 auto: 2026-09-29 00:26  (1 files)
    faaae4b auto: 2026-09-29 auto: 2026-09-29 00:07  (2 files)
    ed70bfb auto: 2026-09-28 19:42  (2 files)
```
- 候选目录 = 会话 cwd（`agent.session.cwd` → `.header.cwd` → `agent.cwd` → `process.cwd()`）+ `config.repos`；按仓库根去重；**不是仓库就返回空串、不注入**（静默）
- `git status --porcelain` 计数 = uncommitted；进程级缓存 TTL 4 s；每个 git 调用 timeout 3 s、`stdio:['ignore','pipe','ignore']`
- 第一轮会被 `anchored-context-gate` 剥掉（没进它的 `allowKinds`），**第二轮起可见** —— 与 time-context / AGENTS.md digest 完全同待遇

### ⚠️ 最大的坑：`agent.cordis.yml` 根本不被扫描
`profiles/web/cordis.patch.yml` 开头的注释写明（0.1.7 起）：
> 旧机制（`$DSH_HOME/.agent-presets/<id>/` 目录 + `dsh-agent-presets` 插件）**已废除：目录不再被扫描**，
> preset 必须由 `@deepseek-ai/dsh-agent-preset` 声明行携带 plugins 列表。
> 下面 plugins **逐字来自 `.agent-presets/anchored-standard/agent.cordis.yml`**（mjs 路径改为相对本 profile 目录）。

⇒ **只改 `agent.cordis.yml` 完全无效**。真正生效的是
`profiles/web/cordis.patch.yml` → `- insert:` → `- id: preset-anchored-standard` → `config.plugins`
（24 行 row，缩进 10 空格，name 用 `../../.agent-presets/anchored-standard/xxx.mjs`）。
`headless` 是另一种机制：`profiles/headless/cordis.patch.yml` **直接引** `.mjs`。

**三处都改了**：`agent.cordis.yml`（保持"逐字一致"作为源）、`profiles/web/cordis.patch.yml`
（生效的那份，备份 `.bak-20260928-2000-pre-git-context-row`）、`profiles/headless/cordis.patch.yml`
（备份 `.bak-20260928-2010-pre-git-context`）。

## C —— 记忆级 git 锚点 `captureGitAnchor`

`~/.dsh/.agent-presets/anchored-standard/memory.mjs` 新增：
- import 加 `execFileSync`（`node:child_process`）、`dirname`（`node:path`）
- `captureGitAnchor(factName)` 放在 `toJsonSchema` 之前
- `memory_remember` 里 `syncToMnemon(...)` 之后 `await captureGitAnchor(factName).catch(() => {})`

**为什么用旁路文件而不是写进 frontmatter**：`renderFact` 生成的 frontmatter 是「与 reasonix 自己的 remember 工具同一形状」，reasonix 是这套语料的唯一写入方、双机同步也依赖那个形状；写旁路文件完全不碰语料格式，也不污染喂给 mnemon 的 content。

落盘 `~/.dsh/storages/git-anchors.json`（tmp + rename 原子替换，保留最近 300 条）：
```json
{ "version": 1,
  "anchors": { "<fact-name>": { "at": "2026-09-28T16:29:58.711Z",
    "repos": [{ "repo": "C:/Users/27063/.dsh", "branch": "main", "head": "11cdf40", "dirty": 1 }] } } }
```

## ★ 自我验证的最短路径 = headless 线（用户点破的）

**不要叫用户去开新会话看** —— `dsh headless '<task>'` 7 秒就能端到端验完，因为
**headless profile 没有挂 `anchored-context-gate`**，注入在第一轮就可见（web 线要等第二轮）。

```bash
cd ~ && dsh headless '把你上下文里以 "LOCAL GIT STATE" 开头的那一段原样打印出来；没有就打印 NO-INJECTION。'
# → 模型原样复述出注入文本 ✅（2026-09-28 16:26 实测，7.4 s）

dsh headless '调用一次 memory_remember 写 name=... / description=... / body=... / factType=reference / scope=global'
# → git-anchors.json 立刻出现该 fact 的 repo/branch/head/dirty ✅（16:29:58 实测）
```
第二条之所以能验 C，是因为 headless 每次启动都重新加载 `memory.mjs`（**preset 的 `.mjs` 不参与 HMR**）。

## 生效时机
| 改动 | 何时生效 |
|---|---|
| `profiles/{web,headless}/cordis.patch.yml` 的新 row | **新 session / 新进程**（profile patch 参与 `patchReload: live` HMR） |
| `memory.mjs` 的新代码 | **必须重启 dsh 进程** |
| `git-context.mjs`（新文件，被 row 引用） | 随 row 一起生效 |

**对照证据**：2026-09-28 16:2x 之后 `git-anchors.json` 对 headless 写的 fact 有记录，而我用
3080 的工具写的那条 fact（`dsh-git-context-and-memory-anchors-20260928`）**没有** ——
因为 3080 是 19:12 启动的、那时 `memory.mjs` 还是老代码 ⇒ **重启 3080 之前 C 在生产是不生效的**。

## 验收证据汇总
- `dsh --profile web --dump-config` → EXIT 0，2346 行，**line 2172 出现 `- id: git-context`**
- headless 端到端 ×2（上面两条命令）
- `memory.mjs` import OK（exports: apply, inject, listFacts, name, parseFact, rankFacts）
- 两次自检用的临时 fact 三处全清（fact 文件 / MEMORY.md 索引行 / anchors 条目）
- 所有改动由 `DshConfigAutocommit` 自动落 commit，我一次都没手动 commit
