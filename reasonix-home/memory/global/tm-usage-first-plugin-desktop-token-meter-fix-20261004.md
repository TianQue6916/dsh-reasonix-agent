---
id: mem-4e317132d95a9450cf2389ae6deb21c7
revision: 1
created_at: "2026-10-04T07:46:02.530Z"
updated_at: "2026-10-04T07:46:02.530Z"
name: tm-usage-first-plugin-desktop-token-meter-fix-20261004
description: "desktop App 从 app.asar 加载 core ⇒ 文件 patch 无效；改用 profile-level plugin 包装 ctx.tokenMeter.measure 覆盖两侧"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 问题
auto-compaction 在真实上下文占用 10–16% 时就触发（用户看到「上下文消失」）。
根因：`dsh-token-meter/lib/index.js` 的 usage 分支被门控
`baseline = usage !== void 0 && usageTokens(usage) >= estimatedAnchorTokens ? {kind:"usage"} : {kind:"estimated"}`，
而 per-step 注入（plan-anchor / git-context / thinking-anchor）把 char-based（CHARS_PER_TOKEN=4）估算撑到真实的 3–10× ⇒ 长会话永远走 estimated 分支。
生产证据（session a0d5fbf8，14 次 compaction）：前 10 次 ratio 0.60–0.76（健康），10-03 起 4 次 ratio 9.26–10.56、触发点 10.0–15.7%。
判据链：`dsh-compaction-basic/lib/index.js:940-941` → `resolveCompactSpec` 的 `min(W·0.8, W−O−65536)`。

## ★ 结构性障碍：desktop App 不走 profiles/node_modules
desktop host（pid 2792）commandline = `"…\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\lib\index.js" "…\resources\app.asar\dsh"` ⇒ **core root = `app.asar/dsh`**。
asar 内 `/dsh/node_modules/@deepseek-ai/dsh-token-meter/lib/index.js` = size 31507 / offset 55888972 ⇒ 与 patch 前备份同字节数 = 未打补丁原版。
`app.asar.unpacked/dsh/node_modules/` 里**没有** token-meter ⇒ 无法用 unpacked 覆盖。
Node 解析规则下引用者位于 `app.asar/dsh/node_modules/@deepseek-ai/dsh-agent-loop/lib/` ⇒ 向上半步就命中 `app.asar/dsh/node_modules/`，**永不走到 `~/.dsh/profiles/node_modules/`**。
asar 被运行中的 App 锁住（`File.Open(...,'ReadWrite','None')` → "being used by another process"）⇒ 改 asar 必须关 App。
（asar 头读法：u32@0=4 / u32@4=headerSize / u32@8=jsonLen；**JSON 正文从偏移 16 开始**，必须 `json.JSONDecoder().raw_decode(...)`，`json.loads` 会报 Extra data。entry 带 integrity: SHA256 hash + blockSize 4194304 + blocks[]。`DeepSeek Harness.exe` 内 `ELECTRONASAR` 0 命中 ⇒ 未启用 embedded asar integrity 校验；Electron 44.0.0。）

## 解法（已落盘）：profile-level plugin 包装活的 service
`~/.dsh/plugins/tm-usage-first.mjs`（3990 B）—— `export const name = 'tm-usage-first'; export const inject = ['tokenMeter'];`
包装 `meter.measure`：若返回 `baseline.kind === 'estimated'` 则 `meter._sync(session)?.anchor?.usage` 取真实 usage，
用 `usageTokens = input+cacheRead+cacheWrite+output` 重算，返回 `{...m, baseline:{kind:'usage',tokens,usage}, totalTokens: Math.max(0, tokens + (m.surfaceDeltaTokens ?? 0))}`；
已是 usage ⇒ fast path；`_sync` 缺失/抛错 ⇒ 降级不传播；`Symbol.for('tm-usage-first.wrapped')` 幂等；`meter.tmUsageFirstStats()` 暴露计数器。
**为什么必然生效**：`dsh-compaction-basic/lib/index.js:918 const meter = this.ctx.tokenMeter; :919 let measurement = meter.measure(agent.session);` —— 每次运行现取 ⇒ 运行时猴补有效。
`_sync` 是增量重放（`while (state.consumedEvents < session.seq) …`）⇒ O(1) 摊销，wrapper 里调用安全。

## 挂载与验证
`~/.dsh/storages/tools/patch-tm-usage-first.py`（--check/--apply/--verify/--restore）追加到 `profiles/{web,desktop}/cordis.patch.yml` **末尾**（最后应用 ⇒ 优先级最高）。已 apply：web 66878→67986 B、desktop 66917→68025 B。
**★ cordis patch 语义**：`- insert:` 顶层块 = 新增 entry（列表里是完整 entry）；`- id: x` 顶层块 = **只能覆盖已有 id**，用 overlay 新增会静默忽略（`patch: entry "tm-usage-first" not found`）。
**相对路径基准 = 声明它的 patch 文件所在目录**（写在 profiles/web/ 里则 `../../plugins/` = `~/.dsh/plugins/`）；用绝对路径最稳。`~/.dsh/plugins/` 不在任何自动扫描面。

自测：`storages/tools/test-tm-usage-first.mjs` → **18 passed / 0 failed**（含 surfaceDeltaTokens 保留、_sync 抛错不传播、幂等、无 service 静默 no-op）。
真实 headless 探针 `plugins/tm-verify.mjs`（未接入任何 profile）→ `tm-verify.log` 三行 `{"ev":"loaded","ctor":"TokenMeter","hasMeasure":true}` / `{"ev":"wrapped",...}` / `{"ev":"pre-step",...}` ⇒ 接线成功。
`--profile web --dump-config`（exit=0 / 79614 B）第 2227-2228 行 = `- id: tm-usage-first` / `name: file:///C:/Users/27063/.dsh/plugins/tm-usage-first.mjs`。
⚠️ `--profile desktop --dump-config` 被 `lib/bin.js:36` 硬拦（`error: profile "desktop" is managed exclusively by the Electron application`）⇒ desktop 只能靠重启后行为验收。

## 生效条件与验收
**两侧各需一次重启**。验收：
`python ~/.dsh/storages/tools/compaction-audit.py --since <重启时刻> --assert-usage-first`
（期望 ratio ≈ 1.0、触发点落在窗口 ≥55%）。`--assert-legacy-inflation` 用于固化旧行为对照。

## 残留
`usageTokens()` 含 `outputTokens`（`lib/index.js:593`）而阈值已扣预留输出 ⇒ output 计两次（<1%）；usage 为 undefined 时仍回退 estimated。
脚本坑：Git Bash 里 `$TEMP` = `/tmp` 会 Permission denied，必须写 `/c/Users/27063/AppData/Local/Temp`。
