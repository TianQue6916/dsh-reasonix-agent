---
id: "2a396508-3c3f-4a3e-8ce8-43f255f88347"
title: "DSH session fork 的适用判据、触发信号与 dsh-fork-audit.py 核账工具"
description: "2026-10-01 会话后半段成果：把 session fork 从「机制存在」推进到「何时值得用」——原文 vs 结论的判据、学习场景三个触发信号、fork 与 git 的对偶边界、核账脚本 dsh-fork-audit.py 的实现要点（concatenated-frame 读取与 end-seed 边界反推）与三条给 agent 暴露 fork 的落地路径。机制取证部分见 doc 91ba0419。"
status: "active"
created_at: "2026-10-01T12:38:52.415Z"
updated_at: "2026-10-01T12:38:52.415Z"
content_hash: "ce4fb063b9406483895f1d03bf1c6b67a22c2725a959b560f749e6e991c9c695"
source_paths:
  - "storages/tools/dsh-fork-audit.py"
  - "profiles/desktop/cordis.patch.yml"
  - "storages/plugins.json"
  - "profiles/.agent-presets/anchored-standard/subagent-language.mjs"
  - "profiles/.agent-presets/anchored-standard/context-gate.mjs"
session_ids:
  - "be3a939b-7842-4ef4-b1dc-02562e1c6e5a"
memory_body_ids:
  []
---

# DSH session fork 的适用判据、触发信号与核账工具

日期：2026-10-01。承接机制取证（见 `91ba0419-c485-418c-89c7-488475dfab28`，那份讲「三套分叉机制是什么、agent 为何用不到 UI 按钮」）。本文只记录**新增且不重复**的部分：值不值得用、何时用、怎么核账、怎么落地。

## 1. 核心判据（一句话，取代教科书式列举）

> 需要保留**原文**才能继续 → fork；只需要**结论** → ACP compress。

fork 是「无损分叉」，ACP compress 是「有损压缩」，二者不是竞品而是同一成本轴的两端。fork 的本质：**对 event log 做 prefix 的 copy（复制，不是引用）**——买到的是「带完整原文的平行执行点」。

据此严格推出的三个边界：

- **不低成本**：child 首轮要把整个 prefix 重新发给 provider，便宜与否只看 exact-prefix prompt cache 是否命中。profile 里挂了 time-context / git-context 注入会破坏逐字节一致性 ⇒ cache miss 不罕见。**fork 是「重放」，不是「续租」**，必须实测，不能凭直觉。
- **不继承 live state**：模型选择不继承（child 用当前 default model）；工具权限、workspace 需重新 attach。
- **没有 merge / rebase**：两条线永不自动合回，只能人肉 squash（把结论贴回主线）。

另一句判据（决定单次是否值得）：

> 丢了这段对话上下文，重建要花多久？几分钟 → 不值，新开 session 手写背景即可；十几分钟以上或「重建不起来」→ fork 是唯一解。

## 2. 纠正一个隐含错位：fork 快照「上下文」，不是「代码」

「重构大项目看效果」如果指「让 agent 改完代码看效果」，那是 **git branch** 的事，与 fork 无关。fork 在重构场景的正当用途只有一个：**保住 agent 已建立的项目理解这份上下文原文**。

| git | dsh session fork | 说明 |
|---|---|---|
| commit | event（一个 turn / step） | 都是 append-only |
| branch | fork | 都是「在某历史点分出去」 |
| working tree | 当前 session 的 live context | |
| merge / rebase | **不存在** | 只能人肉 squash |
| `git worktree`（文件隔离） | **无对应** | fork 完全不隔离文件系统 |
| working dir 回滚 | 靠 git（`~/.dsh` auto-commit repo 是另一半 checkpoint） | 两者互补，不能互相替代 |

## 3. 学习场景：有需求，但形态是「搜索树分歧点」而非「长时间分支」

按贴合度排序的三处：

- **(a) 证明搜索树的分叉**（同构于代码 branch，最本质）。推证明走到「可走 lemma A 或 lemma B」即分歧点。在单条 session 里继续推有真实可观测的坏后果：前一条路的错误分支作为 context 残留，**持续偏置后续推演**（症状：agent 反复回到已被否掉的思路）。profile 里的「先攻后守」协议天然产生这种分歧点，目前是用「文字卡点」在替代。
- **(b) 失败路径的原文诊断**（fork 在学习场景独占的用途）。卡点协议中最有价值的证据是「你为什么会卡」那堆错路原文；ACP compress 会把它压成「卡在 X」一句，证据直接消失。
- **(c) 同一背景对照两套处理**。同一主题（Rudin 的证明 vs Thomson 的证明、6.431 的处理 vs Cover 的处理）要对照的是自己的理解状态；同一 prefix 分叉两条各吃一套，优于把两套塞进一个 context 互相干扰。

**诊断结论：不是「不会用」，而是需求密度未到。** 现有四个机制已覆盖 fork 的大半功能（ACP compress 管结论、`~/.dsh` git auto-commit 管文件回滚、mnemon/reasonix memory 管跨 session 结论、新开 root + 手写背景管干净上下文）；fork 独占、四者都替代不了的那一格是：

> 原文级完整上下文 ＋ 在某一时刻分裂成两条线 ＋ 不愿付重建成本。

因为 session 是「话题式」（约 896 roots ≈ 一话题一条）而非「工程式长驻」，这一格出现频率低。

**三个可判定信号（在此之前不值得为 fork 建工作流）：**

1. **重建成本阈值**：开始跨多天工程（真去写 tool plugin、跑 Linux 双系统调环境），并发现自己**反复向新 session 重述同一份背景**。
2. **偏置症状**：单条 session 里推证明，agent 反复回到已被否掉的思路（context 污染）。
3. **对照需求**：需在同一份背景上并排对比两套处理，且在同一 context 里开始互相干扰。

当前三个信号都未到 ⇒ 正确态度是「知道它有、知道它独占哪一格、留一个核账脚本在手」，而非现在建工作流。

## 4. 核账工具：`storages/tools/dsh-fork-audit.py`

只读脚本（约 12KB，已 chmod +x），用途：分叉后核账，不用记命令。

```
python dsh-fork-audit.py                    # 汇总
python dsh-fork-audit.py --forks -v         # 只列 isSeeded=true 的 fork，展开 prefix 核账
python dsh-fork-audit.py --id 5b3c166a -n 20  # 单会话详情 + 尾部事件
python dsh-fork-audit.py --json             # 机器可读
```

**实现要点（真坑，已写进 docstring）：**

- dsh 的 jsonl backend **不是「一个 zstd 流」，而是 concatenated-frame container**：header 单独一帧，其后每个 append batch 一帧。读取必须 `stream_reader(fh, read_across_frames=True)`（`zstandard 0.25.0`），否则只读到第一帧、**事件数永远是 0**。
- 继承前缀边界反推：取最后一个带 tag 的 `session/end-seed` event，**之前（含自身）**即继承前缀；host 侧 `inheritedEventCount = boundary + 1`，且不落 header。
- header 字段判据：`isSeeded=true` 才是 fork；`origin="subagent"` + `parentSession` + `delegationDepth=1` 只是普通 subagent child。

**实测（2026-10-01 20:37 左右）：**

```
sessions: 1003   roots: 896   subagent children: 107   session forks (isSeeded=true): 0
```

即使用形状为「896 条短命 root + 107 条 child + 0 条 fork」。child 采样显示每条约 300–480 事件、0.8–1.7 MiB，`preset=anchored-standard`，父侧多为 `a0d5fbf8`。

## 5. 给 agent 暴露 fork 的三条落地路径（按代价排序）

**路 1 — 零代码，persona 策略行。** 在 `profiles/.agent-presets/anchored-standard/` 放一个 `.mjs`（该目录**无 node_modules，只能 import node 内置模块**），用已有 seam 注入判据：

```js
ctx.on('system-prompt/assemble', async (assembly, context, next) => { /* 注入判据段 */ })
```

同目录 `subagent-language.mjs:74`、`context-gate.mjs:158` 即此 seam。注入文字约 5–8 行，说明：带已完成轮次开平行线用 `subagent_fork`（seed 既有历史）而非 `subagent`；一次 run 可开多条；之后用 `send_message` 追问某条（agent_id = direct continuable child）；只需结论且要继续同一 context 则不要开分支；分支不会自动合回，结论须自己写回主线。验收：出现 `isSeeded: true` 的 child header，且 `list_agents` 看得到。

**路 2 — 薄 tool 插件。** store 级 API 为 `ctx.sessions.fork(source, boundary?, childSessionId?): Session`，已注册进 cordis API catalog（`@Remote('fork')`）。工具形状抄 `dev-tool-search.mjs:79-103`：`export const name` / `inject = ['tools']` / `ctx.tools.register({name, description, parameters, output: {schema, render}, execute})`。**唯一的真设计难点：参数不能是 seq**——模型看不到 event seq，只看到消息，所以 interface 必须是语义锚点（`last_turn` / `before_last_user_message`），由插件内部解析成 boundary。⚠️ `ctx.sessions.fork` 是 host 内部面，跨 rc 版本可能变。

**路 3 — 先看成品。** `storages/plugins.json` 中已有 `dsh-session-fork`：做了 `/branch` + `send_message_by_branch` 跨分支消息 + `branch_squash` / `branch_rebase`（补上官方缺的 merge/rebase）。配套还有 `dsh-fork-relink`（把 fork 出的 session 重新接入 lineage，使其能被官方冷恢复路径唤醒）、`dsh-branch-inbox-guard`（防父子 inbox 继承踩踏）。

## 6. 后续可选挂钩

`storages/tools/thread-edges.mjs` 已在生成 `storages/thread-edges.json` 血缘图，可把 `--forks` 输出接进去，使 fork 一旦出现自动落在线程图里。
