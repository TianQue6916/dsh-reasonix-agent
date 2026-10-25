---
id: "e1471ba1-1503-4003-b4de-a5d1ad89a3d3"
title: "dsh-plugin-local-search 第五源 deepseekSearch（DeepSeek Search API 直连）与 D:\\80-系统 High IL 提权写入流程"
description: "2026-10-25 给 web_search 聚合 provider 加入第五源 deepseekSearch（POST /v1/tools/search、按成功请求计费、独立熔断、minRerankScore 语义修正）的实现交接与回滚方案；并给出 D:\\80-系统 属 High Integrity Label 保护目录、tool 进程写不进去的诊断证据与 UAC 提权脚本改插件流程。"
status: "active"
created_at: "2026-10-25T06:47:51.094Z"
updated_at: "2026-10-25T06:47:51.094Z"
content_hash: "783fd420298e838d67acb7a1306298f95189940d65c2c33d8f70ce4ef94fd289"
source_paths:
  []
session_ids:
  - "d463712e-4a51-4784-9003-3c1d283b01cc"
memory_body_ids:
  []
---

# 第五源 deepseekSearch 与 D 盘保护目录提权写入

完成时间：2026-10-25。目标文件（实际落盘位置，不在 workspace 内）：
`D:\80-系统\Toolbox\goat-gateway\dsh-plugin-local-search\index.js` 与同目录 `cordis.patch.yml`。
`D:\Toolbox` 是 symlink，指向 `/d/80-系统/Toolbox`。

关联文档：
- `c6920883-b535-418c-afe8-68e83c7dfa0b` —— 三源聚合 provider 的 mergeSources / rank 语义
- `68496d1e-2cf3-4558-8ccf-10f1f2beac0a` —— goat 第四源成本与「默认关闭」原则、CRLF 编辑陷阱
- `be295e6b-be04-4de4-9625-c6cd431e73dc` —— 三端 cordis.patch.yml 位置与运行时核验方法

## 1. 接入设计（9 处改动）

| 位置 | 改动 |
|---|---|
| `SOURCE_RANK` | `{ github:0, deepseekSearch:1, goat:2, deepseek:3, wiki:4 }` |
| `DEFAULT_CONFIG` | `enableDeepseekSearch: true` + 8 个 `deepseekSearch*` 参数 |
| `constructor` | 增加 cache / cooldown / apiKey 三个状态槽 |
| `available()` | 新源参与可用性判定（`enableDeepseekSearch !== false`） |
| `search()` 的 plan | 与其它源并发发起，401/402/403 触发熔断 |
| 熔断复位/设置 | 新源独立熔断，成功后自动解除 |
| 新增方法 | `deepseekSearchApiKey()` / `searchDeepseekSearch()` / `searchDeepseekSearchCached()` |

配置项（env 覆盖前缀 `DEEPSEEK_SEARCH_*`，key 走 `DEEPSEEK_API_KEY`）：
`deepseekSearchBaseUrl`（默认 `https://api.deepseek.com`）、`deepseekSearchApiKeyEnv`、
`deepseekSearchEnvFile`（`${HOME}/.dsh/.env`）、`deepseekSearchCount: 10`、
`deepseekSearchNeedContent: false`、`deepseekSearchMinRerankScore: 0`、
`deepseekSearchTimeoutMs: 30000`、`deepseekSearchCacheTtlMs: 120000`、
`deepseekSearchFailureCooldownMs: 600000`。

协议：`POST https://api.deepseek.com/v1/tools/search`，`Authorization: Bearer <key>`，
body `{ query, count, need_content }`。返回条目按 `rerank_score` 降序、丢弃无 `url` 的项；
字段映射 `title` / `publishedAt` / `siteName` / `authority` / summary 优先于 snippet；
provider 标记为 `deepseek-search`。

## 2. 成本与计费语义（这是选它的主要理由）

- 2026-11-01 00:00 前免费；之后 **¥5 / 1000 次成功请求 ≈ ¥0.005/次**。
- **只有 HTTP 200 且 `results` 非空才计费**，失败不计费；`count` 不影响单价。
- 不吃模型 token，与模型解耦；账号级 QPS 100。
- 对比 goat 的 ¥0.27/次，便宜约 50 倍 —— 但按 `68496d1e` 的两层默认关闭原则，仍需在
  `cordis.patch.yml` 写显式开关行（本次已写 `enableDeepseekSearch` + 计费注释），便于审计与一键关。

## 3. 自测（27 项全过）与中途发现的真 bug

脚本：`C:\Users\27063\_selftest_dss.mjs`（`node _selftest_dss.mjs`）。覆盖 URL/method/鉴权头/
body 透传/无 url 丢弃/rerank 降序/字段映射/summary 优先/HTTP 402 抛错带 `error.status`/
mergeSources 的 rank 顺序。

**真 bug**：`minRerankScore` 阈值过滤原实现会把「没有 `rerank_score`」的条目放过去，等于阈值形同虚设。
已改为「设了阈值就必须有分数且达标」，重新提权写回后复测通过（pass=27 fail=0）。

## 4. 关键环境结论：`D:\80-系统` 是 High Integrity Label 保护目录

诊断证据链（三者同时成立，只剩 IL 一种解释）：
- DACL：owner `BUILTIN\Administrators`，`Authenticated Users: Modify, Synchronize Allow (inherited)`，**无任何 Deny**。
- 卷/分区：`Healthy` / `NTFS` / `Fixed`，磁盘与分区 `IsReadOnly` 均 `False`；`D:\80-系统` 是普通 Directory，
  不是 reparse point（`Attributes: Directory`、`LinkType`/`Target` 为空）。
- 实测：python / PowerShell / cmd 三者写入 `D:\80-系统\_p.txt` 全部 `Access denied`，
  而 `C:\Users\27063` 写入正常。
- `Get-Acl -Audit` 直接返回 `Attempted to perform an unauthorized operation`（普通用户读不到 SACL），
  所以无法用常规命令把 label 显示出来 —— 行为面吻合即结论。

**落地流程（以后改这个插件必须这样走）**：
1. 在 `C:\Users\27063\_new_index.js`（或同名副本）里改代码，先 `node --check`（ESM）验语法。
2. 用 `C:\Users\27063\_install_dss.ps1` 提权安装：自动打时间戳备份
   `*.bak-<yyyyMMdd-HHmmss>-pre-deepseekSearch`、写回、逐项 grep 校验关键符号、写日志
   `C:\Users\27063\_install_dss_<ts>.log`。
3. 重启 dsh —— client bundle 不参与 HMR，必须重启进程才加载新 bundle。

用户选择的是方案 A（UAC 提权直写 D 盘），而不是把插件搬到 C 盘；理由是这个目录是被用户刻意保护的，
且插件仍在原位置保留可版本追溯的备份链。

## 5. 回滚

```powershell
Copy-Item "D:\80-系统\Toolbox\goat-gateway\dsh-plugin-local-search\index.js.bak-20261025-144606-pre-deepseekSearch" `
          "D:\80-系统\Toolbox\goat-gateway\dsh-plugin-local-search\index.js" -Force
```
`cordis.patch.yml` 同法（对应 `.bak-20261025-144606-pre-deepseekSearch`）。

## 6. 仍需用户完成 / 注意

- `C:\Users\27063\.dsh\.env` 已加占位行 `DEEPSEEK_API_KEY=`，需用户填值（不是桌面端登录 token）。
- 重启后 `web_search` 为四源并发：GitHub / DeepSeek Search / wiki（goat 与老 deepseek 仍关闭）。
- 遗留：`68496d1e` 里指向的 gateway 400 额度冷却问题本次未触碰。
