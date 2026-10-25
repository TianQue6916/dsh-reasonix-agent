---
id: "84ba645c-8ee3-4cb2-9703-ebd0efe73a09"
title: "dsh 插件依赖 file: vs link:——pnpm 目录物化导致源码改动不生效（goat-panel 案例，2026-10-02）"
description: "2026-10-02 定位「goat-panel 面板渲染旧代码」的真根因：profiles/{web,desktop}/package.json 用 file: 声明本地插件目录，pnpm 将其物化成真实目录拷贝，源目录改动永不生效；含 file:→link: 的根治步骤、lockfile 证据、junction 验证方法、bash+PowerShell 引号测量陷阱，以及 dsh-thinking-language 同类隐患。"
status: "active"
created_at: "2026-10-02T08:13:19.182Z"
updated_at: "2026-10-02T08:13:19.182Z"
content_hash: "c26767380e03a6c35b6eca253e65e04e3ca8ae7dd61f58e0db20a115f384c864"
source_paths:
  - "profiles/web/package.json"
  - "profiles/desktop/package.json"
  - "profiles/web/pnpm-lock.yaml"
  - "profiles/desktop/pnpm-lock.yaml"
  - "PLAN.md"
session_ids:
  - "85a20d57-55ff-483c-a588-9de220dfb57b"
memory_body_ids:
  []
---

# dsh 插件依赖 `file:` vs `link:`（2026-10-02）

状态：**已修并验证到「dump-config 干净 + junction 到位」，剩一步只能由用户做（重启 web 进程）**。

关联文档：`ccaf7418-968f-43b9-b194-486ffe04727c`（desktop profile 移植/Electron 独占守卫）、`b028b5a5-54fd-4679-aeca-79e8b6d7958a`（desktop 手动安装 bundle 型插件）、`6471b357-f586-4315-a59d-42143704ee5a`（pnpm install 冲掉 node_modules patch）。

## 1. 症状

GOAT 额度面板里 `deepseek-official` 行渲染错误：显示 `5h 0% / 周 0% / 月 0% / 余 0.00`，且「窗口重置：5h · 周」后面时间为空。数据层其实是对的——`curl http://127.0.0.1:8790/quota` 的 official 行本就是余额制：

```
kind=official, plan=official-balance, currency=CNY,
available=-0.22, granted=0, toppedUp=-0.22, apiAvailable=false,
fiveHourUsed/Cap/Reset = null, weekly*/month* = null
```

所有窗口字段本来是 `null`，是**旧代码硬按套餐渲染**了它：`pctFine(null,null)` → `"0"`、`n2(null)` → `"0.00"`、`fmtReset(null)` → `""`（名字拼出来、时间空着）。

## 2. 根因：`file:` 目录依赖被 pnpm 物化

`profiles/{web,desktop}/package.json` 原声明：

```jsonc
"@local/dsh-plugin-goat-panel": "file:D:/Toolbox/goat-gateway/dsh-plugin-goat-panel"
```

pnpm 对 **`file:` 的目录依赖**会把它物化成 `node_modules` 下的**真实目录**（拷贝/硬链进 store），而不是指向源目录的链接 ⇒ 源目录改了，`node_modules` 里那份永远不变。对照组 `dsh-plugin-local-search` 用 `link:` 声明，在 `node_modules` 里就是 Junction，从没出过这问题。

## 3. 证据（新旧代码对比）

| 路径 | client.js 大小/时间 | sha256[:8] |
|---|---|---|
| 源 `D:\Toolbox\goat-gateway\dsh-plugin-goat-panel\lib\client.js` | 12371 B, Oct 1 20:08 | `94d84544` |
| `profiles/{web,desktop}/node_modules/@local/dsh-plugin-goat-panel\lib\client.js` | 11100 B, **Sep 25 19:22** | `283840f5` |

新版源码里存在的、旧物化副本里缺失的分支：
- 过滤 official 行：`const worst = rows.reduce((m, r) => (r && !r.error && r.kind !== "official" ? ... : m), 0);`（weekly/hourly 同理，源文件 115–117 行）
- 余额行单独渲染：`const official = rows.find((r) => r && !r.error && r.kind === "official");`（119 行）与 `if (r.kind === "official") { ... 余额 ... 赠送 ... 充值 ... }`（154 行，注释「余额行：没有 5h/周/月 百分比，直接显示金额，避免渲染成 0%/NaN」）

修复后正确渲染应为：badge `GOAT 5h 13.5% · 周 26.7% · CNY-0.22`，详情行 `余额 CNY -0.22` / `赠送 0.00 · 充值 -0.22`。

lockfile 机制证据：`pnpm install --lockfile-only` 的 diff 把 `resolution: {directory: ..., type: directory}`（`file:` 的目录物化条目）换成 `version: link:D:/Toolbox/goat-gateway/dsh-plugin-goat-panel`。

## 4. 修复步骤（根治，只重建 junction 不够）

只建 junction 会在下次 `pnpm install` 时被 lockfile 打回拷贝 ⇒ 必须 package.json 与 pnpm-lock.yaml 同时写 `link:`，两个 profile 各自执行：

1. `package.json`：`"file:D:/..."` → `"link:D:/..."`
2. `pnpm install --lockfile-only`（让 lockfile specifier 也变 `link:`）
3. `pnpm install`（真正建出 junction）

回滚点：`profiles/web/pnpm-lock.yaml.bak-20261002-160945-pre-link`、`profiles/desktop/pnpm-lock.yaml.bak-20261002-161010-pre-link`，另有 `package.json.bak-*-pre-goatpanel-junction`。

## 5. 验证方法（可复用）

```
cmd //c "dir /AL C:\Users\27063\.dsh\profiles\web\node_modules\@local"
2026/10/02  16:09  <JUNCTION>  dsh-plugin-goat-panel [D:\Toolbox\goat-gateway\dsh-plugin-goat-panel]

web / desktop：均 JUNCTION，client.js = 12371 B / sha=94d84544
dsh --profile web --dump-config → exit=0，stderr 干净
```

## 6. 测量陷阱（本次踩过，教训）

在 bash 里用**双引号 + `\"` 拼 PowerShell 路径会静默拼错**，导致 `Get-Item` / `Test-Path` 假报 MISSING；据此曾误判「node_modules 被某个进程还原」，白花时间排查 git / plugin-manager。**查 junction 一律写 `.ps1` 文件（here-doc）或 `cmd //c "dir /AL"`**。此教训已写进 `PLAN.md`。

## 7. 遗留与未处理隐患

- **client bundle 不吃 HMR**：当前 web 会话跑的是 12:48:18 启动的进程，内存里仍是旧代码。必须**重启 dsh web** 才看到修复；desktop 需冷启动。
- `@local/dsh-thinking-language` 同样用 `file:`：web 里被物化成真实目录（Oct 1 14:26）、desktop 里却是 Junction，两 profile 行为不一致，web 那份改源目录不生效（当前内容恰好一致所以没爆）。未动它——它承载 thinking-language directive 注入，改坏会丢中文思考链注入，值得单独一次做 + 跟一次重启一起验。

## 8. 附带发现

- **官方 key 欠费是真实状态**，不是显示 bug：`available=-0.22 / granted=0 / toppedUp=-0.22 / apiAvailable=false`。
- 另一处**不同的**时间口径不一致未处理：`D:\Toolbox\goat-gateway\dsh-plugin-goat-quota\lib\index.js` 里 `goat_quota` 工具用 `toISOString().slice(5,16) + "Z"` 输出 **UTC** 重置时间，而面板走 `goat-usage.ps1` 的本地时间——两边差 8 小时。
