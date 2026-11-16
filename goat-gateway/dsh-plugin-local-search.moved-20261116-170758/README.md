# dsh-plugin-local-search

把 dsh 的 `web_search` 底层 provider 换成**多源并发聚合**（不是 fallback 链）：
一次搜索同时发起各路，结果合并成一份列表统一返回。**默认三源**（GitHub / DeepSeek 官方 / Linux wiki）；
第四源 goat 质量最好，但走 Claude 单价计费，**默认关闭**（原因见「为什么 goat 默认关闭」）。

| rank | 来源 | 说明 |
|---|---|---|
| 0 | **GitHub 全站** | repositories + code + issues；`priorityOwner` 的仓库在这个来源内部提前 |
| 1 | **goat / Claude**（默认关闭）| Command Code GOAT 的 `claude-sonnet-5-5`，走 `http://127.0.0.1:8788/v1/messages`（Anthropic Messages）+ native `web_search_20250305`。实测命中「答案所在页」（官方文档 / 源码树 / issue / README）的比率最高，但要花套餐额度、6–10s，**单次约 $0.038**。要开：写 `enableGoat: true` |
| 2 | **DeepSeek 官方搜索** | dsh 的 `deepseek-official` provider（Anthropic 兼容 Messages + native `web_search` server tool）。**每搜一次 = 一次 model turn，要花钱、要等** |
| 3 | **Linux local-search 聚合器** | PocketWiki + 离线 Wikipedia ZIM（Tailscale 内网） |

合并规则（`mergeSources`，纯函数、有 selftest）：

1. 每个来源先吃自己的配额 `ceil(maxResults / 来源数)` —— 保证四源都露面；
2. 剩下的名额按 rank 顺序回填；
3. 跨源同一 URL 只保留 rank 最高的那一份；
4. 最后按 rank 稳定排序 → 输出永远是「github 块 → goat 块 → deepseek 块 → wiki 块」（`interleaveSources: true` 改成 round-robin 交错）；
5. 四源全空才回退到 `fallbackProviderId`（默认 `multi-search`）。

它不修改 dsh 核心，只通过 `ctx.web.registerSearchProvider` 注册一个 provider。

## 安装

```powershell
dsh plugin --profile web add "link:D:/Toolbox/goat-gateway/dsh-plugin-local-search"
dsh --profile web --dump-config | Select-String local-wiki-github   # 零副作用校验
```

bundle patch 会把 profile 的 `searchProvider` 设成 `local-wiki-github`。

## 生效方式（重要）

- `index.js` 与 `cordis.patch.yml` 都在 node_modules 里的 bundle → **不参与 HMR，必须重启 dsh 进程**。
- 只想改配置又不想重启：在 `~/.dsh/profiles/web/cordis.patch.yml` 里加一条**完整的**同名 row
  （row 是 replace 语义，`name` 和全部字段都要带上），那条走 `patchReload: live`。
- 校验：`dsh --profile web --dump-config`（零副作用，能在不重启的情况下看合成结果）。

## 配置

| 字段 | 默认 | 说明 |
|---|---|---|
| `aggregatorUrl` | `http://100.79.96.82:8810` | Linux local-search 服务 |
| `tokenFile` | `C:/Users/27063/.dsh/local-search-token` | 读取 aggregator token 的文件 |
| `enableWiki` / `enableGithub` / `enableDeepseek` | `true` | 三路默认来源开关（并发）|
| `enableGoat` | `false` | 第四路来源开关，**默认关闭**（走 claude-sonnet-5-5 计费）|
| `deepseekProviderId` | `deepseek-official` | deepseek 官方 provider 在 dsh 里注册的 id（**不是** row id `web-search-deepseek`） |
| `goatBaseUrl` | `http://127.0.0.1:8788/v1` | goat gateway 地址（Anthropic Messages 路由） |
| `goatModel` | `claude-sonnet-5-5` | 62 个 allowlist 模型里唯一能用 server tool 的 Claude 模型 |
| `goatApiKeyEnv` | `COMMANDCODE_API_KEY` | key 环境变量名（env 里没有，实际从 `goatEnvFile` 读） |
| `goatEnvFile` | `C:/Users/27063/.dsh/.env` | key 所在的 `.env` 文件 |
| `goatTimeoutMs` | `50000` | goat 单独的超时预算（实测 6–10s） |
| `goatMaxUses` | `3` | 一次请求内最多几轮 server tool 搜索 |
| `goatCacheTtlMs` | `120000` | 同一 query 的 goat 结果短期复用，0 = 关 |
| `goatFailureCooldownMs` | `300000` | goat 凭证/额度类失败后的熔断时长，0 = 不熔断。触发词含 `credit`/`quota`/`balance`/`insufficient`——上游额度耗尽时返回的正是 `You have insufficient credits`（HTTP 400），会连打 4 次白烧日志，所以必须熔断 |
| `deepseekTimeoutMs` | `50000` | deepseek 单独的超时预算（一次 model turn）；必须 < `dsh-tool-web` 的 `searchTimeoutMs` |
| `deepseekCacheTtlMs` | `120000` | 同一 query 的 deepseek 结果短期复用，0 = 关（`dsh-tool-web` 的 `searchMaxQueries` 默认 4，可省 model turn） |
| `deepseekFailureCooldownMs` | `600000` | deepseek 凭证/账号类失败后的熔断时长，0 = 不熔断 |
| `timeoutMs` | `20000` | wiki / GitHub 单次超时 |
| `maxResults` | `8` | 合并后的总上限（`dsh-tool-web` 也会再裁一刀） |
| `interleaveSources` | `false` | `true` = round-robin 交错，而非 rank 分块 |
| `tagTitles` | `false` | `true` 时把来源名写进 title（`[github] xxx`）便于肉眼区分 |
| `enableFallback` | `true` | 四源全空时是否回退（`deepseek-official` / goat 已被显式排除） |
| `fallbackProviderId` | `multi-search` | 回退目标。**别指向 `deepseek-official`**：它已是并发来源，代码会拦住避免白跑 model turn |
| `priorityOwner` | `TianQue6916` | 这个 owner 的 GitHub 结果在同来源内提前 |
| `githubCaFile` | `C:/Users/27063/.dev-sidecar/dev-sidecar.ca.crt` | 把 dev-sidecar 的本地 CA 追加到系统根证书，用于验证本地 MITM 代理 |
| `insecureTls` | `true` | `githubCaFile` 不存在时的兜底：跳过证书校验 |

## 自测

```powershell
node selftest.mjs    # 13 组：rank 顺序 / 配额 / 跨源去重 / 回填 / 交错 / 并发 / 单源失败 / 回退 / 缓存 / 熔断 / goat 解析 / 四源配额 / goat 熔断 / 默认配置（goat 关）
```

不碰真实网络：GitHub 走实例 monkeypatch，deepseek 走假 provider，wiki 走本机 http stub。

## GitHub token

按优先级：`GITHUB_TOKEN` / `GH_TOKEN` / `GITHUB_PAT` 环境变量 → `githubTokenFile` → `git credential fill`。
没有 token 时仍会搜仓库和 issues（匿名限流），但不会搜代码。

## 成本与延迟

- **默认三源里只有 deepseek 会花钱**：一次 `web_search` 工具调用最多 4 个 query（`dsh-tool-web` 的
  `searchMaxQueries`，实测三条 `tool-web` row 都没覆盖它 ⇒ 生效值 4），每个 query 并发打一次 deepseek
  （一次 model turn）⇒ 最坏 4 次。嫌贵：调小 `searchMaxQueries`，或把 `deepseekCacheTtlMs` 调大
  （同一 query 的并发子查询会被压成 1 次）。
- 任一路慢或失败时，其余来源的结果照常返回（`Promise.allSettled`，单源失败只记日志 + 触发熔断）。

## 为什么 goat 默认关闭

2026-10-01 用真实账单拟合出的结论。goat 走 `claude-sonnet-5-5`，而 gateway 的 61 个模型里只有它
这一个能吃到 Anthropic 的 server-side `web_search`：其余模型走 `/chat/completions` 路由，
发 `web_search_20250305` 会直接报 `Model "..." is not supported on this endpoint.`。

用户账本里 7 行 claude 记录与 `cost = 2.00e-6 × input + 1.003e-5 × output` **零残差**
⇒ 单价 **$2.00/M input、$10.03/M output**，且账本没有独立的搜索费行（费用与 tokens 严格线性）。
真正贵的是 Anthropic 的机制：**搜索结果块会被回灌进 context 并按 input token 计费**，
实测单次 12–21k input tokens ⇒ $0.027–0.055，均值 $0.0383。

再乘上 `dsh-tool-web` 的 `searchMaxQueries: 4` ⇒ **一次用户级 `web_search` 最坏 ~$0.15**。
对照同一账号 `deepseek/deepseek-v4.1-flash` 的对话 turn（$0.001–0.005），goat 贵 10–40 倍。
质量确实更好（命中「答案所在页」+ 敢说找不到），但不该默认开着：要开就在 `cordis.patch.yml`
里显式写 `enableGoat: true`，并确认额度充足（额度耗尽时上游返 HTTP 400 `insufficient credits`，
插件按 `credit`/`quota`/`balance`/`insufficient` 关键字熔断 5 分钟）。

## 安全说明

- `local-search` 服务绑 Tailscale，内容端点不在公网。
- goat 的 `COMMANDCODE_API_KEY` 从 `~/.dsh/.env` 读出后只在内存里，不落盘到插件配置。
- token 文件不写进插件配置，Linux 侧权限 `0600`。
- GitHub token 不落盘，优先用系统凭据。
