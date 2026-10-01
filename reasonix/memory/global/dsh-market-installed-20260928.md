---
id: mem-7b049e484f8071f2d401dd5157394ba3
revision: 1
created_at: "2026-09-27T16:38:07.126Z"
updated_at: "2026-09-27T16:38:07.126Z"
name: dsh-market-installed-20260928
description: "装 dsh-market（dshmarket 1.66.2）插件市场并隔离验证通过；附关键发现\"装插件必须用 dsh plugin CLI 而非 pnpm add（前者才会自动加 bundles）\"，以及市场能力的完整清单（4200+ 目录 / hot disable / 启动失败 Recovery / WebDAV 备份）"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 一、装了什么

```bash
dsh plugin --profile web add dshmarket
```
→ **`dshmarket@1.66.2`**（`dsh-market/dsh-market` ★4695，"The plugin market inside DeepSeek Harness"）

**实测（2026-09-28）**：
- `bundles` 里**自动出现** `dshmarket`（**官方 CLI 会自己处理 bundles**）
- `node_modules/dshmarket` 的 `dsh` 字段：
  ```json
  {"bundle": {"patch": "./cordis.patch.yml"},
   "client": {"inject": ["@deepseek-ai/dsh-client-locale",
                         "@deepseek-ai/dsh-client-ui-settings",
                         "@deepseek-ai/dsh-client-ui-theme"],
              "platform": "web"}}
  ```
  → 注入到 **Settings UI**（服务端只占 dump 的一行：`# == dshmarket`）
- **隔离验证**：`dsh --profile web --port 3099 --no-open` 正常启动（HTTP 401），验后杀实例，**3080 未受影响**
- **状态目录**：`~/.dsh/profiles/web/.dsh-market/`
  - `state.json`（78 B）：`{disabled, groups, groupOrder, region, regionAuto}`
  - `log.ndjson`（124 B）
  - **无 catalog 本地缓存** → 目录是运行时拉取的

**验收方式（需要用户）**：开新会话（`patchReload: live`，不必重启进程）→ **Settings → Plugin Market**。若入口不出现，README 说明通常是 host 版本过低（要求 **dsh web ≥ 0.1.0-rc.6**，本机 0.1.7-rc.2 ✅）。

备份：`package.json.bak-20260928-0032-pre-dshmarket` / `pnpm-lock.yaml.bak-20260928-0032-pre-dshmarket`

## 二、🔴 重要发现：装插件应该用官方 CLI，不要手工改 package.json

**`dsh plugin --profile web add <pkg>` 会自动把包加进 `dsh.profile.bundles`** —— 本次实测确认。

**对比我前面踩的坑**：
- 装 `dsh-mnemon` 时我用 `pnpm add` → **bundles 没加** → 手工改 package.json 才生效（round 7 还因此误判过一次）
- 装 `dshmarket` 用官方 CLI → **bundles 自动加** ✅

**结论**：`dsh plugin --profile <name> add/remove <pkg>` 是**唯一正确入口**（它还会跑 supply-chain 策略校验，
输出里有 `✓ Lockfile passes supply-chain policies`）。`pnpm add` 只解决依赖，不解决 profile 装载。

## 三、dsh-market 的能力清单（为什么值得装）

- **4200+ 插件的完整目录**：browse / search / 分类筛选 / star 数 / 中英双语描述
- **Host-aware discovery**：读 `engines.dsh` 或 `@deepseek-ai/dsh-*` peer 声明判断兼容性；**不猜**——未声明/格式错/不可用的条目仍可见
- **Hot disable / enable**：开关写 `- id: …` + `disabled: true|false` 进 profile 的 `cordis.patch.yml`，**DSH 的 HMR 约 1s 重组合，不用重启**；手改的 patch 行会显示 badge；host 基础设施插件受保护
- **🛟 Recovery when a restart does not come back**（**最重要的一条**）：
  > DSH's boot is **all-or-nothing**: one plugin that cannot load stops the whole process, and the market's own UI dies with the host it was serving from.

  它的 **Adjust plugins** 页面（由 detached restart helper 在**同一地址**提供服务，所以 host 已死也能打开）把 DSH 报错的插件标红且不勾选，让你选下次启动启用哪些，写回同一批 `cordis.patch.yml` 行后**重试启动**。
  → **这正解决我从 round 1 起就担心的事**（`dsh-mimir` 就是因 typert codec 让启动失败的那个）
- **Backup & restore**：导出/导入 profile 插件列表与配置为 JSON；支持 **WebDAV 每日自动备份** / **私有 GitHub Gist 同步**；恢复是 **merge** 语义（备份之后装的插件保留），写入前校验、失败回滚
- **Resilient GitHub routes**：中国区对 git refs / README / avatar 各有独立 fallback 顺序，记住上次可用路由，拒绝伪装成 HTTP 200 的代理错误页；可用 `DSHM_GITHUB_PROXY` 或 Settings 里指定自定义前缀
- **公开更新 API v1**（beta，见包内 `UPDATE-API-V1.md`）

## 四、教训

我此前评估插件**只用 `~/.dsh/storages/community-readmes/` 里本地缓存的 18 个 README**，
**完全不知道有 4200+ 插件的市场**，也不知道有 Hot disable / Recovery / Backup 这些官方机制。
**以后评估插件：先开市场目录，不要只看本地缓存。**
