---
id: "7ffee013-e0cd-425c-9209-1bce9cc84239"
title: "plan-anchor.mjs 实现交接：每步重注入 PLAN.md head 的 anchored-standard 插件（设计取舍、cordis 注册顺序语义、自测缺陷与重启验收）"
description: "2026-10-01 完成的 plan-anchor 插件实现交接：在 ~/.dsh/.agent-presets/anchored-standard/plan-anchor.mjs 用 agent/pre-step + {prepend:true} 每步把 $DSH_HOME/PLAN.md 的 head（30 行）追加为 source.kind='plan-anchor' 的 user 消息；含从 OthmanAdi/planning-with-files 抄的 4 条社区经验与故意未抄的 completion gate、cordis 逆序注册的语义推导与源码坐实、overByteLimit 判定时机的真缺陷、72 断言测试、双 profile 注册与 dump-config 证据、以及重启后的 5 条验收清单。"
status: "active"
created_at: "2026-10-01T13:17:47.990Z"
updated_at: "2026-10-01T13:17:47.990Z"
content_hash: "beb387d83ff015fdac7b92f5263f926b80a4bce4a41fd20731add6b1f5d41e7c"
source_paths:
  - ".agent-presets/anchored-standard/plan-anchor.mjs"
  - "storages/tools/test-plan-anchor.mjs"
  - "PLAN.md"
  - "profiles/web/cordis.patch.yml"
  - "profiles/desktop/cordis.patch.yml"
session_ids:
  - "44888c6c-8bc2-4591-b164-fffd4fbd1992"
memory_body_ids:
  []
---

# plan-anchor.mjs：每步重注入 PLAN.md head 的插件（实现交接）

2026-10-01 完成。承前：选型调研与 A/B/C 三杠杆见关联文档 `19c32572`（该文留下「未决的 A/B 选择题」与「自建 plan-anchor 建议」）；本文记录**已落地**的实现、设计依据与落地证据。

用户在本轮的要求（m00001，历史记录）：同意推进，但「可以。不过要注意社区经验」——即实现必须逐条对应社区项目的实证做法，而不是自创。

## 交付物

| 文件 | 内容 |
|---|---|
| `~/.dsh/.agent-presets/anchored-standard/plan-anchor.mjs` | 新插件行：`agent/pre-step` + `{ prepend: true }`，每步把 `$DSH_HOME/PLAN.md` 的 head 追加为 `source.kind='plan-anchor'` 的 user 消息 |
| `~/.dsh/storages/tools/test-plan-anchor.mjs` | **72 断言，全过**（`[EXIT=0]`，终态 `72 passed, 0 failed`） |
| `~/.dsh/PLAN.md` | 2213 B / 37 行，写的是当时真实状态（含本轮待办） |
| `~/.dsh/profiles/web/cordis.patch.yml` | `- id: plan-anchor` 块 + `allowKinds` 加 `plan-anchor`；备份 `.bak-<ts>-pre-plan-anchor` |
| `~/.dsh/profiles/desktop/cordis.patch.yml` | 同上（与 web 保持同步） |

## 从社区经验抄来的 4 条（OthmanAdi/planning-with-files ★27229，v3.21.0）

1. **每轮重注入**（其 README 原文 "per-turn re-injection against context rot"）→ 落在 dsh 的 `agent/pre-step`。
2. **head 剂量**（其 `inject-plan.sh` 头注释 `pretool — short plan head only (head -30)`）→ 默认取前 30 行，**不给全文**。理由：dsh 每 step 都跑，给全文等于每步重发全文、token 与注意力双重浪费。
3. **可验证包裹**（其第 1076-1089 行）→ 逐字对应成
   `===BEGIN-PLAN-DATA file=… bytes=… lines=… head=… sha256=… truncated=yes|no===`
   关键性质：**`sha256` 取全文摘要而非 head 摘要**——配合 `truncated` 让模型能自证「我看到的是不是最新、有没有被裁」。测试 [4] 专门锁死这条：head 相同但全文不同 → sha256 必须不同。
4. **fail-closed**（其 "a broken pin fails closed rather than selecting another plan"）→ 读不到 / 空文件 / 路径是目录 / 抛异常，一律静默跳过，**绝不用旧内容顶替**（`readPlan()` 三态：非空文件→原文；不存在或只有空白→`null`；catch 兜底）。`stats.skipped` 计数可观测。

**故意没抄**：它的 completion gate（Stop hook 拒绝停止）。dsh 的等价物是 `agent/turn-stopping` + `agent.steer()`，机制已查证为真——`dsh-agent-loop/lib/index.js:999-1005` 在 dispatch 之后**重新检查** `inbox.nextStep.length`，listener 里 steer 进 inbox 就能阻止 break。但改的是 loop 终止行为，风险等级不同，**留作独立的 gate 行**，不并入本条。

## 注册顺序是语义，不是排版（本轮最容易被误改的地方）

- cordis 的 `agent/pre-step` after-next transform 按**注册顺序的逆序**执行：先注册 = 最外层 = 最后改写结果 = 消息最靠后（最贴采样点）。
- 源码坐实：`@deepseek-ai/cordis/lib/index.js:336` `const method = options.prepend ? "unshift" : "push";`；`:372` `if (typeof options !== "object") options = { prepend: options };` ⇒ `{ prepend: true }` = unshift 到 listener 头部 = 外层 = 最后改写。
- 因此 YAML 里 **`plan-anchor` 必须写在 `thinking-anchor` 之前**，最终消息序为 `git-context → plan-anchor → thinking-anchor`（thinking-anchor 最贴采样点）。把 plan-anchor 挪到 thinking-anchor 之后，会让 thinking-anchor 变成最后改写者被推前，语言锚点失效。
- `context-gate` 的 `allowKinds` 需同时含两个锚点：`allowKinds: [ skill-invocation, thinking-anchor, plan-anchor ]`——第一轮（unpromoted）也要留下 thinking-anchor，因为首块语言决定后续锁定。

## 自测抓出的真缺陷（1 个）

`overByteLimit` 判定时机错了：原本在 `frame()` 里用 `Buffer.byteLength(shown) > maxBytes` 判断，但那时 `shown` **已经裁过**，必然 ≤ maxBytes → 永远算不出「这次是被字节上限裁的」。修法：在 `render()` 裁剪**之前**定下该标志并作为参数传入。另 3 处失败（`\n===END-PLAN-DATA===\n` 的前后换行断言、`split('===\\n')[1]` 取段、消息条数 4 vs 3）都是**测试断言自己写错**，非代码缺陷，已单独说明。

## 去重（habituation 防线）

transcript 只增不改，累加会让每步锚点退化成噪声。做法：注入前先剪掉本行此前注入的消息，判定只认自己的 `message.source.kind === 'plan-anchor'`，**绝不误删** thinking-anchor、git-context 或真实 user 消息（测试 [7]/[10] 锁死）。`cfg.pruneHistory: false` 可关闭。

## 落地证据

- **dry-run 真实 PLAN.md**：输入 2213 B / 37 行 → 注入 2289 B，`truncated=yes`，末行给出「要看全文自己 read，不要凭这截断段猜测后面的内容」。
- **`dsh --profile web --dump-config`**（新进程真解析 YAML）：line 1886-1887 `allowKinds` 含两个锚点，**line 1888 `id: plan-anchor` 在 line 1892 `id: thinking-anchor` 之前** ✓。
- 两个 profile 的 YAML 结构校验：`plan-anchor=1 thinking-anchor=1 allowKinds=1 planBeforeThinking=true`。
- desktop profile 由 Electron 应用独占管理，`dsh --profile desktop --dump-config` **不可用**，故 desktop 侧校验只能是「YAML 结构 + 与 web 的逐段 diff」。

## 改 PLAN.md 不需要重启

`readPlan()` 逐 step 现读、**无缓存**。刻意不用 `mtimeMs:size` 当缓存键——thinking-anchor 踩过这个坑：`{"thinking":"zh"}` 与 `{"thinking":"en"}` **恰好同为 17 字节**，同毫秒切换会键相同而内容已变，读回上一个值。属于「为微优化引入一类静默错判」，不值当。

## 重启后的 5 条验收（本轮结束时尚未执行）

```
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\.dsh\storages\tools\restart-desktop.ps1"   # desktop
# web：终端 Ctrl+C 后重跑 dsh web
```

1. `skill_search` 对 `hindsight` / `microsoft-foundry` / `deja-history` / `deja-search` 零命中；
2. 新 session **turn 首步**注入顺序 = `git-context → plan-anchor → thinking-anchor`；
3. 无 `deja.exe` 被拉起；
4. reasoning 首块 CJK（重启前基线：首块中位 0.440 / 中文主导 44.8%）；
5. **plan-anchor 真的落盘**：`session.v4.jsonl.zstd` 里应出现 `source.kind='plan-anchor'`，且每步只有一条（旧条被剪）。

另在 `.reasonix` 全局记忆落了一条 `plan-anchor-plugin-20261001`（revision 1, scope global）。

## 复现要点 / 教训

- 新插件行要先写独立测试脚本（`~/.dsh/storages/tools/test-*.mjs`）再注册进 profile；本轮 72 断言全过才动 YAML。
- 挨着 `agent/pre-step` 的插件行，**注册位置必须写进注释说明其语义**，否则后续顺手挪动会静默改变注入顺序。
- 自己的断言写错会伪装成代码失败——先把失败逐个归因到「代码 vs 断言」再改代码。
