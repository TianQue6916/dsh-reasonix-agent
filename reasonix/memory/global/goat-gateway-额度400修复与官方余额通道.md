---
id: mem-b30137f37059c46d7100aa7134e3bfd9
revision: 1
created_at: "2026-10-01T12:10:10.771Z"
updated_at: "2026-10-01T12:10:10.771Z"
name: goat-gateway-额度400修复与官方余额通道
description: "goat-gateway 认 400+insufficient credits 为额度耗尽并换 key；额度面板新增 deepseek-official 真实余额行（kind=official）；restart-all.ps1 延迟重启三件套"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## gateway.mjs：额度耗尽可能是 HTTP 400（2026-10-01 修复）

上游（individual-goat 计划）额度耗尽时返回的是 **HTTP 400** + `{"type":"invalid_request_error","message":"You have insufficient credits to make this request..."}`，而不是 402。
旧代码两个洞叠加：400 不在 `retryableStatus` 里（连 body 都不读就透传）、`cooldownReason` 只在 402 上判 quota ⇒ **耗尽的 key 永不冷却、永不换 key**，且 `state.sessions` 把 914 个会话钉死在它上面（163 的余量完全不可见）。

修法（`D:/Toolbox/goat-gateway/gateway.mjs`，全 CRLF，现 1465 行；备份 `gateway.mjs.bak-20261001-2030-pre-quota400`）：
- 新增 `function isQuotaExhausted(detail)`，正则 `/insufficient credits|out of credits|quota exceeded|exceeded your current quota|credit balance is too low|billing hard limit/i`。
- `cooldownReason` 里紧跟 cloudflare 判定之后加 `if (isQuotaExhausted(detail)) return ['quota', CFG.cooldownMs.quota];`（额度优先于所有状态码规则）。
- 失败分支入口：`const sniff400 = Number(status) === 400; if (CFG.retryableStatus.includes(status) || sniff400) {` ⇒ 400 也进「先读 body 再决定」；body 读取上限 `len < (sniff400 ? 262144 : 8192)`。
- **普通 400 原样补发**：`if (sniff400 && !isQuotaExhausted(text))` → `clientRes.writeHead(status, stripHopByHop({ ...upRes.headers }))` + `clientRes.write(text)` + `responseStarted = true` → `log('PASSTHROUGH-400 …')` → `finish({ ok: true, status, passedThrough: true })`；重试循环里 `if (r.ok && r.passedThrough) { state.stats.forwarded += 1; return; }`（不算失败、不冷却 key）。
- `const quota400 = Number(r.status) === 400 && isQuotaExhausted(r.body); const immediateCooldown = ([401,402,403,429].includes(Number(r.status)) || quota400) && !cfBlocked;`
- 前提：`gateway.mjs` 里 `headers['accept-encoding'] = 'identity';` 保证失败 body 是明文，关键字匹配才成立。

`selftest.mjs` 新增用例 13/14（`upstreamState.quota400Keys` / `plain400` / `plain400Seen`）：13 断言 quota-400 → `COOLDOWN reason=quota status=400 for=600s` + `STICKY-SWITCH A -> B` + 200；14 断言普通 400 透传（body 含 `missing messages field`、`plain400Seen === 1`、无 cooldown、key fail 数不变）。**15 组全过**，备份 `selftest.mjs.bak-20261001-2045-pre-quota400`。

## 额度行的 `kind` 约定 + deepseek-official 余额

keys.json 里 `deepseek-official` 那条是上游 DeepSeek 的转发 key（`upstream.origin = https://api.deepseek.com`），拿它去 `api.commandcode.ai/alpha/billing/credits` 必 401。
约定：data 层每行带 `kind`（`'goat'` | `'official'`），official 行只有 `available / currency / granted / toppedUp`，窗口字段全 `$null`；**所有消费方按 kind 分支**，绝不拿余额算百分比。
- `goat-usage.ps1`：新增 `Get-OfficialBalance` → `GET https://api.deepseek.com/user/balance`；`-Brief` 与完整文本都有 official 分支（旧 `-Brief` 会对 `$null` 做除法，在 `$ErrorActionPreference='Stop'` 下直接炸 —— watchdog 每 ≥4 分钟正好用 `-Brief -Force` 刷缓存，这个修复顺带救活了它）。
- `quota-http.mjs`：`/balance` 的 **json 是默认分支**（`?format=text` 才是纯文本，与文件头注释相反）；3 窗口展开加了 `r.kind !== 'official'` 过滤，另 push 一条 `currency: name + ' (CNY)'` 的余额行。
- 消费方（备份 `*.bak-20261001-2120-pre-official-balance`）：`mcp-goat-quota.mjs`、`goat-quota-hook.mjs`、`goat-tray.ps1`、`dsh-plugin-goat-panel/lib/client.js`（badge 尾部追加 `" · CNY2.17"`，popover 加余额行）。
- panel 无 build 步骤（`dsh.client` 直接导出 `lib/client.js`），改完只需 dsh 重启 + **浏览器刷新**。

## restart-all.ps1（延迟重启三件套）

`D:/Toolbox/goat-gateway/restart-all.ps1 -DelaySeconds 90 [-SkipDsh] [-SkipGateway]`：延迟 → 8788 杀进程 + `schtasks /run Goat-Gateway` + 轮询 `/health` 36s → 8790 杀进程 + `cscript //nologo start-quota-http.vbs` → 3080 杀进程 + `~/.dsh/launch-dsh.ps1 -Mode Serve` + 轮询端口。日志 `logs/restart-all.log`。
必须延迟 + `Start-Process -WindowStyle Hidden`（agent 自己就跑在 dsh/gateway 上，立即重启会打断 in-flight 请求）。
**附带发现**：goat-gateway 有看门狗计划任务 `Goat-Gateway-Watchdog`（每 1 分钟，`watchdog.ps1`），网关挂了会自动复活；quota-http **无**守护。

## 两条操作教训

1. 子进程 `childLog` 是异步收集的 ⇒ 断言日志内容前必须 `await sleep(200)`（否则 log 行还没落地，测试假失败）。
2. python 行式 patcher 的「整行替换」手法对多行语句的第一行用会**删掉该行剩余部分**（把 `const worst = rows.reduce((m, r) => (r.error ? m :` 后面的半句吃掉了）；行内子串替换必须用 `line.replace(needle, repl, 1)`，出错后从 backup 恢复重做。
3. Git Bash 传 `D:\...` 反斜杠路径会被 MSYS 改写（`schtasks /Query` → `C:/Git/Query`）；传正斜杠或把命令放 PowerShell 里跑。
4. 语法检查：`D:/Toolbox/goat-gateway/parsecheck.ps1`（PS Parser）+ `node --check`。
