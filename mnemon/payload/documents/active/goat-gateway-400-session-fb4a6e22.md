---
id: "fb4a6e22-1db0-406a-bd62-9d693e968f7a"
title: "goat-gateway 额度耗尽不进冷却：上游 400 与 session 亲和的死粘因果链（含修复选项）"
description: "2026-10-01 的排查记录：goat 套餐 key 额度耗尽后 gateway 不切 key，根因是上游用 HTTP 400 表达额度不足而 retryableStatus 不含 400，导致 quota 冷却永不触发、session 绑定永不复检。含逐行证据、诊断端点、A/B/C 修复选项与本地不花额度的额度查询路径。"
status: "active"
created_at: "2026-10-01T11:51:52.207Z"
updated_at: "2026-10-01T11:51:52.207Z"
content_hash: "ee5866dc39a995c9cd5c1b2d1ec5d9b0389a4f7cfc7ebf9a00d48a0a84b0737c"
source_paths:
  []
session_ids:
  - "84002c29-8ad7-4f1a-b7e7-47f6ea37ac09"
memory_body_ids:
  []
---

# goat-gateway 额度耗尽不进冷却：400 与 session 亲和的死粘链

**性质**：带运行时证据的故障调查 + 修复方案交接（方案已给出，用户当场未答复是否动手）。
**背景文档**：`d719aa02-0f0c-44f0-9480-4930f70bc058`（多 upstream 设计交接，其中「余额耗尽行为」列为未决项）；上线记录 `dbffeb3a-718b-436e-b8f1-e4b9850f4b53`。
**日期**：2026-10-01。**全部代码证据来自** `D:/Toolbox/goat-gateway/gateway.mjs` 与 `D:/Toolbox/goat-gateway/config.json`。

## 症状与结论

表象是「goat 额度耗尽」，实际是**只有两个套餐 key 中的一个耗尽，而 gateway 把一半会话死死粘在耗尽的那个 key 上**。另一 key 尚有月度余量，但请求打不进去。

正确的一句话结论：不是额度总量的锅，是**状态码分类缺口 ⇒ 冷却不写 ⇒ session 绑定永不复检额度**。

## 账本：查额度不花额度

- 数据源 `D:/Toolbox/goat-gateway/goat-usage.ps1`（account metadata，查询本身不消耗额度）。
- 本地缓存 `%TEMP%/goat-quota-http-cache.json`，由 `D:/Toolbox/goat-gateway/quota-http.mjs` 写入；该脚本默认 `PORT = process.env.QUOTA_HTTP_PORT || 8790`，`GET /quota -> { ok, ts, rows }`，供 UI 面板（dsh web / Reasonix 状态栏）读取。
- 注意端口陷阱：本次实际 LISTENING 的是 8899 上的 pythonw（`.ocs-ai-tiku`），不是 quota-http；直接问 8899 只会拿到那个无关服务的 `not found`。
- 本次快照（`fetchedAt 2026-10-01T19:49`）读法：
  - `qq`：月 69.4866 / 70.0182 ≈ **99.24%**，月剩余 **0.5316**；5 小时 1.147/14、周 11.60/35 —— **binding constraint 是月额度，不是 rate limit**（整月累计 20224 请求 / 2.1B tokens）。
  - `163`：月 58.0707 / 70.0251，月剩余 **11.9544**；5 小时 0/14。
  - `deepseek-official`：`error: 远程服务器返回错误: (401) 未经授权。` —— 这是**另一个独立额度站**（DeepSeek 官方）的认证问题，与 goat 无关，排查时不要混。
- 缓存里只有 `weeklyReset` / `fiveHourReset`，**没有 `monthReset` 字段**，所以月度窗口何时归零无法从本地推断（按语义大概是自然月）。要立刻恢复只能充值，或先把流量导到未耗尽 key。

## 代码级因果链（四环，逐行确认）

**① 上游对额度耗尽返回 HTTP 400，不是 402。**
响应体形状：`{"type":"invalid_request_error","message":"You have insufficient credits to make this request..."}`。

**② `retryableStatus` 里没有 400。**
`gateway.mjs:831` `if (CFG.retryableStatus.includes(status)) {` 是该文件**唯一**的失败响应处理入口（该分支注释明确写「读一小段用于日志/诊断，绝不发给客户端……换 key 重试对它是完全透明的」）。
实测 `config.json` 的 `retryableStatus = [401, 402, 403, 408, 429, 500, 502, 503, 504]`（不含 400）。
⇒ 400 **不进这个分支**：不读正文、不写冷却、不换 key、原样透传给客户端。

**③ `cooldownMs.quota` 只在 402 上生效。**
`gateway.mjs:343` `if (status === 402) return ['quota', CFG.cooldownMs.quota];`，而 `cooldownMs = {"unauthorized":180000,"quota":600000,"rateLimit":60000,"server":15000,"network":20000,"authModel":30000}`。
⇒ 上游用 400 表达额度耗尽时，这条 600000ms 的 quota 冷却规则**永远不会被触发**。

**④ 后果：耗尽的 key 永不 `isCooling`，session 亲和永远命中它。**
`gateway.mjs:539` `function selectKey(candidates, fp, prefixFp = '')` 的 session 分支（默认 `strategy = "session"`）：

```js
const bound = state.sessions[fp];
if (bound) {
  const held = candidates.find((k) => k.name === bound.key);
  if (held && !isCooling(held.name)) {   // ← 唯一的切换条件
    bound.t = Date.now();
    return held;
  }
}
```

切走的前提是 `isCooling(held.name)` 为真，而冷却只在 ② 那个分支里写。**400 永不冷却 ⇒ 绑定永不复检 ⇒ 未耗尽 key 的余量对该会话不可见。**

补充证据：`gateway.mjs` 全文 grep `insufficient` / `credits` **零命中** —— 网关对「额度耗尽」这种响应体形状毫无认知，属设计缺口，不是配置笔误。

## 运行时证据与诊断端点

```bash
curl -sS http://127.0.0.1:8788/_gateway/sticky
# {"ok":true,"stickyKey":"qq","strategy":"session"}

curl -sS http://127.0.0.1:8788/_gateway/sessions
# {"ok":true,"total":1717,"byKey":{"163":789,"qq":914,"deepseek-official":14}}
```

1717 个会话里 914 个绑在耗尽 key 上：均衡器本身正常工作，只是它均衡的是**会话数**，不是**剩余额度**。

两个「看起来能救、其实无效」的操作：
- `GET /_gateway/reset`（`gateway.mjs:1124`）只把各 key 的 `cooldownUntil` 清零 —— 而耗尽的 key 从未进过冷却，清了等于没清。
- `GET /_gateway/sticky?clear=1` 只清全局 fallback 粘滞 `state.sticky`，对已写入的 `state.sessions[fp]` 逐会话绑定无效。

## 修复选项

**A. 精准修（推荐）**：在 ② 的失败正文读取处加一层 body 判定，匹配 `/insufficient credits|quota exceeded|out of credits/i` 就把该 key 归入 `quota` 冷却（复用现成的 `cooldownMs.quota: 600000`）。冷却一写，④ 的 `isCooling(held.name)` 立刻为假，会话自动重新绑定到未耗尽 key，**无需人工干预**。风险可控：只认关键字，400 的透传语义不变（客户端照样收到那个错误），只是内部多冷却一个 key。改动需重启 gateway 进程。

**B. 临时缓解（零代码）**：从 `keys.json` 里停用耗尽的 key；`candidates.find(...)` 找不到 `held` ⇒ 自动走重新分配路径。

**C. 把 400 整个加进 `retryableStatus`（不推荐）**：400 也覆盖真正的 bad request / 参数错误，会把无意义重试也算进 `maxAttemptsPerRequest: 4`，掩盖真 bug。

## 插件侧连带影响

搜索插件里的 goat 熔断已按关键字命中（正则含 `insufficient|credit`），本地跳过 goat 5 分钟（`goatFailureCooldownMs: 300000`），其余三源照常 —— 所以用户可见表现是「goat 静默缺席」而非整个搜索失败。副作用：只要 key 绑定不变，每 5 分钟必然白试探一次并再吃一个 400，建议把这个窗口调大。

## 归因边界（诚实表述）

当晚为做 goat 质量对照真发了 4 次 `web_search_20250305`（每次 usage 约 14k–25k input tokens），确实动了月额度；但没有 19:00 之前的额度快照可比对，而 `requests 19764` 说明这是整月累计结果，**无法从现有数据分解出这几下占了剩余 0.5316 单位的多少**，不排除正好压过临界点。

## 未决 / 待办

- 用户当时未答复是否执行方案 A；同时被提议的还有把插件 `goatFailureCooldownMs` 从 5 分钟抬到 30 分钟。
- 月度配额重置时点在本地不可推断（无 `monthReset` 字段）。
