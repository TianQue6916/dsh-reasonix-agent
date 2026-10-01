---
id: mem-45683ef9960954189536f735466aa652
revision: 1
created_at: "2026-10-01T13:16:23.707Z"
updated_at: "2026-10-01T13:16:23.707Z"
name: plan-anchor-plugin-20261001
description: "自建 plan-anchor.mjs：把 PLAN.md 的 head 每步重注入采样点，治 context rot；72 断言全过，待重启"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 是什么
`~/.dsh/.agent-presets/anchored-standard/plan-anchor.mjs`（新文件）+ `~/.dsh/storages/tools/test-plan-anchor.mjs`（72 断言，全过，EXIT=0）+ `~/.dsh/PLAN.md`（1441 chars / 2213 B / 37 行）。

**杠杆 A（已落地）**：`agent/pre-step` + `{ prepend: true }` → 每步把 `$DSH_HOME/PLAN.md` 的 head（默认 30 行）作为 `source.kind='plan-anchor'` 的 user 消息追加到最贴采样点的位置。默认路径 `join(dshHome(), 'PLAN.md')`，可被 `cfg.path` 覆盖。

## 设计依据（社区经验，非凭空设计）
`OthmanAdi/planning-with-files` ★27229，v3.21.0，默认分支 **master**。抄了它四条：
1. **每轮重注入**对抗 context rot（其 README 原文 "per-turn re-injection against context rot"）→ 映到 dsh 的 `agent/pre-step`
2. **head 剂量**（其 `inject-plan.sh` 头注释 `pretool — short plan head only (head -30), no progress.`）→ 默认 30 行；不给全文（dsh 每 step 都跑，给全文 = 每步重发）
3. **可验证包裹**（其第 1076-1089 行）→ `===BEGIN-PLAN-DATA file=… bytes=… lines=… head=… sha256=… truncated=yes|no===`，`sha256` 是**全文**摘要（不是 head 的），配合 `truncated` 让模型能自证"这份是不是最新、有没有被裁"
4. **fail-closed**（其 "a broken pin fails closed rather than selecting another plan" / "nothing injected"）→ 读不到 / 空 / 抛异常一律**静默跳过**，绝不用旧内容顶替

**故意不做**：pwf 的 completion gate（Stop hook 拒绝停止）在本文件里没实现 —— dsh 的等价物是 `agent/turn-stopping` + `agent.steer()`（机制已验证：`dsh-agent-loop/lib/index.js:999-1005` dispatch 之后**重新检查** `inbox.nextStep.length`，listener 里 steer 进 inbox 就能阻止 break；官方样板见 `dsh-hooks-claude-code/lib/index.js:292-302`）。它会改变 loop 终止行为，风险等级不同，留作独立 gate 行。

## 自测抓出的真缺陷（1 个）
`render()` 里判定 `overByteLimit` 的时机错了：原本在 `frame()` 内用 `Buffer.byteLength(shown) > maxBytes` 判断，但那时 `shown` **已经裁过了**，必然 ≤ maxBytes → 永远算不出"这次是被字节上限裁的"。修法：`overByteLimit` 在 `render()` 裁剪**之前**定下并作为参数传给 `frame()`。
另 3 处失败是我自己的断言写错（`/\n===END-PLAN-DATA===\n/` 要求尾随换行但 END 在末尾；剪掉 2 条旧 anchor 后应为 3 条不是 4；`split('===\n')` 会在 END 处再切一刀）。

## 注册（两处，machine-local，不同步）
- `profiles/web/cordis.patch.yml` 与 `profiles/desktop/cordis.patch.yml`：`- id: plan-anchor` 块插在 `# ── thinking-language anchor` 段头注释**之前**（因为先注册 = 最外层 = 最后改写；**必须排在 thinking-anchor 之前**，语言契约优先级最高）
- 两处 `allowKinds: [ skill-invocation, thinking-anchor ]` → `[ skill-invocation, thinking-anchor, plan-anchor ]`
- 备份 `.bak-<ts>-pre-plan-anchor`
- **验证**：`dsh --profile web --dump-config | grep -n -i "plan-anchor\|thinking-anchor"` → line 1886-1893，`id: plan-anchor`(1888) 在 `id: thinking-anchor`(1892) **之前** ✓（dump-config 是新进程真解析，可信）

## 机制在 cordis 源码确认
`~/.dsh` 之外的 `~/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/cordis/lib/index.js`：
- `:336` `const method = options.prepend ? "unshift" : "push";`
- `:372` `if (typeof options !== "object") options = { prepend: options };`
- `:368` 注释 `@param options — listener options; a boolean is shorthand for prepend.`

⇒ `ctx.on(ev, fn, { prepend: true })` = unshift 到 listener 数组头部 = 外层 = **最后改写结果** = 消息最终最靠后。**desktop profile 的 dump-config 不可用**（Electron 独占），只能靠字符串校验 + 与 web 逐段 diff。

## 期待的重启后顺序
`git-context`(无 prepend，内层，最靠前) → `dsh-mnemon`(prepend，最早注册) → **plan-anchor** → **thinking-anchor**（最外层，最贴采样点）

## 待办
**重启 dsh 才生效**（`.agent-presets/**` 不参与 `patchReload: live` HMR）。重启后与另外四条一起核：`skill_search` 零命中 / 首步顺序 / 无 deja.exe / reasoning 首块 CJK。

## 改 PLAN.md 不需要重启
`readPlan()` 是逐 step 现读、无缓存（刻意不用 `mtimeMs:size` 当缓存键 —— thinking-anchor 踩过：两个不同 JSON 恰好同字节数时同毫秒切换会读回旧值）。
