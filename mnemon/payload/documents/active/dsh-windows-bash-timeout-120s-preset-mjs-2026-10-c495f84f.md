---
id: "c495f84f-f1d3-4172-b021-244be70b0002"
title: "dsh Windows bash 工具无 timeout 参数（120s 硬默认）与 preset .mjs 的会话生效边界（2026-10-29 取证）"
description: "Windows 上模型-facing bash（custom-bash.mjs）的 schema 只有 command/workdir、config 未设 timeoutMs 因而吃 DEFAULT_TIMEOUT_MS=120000、instruction 层零约束——三层证据链与修法成本对比；另附 preset 层 .mjs 改动对已存在会话不生效（需开新会话，\"需重启\"结论已被实测证伪）的判据。"
status: "active"
created_at: "2026-10-28T18:11:08.646Z"
updated_at: "2026-10-28T18:11:08.646Z"
content_hash: "96169ee60f61cc340fa026237225e66a6c59ec9528a02511248d21637d739193"
source_paths:
  - ".dsh/.agent-presets/anchored-standard/custom-bash.mjs"
  - ".dsh/.agent-presets/anchored-standard/concurrency-discipline.mjs"
  - ".dsh/.agent-presets/anchored-standard/tool-bootstrap.mjs"
  - ".dsh/profiles/desktop/cordis.patch.yml"
  - ".dsh/profiles/web/cordis.patch.yml"
session_ids:
  - "a3e7c1c5-624d-495b-ae10-d5c2302a8f13"
memory_body_ids:
  []
---

# dsh Windows bash 工具无 timeout 参数，与 preset .mjs 的会话生效边界

本机 Windows（`C:\Users\27063`，Git Bash）实机取证，2026-10-29。起因是用户观察：「很多会话调用命令不再加 timeout」，怀疑提示词约束不足。

## 结论一：不是提示词约束不够，是结构上模型拿不到 timeout

Windows 上模型-facing 的 `bash` 由 **`custom-bash.mjs`** 注册（不是 persistent shell）：

```
profiles/desktop/cordis.patch.yml:489-491
  - id: custom-bash
    name: ../../.agent-presets/anchored-standard/custom-bash.mjs
    disabled: !!js process.platform !== 'win32'
```

**① schema 层** —— `custom-bash.mjs` 的 `commandSchema` 只有两个属性，且 `additionalProperties: false`：

```js
const commandSchema = {
  type: 'object',
  properties: {
    command: { type: 'string', ... },
    workdir: { type: 'string', ... },
  },
  required: ['command'],
  additionalProperties: false,   // 硬传 timeout 会被 schema 直接拒
}
```

**② config 层** —— 那一行没有 `config:`，所以走模块默认值：

```js
custom-bash.mjs:54   const DEFAULT_TIMEOUT_MS = 120000
custom-bash.mjs:122  const timeoutMs = Number.isSafeInteger(config?.timeoutMs) && config.timeoutMs > 0
                         ? config.timeoutMs : DEFAULT_TIMEOUT_MS
```

对照同文件 `:461` 的 `terminal-bash` 与 `:466` 的 `persistent-bash` 都配了 `timeoutMs: 300000`，但二者在 Windows 上 `disabled`（PTY 是 linux/darwin-only，见 `:443-445` 注释）。⇒ **Windows 实际硬超时 = 120s**，与 linux 的 300s 不一致。

**③ instruction 层** —— grep 遍所有 preset `.mjs` 与两个 profile patch，`timeout` 命中全是插件内部常量（`GIT_TIMEOUT_MS = 3000`、`stall-guard` 的 `stallMs = 240000`、`memory` 的 `timeout: 2000`），**面向模型的约束为零**。

推论：长会话里 `timeout N` 前缀的衰减（最近的 N 条 bash 调用都不带前缀 → few-shot 自我强化）没有任何结构支撑可抵抗。后果分级：命令挂住（等 stdin / 网络 / ssh）→ 挂满 120s 被 kill；需要 >120s 的命令（大项目 `pnpm install`、全量 `vitest`）→ 被误杀。

## 修法（成本递增，2026-10-29 时点尚未落地，方案待用户拍板阈值）

| 层 | 改法 | 生效时机 | 代价 |
|---|---|---|---|
| instruction | `concurrency-discipline.mjs` 的 TEXT（或 persona）加「可能 >60s 的命令必须 `timeout N` 前缀，N ≈ 预期 × 3」 | 新会话 | 极低 |
| config | `cordis.patch.yml:489` 的 `custom-bash` 加 `config: { timeoutMs: 300000 }`，与 persistent-bash 对齐 | **live** | 极低 |
| schema | `commandSchema.properties` 加 `timeout: {type:'integer'}`，`apply()` 里 `Math.min(模型值, config 上限)` | 新会话（`.mjs`） | 中 |

建议方向（曾提出、未最终采纳）：instruction + config 两刀同下；schema 那刀不做 —— `timeout N` 前缀是通用 bash 习惯、可跨工具迁移，而 schema 参数只在这个工具里有效。

## 结论二：preset 层 `.mjs` 改动对**已存在**会话不生效，准确说法是「要开新会话」而非「要重启」

判据（实测，两条互斥证据同时成立）：

- `dsh` 进程 pid 19924 启动于 **2026-10-29 00:00:23**；`tool-bootstrap.mjs` mtime **00:48:52**（晚 48 分钟）—— 且改后 `compress` 在旧进程里实测可用。⇒ 旧计划的「`.mjs` 不参与 HMR 必须重启」被**证伪**（PLAN.md 已改）。
- 对照：本会话 `session-3315a426-...` 目录 born = **2026-10-28 16:21:58**，而 `concurrency-discipline.mjs` mtime = **2026-10-29 01:37:49**（晚 9 小时）；该会话这一步收到的注入文本仍是旧版「并发 ≤ 3、社区实测 5–7 路恶化」。⇒ 已有的 session 拿不到新版。

工作机制推测（未定案）：新会话创建时重新 `import` 模块，而 ESM 的 import cache 被 dsh 在 URL 上附加时间戳/版本参数绕过；HMR 只覆盖 client-plugin 与可重载层，preset 的 `.mjs` 走「新会话重新 import」这条路。

实践含义：改 preset `.mjs` 后要**验证新行为必须开新会话**；不要用「旧会话里没变」当作改动失败或需要重启的证据。

## 相关文档

- `fc0a8a83-84ea-44c4-86a0-9ff1fe82d097` —— 同一 patch 层（`profiles/*/cordis.patch.yml`）的另一处 Windows 根因取证与两地 patch 同步方法，可作 patch 改写风格参考。
