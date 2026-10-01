# goat-gateway — Command Code GOAT 多 key 网关

> 建于 2026-09-23。解决的问题：手上有**两个 Command Code GOAT 套餐 key**，希望「哪个能用就用哪个」，
> 而且 reasonix 与 dsh 同时受益，不用手动改配置。

## 它做什么

在本机 `127.0.0.1:8788` 暴露一个 OpenAI 兼容入口，把请求转发到 `https://api.commandcode.ai/provider/v1`，
并在 key 池里做**按会话粘滞 + 故障转移**：同一个会话永远用同一个 key，会话之间再分散到不同账号。

```
                      ┌─ 会话 A ─┐
reasonix ─┐           │ 会话 B ─┤──→ key 163   ← 每个会话固定粘在某个 key 上，
          ├─→ 8788 ─→ │ 会话 C ─┤              同一会话的多轮对话全程不换 key（保 prompt cache）
dsh      ─┘  /v1      │ 会话 D ─┤──→ key qq    ← 会话按「当前绑定数最少」分配，双账号负载均衡
                      └─────────┘
                              │
                              ▼
              https://api.commandcode.ai/provider/v1
```

## 为什么不是轮询

上游的 prompt cache（KV cache）**按账号隔离**：同一段对话前缀若交替打到两个账号，两边的缓存都被打断，
换 key 的那个请求，输入几乎全按「未命中」计费。本套餐的价差是：

| | 价格（每百万 tokens） |
|---|---|
| 缓存命中 | ¥0.02019 |
| 缓存未命中 | ¥1.0095 |

**差约 50 倍。** 四种策略（`config.json` 的 `strategy`）：

| 策略 | 行为 | 缓存 | 双账号并发 | 适用 |
|---|---|---|---|---|
| **`session`（默认）** | 同一会话永久粘一个 key；不同会话分散 | 保住 | 用得上（会话级分摊） | 常态 |
| `prefix` | 新会话按 `system + tools + model` 前缀亲和到同一 key；窗口内新会话数软上限，超了再 overflow | 跨会话共享前缀更易命中 | 用得上（窗口计数 + 最少会话兜底） | 想进一步压 prompt cache 成本时 A/B |
| `sticky` | 全局只粘一个 key，失败才换 | 保住 | 用不上（另一个长期闲置） | 只用得起一个账号的额度时 |
| `round-robin` | 每次交替 | **打断** | 用得上 | 仅调试，会显著抬高成本 |

> `prefix` 只是「前缀 → key」的近似，因为上游是黑盒 API，网关看不到真实 KV cache；
> 已有会话仍然由 `state.sessions[fp]` 忠实绑定，本策略只影响新会话首次分配。
>
> 社区同类成熟方案：vLLM Production Stack 的 Session-ID / Prefix-aware routing、llm-d Router 的
> prefix-cache aware EPP、NVIDIA Dynamo 的 KV-Aware Routing、SMG 的 `cache_aware` / `prefix_hash` /
> `consistent_hashing`。它们多数能直接读取 worker 的真实 KV-cache 状态；黑盒 API 场景下只能用
> 「前缀哈希 + 软上限」近似。

判定「同一会话」优先用 `x-reasonix-session-id` / `x-session-id` / `x-conversation-id` 等 session header；
没有 header 时用第一条 `user` message 算稳定指纹，最后才退回 `messages` 前两条。
无 `messages` 的请求（如 `GET /v1/models`）没有会话概念，走全局粘滞分支。

> 2026-09-23 加固：以前用「前两条消息」，一旦 system prompt 动态变化就会导致会话重新分配 key。
> 现在 system prompt 改变不影响会话指纹；`selftest.mjs` 有专门覆盖。

## 三条设计红线（实测过）

| 红线 | 实测结果 |
|---|---|
| **不偷烧 token** | 网关**不主动发任何请求**：没有定时 ping、没有后台 key 校验。只有 reasonix/dsh 发请求才转发 |
| **不降速** | 用固定响应大小的 `/v1/models` 精确测（排除推理耗时）：直连 232ms → 过网关 241ms，**净开销 5–9ms** |
| **不改写报文** | 字节级透传，`reasoning_content` 等非标字段原样保留（dsh 的 `thinkingFormat: deepseek` 依赖它） |

失败重试也**不额外计费**：401/402/403/429 这类被拒绝的请求不产生 token。重试只在「响应头尚未发给客户端」时发生，所以换 key 对客户端完全透明。

## 2026-09-23 稳定性加固

- **客户端主动中断不再切 key**：手动停止、idle timeout、关页面等不会再把当前 key 冷却/切走。
- **响应头发出后上游断流不重试**：已经给客户端看了半截流，不能再换 key 透明重试；直接结束客户端流。
- **重试策略分级**：`401/402/403/429` 立即冷却换 key；`5xx/网络错误` 先在同一个 key 上按 `attemptsPerKey` 重试，再换 key。
- **Cloudflare 1010 单独识别**：不会再把 `error code: 1010` 当成 30 分钟 key 失效。
- **修复 `x-reasonix-session-id` 指纹崩溃（2026-09-24）**：带该 header 的请求，指纹形如 `h:<16hex>`，
  `selectKey` 里 `parseInt(fp.slice(0,8),16)` 得到 `NaN` → `balanced[NaN]` 未定义 → 读 `.name` 抛异常，**整个请求 500**。
  现在统一走 `fingerprintBucket()`（`h:` 前缀/非法值都退化成 sha1 分桶），`selftest.mjs` 新增用例覆盖。
- **统一上游 `User-Agent`（2026-09-24）**：以前把客户端的 header 原样转给上游，reasonix(Go-http-client) 与 dsh(undici) 的指纹不同，
  Cloudflare 1010 的命中率也不同（表现为「同一个 key，一个客户端 200，另一个 1010」）。现在由 `upstream.userAgent` 统一，
  并用 `upstream.stripClientHeaders` 丢掉 `x-reasonix-*` / `x-session-id` 等只服务于本地选 key 的头。
- **1010 不再立刻双 key 冷却（2026-09-24）**：Cloudflare 1010 与 key 无关，现在先在同一 key 上按 `attemptsPerKey` 重试，
  仍失败才冷却（20s），避免一次风控让两个账号同时冷却、客户端直接「卡住」。日志里 1010 会标记 `cloudflare=1010` 并附上实际 UA。
- **配置/keys 热重载**：`http://127.0.0.1:8788/_gateway/reload`；`listen.port` 仍必须重启。
- **`state.json` 原子写、body timeout、hop-by-hop header 清理、坏 JSON 保留上一版配置/keys。**
- **新增自测**（含 `x-reasonix-session-id` header 指纹回归）：

```powershell
node D:\Toolbox\goat-gateway\selftest.mjs
```

覆盖正常流、客户端中断不切 key、5xx 重试/换 key、半截流不重试、Cloudflare 1010、body timeout、
config/keys 坏 JSON 回退、session 指纹稳定、20 并发请求。

## 快速开始

```powershell
cd D:\Toolbox\goat-gateway

# 公平基准：首字延迟 / 解码速率 / 端到端（别再拿 reasonix 状态栏 TPS 跟解码速率比）
node bench-llm.mjs --runs 3

# 健康检查（每个 key 的可用性、冷却、成败计数、策略、会话数）
Invoke-RestMethod http://127.0.0.1:8788/health | ConvertTo-Json -Depth 5

# 启动 / 重启 / 停止
schtasks /run /tn Goat-Gateway                    # 启动（重启 = stop 后再 run）
powershell -NoProfile -ExecutionPolicy Bypass -File .\stop-gateway.ps1   # 停止

# 前台调试（会占住终端，Ctrl+C 退出）
node gateway.mjs

# 安装 / 卸载计划任务
powershell -NoProfile -ExecutionPolicy Bypass -File .\install-tasks.ps1 -Start
powershell -NoProfile -ExecutionPolicy Bypass -File .\install-tasks.ps1 -Uninstall
```

计划任务：

| 任务 | 触发 | 作用 |
|---|---|---|
| `Goat-Gateway` | 用户登录 | 无窗口启动网关（`start-gateway.vbs` → `node gateway.mjs`） |
| `Goat-Gateway-Watchdog` | 每 1 分钟 | 连查两次 `/health` 都失败才重启，避免抖动误杀（日志 `logs\watchdog.log`） |

> **为什么停止要用 `stop-gateway.ps1` 而不是 `schtasks /end`**：任务只负责「点火」，`node` 是脱管进程
> （`wscript` 启动后立即退出）。`schtasks /end` 杀不掉 `node`，它仍会占着 8788 端口，导致「重启」实际没重启、
> 新实例又因端口冲突退出。`stop-gateway.ps1` 和 `watchdog.ps1` 都会显式按端口找出并杀掉该进程。
> 实测：崩溃后看门狗 11 秒内恢复。

## 管理 key、会话绑定与冷却

`keys.json`（**热重载**，改完不用重启）：

```json
{
  "keys": [
    { "name": "163", "key": "user_…", "enabled": true, "note": "账号 163.com" },
    { "name": "qq",  "key": "user_…", "enabled": true, "note": "第二个 GOAT 账号" }
  ]
}
```

- 临时停用某个 key：把 `enabled` 改成 `false`（在它上面的会话会自动重新分配到其它 key）
- 加第三个 key：往数组里追加一项即可，新会话按负载自动分流

会话绑定与冷却（本地端点，不产生任何上游调用）：

```powershell
Invoke-RestMethod "http://127.0.0.1:8788/_gateway/sessions"          # 会话绑在哪些 key 上 + 每个 key 的会话数
Invoke-RestMethod "http://127.0.0.1:8788/_gateway/sticky"            # 看/改无会话请求（如 /v1/models）的全局粘滞目标
Invoke-RestMethod "http://127.0.0.1:8788/_gateway/sticky?name=qq"
Invoke-RestMethod "http://127.0.0.1:8788/_gateway/reset"             # 清空所有冷却（key 恢复后立即复用）
Invoke-RestMethod "http://127.0.0.1:8788/_gateway/reload"            # 强制重载 keys.json
```

> ⚠️ `keys.json` 含明文 key。**不要**把它纳入任何 Git 备份仓库（见 `.gitignore`）。

## 端点切换（让 reasonix / dsh 走网关，或切回直连）

```powershell
# 切到本机网关
powershell -NoProfile -ExecutionPolicy Bypass -File .\set-goat-endpoint.ps1 -Mode gateway

# 一键切回官方直连（网关挂了也能立刻恢复）
powershell -NoProfile -ExecutionPolicy Bypass -File .\set-goat-endpoint.ps1 -Mode direct

# 只看会改什么，不动文件
powershell -NoProfile -ExecutionPolicy Bypass -File .\set-goat-endpoint.ps1 -Mode gateway -DryRun
```

它同时改两处，并各自留 `.bak-goatgateway-<时间戳>` 备份：

| 程序 | 文件 | 字段 |
|---|---|---|
| reasonix | `%APPDATA%\reasonix\config.toml` | `base_url` / `chat_url` / `request_url`（3 处） |
| dsh | `%USERPROFILE%\.dsh\settings.yaml` | `llm-pi-ai.providers.commandcode-goat.baseURL`（1 处） |

**两个程序都是启动时读配置，切完要重启对应程序才生效。**

## 配置（`config.json`）

| 字段 | 默认 | 说明 |
|---|---|---|
| `listen` | `127.0.0.1:8788` | 本地监听地址 |
| `upstream.basePath` | `/provider/v1` | 上游路径；本地 `/v1/xxx` 映射到 `/provider/v1/xxx` |
| `upstream.userAgent` | `commandcode-goat-gateway/1.0` | 统一上游 User-Agent；置空字符串 = 透传客户端原值 |
| `upstream.stripClientHeaders` | `['x-reasonix-','x-session-id',…]` | 转发前丢掉的客户端头前缀（仅本地选 key 用） |
| `strategy` | `session` | `session` / `prefix` / `sticky` / `round-robin`（见上文策略表） |
| `prefixAffinity.windowMs` | 1800000 | `prefix` 策略的新会话计数窗口（30 分钟） |
| `prefixAffinity.maxNewSessionsPerKey` | 10 | 每个 key 每窗口的新会话软上限，超过后 overflow 到其它 key |
| `prefixAffinity.prefixTtlMs` | 1800000 | 「前缀 → key」绑定的 TTL |
| `prefixAffinity.maxPrefixes` | 4000 | 最多记住多少个前缀绑定 |
| `maxSessions` | 2000 | 会话绑定表上限，超出按最久未用淘汰 |
| `maxAttemptsPerRequest` | 4 | 单请求最多换几个 key |
| `retryableStatus` | 401/402/403/408/429/5xx | 触发换 key 的状态码 |
| `cooldownMs.unauthorized` | 1800000 (30min) | key 无效/无权限 |
| `cooldownMs.quota` | 600000 (10min) | 额度耗尽 |
| `cooldownMs.rateLimit` | 60000 (1min) | 限流 |
| `upstream.keepAlive` | `true` | 是否复用上游 HTTPS 连接（长连接空闲久了会 stall 时可试 false） |
| `upstream.agentMaxAgeMs` | 300000 | 连接池最大存活 5 分钟，到期重建 Agent/TLS，避免长连接吐字衰减 |
| `upstream.firstChunkTimeoutMs` | 180000 | 请求发出后 3 分钟内没有第一个 body chunk 就断开重试（大上下文 prefill 兜底）；`0` = 关闭 |
| `upstream.streamIdleTimeoutMs` | 30000 | 首个 chunk 之后 30s 内没有新 chunk 就断开（流内 stall）；`0` = 关闭 |
| `upstreamTimeoutMs` | 900000 | 上游 socket 总超时（长输出兜底；空闲保护由上面那项先出手） |

冷却状态、会话绑定、全局粘滞目标都持久化在 `state.json`，网关重启后仍然生效。

## 日志

`logs\gateway-YYYY-MM-DD.log`，每行一次请求/事件：

```
SESSION-BIND 9f8fe410 163 (sessions per key: 163=6 qq=2)   # 新会话首次绑 key，附当时的负载
OK   id=19 POST /provider/v1/chat/completions key=163 status=200 252ms sess=9f8fe410 model=… stream=true usage={…}
FAIL id=26 …  key=bogus-test status=401 371ms sess=- body="…Invalid 'Authorization'…"
COOLDOWN key=bogus-test reason=unauthorized status=401 for=1800s
SWITCH   id=26 attempt=2 -> key=163          # 本次请求内部换 key 重试（原 key 失败）
```

- 同一个 `sess=` 反复出现同一个 `key=` —— 这就是想要的（会话内缓存不被打断）
- `SESSION-BIND` 会打印分配时的双账号负载，可直接看出均衡效果
- `OK` 带 `usage=` 即该次请求真实 token 消耗，可用它核对账单
- 日志默认保留 30 天，自动清理

## 故障排查

| 症状 | 处理 |
|---|---|
| reasonix/dsh 报连接失败 | `Invoke-RestMethod http://127.0.0.1:8788/health`；不通就 `schtasks /run /tn Goat-Gateway` |
| 两个 key 都失效 | `/health` 里看 `available=false` 与 `cooldownReason`；换新 key 写进 `keys.json` |
| 某个 key 被误判冷却 | `Invoke-RestMethod http://127.0.0.1:8788/_gateway/reset` |
| 想知道某会话用了哪个账号 | `…/_gateway/sessions`；日志里搜 `sess=<指纹前8位>` |
| 想固定用某个账号 | 把别的 key 的 `enabled` 设为 `false`，或设 `strategy: sticky` + `…/_gateway/sticky?name=qq` |
| 怀疑模型输出被改 | 不会：网关字节透传，不解析业务字段（只 tail 抓 `usage` 统计） |
| 想彻底退回直连 | `set-goat-endpoint.ps1 -Mode direct` + `stop-gateway.ps1` |

## 实测记录（2026-09-23）

| 项目 | 结果 |
|---|---|
| 转发净开销 | +5–9ms（`/v1/models` 固定响应：直连 232ms vs 过网关 241ms） |
| 会话粘性 | 同一会话连发 3 次，日志 `sess=9f8fe410` 全部 `key=163` |
| 负载均衡 | 6 个新会话时前 5 个分给负载低的 `qq`、第 6 个补 `163`，最终 163=7 / qq=7 |
| 失败转移 | sticky 指向失效 key → `FAIL 401 → COOLDOWN → SWITCH → OK 200`，客户端全程 200 |
| 看门狗自愈 | kill 掉 node 后 11 秒恢复（DOWN → RECOVERED） |

## 后续升级路径（调研记录）

需求真是「多上游 + 面板 + 用量统计」时，可换成成熟项目；当前这套的取舍：

| 方案 | 优点 | 在本场景的硬伤 |
|---|---|---|
| 本网关（现用） | 零依赖、零空转、字节透传、5–9ms、会话级粘滞+均衡 | 无 UI、无用量看板，需要自己维护 |
| [GPT-Load](https://github.com/tbphp/gpt-load)（6K★, Go 单 exe） | 透明代理、加权均衡、黑名单恢复、有面板 | **默认每 60 分钟后台校验所有 key**（会发真实请求烧 token，需关掉）；需建 channel/group/AccessKey + SQLite |
| [LiteLLM](https://github.com/BerriAI/litellm)（~30k★, Python） | 路由最成熟 | 是**转换层**不是透传层，会解析重建报文，`reasoning_content` 有丢失风险；Python 3.13 依赖较重 |

迁移成本低：`keys.json` 里的 key 直接搬进新方案即可。