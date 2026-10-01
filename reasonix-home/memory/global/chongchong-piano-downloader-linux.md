---
id: mem-b565c8e7acd79581180d8090b6732a8c
revision: 1
created_at: "2026-08-12T10:44:26.061393Z"
updated_at: "2026-08-12T10:44:26.061393Z"
name: chongchong-piano-downloader-linux
description: 虫虫钢琴下载器（chongchongpiano_downloader）已装到 Linux 天阙机：位置、用法、原理、网络镜像坑、SSH 远控状态
keywords: 虫虫钢琴 chongchongpiano gangqinpu ccmz 下载器 playwright Linux 远控
volatility: stable
metadata:
  type: user
  fact_type: project
  scope: global
---

# 虫虫钢琴下载器已装到 Linux（2026-08-12）

**Why:** 用户批量下载虫虫钢琴谱子被"操作频繁"风控限制（有会员仍被限），选择用开源下载器绕过网页会员下载通道。用户指定装 Linux（天阙机）。

**How to apply:**
- 位置：`~/chongchongpiano_downloader/`（Linux TianQue，Ubuntu 24.04），venv 在 `.venv`
- 依赖：playwright 1.62.0 + requests + beautifulsoup4 + midiutil，Chromium headless 已装（`~/.cache/ms-playwright/chromium-1234`）
- 下载目录：`~/虫虫钢琴/`（每首按谱名建文件夹：五线谱.pdf + 简谱.pdf + .mid）
- 用法：`cd ~/chongchongpiano_downloader && source .venv/bin/activate && cd ~/虫虫钢琴 && python3 ~/chongchongpiano_downloader/downloader_playwright.py`，粘贴 cchtml 链接每行一个、空行结束
- 原理：requests 抓 `cchtml/<id>.htm` → 解析 `iframe#ai-score` → 提取 `url=` 参数得 `.ccmz` 资源（s*.lzjoy.com）；playwright 无头导出 PDF；ccmz v2 是异或混淆 zip 内 midi.json，用 midiutil 转 .mid。全程不走登录/会员下载接口，天然低频（约 20-30s/首）
- 已验证：942280（《所念皆星河》）三件套生成成功（2026-08-12）
- 网络坑：GitHub 直连/ghproxy.net 均失败，走 `https://gh-proxy.com/https://github.com/...` 成功；pip 用清华源；playwright 浏览器用 `PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright/`
- 远控状态：Linux sshd 此前未开（仅 3389 xrdp），2026-08-12 用户手动开启 + 加入 Windows 公钥（`~/.ssh/authorized_keys`），现可从 Windows `ssh tianque@192.168.1.13`（或 Tailscale 100.79.96.82）免密登录
- 若用户仍要"随机 IP"方案（网页版下载），需代理轮换；下载器方案已不依赖它
