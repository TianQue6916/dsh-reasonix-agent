---
id: "be295e6b-be04-4de4-9625-c6cd431e73dc"
title: "dsh web_search deepseek 源 maxUses 预算收紧（100→3）与三源运行时核验方法"
description: "2026-10-01 对 web_search 三源聚合的后续运维：deepseek 源 maxUses 由 100 收紧为 3 的理由、三端 cordis.patch.yml 精确位置与生效边界（web/desktop live、headless startup）、以及用真实搜索结果构成（3/3/2 配额、每源指纹）和 session event stream 解压来做运行时核验的方法。"
status: "active"
created_at: "2026-10-01T06:17:43.059Z"
updated_at: "2026-10-01T06:17:43.059Z"
content_hash: "284de293247e0a7e9117579d3faae791e7686fd3e20b09777f127dca2e327a45"
source_paths:
  - "profiles/web/cordis.patch.yml"
  - "profiles/desktop/cordis.patch.yml"
  - "profiles/headless/cordis.patch.yml"
  - "profiles/web/node_modules/dsh-plugin-local-search/index.js"
session_ids:
  - "6373f6c4-e668-4585-ad1c-07c9f45088dd"
memory_body_ids:
  []
---

# dsh web_search deepseek 源 maxUses 预算收紧与三源运行时核验

关联文档：`c6920883-b535-418c-afe8-68e83c7dfa0b`（dsh-plugin-local-search 三源并发聚合 provider 的实现交接：rank 合并语义、`deepseek-official` 正确 id、凭证熔断、Git Bash `find /` 取证）。本文只记录 2026-10-01 的后续增量：预算收紧、生效边界、以及「怎么用运行时证据确认来源」。凡与上文冲突处以本文为准。

## 1. 变更：`maxUses` 100 → 3（三端）

理由（写进 patch 注释）：

```yaml
    # 每个 query 都会打一次 deepseek 搜索（一次 Messages model turn）；
    # dsh-tool-web 的 searchMaxQueries 默认 4 ⇒ 100 会让最坏情况变成 400 次内部搜索。
    maxUses: 3
```

精确落点（三处都紧跟在 `web-search-deepseek` 的 `config.apiKeyEnv: DEEPSEEK_API_KEY` 之后）：

| profile | 文件 | 改前行号 |
|---|---|---|
| web | `profiles/web/cordis.patch.yml` | 1077 |
| desktop | `profiles/desktop/cordis.patch.yml` | 1219 |
| headless | `profiles/headless/cordis.patch.yml` | 684 |

- 改法是**二进制级替换**（只动目标行 + 插入两行注释，不重排其余内容）。这三个文件本来是 LF，替换后无 CRLF 被改动。
- 备份：`.bak-20261001-1415-pre-maxuses`。
- 勿混淆的两个 `100`：同一段里还有 `maxParallelToolCalls: 100`，不属于本次改动。

## 2. 验证与生效边界

验证三端都要看合成配置（不是看源 patch 文件）：

- `dsh --profile web --dump-config` → `maxUses: 3`
- `dsh --profile headless --dump-config` → `maxUses: 3`
- desktop：CLI `--dump-config` 对 profile 名 `desktop` 被硬编码守卫拒绝，必须走探针脚本 `~/.dsh/storages/tools/dump-desktop-config.ps1` → `maxUses: 3`
- `grep -rn "maxUses: 100" profiles/*/cordis.patch.yml` → 无命中

生效边界（profile patch 的 `patchReload`）：

- web / desktop = `live` ⇒ **开新会话即生效，不用重启**。
- headless = `startup` ⇒ 下次进程启动生效。

## 3. 运行时核验：不要只看配置，要跑一次搜索看构成

`maxResults: 8` 时三源配额为 `ceil(8/3) = 3, 3, 2`，且结果按 rank 分块顺序输出（rank `github(0) > deepseek(1) > wiki(2)`，`interleaveSources: false`）。所以「3/3/2 + 分块顺序」本身就是三源并发聚合的指纹。

可靠的运行时判据：

- 若只看 `available()` 会误判——`resolveOptions()` 里两个函数恒存在 ⇒ 恒 `true`，不能当凭证判据。
- 真实搜索结果指纹：

| 来源 | 识别特征 |
|---|---|
| github | URL 为 `github.com/...`；title 形如 `owner/repo · Python`；snippet 带 `★N`；issue 类 title 前缀 `[GitHub] ` |
| deepseek | 普通公网 URL（含 PDF / 文档站，如 `apps.dtic.mil`、`hackage-content-origin...`）；title 就是网页标题；无 ★、无内网 IP |
| wiki | URL 为 `http://100.79.96.82:8810/wiki/...`；snippet 以 `[离线维基 2026-06]` 开头 |

- 想更直白：在 bundle 的 `cordis.patch.yml` 打开 `tagTitles: true`（需重启），title 会直接带 `[github]` / `[deepseek]` / `[wiki]` 前缀。

deepseek 那一路「昨天不通、今天通了」的解释：provider 的 key 是**每次搜索时**才 resolve（不是启动时），所以 key 一存进去下一次搜索立即生效、无需重启；缺 key 时走 600s 熔断降级，github / wiki 照常返回。

## 4. 取证方法上的两个坑（本轮实测踩到）

1. session 事件流是 **`session.v4.jsonl.zstd`**（zstd 压缩）。直接 `grep` 判「无命中」**无效**；必须先解压（本轮为此装了 python `zstandard`）再看 `turn/start`、`web_search` 等事件。
2. `logs/dsh-web-*.out.log` 的 mtime 与内容**不能**当作「本次进程没有任何 warn」的证据——该进程未必把 stdout 重定向到那个文件（`launch-dsh.ps1` 是让 cmd 自己重定向，路径 `~/.dsh/logs/dsh-web-$Port.out.log`）。

## 5. 附带结论

- deepseek 官方 provider 注册 id 是 `deepseek-official`（不是 row id `web-search-deepseek`）。
- key 的明文落点仍未定位：`~/.dsh/.credentials.yaml` 只有 `client-connection/browser-session`、`deepseek-account-platform/device`、`deepseek-account-platform/default` 三条 record，无 `DEEPSEEK_API_KEY` record；`~/.dsh/.env` 只有 `COMMANDCODE_API_KEY`；`settings.yaml` 不存在（只有历史 `.bak`）。推测存在 credentials 服务的加密落盘里（UI 的 Models / Web Search 页写入），功能上不受影响。
