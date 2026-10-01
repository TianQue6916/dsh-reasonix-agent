---
id: mem-c85857a27b75a69af31ca8ff6d851ce9
revision: 1
created_at: "2026-10-01T06:14:18.893Z"
updated_at: "2026-10-01T06:14:18.893Z"
name: dsh-web-search-三源聚合最终形态
description: "dsh web_search = GitHub + DeepSeek 官方 + 本地 wiki 三源并发聚合（rank github>deepseek>wiki）；含 provider id、凭证/熔断、maxUses=3、生效边界与验证工具"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 形态（截至 2026-10-01 实测）

`web_search` 的 provider 是自建插件 `D:/Toolbox/goat-gateway/dsh-plugin-local-search`（`id: local-wiki-github`），**三源并发聚合**而非 fallback 链：

| rank | 来源 | 识别指纹 |
|---|---|---|
| 0 | GitHub 全站（repos + code + issues，`priorityOwner: TianQue6916` 在该源内提前） | `github.com/...`；title = `owner/repo · Lang`；snippet 带 `★N`；issue 前缀 `[GitHub] ` |
| 1 | DeepSeek 官方搜索 | 普通公网 URL（含 PDF），title = 网页标题 |
| 2 | Linux local-search 聚合器（PocketWiki + 离线 Wikipedia ZIM，Tailscale `100.79.96.82:8810`） | URL `http://100.79.96.82:8810/wiki/...`；snippet 前缀 `[离线维基 2026-06]` |

合并规则：每源先吃配额 `ceil(maxResults/来源数)`（maxResults=8 → 3/3/2，保证三源都露面）→ 剩余名额按 rank 回填 → 最后按 rank 稳定排序（github 块 → deepseek 块 → wiki 块）；跨源同 URL 保留 rank 最高那份；`interleaveSources: true` 切换成 round-robin。

## 关键 id 与配置

- **deepseek 官方 provider 注册的 id 是 `deepseek-official`**，不是 row id `web-search-deepseek`（dsh-base 默认 `searchProvider` 也是 `deepseek-official`）。旧配置里 `fallbackProviderId: web-search-deepseek` 是解析不到的无效 id。
- 三个 profile（web / desktop / headless）的 `package.json → dsh.profile.bundles` 都含 `dsh-plugin-local-search`，node_modules 都 symlink 到 `D:/Toolbox/goat-gateway/dsh-plugin-local-search` ⇒ 改插件即三端同改；bundle patch 设 `web.searchProvider: local-wiki-github`。
- `available()` **不能**当"有没有 key"的判据：provider 的 `resolveOptions()` 里 `resolveApiKey`/`resolveAccountToken` 两个函数恒存在 ⇒ `available()` 恒 true，真正的凭证检查在调用时抛 `WEB_PROVIDER_CREDENTIAL_MISSING`。
- 凭证在**每次搜索时** resolve（`credentials.resolve('DEEPSEEK_API_KEY')` → launch env）⇒ 补 key **不需要重启** dsh；实测 2026-10-01 补 key 后下一次搜索立即生效。
- 凭证缺失类错误触发插件内熔断 `deepseekFailureCooldownMs`（默认 600000ms），期间不再发起、只 warn 一次，github/wiki 照常返回。
- `web-search-deepseek` row 的 `maxUses` 2026-10-01 从 100 改为 **3**（三端 `profiles/*/cordis.patch.yml`；每 query 都打一次 model turn，而 `dsh-tool-web` 的 `searchMaxQueries` 默认 4）。
- 成本控制：`deepseekCacheTtlMs` 默认 120000（同一 query 并发复用，避免重复打 model turn）。
- 兜底：三源全空才回退 `fallbackProviderId`（默认 `multi-search`，本机未安装该包 ⇒ 实际只打一条日志）；fallback 指向 `deepseek-official` 时被代码显式拦住，避免白跑一次 model turn。

## 生效边界

- `index.js` 与插件 bundle 里的 `cordis.patch.yml`（在 node_modules）**不参与 HMR ⇒ 必须重启**（web = 重启 `dsh web`；desktop = 重启 Electron app；headless = 下次启动）。
- 只改 `~/.dsh/profiles/<name>/cordis.patch.yml` ⇒ `patchReload: live`（web/desktop）开新会话即生效；headless 是 `startup`。
- 用户层要覆盖插件 row 时必须写**完整**同名 row（row 是 replace 语义，`name` + 全字段都要带），否则会丢字段。

## 验证方式

- 自测：`cd D:/Toolbox/goat-gateway/dsh-plugin-local-search && node selftest.mjs` → 9 组（rank 顺序 / 配额 / 跨源去重 / 回填 / 交错 / 三路并发 / 单源失败降级 / 空结果回退 / 凭证熔断），全程不碰真实网络。
- 配置合成：`dsh --profile web --dump-config`；headless 同理；**desktop 被 Electron 独占**（`dsh/lib/bin.js:36` 守卫直接 error）⇒ 用 `~/.dsh/storages/tools/dump-desktop-config.ps1 -Pattern '...'`（探针 profile + node_modules junction，跑完自删）。
- 实跑指纹（2026-10-01，query `Boyer-Moore majority vote algorithm`）：8 条 = github 3 + deepseek 3（hackage / apps.dtic.mil PDF）+ wiki 2。
- 改动备份：`D:/Toolbox/goat-gateway/dsh-plugin-local-search/index.js.bak-20260930-2135-pre-deepseek-rank`、`cordis.patch.yml.bak-20260930-2135-pre-deepseek-rank`、三个 profile patch 的 `.bak-20261001-1415-pre-maxuses`。
