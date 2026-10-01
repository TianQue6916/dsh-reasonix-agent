---
id: mem-5e02ab791bec902ba8318a4dac07a60f
revision: 2
created_at: "2026-09-30T12:32:24.340Z"
updated_at: "2026-09-30T13:24:14.647Z"
name: deepseek-webarchive-wiki-pipeline
description: "DeepSeek 抓取+归档链路 v2：Windows puppeteer/msedge 抓取流程、数据现状（2412 会话 / 252 页）、渲染与索引脚本用法、缺口"
metadata:
  type: user
  fact_type: reference
  scope: global
---

# DeepSeek 网页版对话 → PocketWiki 归档链路

> 2026-09-30 晚更新：抓取端已从 Linux playwright 迁到 **Windows puppeteer + msedge**，数据补齐到 2026-09-30。旧版本记录（07-30/08-07 口径）已被本轮取代。

## 抓取（Windows 侧，2026-09-30 实测可用）
- 工作目录 `C:\Users\27063\deepseek-scrape\`
  - `profile/`            = 8 月那份 Chromium profile 副本（内含有效 `userToken`）
  - `list_sessions.cjs`   = `/api/v0/chat_session/fetch_page?lte_cursor.pinned=false[&lte_cursor.updated_at=…]` 分页到空页
  - `bulk_fetch.cjs`      = `/api/v0/chat/history_messages?chat_session_id=<id>` 逐会话全量，**浏览器内 fetch** + `Bearer <userToken>` + client 头
  - `out/`                = 本轮产物（`all_sessions_new.json` / `raw/*.json` / `fetch_summary_new.json`）
- 关键坑：**Chrome for Testing 131 打不开这份 profile**（"profile 由更新版本创建"直接静默退出）→ 必须 `channel:'msedge'` + `executablePath: C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`；headful（headless 未验证）。
- 接口鉴权头：`x-client-bundle-id: com.deepseek.chat` / `x-client-locale: zh_CN` / `x-client-platform: web` / `x-client-timezone-offset: 28800` / `x-client-version: 2.3.0`；`userToken` 取自 `localStorage.getItem('userToken')` 的 `.value`（64 字符）。
- 并发 4 + 700 ms 间隔：117 个会话 / 11,438 条消息 / 45 MB / **40 秒** / 0 失败。

## 数据位置（Windows 与 Linux 已同步）
- Linux `~/data/deepseek_data/`（Windows 对应 `~\.reasonix\global-workspace\deepseek_data\`）
  - `all_sessions.json`  2412 个会话（2025-01 起）
  - `raw/<session_id>.json` 2412 个全量文件（REQUEST/THINK/RESPONSE/FILE/SEARCH）
  - `deepseek_all_chats.json` 旧 top-100 快照（**messages 字段只有 THINK 片段，别用来渲染**）
- `history_messages` 返回的是**全量历史**（`计算机技术问题` 952→1841 条，首条时间不变可验证）。

## wiki（PocketWiki）
- `~/.reasonix/global-workspace/render_ds_pages.py`（v2）：
  - 目标来自 `all_sessions.json`；**session-id → 页面**映射持久化在 `ds_page_map.json`（不再靠标题猜）
  - 增量：`--apply`（默认只渲染「无页面」或「raw 比页面新」）；也支持 `--sessions ids.json`、`--all`
  - 同名会话自动加 `_<YYYYMMDD>` 后缀；每次 `--apply` 自动把 pages/ 打成 `~/backups/pocketwiki-pages-<ts>.tar.gz`
- `build_ds_index.py`（v2）：重建 `DeepSeek对话记录.md`（按最后更新月份分组 + 🆕 标记）、追加 `DeepSeek导入日志.md`、更新 `首页.md` 指针；`--fresh-ids` 传本轮 id 列表
- 现状（2026-09-30）：**252 页 / 36.3 MB**，索引链接 252 条失效 0；服务 `nohup python3 pocket-wiki.py` @ `127.0.0.1:8808`（大页 4.8 MB 渲染 0.36 s）
- 页面命名继承首轮约定：`DS_<标题>.md`，空格与 `/` → `_`；**DeepSeek 会改写会话标题**，所以文件名可能停留旧标题（例：`DS_Java版光影推荐.md` 现标题是 `Minecraft`），页内标题才是当前标题

## 还没做的
- 未入库的历史会话 **2155 个**（全量 2407 个）——需要时 `python3 render_ds_pages.py --apply --all`（预估 +150 MB 级 markdown）
- 重抓依赖 `~/deepseek-scrape/profile` 里的 `userToken`；它会过期，届时需在该 profile 里人工登录一次 DeepSeek 网页版（脚本会停在 chat 页面等你登录）
