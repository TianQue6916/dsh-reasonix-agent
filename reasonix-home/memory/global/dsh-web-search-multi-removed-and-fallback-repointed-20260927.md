---
id: mem-e77176d50bda126ab953abe39e5c1e64
revision: 1
created_at: "2026-09-27T15:26:43.222Z"
updated_at: "2026-09-27T15:26:43.222Z"
name: dsh-web-search-multi-removed-and-fallback-repointed-20260927
description: "删除 dsh-web-search-multi（deps+bundles+lockfile 三块+node_modules），并把 dsh-plugin-local-search 的 fallbackProviderId 从 multi-search 改指 web-search-deepseek；含 provider id 的查法与缩进感知的 lockfile 块删除"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 变更（2026-09-27，用户要求）

**删除 `dsh-web-search-multi`**（多源聚合：Bing/Tavily/Brave…），只保留用户自定义的 `web-search-deepseek`。

### 关键：删它必须同时改 fallback 引用

`dsh-plugin-local-search`（自建，`link:D:/Toolbox/goat-gateway/dsh-plugin-local-search`）的 `cordis.patch.yml` 第 11 行与 `index.js` 第 30 行写着：

```yaml
enableFallback: true
fallbackProviderId: "multi-search"     # ← 指向被删的 provider
```

`index.js:119-120` 的逻辑是 `this.web?.searchProviders?.get(cfg.fallbackProviderId)` —— 指向不存在的 id 会让回退链断掉。

**已改成 `web-search-deepseek`**（正本 + 自动同步到 `node_modules` 软链）。备份：`cordis.patch.yml.bak-<ts>-pre-fallback`、`index.js.bak-<ts>-pre-fallback`。

### 用户自定义 websearch 的 provider id 怎么查到的

包在 `C:\Users\27063\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\dsh-web-search-deepseek\lib\index.js`。
**provider id 不在 `dump-config` 里**（运行时注册），只能从包内字面量读：
```bash
grep -rhoE "['\"][a-z0-9-]{3,30}['\"]" <pkg>/lib/index.js | sort | uniq -c | sort -rn
# → "web-search-deepseek" ×2  ← provider id
# 另有 "deepseek-v4-flash" / "deepseek-official" / "x-api-key" / DEEPSEEK_SEARCH_BASE_URL（可配 base URL）
```

### 删除动作（手工，不用 pnpm）

`pnpm remove` 对 **git 依赖**会重新解析并尝试 fetch → 慢且可能触发 gh-proxy 403。手工四步：
1. `package.json`：删 `dependencies` 项（它是**最后一项**，删后要给前一行去掉尾逗号）+ 删 `dsh.profile.bundles` 项
2. `node_modules/dsh-web-search-multi` 整个删
3. `pnpm-lock.yaml`（**LF**）三个块：importer 段（`      dsh-web-search-multi:`）+ `packages:` 段（`  dsh-web-search-multi@…:`）+ `snapshots:` 段（同形）。用**缩进感知**的块删除（记录起始缩进，缩进 ≤ 起始即结束），否则会误吞后续同级条目
4. 检查 `.bin` 残留 shim（本例无）

### 验证（2026-09-27）

- `dump-config`：`searchProvider: local-wiki-github`（本地优先，未动）✅ / `web-search-deepseek` 仍在（line 980）✅ / **`fallbackProviderId: web-search-deepseek`**（line 1889）✅ / `web-search-multi` 与 `multi-search` **零出现** ✅
- `package.json` + `pnpm-lock.yaml` 残留检查：**零** ✅
- **隔离启动**：`dsh --profile web --port 3099 --no-open` 正常，验后已杀，3080 未受影响 ✅

### 当前 bundles

```
@deepseek-ai/dsh-base · @deepseek-ai/dsh-web-app · @local/dsh-plugin-goat-panel
dsh-deja · dsh-plugin-local-search · dsh-headroom · dsh-mnemon
```

### 生效的搜索链路

```
本地（wiki + GitHub，priorityOwner: TianQue6916）
  → 回退 web-search-deepseek（用户自定义，apiKeyEnv: DEEPSEEK_API_KEY，maxUses: 100）
```
`DEEPSEEK_API_KEY` 已确认存在于**用户级环境变量**（`[Environment]::GetEnvironmentVariable('DEEPSEEK_API_KEY','User')` → True）。
