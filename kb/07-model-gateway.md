# 07 · 模型路由与自建网关

> 自建 gateway 不是"多一层转发"，是把**凭据、额度、model 命名空间、重试语义、计费口径**这五件本来分散在各 client 里的事收进一个可观测的单点；
> 代价是这个单点挂掉时所有 client 同时挂，所以它的每一次改动都必须先能 DryRun。

---

## D 定论

**D1 · 所有 client 只认一个 base_url：`http://127.0.0.1:8788/v1`。**
`~/.dsh/profiles/web/cordis.patch.yml:696-726` 的 `agent-default-model` = `provider: commandcode-goat` / `model: deepseek/deepseek-v4.1-flash` / `reasoningEffort: high`，其 `commandcode-goat` provider 的 `baseURL: http://127.0.0.1:8788/v1`（`api: openai-completions`，`compat.thinkingFormat: deepseek`，`supportsDeveloperRole: false`，`maxTokensField: max_tokens`，`defaultMaxTokens: 65536`）；`commandcode-goat-anthropic` 同 baseURL，`api: anthropic-messages`。Reasonix 桌面同样打 `http://127.0.0.1:8788/v1`。**换模型 / 换 key / 换上游都不改 client**，这是自建 gateway 换来的第一等好处。

**D2 · key 池化的真实动因是"同质账号池 + 会话粘滞 + 冷却 + 重试"，不是负载均衡。**
`strategy = session`：同一会话粘同一个 key（为保 upstream prompt cache），不同会话按指纹分散。粘滞不是优化而是必要——命中 ¥0.02019/M vs 未命中 ¥1.0095/M，**差 50 倍**。所以任何"均衡"讨论都必须先承认：均衡只能作用于**新会话**，已有绑定不回迁。

**D3 · `loadKeys()` 的 `.map()` 只挑固定字段 —— 这是本网关最贵的结构性坑。**
`keys.json` 新增字段（`weight`、`priority`、`pathPrefixes`、`upstream`、`models`、`modelMap`）必须同步加进 `loadKeys()` 的 `.map()`，否则**静默丢失**：配置文件里有、运行时没有、无报错。三个独立特性（weight 2026-09-30、priority + pathPrefixes 2026-10-01/02）都在这条坑上踩过。

**D4 · `quotaSync.resetWindow` 必须是 `month`，不是 `weekly`。**
`gateway.mjs` 的 `RW_COL = { fivehour: 'fiveHourReset', weekly: 'weeklyReset', month: 'monthReset' }`。2026-10-01 的注释断言"月度池属 billing cycle、服务端不给日期" → 定成 `weekly` → 两个账号的周/月远近顺序**可以相反**（163：周 158.2h / 月 75.2h；qq：周 139.0h / 月 713.3h）⇒ 实际变成"优先烧刚充值的额度"：当天 5326 次请求全打 qq，163 只拿到 24 次，那 4.89 眼看 3 天后白废。`goat-usage.ps1 -Json`（经 `8790/quota`）一直在返回 `monthReset`。

**D5 · 403 必须分三类，一类一策；混为一类会让整个网关停摆半小时。**
① `MODEL_NOT_IN_PLAN`（套餐不含该 model，两个 key 完全一致，换 key 无用）→ 不冷却、直接 403 `gateway_model_not_in_plan`；② `Authentication failed. Please check your credentials.`（不是 key 失效，是该 model 的后端 provider 没绑定；同 key 打 `deepseek/deepseek-v4.1-flash` 得 200）→ `authModel` 冷却 30000ms；③ Cloudflare 1010 / 真 401 / 429 → `unauthorized` 冷却 `180000`（曾 1800000 = 30 分钟，一个 model 级 403 就能冻全网关）。

**D6 · 额度耗尽可能不是 402，而是 400 + `insufficient credits`。**
`individual-goat` 计划耗尽时返回 `HTTP 400` + `{"type":"invalid_request_error","message":"You have insufficient credits to make this request..."}`。旧代码 `retryableStatus` 不含 400（连 body 都不读）、`cooldownReason` 只对 402 判 quota ⇒ 耗尽的 key **永不冷却、永不换 key**，`state.sessions` 把 914 个会话钉死在它上面。修法：`isQuotaExhausted(detail)` 正则 `/insufficient credits|out of credits|quota exceeded|exceeded your current quota|credit balance is too low|billing hard limit/i`；`sniff400` 时 body 读取上限放宽到 262144；普通 400 走 `PASSTHROUGH-400` 原样补发（不算失败、不冷却）。前提是 `accept-encoding: identity`。

**D7 · dead key 的危险不在"不能用"，而在"能返回一个误导性的错"。**
`deepseek-official` 余额 -0.22（欠费），是 `priority: 0` 兜底层。`qq` 被上游 CF `Error 1102` / `ECONNRESET` / `ENOTFOUND api.commandcode.ai` 打挂时 failover 到它 → 上游 402 `Insufficient Balance` → gateway 判 `quota` 并把 402 body 原样透传 → dsh 归一化成 `QUOTA` → 界面显示「当前请求的额度已用尽」，**而 qq 的额度一直很充足**（10-07：5h 0.53/14、周 9.30/35、月剩 60.70）。2026-10-16 11:37 该 key `enabled: true → false`（UAC 提权，`_elev-disable-official.ps1`，日志 `~/.dsh/logs/elev-disable-official.log`），随后 `curl -X POST http://127.0.0.1:8788/_gateway/reload` 热生效。禁掉之后报错如实显示为网络错误。

**D8 · 模型替换的判据是"代际"而不是"档位"：`deepseek-v4-pro` 是被 v4.1-flash 跨代超越的，`v4.1-pro` 完全不存在。**
2026-09-10 用户拍板 v4.1 全面上线（`deepseek/deepseek-v4.1-flash` 取代 pro 与 v4-flash）。GOAT `/v1/models` deepseek 线 5 个 id：`deepseek/deepseek-v4.1-flash`、`deepseek/deepseek-v4-pro`、`deepseek-v4-flash`、`deepseek-v4-flash-fast`、`deepseek-v4-flash-vision-exp`；**无 v4.1-pro、无独立 v4.1-vision**。官方 `api.deepseek.com` 只 2 个 id：`deepseek-flash`（= V4.1-Flash，ctx 1048576，max_out 393216，input 含 image）与 `deepseek-v4-pro`。`deepseek/deepseek-v4-pro` 是 **latest 滚动指针**（`name = "DeepSeek V4 Pro (latest)"`），升级不新增 id；可观测触发器 = name 变成 "DeepSeek V4.1 Pro (latest)"。

**D9 · `reasoning_effort` 有三层不同的合法域，混淆是历史上的主要 bug 源。**
模型本体 `low/high/max`；dsh 对外 `off/low/high/max`；**GOAT relay 校验域 `low/medium/high/xhigh/max`**（`none`/`minimal`/`off` → 400 `Invalid option: expected one of "low"|"medium"|"high"|"xhigh"|"max"`）。dsh 的 `off` = **不发送该字段**，而 relay 默认 thinking enabled ⇒ **这条 route 上思考关不掉**。且 `commandcode-goat` 不在 pi-ai 内置 catalog（`resolveRouteModels` 的 `catalogModels()` 返回空 Map）⇒ `base` 恒 undefined ⇒ `reasoningEfforts` **必须手写**，无法自动继承。

**D10 · 一条自建 gateway 上的"成本"全是估算，credits 才是真账。**
GOAT 按 credits 计费（5h 14 / 周 35 / 月 ≈70），上游 `/v1/models` 只返回 `id/name/context_length/supported_endpoints`，**不暴露 per-model USD**。所以 UI 里的钱数必须标「≈ 成本（估算）」，且必须在价目 overlay 里显式给 per-1M 单价，否则面板显示 `费用 —`。

**D11 · 任何会打断 in-flight 流的操作都必须延迟执行，因为 agent 自己就跑在这条链路上。**
`restart-all.ps1 -DelaySeconds 90 [-SkipDsh] [-SkipGateway]`：延迟 → 8788 杀进程 + `schtasks /run Goat-Gateway` + 轮询 `/health` 36s → 8790 杀进程 + `cscript //nologo start-quota-http.vbs` → 3080 杀进程 + `~/.dsh/launch-dsh.ps1 -Mode Serve`。必须 `Start-Process -WindowStyle Hidden`。**在 bash 工具调用执行期间没有活跃 LLM 流**，所以"在大 sleep 里让它触发"是安全窗口。

**D12 · 只有 `keys.json` / `config.json` / `model-allowlist.json` 是 mtime 热重载，`gateway.mjs` 必须重启进程。**
⇒ 改代码与加 key 的顺序必须是「**先重启加载新代码，再改 keys.json**」，否则旧代码会把新 key 当同上游 key 用（例：`sk-` 打向 `api.commandcode.ai` 必然 401）。

---
## M 机制

### 拓扑

```
dsh (web/desktop/headless)  ─┐
reasonix (桌面/CLI)         ─┼─►  http://127.0.0.1:8788/v1   goat-gateway (node)
其它 OpenAI 兼容 client     ─┘      listen 127.0.0.1:8788      D:\Toolbox\goat-gateway\gateway.mjs
                                     ↑ key 池 / path 认领 / model 改写 / 冷却 / 日志
              ┌──────────────────────┼───────────────────────┐
  api.commandcode.ai/provider/v1     api.deepseek.com     (pathPrefixes 专属上游)
  key: 163 / qq（user_ 前缀 93 字符） key: deepseek-official（已 dead）
```

- 上游缺省：`upstream.origin = https://api.commandcode.ai`、`basePath = /provider/v1`、`localPrefix = /v1`、`userAgent = commandcode-goat-gateway/1.0`、`stripClientHeaders = ["x-reasonix-","x-session-id","x-conversation-id","x-topic-id","x-api-key"]`。**`x-api-key` 必须删**：原代码只删 `host`/`authorization`/`content-length`，而 dsh-web-search 的 `authHeaders()` 同时发 `x-api-key` 和 `authorization: Bearer ...` ⇒ 客户端原始 key 会原样透传给 upstream、绕过 key 池。
- 双上游是 **per-key upstream**：`resolveUpstream(keyEntry)` 取代全局单例 `upOrigin`，缺省继承 `CFG.upstream`；agent 单例改为 `Map<origin,{agent,bornAt}>`（keep-alive 连接绑 origin，不能跨 origin 复用）；`defaultPort(protocol)` 不能写死 `|| 443`（对 http 上游是错的）。
- `/v1/models` **固定用缺省上游的 key 拉**——官方只有 2 个模型，问它会把 dsh 模型选择器打回 2 项。
- 自建的四个理由：① key 池化（多账号同质池 + 粘滞 / 冷却 / 重试）；② path 认领（各上游路由空间不同，见下）；③ 跨 client 复用（一份 base_url、一份额度视图）；④ 额度与成本统一可见（`8790/quota`、dsh 面板、Reasonix hook、窗口标题）。

### key 池与调度

- **选择函数**：`selectKey()` 的 `scoreOf = (k) => load[k.name] / (k.weight > 0 ? k.weight : 1)`，`load` = `state.sessions` 里绑定到该 key 的会话数，**取 min**。日志证据形如 `SESSION-BIND 928c0c35 qq (sessions per key: 163=788 qq=800)`。`weight` 只影响新会话：`qq.weight=3` / `163.weight=1` 时 163 冻结在 788、每个新会话都落 qq，而 `load/weight` 要到 `qq = 788*3 = 2364` 才平衡。
- **新 key 独占预热期（未解决）**：新 key `load=0` ⇒ `score=0` ⇒ 必然最小 ⇒ 独占后续所有新会话，`weight` 压不住（load=0 时 score 恒为 0）。实测官方 key 要独占约 `903/3 = 301` 个新会话才与 qq 打平（按 ~¥0.1/会话估，几十个会话烧光 ¥5.53）。曾给三个选项（接受 / `joinBalanced` 把初始 load 设为按 weight 应得份额（约 10 行）/ `enabled: false` 热重载关掉），用户未选 → 现状 = 接受。
- **priority 分层**：`keys.json` 每 key 可写 `priority`（缺省 100，**越大越优先**）；`tiers = [...new Set(candidates.map(prioOf))].sort((a,b)=>b-a)`，选第一个含非冷却 key 的层作 `pool`，其后 `bound`/`held`/`fresh`/`scoreOf` 全基于 `pool`。⚠️ **必须逐层下探**：最初只取 `tiers[0]`、层内 `fresh` 为空就 `return null` ⇒ 高层全冷却时官方兜底完全失效，客户端拿到 503 `gateway_all_keys_failed`。
- **quota 动态 weight**：`config.json` 的 `quotaSync = { enabled: true, url: "http://127.0.0.1:8790/quota", intervalMs: 60000, timeoutMs: 15000, mode: "resetSoon", resetWindow: "month", minWeight: 0.2, maxWeight: 5 }`。`mode` 四值 `used` / `left` / `resetSoon` / `resetLate`。**只写内存 `quotaWeights` Map，绝不回写 keys.json**（避免与 mtime 热重载打架）；拉取失败静默回落静态 `weight`；`effWeight(k)` 先查 quota 表再看 `k.weight`；官方余额行（无 month 窗口 / 无 `resetAt`）自动跳过 → `weightFromQuota: false`；`reloadRuntimeConfig()` 里也会 `syncQuota().catch(()=>{})`，启动跑一次 + 滚动 interval（下限 10s，`.unref()`）。
- **"163 近乎独占"是 weight × 历史 load 的必然结果**：`load` 是历史累计（163≈790 / qq≈915），权重却是 5 / 0.2 ⇒ score 158 vs 4575 ⇒ qq 要等 163 背到约 22575 个会话才轮到，实际等于永远。收敛只需调大 `quotaSync.minWeight`（如 1→3），**无需改代码**。
- **path 认领（显式认领制，不是黑名单）**：`keys.json` 每 key 可声明 `pathPrefixes: ["/anthropic/"]`。**无人认领** → 全部 enabled key 照常参与（`/v1/*` 逐位不变）；**有 key 认领** → 该 path 上只保留认领者，未声明 `pathPrefixes` 的 key **一律出局**。好处：GOAT 两个 key 无需任何配置就自动让开 forge 不认识的 path，不存在"忘加配置 = 静默走错上游"。实现：`pathClaimed(keys, pathname)`、`pathAllowed(keyEntry, pathname, claimed)`（**未声明者 `return !claimed`**）、`gateway.mjs:1563` 的 `const pathOwned = pathClaimed(enabledKeys, meta.path); const all = enabledKeys.filter(k => modelSupported(k, meta.model) && (!pathOwned || pathAllowed(k, meta.path, pathOwned)));`。动机：`selectKey` 只看 model，`POST /anthropic/v1/messages` 被分给 priority 100 的 GOAT key → 转发成 `POST https://api.commandcode.ai/provider/v1/anthropic/v1/messages` → 上游 404 `is not a registered API route`。
- **`/health` 的可见性**：顶层 `priorityTiers` / `quotaSync{enabled,url,mode,resetWindow,ok,ageSec,error,detail}`；逐 key `priority` / `quotaAccount` / `weightStatic` / `weightEffective` / `weightFromQuota` / `pathPrefixes`。

### 模型线与别名

- **`model-allowlist.json`** 结构 `{ "_comment", "_verifiedAt", "models": [...], "_note_claude" }`，本次实测 **62 条**。`loadModelAllowlist()` 照搬 keys.json 的 mtime 热重载，文件空 / 缺失 ⇒ 返回 `null` = 不干预；拦截 `GET /v1/models`：透传拿到 JSON → 按白名单过滤 → 返回。日志 `MODELS-FILTERED 86 -> 62`，改白名单**即时生效**。根因：上游 `/v1/models` 返回「平台提供的**全部**」≠「本套餐有权限的」，dsh 会把它同步成模型选择器，用户点到必然失败的模型还以为是网关坏了。
- **per-key 模型面**：`models`（客户端 id，dsh 发什么写什么）+ `modelMap`（翻成上游裸 id）；`basePath: ""` 合法（官方 origin 直接接 `/chat/completions`）；`/health` 逐 key 报 `upstream` + `models` 数量。上游要求 `provider/model` 形式（`deepseek/deepseek-v4.1-flash`），裸 id 只部分有效。
- **`models` block 解析陷阱**：profile patch 里有两处**同缩进**的 `models:`——`commandcode-goat-anthropic` 那段（6 行 / 1 个 model）与 `commandcode-goat` 的（61+ 个）。改列表必须先锚 6 空格的 provider key（`      commandcode-goat:`，在 707 行附近），否则命中错段（曾误锚到 `- id: permission` @1128 之外的边界）。
- desktop 曾有 82 个 model、其中 **21 个不在 allowlist**（点了必然 403）；已删这 21 个 + 补 `stealth/pixel-canary` + 把 `claude-sonnet-5-5` 从 `commandcode-goat` 块移走（按 `_note_claude` 它只走 `/v1/messages`，已由 `commandcode-goat-anthropic` 块覆盖）。
- **effort 三层档位域**见 D9。14 个 true-thinking model 给 `reasoningEfforts: {off: null, low, medium, high, xhigh, max}`，46 个非 thinking 给 `reasoningEfforts: false`（schema 接受 `z.union([z.const(false), reasoningEfforts])`）——依据 `dsh-llm-pi-ai/lib/index.js` 的 `resolveModelReasoning()`：手写 entry 无 `base` 时，不声明就是 `reasoning: false`，而 `reasoningInfo()` 在 `!model.reasoning` 时返回 `{}` ⇒ UI 里那栏**根本没有选项**。
- **实测校准（85 次真实调用，temperature=0，6 题 × 6 档，ground truth 独立验证）**：档间差（±20%）远小于档内方差（同题同档重复采极差 602%–1527%；P4 `low` 913 tok vs `high` 9420 tok），正确率无差异（82/82 全对，`off`/`low` 一样全对）。**`reasoning_effort` 只是弱预算提示，难度主导思考量，`max_tokens` 才是真杠杆。**
- **pro 零调用不能反推 pro 不需要**：6 天 23,780 次调用中 `deepseek/deepseek-v4.1-flash` 占 23,776（99.99%）、`deepseek-v4-pro` **0 次**——但 v4-pro 是被 v4.1-flash **跨代**超越的，`v4.1-pro` 是同代高档位，会真的更强。真正变量是"同代档位差在用户任务上的兑现率"。

---
### 协议细节

- **SSE tail truncation（usage 覆盖率 16% → 100% 的根因）**：旧代码写的是
  `const chunkStr = c.toString('utf8'); if (tail.length < 65536) tail += chunkStr;`
  这是**前 64KiB 封顶**，不是滑动窗口——流一旦超过 64KiB 就永久停止累积，而 `usage` 只出现在流的**最后一帧** ⇒ `extractLastUsage(tail)`（`gateway.mjs:823`，用 JSON 扫描而非正则以正确处理嵌套）永远看不到。短流（<64KiB）不受影响 ⇒ 覆盖率 ≈ 短请求占比 ≈ 15–16%（实测 471 条 OK / 76 条带 usage = 16.1%）。修：`tail += chunkStr; if (tail.length > 65536) tail = tail.slice(-65536);` ⇒ 重启后 **13/13 = 100.0%**。
- **gzip**：`gateway.mjs:635` 把客户端 headers 原样透传给 upstream，而 dsh（node undici）默认发 `accept-encoding: gzip, deflate` ⇒ upstream 把 403 body 压成 gzip 而网关**不解压** ⇒ detail 变成 `1f 8b 08…` ⇒ `isModelNotInPlan()` 与 `cooldownReason()` 的**全部文本匹配失效** ⇒ 落进默认分支按 `unauthorized` 冷却 180s ⇒ **一次 403 冻住两个 key**，界面还显示成"API 密钥无效"。修：`headers['accept-encoding'] = 'identity'`。
- **`finish=length` 与 64 token**：不是长 prompt 被上游截断，而是 `@deepseek-ai/dsh-session-title-first-prompt-llm` 的 `maxOutputTokens` 默认 **64**，且 title 请求**继承主 session 的 route**（默认 thinking enabled）⇒ reasoning 吃光 64 token 预算 ⇒ 上游回 `finish_reason:"length"` ⇒ dsh 抛 `session-title-llm: title output reached maxOutputTokens`。日志特征齐整：`completion_tokens == reasoning_tokens == 64`、prompt 141–192、单发。finish 分布 `535 tool_calls / 16 stop / 4 length`（length 仅 0.7%）。修：profile patch 追加 `maxOutputTokens: 512`（`SessionTitleLlmConfigFields` 七项**全部 `.required()`、无 library default** ⇒ 64 来自 profile bundle 的声明）。
- **reasoning content 在 SSE / 请求体里的字段形态**：`ECHO_FILTER_FIELDS = ['reasoning_content', 'reasoning', 'reasoning_text']`。dsh 的 pi-ai 适配层（`@earendil-works/pi-ai/dist/api/openai-completions.js` 的 `nonEmptyThinkingBlocks` 分支）把上一步自己的 reasoning 以 `reasoning_content` **回灌**给模型，形成**语言自锁**：同一上下文重复 6 次，保留英文回灌 0/6 中文，删掉 / 本地化 3–4/6（Fisher p≈0.033）。修法策略 = **棘轮**：`cjkRatioOf(text) < minCjk(0.25)` 的非中文 reasoning 不回灌、中文原样保留 ⇒ 一旦有一步中文就被自己强化并收敛。开关 = `logs/.reasoning-filter.json` 是否存在（**每请求现读，改完不用重启，删掉即回退**），`uaHints: ['deepseek-harness']`、`mode: 'strip'`。
- **超时 / 重试语义（`config.json` 实测值）**：`maxAttemptsPerRequest: 4`、`attemptsPerKey: 1`、`retryDelayMs: 500`、`firstChunkTimeoutMs: 180000`、`streamIdleTimeoutMs: 30000`、`bodyTimeoutMs: 120000`、`upstreamTimeoutMs: 900000`、`maxBodyBytes: 67108864`、`agentMaxAgeMs: 300000`、`keepAlive: true`。`cooldownMs = { unauthorized: 180000, quota: 600000, rateLimit: 60000, server: 15000, network: 20000, authModel: 30000 }`。`strategyNote` 说得最清：**客户端取消不冷却不切 key；401/402/403/429 立即冷却换 key；5xx / 网络错误按 `attemptsPerKey` 重试同一 key 后再换。**
- **长连接会衰减**：复用连接时上游 SSE 速度从 ~300 tok/s 一路衰减到个位数 ⇒ `agentMaxAgeMs = 300000` 强制轮换。
- **loopGuard**：字符级 6-gram 滑动窗口 novelty（唯一率），`capacity = 256/1024` 双尺度。阈值由 `selftest-loop-guard.mjs` 实测校准：capacity=1024 下正常中文散文 0.99 / 代码块 0.55 / markdown 表格 0.31 / deadlock 0.117 / 真循环 0.032。`mode: shadow` = 只写 `logs/loop-guard.jsonl` 不干预转发；`abort` = 命中即断上游并给客户端补 `[DONE]`（直接 `destroy` 的话 dsh 会当成网络错误并走重试）。

---
### 额度与计费

- **额度查询端点**（Bearer = `keys.json` 里 `user_` 前缀 93 字符的 key）：
  - `GET https://api.commandcode.ai/alpha/billing/credits` → `windowLimits.fiveHour = {used, cap: 14, resetAt(epoch ms), exceeded}`、`windowLimits.weekly = {used, cap: 35, resetAt, exceeded}`、`credits.monthlyCredits` = 本月**剩余**、`credits.belowThreshold`。
  - `GET https://api.commandcode.ai/alpha/usage/summary` → `totalCredits`（当前计费周期已用）、`totalCount` / `totalTokens`、`periodBasis = billing-period`。
  - `GET https://api.commandcode.ai/alpha/billing/subscriptions` → `planId = individual-goat`、`currentPeriodStart/End`。
  - **月度上限 = `summary.totalCredits` + `credits.monthlyCredits`**：163 = 38.75 + 31.27 = 70.02、qq = 36.29 + 33.70 = 69.99 ⇒ 套餐结构 **5h 14 / 周 35 / 月 70**（credits，按 API list price 折算）。
- **不可用的路径（别再猜）**：`/internal/usage*`、`/internal/billing/*` → 401 `You're logged out`（只认网页 session cookie，不认 API key）；直接猜的 `/api/usage`、`/provider/v1/usage|me|quota|balance` 全 404；chat/completions 响应头**不含** rate-limit（只有 Cloudflare/Hono 头）⇒ 无法从调用响应推断额度。端点是从 `https://commandcode.ai/settings/usage` 的 JS chunk 字面量（`/alpha/usage/summary`、chunk 名 `use-org-limits` / `monthly-usage-meter` / `plan-allowance-rows`）里挖出来的。
- **余额通道**：官方 `GET https://api.deepseek.com/user/balance`。data 层每行带 `kind`（`'goat'` | `'official'`），official 行只有 `available / currency / granted / toppedUp`，窗口字段全 `$null`；**所有消费方按 kind 分支，绝不拿余额算百分比**（旧 `-Brief` 对 `$null` 做除法，在 `$ErrorActionPreference='Stop'` 下直接炸——而 watchdog 每 ≥4 分钟正好用 `-Brief -Force` 刷缓存，这个修复顺带救活了它）。`quota-http.mjs` 的 `/balance` **json 是默认分支**，`?format=text` 才是纯文本（与文件头注释相反）。
- **价目 overlay**：`~/.dsh/storages/dsh-context-price-overlay.json`（USD / 1M tokens；键 = harness 上报的 `(provider, model)` 原样字符串，精确匹配才生效；`hit` = cache_read、`miss` = 未命中 input、`write` = cache_write、`out` = output 含 reasoning）。本次读到的实测值：`commandcode-goat` / `deepseek/deepseek-v4.1-flash` = `hit 0.0030285 / miss 0.151425 / write 0.151425 / out 0.6057`。这个价不是抄的，是**反解**出来的：Reasonix `config.toml` 自报 `cache_hit 0.02019 / input 1.0095 / output 4.038 CNY per 1M`，验算 `384×0.02019 + 47873×1.0095 + 702×4.038 = 0.05117043 CNY` vs stats 自报 `0.051170222`（差 4e-7），再按 `1 CNY = 0.15 USD` 折算。旧值 0.003/0.15/0.6 是 models.dev 的 deepseek-v4-flash 刊登价，系统性偏低 0.95%。
- **dsh-context 显示 `费用 —` 的三重根因**：① `modelsDevProviderOf("commandcode-goat")` 原样透传，`MODELS_DEV_PROVIDER_IDS` 里没有它 ⇒ `branchOf(book.prices,...)` = null；② `if (model.toLowerCase().startsWith("deepseek-"))` 而 model id 是 `deepseek/deepseek-v4.1-flash`（以 `deepseek/` 开头，不是 `deepseek-`）；③ `resolveRate` 四层候选（org 命名 → `@ai-sdk/<own id>` primary → id 前缀 → lone carrier）全空——models.dev 的 `deepseek` provider 只有 4 个 model，根本没有 `deepseek-v4.1-flash`。影响面：这一对 = **1413 session / 2.4502B token = 全机 token 的 96%**，对总额贡献 0。补丁后 **153/1599 → 1558/1599**，总额 `USD 5.8260 = ¥38.84` → `USD 48.1622 = ¥321.08`。
- **replay cost tile 直接不渲染（不是显示 $0）**：`@mingozhou/dsh-replay` v0.4.1 的 `src/core/cost.ts` 里 `estimateCost` 是 session 级 first-match-wins，`pricing.find(p => models.some(m => p.match.test(m)))` 命中不了就 `return undefined`；而 `src/client/components/OverviewView.tsx` 写 `...(cost !== undefined ? [{...}] : [])` ⇒ undefined 时 tile **整个消失**。原 `DEFAULT_PRICING` 只有 5 条（deepseek/claude/gpt/openai/gemini），本地 62 个 model 约 50 个命中不了（muse-spark、Kimi、GLM、MiniMax、mimo、Qwen、LongCat、Step、hy、nemotron、inkling、stealth、laguna、ling、grok）。修：追加 15 条 vendor 估算 + 末尾 `/./u` fallback（21 条，62/62 命中）。**残留未修**：`estimateCost` 是 session 级单费率，混用多 vendor 的 session 会按第一个命中的规则给**全部** token 计价（实测含 muse-spark 的 session 仍显示 `$45.80 [DeepSeek]`）；要 per-model 正确需 per-step 归属（`usageSamples` 已带 turn/step，`assistant/message` 带 `source.model`）。
- **成本可见性三条腿**：① 窗口标题；② dsh web 面板 `dsh-plugin-goat-panel`（`REFRESH_MS = 15000`，挂 `sidebar.footer.action` 全局常驻 + `conversation.input.dock` 会话内，badge 尾部追加 `" · CNY2.17"`，无 build 步骤 ⇒ 改完 dsh 重启 + **浏览器刷新**）；③ Reasonix hook `SessionStart`（`timeout: 15000`，**毫秒**）+ MCP 工具 `mcp__goat-quota__goat_quota`（dsh 侧 `serverName: goatquota` ⇒ 工具名 `mcp__goatquota__goat_quota`，**必须加进 headless 的 `bootstrapTools`**，否则首轮不可见）。

---
### 运维

- **key 泄露处置**：真实事件——两个 GOAT key（`user_` 前缀 93 字符）曾在 public 仓库明文躺约 **3 个月**（最早可追到 2026-06-15 的 initial commit），位置 `reasonix/.env`、`dsh/.env`、`dsh/.env.bak-goat-qq-20260907-232526`。两个根因缺一不可：① 脱敏正则不覆盖服务商自有前缀（只覆盖 `sk-*` / `sk-ant-` / `ghp_` / `github_pat_` / `gho_` / `AKIA` / `xox*` / 私钥块 / `Bearer <tok>` / `wpa_passphrase`）；② scrub 只扫 `git diff --cached --name-only` 的变更文件 ⇒ 内容不再变化的文件**永远不进扫描**。修：`$Scrub` 加 `@{ rx='user_[A-Za-z0-9]{20,}'; to='user_REDACTED' }`、`$Detect` 加同款，并把 `git ls-files` 并入待扫清单（710 → 2144 文件）；历史清理用 `git-filter-repo --replace-text`（**会移除 origin，必须重新 `git remote add`**，且其它克隆位置要重新 clone）。**遗留铁律：泄露过的 key 必须在服务商后台轮换，脱敏只是止血。** 另：本次排查第一轮用 `-replace 'sk-...'` 脱敏 keys.json 失败（key 是 `user_` 前缀）⇒ key 明文进了对话历史 —— **脱敏正则必须按实际前缀写，先看清格式再打印**。
- **双机 gate profile 铁律**：两台机各自跑自己的 gateway 实例，**不共享一个进程**。本机（Linux 天阙）历史上不跑 dsh（2026-09-04 拍板，性能不足），pro / dsh 调用经 `dsh-remote -pro "任务"`；Linux 的 dsh 出口同样是本机 `127.0.0.1:8788/v1`。**绝不能把 Windows 目录整目录拷到 Linux**：Linux 侧曾长期停在 911 行旧版（缺 `weight`、`model-allowlist.json`、`streamIdleTimeoutMs` / `firstChunkTimeoutMs`、`prefixAffinity`），且混着 12 个 Windows 专属文件（`*.ps1` / `*.vbs` / `quota-widget.cs`）。归一后仍是**两个 build**：Linux 版 `gateway.mjs` 1642 行、没有 bodylog 补丁，tail 补丁在**行 1101**，reasoning-filter 需改锚点（Windows 版锚点是 `function forward(` 与 `// bodylog-end`）。**config 差异必须保留**：Linux `cooldownMs.unauthorized = 1800000`（30 分钟），Windows `180000`（3 分钟）。runtime 也不同：Windows 计划任务用 `C:\Program Files\nodejs\node.exe`（v24），Linux unit `ExecStart=/usr/bin/node`（**v18.19.1**，不是 PATH 上的 `~/.local/bin/node` v24）。
- **强制显式 model + effort（2026-09-09 拍板）**：`dsh-remote -pro "任务"`（= pro + max）或 `dsh-remote -m <model> -e <effort> "任务"`；裸调用（无模型）两端报错 **exit 2** 并打印用法，effort 缺省补 high。废除按任务文本关键词自动升 pro（旧 `$HARD_PATTERNS` / `dsh-remote` 54-59 行关键词列表："证明 / 推导 / 审计 / 数学 / 实分析…"——不灵活）。PowerShell 位置绑定陷阱：`$Pro string → switch`，任务文本走 `Position=0` 的 `TaskText`，否则裸调用文本会落进 `$Pro` 造成隐式 pro。
- **降级路径（按顺序）**：① 层内 failover（同 priority 换 key）→ ② 逐层下探到 `priority: 0` 的兜底 key（**当前已无兜底**，见存疑）→ ③ path 认领者失效时**返回失败而不回退**（安全性质：宁可报错也不要静默走错上游；`selftest-path-prefixes.mjs` 的 T4 用 `officialFail.on` 开关而不是 `close()` 端口，避免 TIME_WAIT）→ ④ gateway 整体挂 → 计划任务 `Goat-Gateway-Watchdog`（每 1 分钟，连查两次 `/health` 均失败才重启）+ `start-gateway.vbs` 点火 → ⑤ watchdog 救不了的：改坏 `gateway.mjs`。旧文件复制到别处再跑会起不来：`gateway.mjs:15` 有 `import ... from './loop-guard.mjs'`，同目录依赖必须一起带；且备份文件名无 `.mjs` 扩展时 node 按 CJS 解析 ⇒ `import` 语法错，**只表现为 health timeout**（极难诊断）。
- **D 盘写入边界（踩过两次）**：非提权下 `[IO.File]::Open('keys.json','Open','ReadWrite','None')` **能过**、`[IO.File]::WriteAllText('...\__wtest.tmp','x')` **能过**，但 python `shutil.copy2` 建 `.bak` / `io.open(p,'w')` 覆写 → **`PermissionError: [Errno 13]`** ⇒ **create-new 语义被拦**。判定标准不同，**不要用「PowerShell 能写」推断文件可替换**。改 D 盘 gateway 配置一律走 UAC：`Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','<ps1>'`，**提权脚本的日志必须写到 C 盘**（`~/.dsh/logs/`），否则无法验证是否真跑到。

---

## J 判据

- **J1 · usage 覆盖率**：`grep -c ' OK '` 与 `grep -c 'usage='` 的比值应 ≈ 100%。掉到 15% 左右 ⇒ 先怀疑 tail 封顶，不要怀疑上游。
- **J2 · quota 权重是否按 month 读**：`curl -s http://127.0.0.1:8788/health` 的 `quotaSync.detail` 应显示 `163: 剩 75.1h -> w5.00` / `qq: 剩 713.1h -> w0.20`；若"最近复位"与 `weeklyReset` 一致而与 `monthReset` 相反，说明配置退回 weekly —— `selftest-quota-priority.mjs` 的 **T8** 专钉这条（反向验证时精确报 `月重置最近的 goatA 应拿满权重 5，实际 0.2`）。
- **J3 · 逐 key 可观测性**：`/health` 顶层 `priorityTiers` / `quotaSync{enabled,url,mode,resetWindow,ok,ageSec,error,detail}`；逐 key `priority` / `quotaAccount` / `weightStatic` / `weightEffective` / `weightFromQuota` / `pathPrefixes`。
- **J4 · 一次失败该不该冷却**：看 `reason` —— `unauthorized`(180s) 是真 key 问题、`authModel`(30s) 是 model 级绑定问题、`quota`(600s) 是额度、`rateLimit`(60s) 是限流、`server`(15s) / `network`(20s) 是瞬时。`attempted` 为空 ⇒ `selectKey` 里 `fresh` 为空 ⇒ 全部 key 在冷却（`gateway.mjs:463-464`）。
- **J5 · 面板数字对不上时先验数据源再验插件**：`curl -s http://127.0.0.1:8790/quota` 看原始 JSON（含 `plan=official-balance` / `available=-0.22` 这类行），再核 `profiles/{web,desktop}/node_modules/@local/dsh-plugin-goat-panel` 的版本（曾读到 09-25 的 11100B 旧版、没有 official 分支；源在 `D:\Toolbox\goat-gateway\dsh-plugin-goat-panel\lib\client.js`）。`dsh plugin ... add file:<path>` 是**拷贝**而非软链 ⇒ 改源后必须手动同步或改 junction。
- **J6 · 成本异常先看"已计价会话数 / 总数"**：`1558/1599` 且未计价那 41 个是 0 token ⇒ 正常；`151/1468` ⇒ overlay 没生效或没重启 App。
- **J7 · 改 profile patch 后必须用 `--dump-config` 验 merge 语义**：`dsh --profile web --dump-config`（正常 ~552 行，exit=0 / stderr 0 B），确认目标 row 的值变成新值，且其上方正是 `# == ... patched by ...cordis.patch.yml`。
- **J8 · 语法检查固定三件套**：`node --check gateway.mjs`、PowerShell `Parser::ParseFile`（`parsecheck.ps1`）、python `json.load(...)` 验 keys.json / config.json。JS 源码插入一律用**文件里已存在的锚点**替换（不要在字符串里重建整段代码）。
- **J9 · 回归套件是改动的准入门槛**：`selftest.mjs`(13) + `selftest-multiupstream.mjs`(6) + `selftest-quota-priority.mjs`(7) + `selftest-path-prefixes.mjs`(6) + `selftest-tail-window.mjs`，全绿才上线。**注意**：子进程 `childLog` 是异步收集的 ⇒ 断言日志内容前必须 `await sleep(200)`；测试的清理代码若放在断言之后，断言一抛就跳过清理，mock 401 与冷却残留会连坐后续用例（表现为后续用例莫名 503）。

---
## X 反例

- **X1 · 把 `commandcode-goat` 加进 `MODELS_DEV_PROVIDER_IDS` 映射成 `deepseek`** —— 看似"补上 provider 名"的最直觉修法，实际会先命中 `direct !== null` 分支，而该分支 `lookupFace` 失败即 `return null`、**不再下沉**到 model-side index ⇒ 现在能正确计价的 `deepseek/deepseek-v4-pro` / `-v4-flash` 一起变 null。**修好 A 却弄坏 B，是价目 overlay 类补丁的典型陷阱。**
- **X2 · 让 helper 猜默认值**：第一版 `pathAllowed` 写 `if (!Array.isArray(pfx) || !pfx.length) return true;`（未声明者一律放行），与它上方注释（"有人认领 → 未声明的出局"）语义**相反** ⇒ GOAT key 照样进候选集，priority 100 压过 official 的 0 ⇒ 404 照旧。正解：把"有人认领"这个上下文显式传进判定函数。**「默认放行 vs 默认出局」的开关，不允许在没有上下文的 helper 里猜。**
- **X3 · 把否定断言写进注释当事实**：`// GOAT 只有 5h / weekly 两个窗口带时间戳，月度池服务端不给日期` —— 半年后这句被当成结论照抄，直接把 `resetWindow` 定成 `weekly`，排反优先级、烧错账号。**注释里的否定断言必须可验证，否则它反过来束缚实现。**
- **X4 · 用硬编码偏移改 JSON**：`'"enabled": true'` = **15** 字符、`'"enabled": false'` = **16** 字符（delta = +1 是**正确**预期），PowerShell 里硬编码 `Substring($j + 16)` 多切 1 字符吃掉后面的逗号 ⇒ `Invalid object passed in, ':' or '}' expected. (187)`。正解：用 `needle.Length` 或 python `s[:j] + new + s[j+len(needle):]`，改完 `ConvertFrom-Json` 验 + 失败自动回滚。
- **X5 · 单样本推断整组**：拿一个 model 的 403 样式去推断整批模型可用性。那次对账的正确基准是**用户贴的 64 条定价页**（我的 61 个正好是它的子集、无多余项），而不是我探出来的 86 个。批量探测必须逐条落盘 + 可 `--resume`。
- **X6 · 短时间密集探不同 model** ⇒ 上游节流**伪装成 403 `Authentication failed`**。间隔 ≥5s；连续 3 次限流要 `sleep 35` 再续。这条也会污染 `authModel` 冷却判断。
- **X7 · 以为 `reasoning_effort: "off"` 能关思考** —— dsh 的 `off` 只是不发送字段，relay 默认 thinking enabled。真杠杆是 `max_tokens`。
- **X8 · 修完就杀用户的进程**：反复 `Stop-Process dsh.*web` 导致浏览器断连，被当成"面板不刷新"。需要常驻服务时用后台进程保留机制，不要杀用户在看的页面。
- **X9 · 验证时只等 35 秒**：`quota-http` 有 30s TTL + headless Chrome 的 `setInterval` 会被节流 ⇒ 35s 观察会误判成"不刷新"。正确观察窗口 **75 秒**（实测 T1=17:53:46 → T2=17:54:42 `CHANGED=true`）。
- **X10 · 前 64KiB 封顶当成滑动窗口** —— 症状是"usage 偶发缺失"，极易被误判成"上游有时不返回 usage"，从而在错误的地方查上游。
- **X11 · python 行式 patcher 的「整行替换」手法用多行语句的第一行**：会**删掉该行剩余部分**（把 `const worst = rows.reduce((m, r) => (r.error ? m :` 后面的半句吃掉）。行内子串替换必须 `line.replace(needle, repl, 1)`，出错后从 backup 恢复重做。
- **X12 · 在 JS 字符串里重建代码**：用 python 往 JS 里插用例时 `\n` 字面量会被写成真换行（`SyntaxError: Unexpected token ':'`）⇒ 改 JS 文件一律用**已存在于文件里的锚点**做替换。另：C/JS 块注释里绝不能出现 glob 星号紧贴斜杠（`~/.dsh/profiles/*/node_modules/...` 的 `*/` 会提前闭合块注释），报错定位在**下一行末尾**，极具误导性。
- **X13 · Git Bash 传 Windows 路径**：`D:\...` 反斜杠会被 MSYS 改写（`schtasks /Query` → `C:/Git/Query`）。传正斜杠、或把命令放 PowerShell 里跑、或 `export MSYS_NO_PATHCONV=1`。

---

## R 复现

```bash
# 拓扑与健康（只读）
timeout 20 curl -sS http://127.0.0.1:8788/health | python -c 'import json,sys; d=json.load(sys.stdin); print(d.get("priorityTiers"), d.get("quotaSync"))'
timeout 20 curl -sS http://127.0.0.1:8788/v1/models | python -c 'import json,sys; print(len(json.load(sys.stdin)["data"]))'
timeout 20 curl -sS http://127.0.0.1:8790/quota | head -c 800

# key 池现状（绝不打印 key：只看形态与字段）
cd /d/Toolbox/goat-gateway && timeout 30 python -c "
import json
for e in json.load(open('keys.json',encoding='utf-8-sig')):
    print(e.get('name'), 'enabled=',e.get('enabled'), 'prio=',e.get('priority'), 'w=',e.get('weight'),
          'path=',e.get('pathPrefixes'), 'keylen=',len(e.get('key') or ''),
          'prefix=',(e.get('key') or '')[:5])
"

# usage 覆盖率（J1）
cd /d/Toolbox/goat-gateway && timeout 60 python -c "
import glob
ok=usage=0
for f in glob.glob('logs/gateway-*.log'):
    for l in open(f,encoding='utf-8',errors='replace'):
        if ' OK ' in l: ok+=1
        if 'usage=' in l: usage+=1
print(ok, usage, round(100*usage/max(ok,1),1),'%')
"

# finish=length 的 64-token 特征码
cd /d/Toolbox/goat-gateway && timeout 60 grep -h 'finish=length' logs/gateway-*.log | grep 'reas=64' | head

# 语法 + 回归（改代码前后都跑）
cd /d/Toolbox/goat-gateway && timeout 60 node --check gateway.mjs && timeout 120 node selftest.mjs
timeout 120 node selftest-multiupstream.mjs
timeout 120 node selftest-quota-priority.mjs      # T8 钉死 resetWindow=month
timeout 120 node selftest-path-prefixes.mjs
timeout 120 node selftest-tail-window.mjs         # 灌 149547 B 长流再验 usage

# profile patch 的 dry 验（改任何 models / effort 前）
timeout 120 dsh --profile web --dump-config | grep -n -A3 'agent-default-model'

# 额度真相（credits 口径；key 用 <REDACTED> 占位，绝不贴真值）
timeout 30 curl -sS -H "Authorization: Bearer <REDACTED>" https://api.commandcode.ai/alpha/billing/credits
timeout 30 curl -sS -H "Authorization: Bearer <REDACTED>" https://api.commandcode.ai/alpha/usage/summary
```

**改动纪律**：`patch-*.mjs` / `patch-*.py` 一律提供 `--check / --apply / --verify / --restore`，**锚点 `count !== 1` 即拒绝写入**，写盘后回读比对，`--apply` 连跑两次应得同一 md5（幂等）；`--restore` 后文件应与备份**逐字节相等**。改完 `gateway.mjs` 走 `restart-gateway.ps1`（停 8788 → `schtasks /run Goat-Gateway` → 校验），或用 `schtasks /Create /SC ONCE /ST <now+2min>` 挑空闲窗口。

---
## S 溯源

fact 语料（`C:/Users/27063/AppData/Roaming/reasonix/memory/global/`）：

- `goat-gateway-多上游-官方key与goat平级入池.md` · `goat-gateway-优先级分层与quota动态权重.md` · `goat-gateway-quota动态权重-resetWindow必须用month.md`
- `goat-gateway-403-taxonomy-and-dsh-reasoning-models.md` · `goat-gateway-gzip-fix-and-model-allowlist-20260930.md` · `goat-gateway-key-weight-and-model-id-forms.md`
- `goat-gateway-sse-tail-truncation-fix-20261002.md` · `goat-gateway-path-独家认领机制.md` · `goat-gateway-额度400修复与官方余额通道.md`
- `goat-gateway-deepseek-official-disabled-20261016.md` · `commandcode-goat-额度查询端点与看板工具.md` · `goat-model-menu-and-pro-latest-pointer-baseline-20260928.md`
- `api-调用默认-command-code-goat-套餐-key-而非-deepseek-官方.md` · `deepseek-v41-flash-effort-实测与三层档位域-20260930.md` · `finish-length-is-internal-64token-20261004.md`
- `dsh-context-pricing-overlay-patch-20261002.md` · `2026-09-30-replay-cost-tile-muse-不计费-根因与补丁.md` · `goat-额度内置面板-dsh-web-ui-插件与-reasonix-hook.md`
- `goat-额度-mcp-植入-reasonix-与-dsh.md` · `goat-额度面板事故复盘-hook-timeout-单位与-dsh-刷新验证.md` · `goat-额度-窗口标题方案与时间含义-2026-09-25.md`
- `github-public-备份泄露-goat-key-事件与根因修复-2026-09-23.md` · `dsh-gate-双机路由铁律.md` · `dsh-gate-双机配置档案.md`
- `tianque-linux-unreachable-dualboot-and-gateway-patch-prep-20261004.md` · `linux-天阙机-goat-额度同步-reasonix-balance-url-dsh-面板-2026-09-26.md` · `deepseek-v4-flash-ga-0731.md`
- `correction-deepseek-v41-flash-has-native-vision-20260927.md` · `reasonix-状态栏余额打桩为-goat-六额度-2026-09-25.md` · `weixin-bot-goat-provider-402-fix.md`

现场只读观察（本次核对时间点：语料读到的最后状态）：
- `D:/Toolbox/goat-gateway/keys.json`、`config.json`、`model-allowlist.json`、`gateway.mjs`（`reasoning-echo-filter` 段在 962-1000 行、tail 用法在 1271-1285 附近、`// echo-filter-call-start` 在 1660 行）
- `~/.dsh/profiles/web/cordis.patch.yml:690-740`（`agent-default-model` + `llm-pi-ai` 的 `commandcode-goat` / `commandcode-goat-anthropic` 两个 provider 段）
- `~/.dsh/storages/dsh-context-price-overlay.json`
- `~/.dsh/PLAN.md`（181-187 / 484-498 / 576-600 / 889-912 / 977-1050 行段）

---

## 存疑

1. **client 清单**：任务 brief 提到 zcode / trae 也走同一 gateway，但 fact 语料里只有 dsh（web/desktop/headless）与 Reasonix 的直接证据（`baseURL` / `base_url`）。zcode / trae **未验证**。
2. **`deepseek-official` 的终局**：2026-10-16 的记录是 `enabled: false`（条目仍在 keys.json 里）；本次读 `D:/Toolbox/goat-gateway/keys.json` 只有 `163`（`enabled: false`）与 `qq`（`enabled: true`）两条，**没有 `deepseek-official` 条目**。是后来被整段删除、还是我读到的是精简副本，PLAN.md 里无记录。
3. **当前实际处于"单层单 key"退化态**：现网仅 `qq` 一个可用 key，`163` 已 disabled，`priority` 字段也不在本次读到的 keys.json 里 ⇒ 分层与 failover 机制事实上无对象；这一状态的风险等级没有评估记录。
4. **Linux 侧补丁同步状态不明**：tail 窗口补丁只打在 Windows；Linux `~/goat-gateway/gateway.mjs`（1642 行）行 1101 同 bug 未修，reasoning-filter 与 bodylog 锚点也不同，`tianque` 长期 offline。
5. **`gateway.mjs` 行数漂移**：语料中出现 911 / 1416 / 1465 / 1642 / 1743 / 1744 行多个版本，"当前 1744 行"只对应 2026-10-02 那个时间点，本文引用行号须按版本校准。
6. **GOAT `/v1/models` 数量**：69 / 82 / 86 三个数字分别对应不同日期与"是否已过 allowlist"，不能直接比较。
7. **models.dev 是否已补 `deepseek-v4.1-flash`** 未验证；若上游已补，本地 overlay 属冗余（但仍无害，精确匹配优先）。
8. **`finish=length` 是否已彻底归零**：补丁已落盘但状态是"待重启 web 进程与 desktop App 后验收"，语料里没有验收后的复测记录。
9. **`_priceBasis` 里的汇率折算**：overlay 用 `1 CNY = 0.15 USD` 与 dsh-context 的 `USD_PER_CNY` 一致，但这是插件常量而非实时汇率；跨源对账时要记住这一层近似。
