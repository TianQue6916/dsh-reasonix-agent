---
id: mem-895427e3c1155d223e1a48d43dbbac3a
revision: 1
created_at: "2026-09-28T18:29:25.293Z"
updated_at: "2026-09-28T18:29:25.293Z"
name: incident-includeSubagents-broke-mnemon-subagents-20260929
description: "事故复盘：preset 的 tool-bootstrap.includeSubagents:true 让 subagent 第一轮只有 2 个工具，而 dsh-mnemon 六个 operation 都靠 subagent 调 result 工具回传，于是\"memory subagent completed without recording its result\"；含实现级传导链、修法与验收教训"
metadata:
  type: user
  fact_type: project
  scope: global
---

# 事故：preset 的 includeSubagents 折断 dsh-mnemon 的全部 subagent 操作（2026-09-29）

## 现象
用户在 UI 看到「**调度失败：memory subagent completed without recording its result**」，
并判断"这个无法再启动，记忆库有问题"。
因为 mnemon 配了 `idleReviewMs: 30000`，**空闲 30 秒就触发一次 review、每次失败** ⇒ 观感就是"记忆库坏了"。

## 根因：两处独立定制撞在一起
**dsh-mnemon 有六个 operation 都 spawn 一个 subagent**：
`review` / `migration` / `compaction` / `metadata-maintenance` / `document-archive` / `write`
（`dsh-mnemon/lib/index.js:3697 / 3967 / 4034 / 4205 / 4363 / 3929`）

它给 subagent 的约束是：
```js
toolFilter: { allow: [...tools, resultToolName] }
persona 里追加："Completion protocol: call `${resultToolName}` exactly once with requestId …
                 This is the only completion channel for this run. Do not finish with a plain-text answer."
```

而 `anchored-standard` 的 **web patch** 里：
```yaml
- id: tool-bootstrap
  config:
    bootstrapTools: [ bash, str_replace_editor ]
    includeSubagents: true        # ← 元凶
```

传导链（**已读实现确认，不是从注释推断**）：
1. `compaction-epoch.mjs:95-100`
   ```js
   if (!includeSubagents && (session.header?.delegationDepth ?? 0) > 0) return { boundary: -1, promoted: true }
   ```
   `includeSubagents: true` ⇒ 这行被跳过 ⇒ **subagent 走 bootstrap 阶段**（promoted=false）
2. `tool-bootstrap.mjs:262` ⇒ `const keep = new Set(bootstrapTools)`
   ⇒ **第一轮工具面只剩 `[bash, str_replace_editor]`**
3. ⇒ mnemon 的 `resultToolName` **不在工具面里** ⇒ subagent 无法调用它
4. ⇒ 只能以纯文本收尾 ⇒ `stopReason === "completed"` 但 `structured === undefined`
5. ⇒ `index.js:4575` `throw new Error("memory subagent completed without recording its result")`

## 修法
`~/.dsh/profiles/web/cordis.patch.yml` 的 `tool-bootstrap.config.includeSubagents: true → false`
（备份 `.bak-20260929-0230-pre-includeSubagents`）。
默认 `false` ⇒ subagent 第一轮就是完整 catalog（`compaction-epoch.mjs:98-100` 注释明说
"By default subagents keep the full catalog from their very first request"）。

**`context-gate` 的同名字段保持 `true` 不动** —— 它管注入、不管工具面；
subagent 第一轮被剥注入对 mnemon 无害（mnemon 的 prompt 是 claimed message，gate 会保留）。
`headless` patch **本来就没设这个键**（默认 false）⇒ 那条线一直是好的。

`dsh --profile web --dump-config` EXIT=0，两处已分离（context-gate=True / tool-bootstrap=False）。

## ★ 教训
1. **装第三方插件后，验收不能只测 CLI 层。**
   我 9/27 验收 mnemon 时只跑了 `mnemon search/recall/status/gc` 和隔离实例，
   **从没碰过 dsh 侧由插件发起的 delegation** —— 而那正是坏掉的那条路。
2. **preset 里任何"收窄工具面"的定制，都要检查它是否误伤插件的 subagent。**
   `tool-bootstrap` / `context-gate` 的 `includeSubagents` 是"为评测轨迹设计"的开关，
   在真实使用里会与"插件 spawn subagent 并要求它调特定工具"直接冲突。
3. **`anchor` 类 preset 的 `includeSubagents: true` 是高风险默认**：
   它把 subagent 也拉进"第一轮最小工具面"，而 subagent 往往是短命的单次任务，
   等不到 promote 就结束了。
