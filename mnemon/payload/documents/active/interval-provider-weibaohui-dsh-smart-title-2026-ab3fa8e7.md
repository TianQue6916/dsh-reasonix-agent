---
id: "ab3fa8e7-881a-4ca2-b7d1-2568e27e61d7"
title: "会话标题降频选型与落地：拒用 interval provider，改 @weibaohui/dsh-smart-title + 本地放宽节流上限（2026-10-29）"
description: "2026-10-29 为把会话标题 LLM 刷新从「每条 human message（实测约 203 次/天）」降到「每天一次」：否决 npm 上的 session-title-interval-llm（宿主只允许 first-prompt/all-prompts cadence），手工安装 @weibaohui/dsh-smart-title@0.1.9 并接管内建 session-title-llm 行，本地把 refreshMinIntervalMs 上限 1h→24h（三处 + 行内注释导致 SyntaxError 的教训）、绕开 pnpm gitFetcher 的手工装法、web/desktop 两 profile 状态、验证与回滚步骤。"
status: "active"
created_at: "2026-10-29T10:05:44.236Z"
updated_at: "2026-10-29T10:05:44.236Z"
content_hash: "1a84973fef708d406ca0eaead2f57c78971d8e4e28863ce032ea4a0523231c04"
source_paths:
  - "profiles/web/node_modules/@weibaohui/dsh-smart-title/src/index.js"
  - "profiles/web/cordis.patch.yml"
  - "profiles/desktop/cordis.patch.yml"
  - "profiles/desktop/package.json"
session_ids:
  - "ffe62147-34a3-41c7-a0c3-74069d297b1e"
memory_body_ids:
  []
---

# 会话标题降频：选型与落地（2026-10-29）

关联文档：`b028b5a5-54fd-4679-aeca-79e8b6d7958a`（desktop profile 手动安装 bundle 型插件的同款流程：pnpm 挂起规避 / bundles 数组补写 / 重启边界）、`cab1ac23-02b0-4ab7-b36f-5b47612c7b71`（cordis.patch.yml CRLF 混行导致字节替换失败）。

## 目标与判定

把「每轮对话都让 LLM 重写会话标题」的刷新频率降到每天一次量级。基线：原装的 `session-title` all-prompts 路线在**每条 human message** 触发，无节流、长会话不冻结，实测约 **203 次/天**；目标 10–30 次/天，可调到 24h。

## 选型结论：interval cadence 不可用

- npm 上的 `dsh-session-title-interval-llm` **已 404**（`npm view` 实测），只能 `github:` 源码安装，0★、08-21 后无更新。
- 更硬的否决理由：它注册第三种 cadence `interval`，而当前宿主 `@deepseek-ai/dsh-session-title/lib/index.js:600` 只接受两种：

```js
if (candidate.automatic !== "first-prompt" && candidate.automatic !== "all-prompts")
  throw new Error("session-title provider automatic mode is invalid");
```

装上会直接 throw，插件加载失败（plugin tree failed to load）。**判据**：给 session-title 注册提供方前，先核对宿主允许的 `automatic` 枚举，而不是只看插件 README。

## 采用方案：@weibaohui/dsh-smart-title@0.1.9

机制上绕开 cadence 限制：

- 注册的 provider 仍是 `automatic: 'first-prompt'`（官方节奏，首条消息即时出题），不参与 each-message 调度；
- 自己订阅 `session/event` 的 `turn/end` 对「用户消息 + 助手回答」全转写做总结刷新；
- 两道闸：`isFrozen(countUserTurns(session), cfg.refreshMaxTurns)`（默认 100 轮后冻结，回填不受限）与 `isThrottled(lastGenerateAt.get(sid), Date.now(), cfg.refreshMinIntervalMs)`；节流同时也消掉首轮 first-prompt 首题 + turn/end 的背靠背重复生成；
- 附带：同题静默跳过、失败重试、用户手动改名不被覆盖、可选启动回填、独立 provider/model 配置、settings 页可视化。

包属性：零 dependencies / 零 peerDependencies、纯 JS、`main: src/index.js`、`exports` 含 `./client`；`engines` 为范围 `dsh: >=0.1.7-rc.2`（不是精确值）。

## bundle patch：接管内建提供方

`cordis.patch.yml` 做两件事，缺一不可：

```yaml
- insert:
    - id: dsh-smart-title
      name: '@weibaohui/dsh-smart-title'
- id: session-title-llm
  disabled: true
```

原因：sessionTitle 注册表**只允许一个**提供方，base 组合默认挂了 `dsh-session-title-first-prompt-llm`（行 id `session-title-llm`），第二个 register 立即抛错。用**同 id 覆盖 + disabled**（last write wins，对齐 dsh-continue 复用 compaction-basic 行的机制）让内建行让位；卸载本插件时该 patch 层随之移除，内建自动恢复。插件是 HOST-PLANE，必须进宿主组合（insert），绝不进 agent preset。

## 本地改动（三处，packages 内直接改）

官方 `settingsSchema` 上限只到 1 小时，做不到「一天一次」，故就地放宽：

| 位置 | 原值 | 改后 |
|---|---|---|
| `DEFAULTS.refreshMinIntervalMs` | `120000` | `3600000` |
| `settingsSchema` 的 `.max()` | `3600000` | `86400000`（24h） |
| `NUM_RANGES.refreshMinIntervalMs`（PUT /settings 白名单夹取） | `[0, 3600000]` | `[0, 86400000]` |

第 161 行原为 `refreshMaxTurns`，说明 Schema 上限与 DEFAULTS、NUM_RANGES 三处是同一数值的三份副本，改一处必然不一致。

**踩坑（重要）**：第一版替换时把行尾逗号一起注释掉，`node --check` 报 `SyntaxError: Unexpected identifier 'refreshMaxTurns'`。教训：给第三方包打补丁**不要把注释留在行内**（行尾 `//` 会吃掉后续逗号/续行）；每改必 `node --check`，两 profile 都验。

## 安装方式：手抄 node_modules，绕过 pnpm

`pnpm remove/add` 全程被 `gitFetcher` 卡死——`dsh-headroom` 是 `git+https` 依赖，代理近期常报 429，导致 `dsh: plugin command failed`（日志在 `profiles/<p>/ .plugin-manager/logs/operation-*/pnpm.log`）。因此：

1. 解包后把 `src` / `client` / `cordis.patch.yml` / `package.json` / `README.md` / `LICENSE` 直接复制到 `profiles/{web,desktop}/node_modules/@weibaohui/dsh-smart-title`；
2. 同步两 profile 的 `package.json` deps 末尾与 `bundles` 数组（缺 bundles 行则 loader 不加载）；
3. 两个 profile 的 `cordis.patch.yml` 同样补 patch；
4. 不能用 pnpm 时，`node --check` 是唯一低成本语法门；冒烟看 `[trace] [dsh-smart-title] armed {"pid":…,"llmAvailable":true}`。

## 状态与边界

- web profile：包、package.json、patch 就位，`--dump-config` 无 `session-title-llm` 冲突告警，冒烟通过、armed。
- desktop profile：包与 package.json、patch 同步完成，**需用户重启桌面 App** 才加载。
- 其余历史遗留：`profiles/web/cordis.patch.yml` 曾有 `entry "optional-session-title-all-prompts" not found` 告警，通过整段注释消除。
- 设置入口：设置 → 插件 → 智能会话标题 → 「刷新最小间隔」填 `86400000` 即一天一次（默认 1h）。

## 验证与回滚

```bash
python ~/.dsh-lab/tmp/verify-title-audit.py   # titleProvider 是否变成 dsh-smart-title
python ~/.dsh-lab/tmp/title-usage.py          # 跑一天后对比 LLM 调用次数
```

回滚分两级：只把节流改回默认 2 分钟（改回三处常量并 `node --check`）；或整体退回 all-prompts bundle（从 `~/.dsh-lab/backup-title-c-*/web/` 复制 `package.json` 与 `cordis.patch.yml` 覆盖 profile）。**升级插件会覆盖 node_modules 内的三处改动**，升级后须重打并复验。
