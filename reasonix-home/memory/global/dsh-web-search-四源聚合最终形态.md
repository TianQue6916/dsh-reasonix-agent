---
id: mem-c68204a1d979d340aefd3ea411ed5255
revision: 2
created_at: "2026-10-01T11:17:56.294Z"
updated_at: "2026-10-01T12:01:35.531Z"
name: dsh-web-search-四源聚合最终形态
description: "dsh web_search 自定义 provider 的最终形态：默认三源（github > deepseek > wiki），goat 第四源因 Claude 计费默认关闭"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 位置与生效
- 插件源码：`D:/Toolbox/goat-gateway/dsh-plugin-local-search/`（`index.js` / `cordis.patch.yml` / `selftest.mjs` / `README.md`）。
- 三个 profile（`~/.dsh/profiles/{web,desktop,headless}/node_modules/dsh-plugin-local-search`）都是**指向该目录的 symlink** ⇒ 改一处三端同改。
- 插件是 bundle（node_modules）→ **不参与 HMR，改 `index.js` 或插件自带 `cordis.patch.yml` 必须重启 dsh**（`powershell -NoProfile -ExecutionPolicy Bypass -File ~/.dsh/launch-dsh.ps1 -Mode Serve`）。想免重启：在 `~/.dsh/profiles/<p>/cordis.patch.yml` 里加一条**完整同名 row**（replace 语义），那条走 `patchReload: live`。
- 零副作用校验：`dsh --profile web --dump-config`（desktop 用 `powershell -File ~/.dsh/storages/tools/dump-desktop-config.ps1 -Pattern X -Context 2`，**`pwsh` 不存在**）。
- 文件都是 **CRLF**（index.js / cordis.patch.yml / selftest.mjs / README.md）——python 批量替换必须用 CRLF 或 line-based，否则 assert 失败。

## rank 与配额（`export const SOURCE_RANK = { github: 0, goat: 1, deepseek: 2, wiki: 3 }`）
- 每源先吃 `Math.max(1, Math.ceil(maxResults / ordered.length))`，剩余按 rank 回填，末段稳定排序（`interleaveSources: true` 改 round-robin），跨源同 URL 只留 rank 高者，四源全空才回退 `fallbackProviderId`（默认 `multi-search`）。
- 每源特征指纹：github = repositories+code+issues，`priorityOwner: TianQue6916` 提前；goat = claude 原生 server tool（引官方文档/源码/issue 最准）；deepseek-official = 一次 model turn；wiki = Linux `100.79.96.82:8810` 的 PocketWiki(provider=pocketwiki) + 离线英文 Wikipedia ZIM(provider=wikipedia)。

## provider id 坑（关键）
- dsh 里 deepseek 官方 provider 注册 id 是 **`deepseek-official`**，不是 profile patch 里那行的 row id `web-search-deepseek`；插件用 `deepseekProviderId` 配它。原 fallback 配置写 `web-search-deepseek` 是无效 id。
- goat 源直接调 `this.web.searchProviders.get(...)` 上的 provider 对象，不走 `ctx.web.search`（否则 seam 会按 configuredId 再选一次）。
- `WebSearchSource` 类型里**没有 `provider` 字段**，插件塞进去只是元数据，dsh-tool-web 不渲染（只显示 `title ?? hostname`）。

## goat 第四源（**2026-10-01 起默认关闭**）
- 走 goat gateway `http://127.0.0.1:8788/v1/messages`（Anthropic Messages）+ native `web_search_20250305`；gateway 61 个模型里**只有 `claude-sonnet-5-5`** 能吃到 server tool（其余走 `/chat/completions`，报 `Model "..." is not supported on this endpoint.`）。
- **成本实测（账本拟合零残差）**：`cost = 2.00e-6 × input + 1.003e-5 × output` ⇒ **$2.00/M input、$10.03/M output**，账本无独立搜索费行。单次 goat 搜索 12–21k input tokens（搜索结果块回灌 context 按 input 计费）⇒ **$0.027–0.055，均值 $0.0383**；乘 `dsh-tool-web` 的 `searchMaxQueries: 4` ⇒ **最坏 ~$0.15/次用户级 web_search**。对照同账号 `deepseek/deepseek-v4.1-flash`（$0.001–0.005）贵 10–40 倍。
- 用户 m00943 选 C ⇒ 关掉。已做：`index.js:45` 与 `cordis.patch.yml:17` 都改 `enableGoat: false`（**两层都显式关**，避免新装静默花钱），`available()` 仍为 true（github/deepseek/wiki 撑着），**不会触发 `WEB_PROVIDER_CONFIGURED_UNAVAILABLE`**。
- 要重新开：`cordis.patch.yml` 写 `enableGoat: true` + 重启；key 从 `~/.dsh/.env` 的 `COMMANDCODE_API_KEY` 读（env 里没有，只有文件）。
- goat 失败熔断正则（`index.js:248`）：`/api key|credential|401|403|account|not registered|credit|quota|balance|insufficient/i`，`goatFailureCooldownMs: 300000`；deepseek 是 `/api key|credential|account/i` + `deepseekFailureCooldownMs: 600000`。

## 已落地验证（2026-10-01 20:10 后）
- `selftest.mjs` **13 组全过**（离线：本机 http stub 当 wiki、fake provider 当 deepseek、monkeypatch `searchGithub`）。新增 **T13 成本安全默认**：断言 `DEFAULT_CONFIG.enableGoat === false` 且 goat 关闭时 `provider.available() === true`。T5–T9 必须显式 `enableGoat: false`；T10–T12 必须显式 `true`。
- 三端 `--dump-config` 都确认 `enableGoat: false` + `searchProvider: local-wiki-github`。
- 备份：`index.js.bak-20261001-2005-pre-disable-goat`、`cordis.patch.yml.bak-...`、`selftest.mjs.bak-20261001-2010-pre-T13`、`README.md.bak-20261001-2015-pre-goat-default-off`。
- 上一版（已废弃）：四源全开，备份 `index.js.bak-20261001-1915-pre-goat-source`。

## 遗留
- goat 账号额度：`qq` key 月额度 99.24%、`163` 82.93%（`%TEMP%/goat-quota-http-cache.json`，来自 `goat-usage.ps1`，查它不花额度）。**gateway 认不出额度耗尽**：上游返 HTTP 400 `insufficient credits`，而 `gateway.mjs:831` 的 `retryableStatus` 不含 400，`:343` 的 quota 冷却只认 402 ⇒ 不冷却不换 key；`selectKey` 只在 `isCooling` 时改绑会话 ⇒ 1717 个会话一半（`qq`:914）钉死在耗尽的 key 上。修法 A（推荐）= 按 body 关键字归入 quota 冷却 600000ms。
- 未采纳的提议（用户未表态）：① 配额按「实际有结果的来源」动态分配；② 把每源失败事件写进 dsh session。
