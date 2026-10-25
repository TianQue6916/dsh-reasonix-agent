---
id: "c6920883-b535-418c-afe8-68e83c7dfa0b"
title: "dsh-plugin-local-search：web_search 三源并发聚合 provider（rank 合并语义、deepseek-official 正确 id、凭证熔断、Git Bash find / 全盘卡死取证）"
description: "2026-09-30 把 profiles/web 的 web_search provider 重写为 GitHub + DeepSeek + 本地 wiki 三源并发聚合的实现交接：mergeSources 的 rank 配额/去重回填语义、deepseek provider 注册 id 是 deepseek-official（原 fallbackProviderId 永解析不到）、凭证缺失时的 600s 熔断降级、maxUses 成本风险，以及 Windows/Git Bash 上 find / 导致 harness 层卡死的量化取证（/ = C:\\Git 且挂载 C: D:，-xdev 差两个数量级）。"
status: "active"
created_at: "2026-09-30T13:32:43.646Z"
updated_at: "2026-09-30T13:32:43.646Z"
content_hash: "4b03a6c93d5df14c904b0a6ad9b5ac2715cfb8f45ff8e9b1f4ffa0bf73f90bf5"
source_paths:
  - "profiles/web/node_modules/dsh-plugin-local-search/index.js"
  - "profiles/web/node_modules/dsh-plugin-local-search/selftest.mjs"
  - "profiles/web/node_modules/dsh-plugin-local-search/cordis.patch.yml"
  - "profiles/web/node_modules/dsh-plugin-local-search/README.md"
  - "profiles/web/cordis.patch.yml"
session_ids:
  - "1914545c-7bcd-45b7-ab01-cc172226641c"
memory_body_ids:
  []
---

# dsh-plugin-local-search：web_search 三源并发聚合 provider

2026-09-30 完成。任务：把 web_search 的 provider 从「fallback 链」改成「GitHub + DeepSeek 官方 + 本地 wiki 三源同时搜索、结果统一合并展示」，rank 优先级 github > deepseek > wiki。

## 实现位置与生效边界

| 路径 | 角色 |
|---|---|
| `profiles/web/node_modules/dsh-plugin-local-search/index.js` | provider 实现（约 19.9KB） |
| `profiles/web/node_modules/dsh-plugin-local-search/cordis.patch.yml` | 插件自带 patch 片段（config 默认值与注释） |
| `profiles/web/node_modules/dsh-plugin-local-search/selftest.mjs` | 9 组离线自检，`node selftest.mjs` |
| `profiles/web/node_modules/dsh-plugin-local-search/README.md` | rank 表 / 生效方式 / 成本 / 自检说明 |

该 node_modules 目录是 symlink，真身是 `D:\Toolbox\goat-gateway\dsh-plugin-local-search`（仓库外），即 dsh 真正加载的那份源码。

生效规则（与既有 HMR 边界一致）：`index.js` 和 bundle 里的 `cordis.patch.yml` 都在 node_modules ⇒ **改完必须重启 dsh 进程**；只有 `~/.dsh/profiles/web/cordis.patch.yml` 这类 profile patch 文件走 exact-path watch 可 live reload。临时调参不想重启，就在 profile patch 里加一条**完整全字段同名 row**（row 是 replace 语义，`name` 必须带）。改前已备份 `*.bak-20260930-2135-pre-deepseek-rank`。只改了 web profile；headless 没有这个 row。

## 合并语义（`mergeSources()` 纯函数，groups → { sources, dropped }）

1. 三路 `Promise.allSettled` **同时**发起，单源失败/超时只 `console.warn`，不拖累另外两源。
2. 每个来源先吃配额 `ceil(maxResults / 来源数)` ⇒ 保证三源都露面。
3. 剩余名额按 rank 顺序回填。
4. 最后按 rank **稳定排序** ⇒ 输出恒为 `github 块 → deepseek 块 → wiki 块`，块内保持各来源自身顺序（github 内部仍 `priorityOwner` 提前）。`interleaveSources: true` 时改为 round-robin 交错。
5. 跨源同 URL 只保留 rank 最高的那份（去重在合并阶段做，rank 因此顺带决定重复项归属）。
6. 只有三源全空才回退 `multi-search`；`fallbackProviderId` 指向 deepseek 时**显式拦住**，避免空结果白跑一次 model turn。

配置（profile patch 生效后的字段）：`enableGithub/enableDeepseek/enableWiki`、`priorityOwner`、`deepseekProviderId`、`deepseekTimeoutMs` 40000、`deepseekCacheTtlMs` 120000、`deepseekFailureCooldownMs` 600000、`maxResults` 8、`interleaveSources` false、`tagTitles` false、`enableFallback` true、`fallbackProviderId: multi-search`、`timeoutMs` 20000。`tagTitles: true` 会给 title 打 `[github]/[deepseek]/[wiki]` 前缀，是看单条来源归属的开关。

## 两条原有缺陷（本次才发现，值得记住）

1. **deepseek provider 注册的 id 是 `deepseek-official`，不是 profile row id `web-search-deepseek`。** 原配置 `fallbackProviderId: "web-search-deepseek"` 永远解析不到，只在「wiki 与 github 都空」的罕见路径被判空，长期静默失效。旁证：`@deepseek-ai/dsh-base/cordis.patch.yml` 默认 `searchProvider: deepseek-official`。新代码按 `deepseek-official → web-search-deepseek` 顺序探测并告警，同时拦住把 deepseek 当 fallback 的写法。
2. **`provider.available()` 不能当「有没有 key」的判据。** 其实现是 `(apiKey 有值 || resolveApiKey 函数存在 || resolveAccountToken 函数存在) && ...`，而两个函数在 `resolveOptions()` 里恒存在 ⇒ 恒 true；真正的凭证检查发生在调用时，抛 `WEB_PROVIDER_CREDENTIAL_MISSING`。因此失败模式设计为**熔断降级**（失败一次后 `deepseekFailureCooldownMs` 内不再发起），而不是每次搜索重试。

## 凭证 caveat（当时的运行时状态）

- `~/.dsh/.env` 只有 `COMMANDCODE_API_KEY`；Windows 环境变量无 `DEEPSEEK_API_KEY`；`~/.dsh/.credentials.yaml` 里只有 `client-connection/browser-session` 与 `deepseek-account-platform/device|default`，**没有 DEEPSEEK_API_KEY record**。
- provider 取 key 顺序：会话跑在 `deepseek-account` provider 上 → 否则 `credentials.resolve('DEEPSEEK_API_KEY')` → 否则 launch env → 否则抛错。默认模型是 `commandcode-goat`，不走第一条。
- 结果：deepseek 源会 pause 一段时间后静默只剩 github + wiki。补法三选一：(a) 在 dsh Web 的 Models 页存 `DEEPSEEK_API_KEY`（推荐，写进 credentials plane）；(b) 在 `web-search-deepseek` row 写 literal `apiKey`；(c) 会话模型切到 `deepseek-account` 走账号 token。
- 成本风险：`web-search-deepseek` 的 `maxUses: 100` 是「一次 Messages 请求内 server-tool 最多搜 100 次」，而 `dsh-tool-web` 的 `searchMaxQueries` 默认 4 ⇒ 最坏 4 次 model turn × 每次内部 100 轮。建议 `maxUses: 3`。

## 验证

`node selftest.mjs` 9/9 通过：T1 rank 块顺序+配额、T2 跨源同 URL 去重归属 github、T3 稀缺源 rank 回填仍是严格分块、T4 interleave round-robin、T5 三路并发（140–152ms vs 串行约 360ms）、T6 单源抛错降级、T7 空结果回退 + deepseek-skip guard、T8 deepseek 缓存把并发同 query 压成 1 次 model turn、T9 凭证缺失首次失败后熔断 60s（配置里为 600s）。配置合成用零副作用方式校验：`dsh --profile web --dump-config` exit 0，row 14 字段齐全，`web.searchProvider: local-wiki-github`。

## 教训：Windows / Git Bash 上永远不要 `find /`

本次 harness 卡死的根因就是 `find / -maxdepth 6 -type d -name "dsh-web-search*" 2>/dev/null`。取证：

- Git Bash 的 `/` **不是磁盘根**，而是 `C:\Git`（安装目录）。`mount` 显示 `C:/Git on / type ntfs`，且 `C: on /c`、`D: on /d` 都挂在 `/` 内部，`test -d /c/Windows` 为真 ⇒ `find /` 实际是 C:\Git + C:\ + D:\ 的全盘扫描，`-maxdepth 6` 语义完全变了。
- 量化：只算 `C:\Users\27063` 一个子树、depth ≤ 6 就是 **23563 个目录 / 9.7s，其中 sys 6.98s**（时间几乎全在内核态 stat）。对照 `find / -maxdepth 6 -xdev`（不跨 mount）**2.4s / 3111 个目录**，差两个数量级。
- NTFS junction / reparse point（`AppData` 里那些向后指的）会造环，walker 走进环不会结束。
- 叠加 `2>/dev/null` 把权限错误全吞掉，外观是「无输出但还在跑」，最容易被误判成卡死；同一 block 内并发的第二个 tool call 因此只报 `aborted before dispatch` —— 这不是 harness bug，是命令没有时间边界。

替代做法：Windows 侧用 `where` 或 `Get-ChildItem -Path C:\ -Recurse -Depth N -Filter`；MSYS 里至少加 `-xdev`；每条命令套 `timeout N`（超时 exit 124 是可观测信号）；找包用 `node -p "require.resolve('pkg')"` 在目标 cwd 解析（本次 20s 内拿到 `...\@deepseek-ai\dsh-web-search-deepseek\lib\index.js`）；把搜索边界收敛到 `~/.dsh`、`D:/Toolbox` 这类明确 root。

## 相关文档

- `8f433f98-dfa5-46f4-a8a6-1b9a3810bdc2` —— dsh 模型 maxTokens 上限实测与逐 model 校正（同属 ~/.dsh profile 校正类工作）
- `1cbe7ce9-d1ef-4674-b0d7-e2cf529077d5` —— DeepSeek 网页版对话归档链路（wiki 源与之同属 PocketWiki 生态）
