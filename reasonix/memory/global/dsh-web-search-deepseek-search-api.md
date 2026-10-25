---
id: mem-1eafab6f7e782cdddf98e08332e2e0c0
revision: 1
created_at: "2026-10-25T06:57:56.428Z"
updated_at: "2026-10-25T06:57:56.428Z"
name: dsh-web-search-deepseek-search-api
description: "dsh-plugin-local-search 新增 deepseekSearch 源（直连 /v1/tools/search）+ D:\\80-系统 是 High IL 保护目录"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 1. 新增第五个源 deepseekSearch（2026-10-25 落地）

插件 `D:\80-系统\Toolbox\goat-gateway\dsh-plugin-local-search\index.js`（`D:\Toolbox` 是它的 symlink）新增 `deepseekSearch` 源，**直连 DeepSeek Search API**，与原有 `deepseek` 源（让模型跑一轮搜索，吃 input token）完全不同：

- endpoint `POST https://api.deepseek.com/v1/tools/search`
- 请求体 `{query(1~128字符), count(1~50,默认10), need_content(bool), ori_question?, localization?}`
- 响应 `results[]`：`rerank_score`(0~3,≥1.5优质) / `title` / `url` / `snippet`(100~200字) / `summary`(600~800字) / `content`(need_content时) / `site_name` / `date` / `authority`(0~4,≥3极权威)
- 另有 `POST /v1/tools/fetch` 抓单页返回 Markdown
- **计费 ¥5/1000 次成功请求**（仅 HTTP 200 且 results 非空才计费，count 不影响单价），QPS 100（账号级）
- 官方文档 https://api-docs.deepseek.com/zh-cn/guides/search
- `SOURCE_RANK` 改为 `{ github:0, deepseekSearch:1, goat:2, deepseek:3, wiki:4 }`

### 关键实测：**余额为负时连"免费期"也搜不了**
2026-10-25 用现成 key 实测：
- `GET /user/balance` → `{"is_available":false,"total_balance":"-0.22"}`
- `POST /v1/tools/search` → `{"error":{"message":"Insufficient Balance","type":"insufficient_balance_error"}}`（HTTP 402）

⇒ 文档说「2026-11-01 00:00 前免费」指的是**不再计费**，但 API 第一道闸仍是 `is_available`；余额 ≤ 0 一律 402。**必须充值到 ≥0 才能用**。

## 2. D:\80-系统 是 High Integrity Level 保护目录

- `D:\Toolbox` → symlink → `D:\80-系统\Toolbox`
- **普通用户进程写不进去**：`touch` / PowerShell `Set-Content` / python `open` 全部 `Access denied`(5)，但 DACL 明明给了 `Authenticated Users: Modify`（owner = `BUILTIN\Administrators`），磁盘/分区 `IsReadOnly=False`，也不是 reparse point
- ⇒ 登录分析：**Mandatory Integrity Label** 拦的，不是 DACL
- 后果：改这个插件的任何代码都必须提权
- 可复用脚本：`C:\Users\27063\_install_dss.ps1`（提权跑，自带备份 + 5 项校验）
- 改代码流程：改 `C:\Users\27063\_new_index.js` → `Start-Process pwsh -Verb RunAs -File _install_dss.ps1` → 重启 dsh
- 回归测试：`node C:\Users\27063\_selftest_dss.mjs`（27 项断言）
- 回滚：`index.js.bak-20261025-144606-pre-deepseekSearch`

## 3. DEEPSEEK_API_KEY 的位置

- 在 **Windows 用户级环境变量**（`[Environment]::GetEnvironmentVariable('DEEPSEEK_API_KEY','User')`，len=35，`sk-a46e...`），**不**在 `~/.dsh/.env`
- 2026-10-25 已同步写进 `~/.dsh/.env`（因为 dsh 进程的 launch env 未必继承用户级变量；插件 `deepseekSearchApiKey()` 先读 `process.env` 再 fallback 读 `.env`）
- `~/.dsh/.credentials.yaml` 里的 `deepseek-account-platform/*` 是桌面端登录账号平台的 token，**不是** API key，别混

## 4. 待办

- 充值后重启 dsh 即可生效（bundle 不参与 HMR，必须重启进程）
- `cordis.patch.yml` 已加 `enableDeepseekSearch: true`
