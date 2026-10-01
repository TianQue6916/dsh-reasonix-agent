---
id: mem-d0730617f6492d9d0d67f763f5c02f18
revision: 1
created_at: "2026-10-01T12:43:33.037Z"
updated_at: "2026-10-01T12:43:33.037Z"
name: dsh-pre-step-prepend-vs-mnemon-20261001
description: "agent/pre-step 用 {prepend:true} 抢最外层：thinking-anchor 被 dsh-mnemon 顶离采样点的机制与修法"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 现象
desktop 的 turn **首步**注入顺序是 `anchor → (MNEMON 提示) → (MNEMON RUNTIME MEMORY SNAPSHOT) → git-context → anchor`，
锚点被 `dsh-mnemon` 顶离采样点；后续 step 才恢复正常（`git-context → anchor`）。首步恰恰是决定 reasoning 首块语言的那一步。

## 机制
dsh 的 `agent/pre-step` 是 waterfall：handler 依次 `await next()`，after-next transform 按**注册顺序的逆序**执行 —— 先注册的是最外层、最后改写结果、消息最终更靠后。
但 `ctx.on(name, fn, opts)` 支持 `opts.prepend`：`prepend: true` 把 handler **unshift** 到 listener 数组头部。
`dsh-mnemon` 就是这么干的（`dsh-mnemon/lib/index.js:5346`）→ 不管它在 cordis.yml 里排多靠后，都稳坐最外层。

## 修法（2026-10-01）
`~/.dsh/.agent-presets/anchored-standard/thinking-anchor.mjs` 的注册也加 `{ prepend: true }`（末尾 `}, { prepend: true })`）。
排序依据：`~/.dsh/profiles/web/cordis.yml` 顶层 list 里 `mnemon-bundle` 排在 `preset-anchored-standard` **之前** mount → 本行后注册 → 后 unshift → 在数组头部 → 最外层 → 锚点落在最后。
备份 `thinking-anchor.mjs.bak-20261001-2042-pre-prepend`；测试加段 [11] 断言 `hookOpts.prepend === true` 且 `agent/pre-step` 只有一个注册点（44 passed / 0 failed）。
**`.agent-presets/**/*.mjs` 不参与 `patchReload: live` 的 HMR —— 必须重启 dsh 进程才加载新代码。**

## 通则
在 dsh 的 agent preset 里抢「最靠近采样点」的位置，光靠 cordis.yml 里的先后顺序不够；
必须用 `{ prepend: true }`，并依赖 `cordis.yml` 顶层加载顺序保证自己**后**注册（后 unshift 者在外层）。
日后新增别的 pre-step 注入行，同样要按这个规则抢位。

## 踩坑记录
`str_replace_editor` 的 str_replace 对含 `**` / 全角字符的多行中文注释块反复报 "did not appear verbatim"（CRLF 路线问题）；
改用 python 脚本做精确替换（写 `~/.dsh/tmp-probe/*.py`，用 `assert s.count(OLD)==1` 兜底）才稳定。
