---
id: mem-e56d39c26226dedf1d8ddd4475d843a1
revision: 2
created_at: "2026-09-27T15:33:37.673Z"
updated_at: "2026-09-27T16:32:17.011Z"
name: codex-gap-6-7-recon-and-mnemon-recall-quality-20260927
description: "用 GitHub search 补齐 #4-#7 的社区调研：发现 dsh-market ★4695 插件市场（4200+ 插件、hot disable、启动失败 Recovery）、#5 现成方案 dsh-thread 1.2.0、#6 最佳 liguobao/ds-harness-remote ★225、#7 最佳 mrpulor-gh/nuphus-mcp ★313（Rust 通用 MCP）；#4 社区空白自研唯一"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 一、发现：我一直不知道 dsh 有官方插件市场

`dsh-market/dsh-market` **★4695** —— "**The plugin market inside DeepSeek Harness**"

```bash
dsh plugin --profile web add dshmarket
# 装后开新会话（patchReload: live）→ Settings → Plugin Market
```

**能力**（README 摘要）：
- **4200+ 插件的完整目录**——browse / search / 分类筛选 / star 数 / 中英双语描述
- **Host-aware discovery**：读 `engines.dsh` 或 `@deepseek-ai/dsh-*` peer 声明，判断与当前 host 的兼容性；**不猜**——未声明/格式错误/不可用的条目仍然可见
- **一键安装/卸载/更新**（含 per-plugin update check 与 "What changed" 链接）
- **Hot disable/enable**：开关写 `- id: …` + `disabled: true|false` 进 profile 的 `cordis.patch.yml`，
  **DSH 的 HMR 约 1s 重组合，不用重启**；手改过的 patch 行会显示 badge；host 基础设施插件受保护不可切换
- **Recovery when a restart does not come back** ← **这条解决了我最怕的问题**：
  "DSH's boot is **all-or-nothing**: one plugin that cannot load stops the whole process, and the market's own UI dies with the host it was serving from."
  它的 **Adjust plugins** 页面（由 detached restart helper 提供同地址服务）把 DSH 报错的插件标红且不勾选，让你选择下次启动启用哪些，写回同一批 `cordis.patch.yml` 行后重试启动。**即使 host 已死也能打开**。
- **Backup & restore**：导出/导入 profile 的插件列表与配置为 JSON；支持 WebDAV 每日自动备份、私有 GitHub Gist 同步；恢复是 **merge** 语义（备份之后装的插件保留），写入前校验、失败回滚
- **Resilient GitHub routes**：中国区对 git refs / README / avatar 各有独立 fallback 顺序，记住上次可用路由；
  可用 `DSHM_GITHUB_PROXY` 或 Settings → Plugins → Plugin configuration → GitHub acceleration 指定自定义前缀
- 要求 **dsh web ≥ 0.1.0-rc.6**（本机 0.1.7-rc.2 ✅）

**教训**：我此前一直只用 `~/.dsh/storages/community-readmes/` 里**本地缓存的 18 个 README** 作为"社区视野"，
**完全不知道有 4200+ 插件的市场**。**以后评估插件先查市场目录，不要只看本地缓存。**

## 二、#4-#7 的完整社区调研（2026-09-28，用 GitHub search 补全）

| 缺口 | 社区现状 | 我的产物 |
|---|---|---|
| **#4** agent_jobs CSV + output_schema | **社区空白**（`deepseek-harness plugin job csv` 搜不到任何结果） | **自研 `agent-jobs.mjs` 是这条线上唯一方案** |
| **#5** thread_spawn_edges | **`dsh-thread`（npm 1.2.0）** ← 比我自研的强 | 自研 `thread-edges.mjs`（静态派发树） |
| **#6** remote_control | **`liguobao/ds-harness-remote` ★225**（多端 + 端到端加密） | 未做（等拍板） |
| **#7** computer-use | **`mrpulor-gh/nuphus-mcp` ★313**（Rust，通用 MCP） | 未做（等拍板） |

### #5 的现成方案：`dsh-thread` 1.2.0（npm）

> Thread's **deep-integration** plugin — **session memory with lineage** for coding agents
> - **Lossless capture**：订阅 `session/event`，完整事件流落**双 SQLite**（幂等追加）
> - **Structural delivery, three triggers**：首轮 anchor（项目身份 + 行为契约 + status card）、**每次 compaction 后 re-anchor**、每轮边界的 cross-agent state delta
>   设计依据：arXiv:2605.21997 "The Log is the Agent"；re-anchor 针对 **Compaction Cliff**（arXiv:2608.22752）
> - **Native query tool**：`query_session_memory` 经 `ctx.tools.register` 进模型工具面，**文件系统式导航 ls / cd / cat / grep**
> - 检索为 **deterministic BM25**（中文 jieba 分词）+ citation pull-back，**默认无 embedding 依赖**（可选 hybrid）

**对比自研 `thread-edges.mjs`**：我的是**静态导出**（扫 session 文件 → 派发树）；
它的是**运行时集成**（订阅事件流 + 注入 + 查询工具）。**它是更完整的方案。**

### #6 的最佳候选：`liguobao/ds-harness-remote` ★225

多端覆盖：**Windows / macOS / Linux 桌面端**（`liguobao/dsh-desktop`）+ **Web**（dsh.r2049.cn/app）+ **Android** + npm 包。
描述强调「**安全、低延迟、端到端加密**」。定位 "Connect once. Ready whenever you are."
其他候选：`GDWhisper/dsh-web-startup-auth` ★47（远程 Web + 账密认证）、`ZhangFengshun/dsh-remote-ssh` ★21（VSCode Remote-SSH 式）、`hi-wenw/dsh-telegram-channel` ★11（Telegram 移动端）。

### #7 的最佳候选：`mrpulor-gh/nuphus-mcp` ★313

> Desktop automation MCP server — **computer use for any AI agent**
> **Rust**，跨平台单二进制；**标准 MCP tools，JSON-RPC 2.0 over stdio**；**no daemon, no network service**
> 控制 screen / windows / keyboard+mouse / Chrome；**桌面与浏览器自动化不需要 API key**；**本地 OCR 内置**；
> vision 接你自己的 vision LLM（OpenAI-compatible / Anthropic native，**BYOK**）；MIT；有中国大陆镜像

**为何优于 `dsh-computer-use` ★38**：它是**通用 MCP server** —— 而 dsh 自带 `@deepseek-ai/dsh-mcp-client`，
**可直接挂载**，不绑 dsh 版本，任何 MCP client（Claude Desktop / Cursor / VS Code / Copilot）都能用。
其他候选：`dsh-computer-use` ★38、`AzaiSakura/dsh-computer-use` ★15、`qphotoai/dsh-computer-use-windows` ★5、`mekos2772/dsh-plugin-mimi` ★4。

## 三、检索用的 search 口径（可复用）

```bash
curl -s --noproxy '*' --max-time 25 \
  "https://gh-proxy.com/https://api.github.com/search/repositories?q=<关键词>&sort=stars&per_page=5"
```
- 关键词形如 `dsh+plugin+computer+use`、`deepseek-harness+plugin+remote`
- **未认证有速率限制（约 10/min）**，批量查要 sleep
- **README 不一定在 main 分支** —— 先查 `default_branch` 再取（`nuphus-mcp` 就是 `master`）
