---
id: "bdfb4947-957c-407d-ac32-791b4f76295f"
title: "Windows 本机网络与 headless 抓取环境实测（2026-10-01）：CLI 与浏览器代理路径不对称、DNS 污染指纹、puppeteer+Edge 配方、分页 API dedupe 教训"
description: "2026-10-01 在 Windows 主机实测：curl/python-urllib/git 不读 WinINET system proxy 故对被污染域名一律 000，而读 system proxy 的 Edge 经 DevSidecar（127.0.0.1:31180/31181）可达；含 DNS 污染签名、DoH 被封、可跑的 headless Edge 抓取配方（NODE_PATH + 正斜杠 executablePath）、HF 分页 API 忽略 page 导致的计数 artifact（738 = 123×6），以及对 dsh web_search provider 系 python/curl 直连会踩同一坑的结论。"
status: "active"
created_at: "2026-10-01T14:57:48.415Z"
updated_at: "2026-10-01T14:57:48.415Z"
content_hash: "1ff8da4afbb3e595572b240bc68a55f55d403a5d39419239acf75d353b6794dd"
source_paths:
  - "AppData/Local/Temp/webbrain_following.json"
session_ids:
  - "2505fa61-ac3b-4b61-b469-e7850380e1ce"
memory_body_ids:
  []
---

# Windows 本机网络与 headless 抓取环境实测（2026-10-01）

来源：一次"某封 Hugging Face follow 通知邮件是不是钓鱼"的实测调查（用户要求 assistant 自己控制浏览器去看，而非依赖 CLI 探测）。调查本身已结案，但过程中暴露的本机网络/抓取环境事实对 dsh 工具有长期价值，故单独归档。

## 调查结论（HF 邮件真伪）

- 邮件是真的，非钓鱼、非伪造：`https://huggingface.co/webbrain-one` → 200，display name **WebBrain**，PRO 账号；org `huggingface.co/web-brain` → 200；官网 `webbrain.one` 首页直接外链该 HF profile。
- WebBrain 是真实开源项目：AI browser agent 浏览器扩展（Chrome / Firefox / Edge），GPL-3.0-or-later，自称 Claude browser plugin 的开源替代；支持 llama.cpp / OpenAI / Claude / OpenRouter；GitHub 仓库含 `mcp-server`、`src/chrome`、`src/firefox`。
- 但 follow 行为是增长手段：`following ≈ 191`（profile 页显示 191）vs `followers = 18`。单向比率即 follow-farming 指纹。
- 用户本人账号定位成功：`TianQue6916`（display name「天阙轩」）。`/api/users/TianQue6916/followers` → `["webbrain-one"]`（唯一 follower），`following` → `[]`。用户的「我 HF 什么都没有」属实：`Models: 0 — None public yet`、`Datasets: 0`、`AI & ML interests: None yet`、`Organizations: None yet`——空号，但 follow 通知只反映「有人点了 follow 按钮」，不以收信方有内容为前提。
- 反向定位路径：先在 `webbrain-one` 的 following 名单里 grep 到 `TianQue6916`，再回查该账号的 followers 双向对上。
- HF 页面显示的是 display name（`天阙轩`）而非 URL username（`TianQue6916`）；`/api/users?search=` 需要 auth（返回 `401 {"error":"Invalid username or password."}`），故用界面上的中文名反查账号不可行。

## 核心环境事实：CLI 与浏览器是两个网络世界

同一时刻实测（关键不对称）：

```
Edge headless → https://huggingface.co/webbrain-one  → 200
Edge headless → https://github.com/webbrain-one      → 200
Edge headless → https://www.webbrain.one/            → 200
curl -4 / -6 / 默认 → huggingface.co                → 000
```

机制（分层坐实，但未完全钉死）：

- **OS resolver 被 DNS 污染**：三次 `nslookup huggingface.co` 返回三组互相矛盾答案 `104.31.142.88` / `75.126.164.178` / `96.44.137.28`；IPv6 还夹 `2a03:2880:f111:83:face:b00c:0:25de`（`face:b00c` 是 Facebook 的经典图案）——典型 GFW DNS 注入签名。
- **curl / python-urllib / git 都不读 Windows system proxy（WinINET）**，直接吃被污染的 resolver → 连到 sinkhole IP → `000`。
- **浏览器读 system proxy**：注册表 `ProxyEnable=0x1`、`proxyServer = http=http://127.0.0.1:31180; https=http://127.0.0.1:31181`，即本机在跑的 **DevSidecar**（`tasklist` 里有 5 个 `dev-sidecar.exe`），它做 DNS 净化 + 隧道，故浏览器通。
- 直接给 curl 指定 `-x http://127.0.0.1:31181` **也不通**——DevSidecar 不是对任意域名开放的普通 HTTP proxy；逐端口试探 31181 / 8790 / 8899 / 9080 / 1024 / 4709 / 8788 全部 `http_proxy=000 socks5=000`。
- DoH 逃生路径被封：`cloudflare-dns.com` DoH → `curl: (35) Recv failure: Connection was reset`；alidns DoH → 超时。

对 dsh 的直接含义：**任何在 provider 内部用 python/curl/urllib 直连的 web_search 或 fetch 工具，在这台机上撞到 HF / GitHub 这类被污染域名都会拿到 000，而浏览器路径正常。** 要修必须显式挂 system proxy 或走 DevSidecar，不能依赖进程继承环境。

## 可跑的 headless 抓取配方（puppeteer + Edge）

两个必要条件，缺一即失败：

```bash
export NODE_PATH="$(npm root -g)"
```

```js
puppeteer.launch({ headless: true,
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  args: ['--no-sandbox'] })
```

失败模式记录（都实测过）：

- puppeteer 自带 Chrome 未下载：`Could not find Chrome (ver. 150.0.7871.24)`；未设 `executablePath` 时报 `LAUNCH_ERR The "path" argument must be of type string. Received undefined`。
- 只设 `channel:'msedge'` 也炸：`LAUNCH_ERR Browser was not found at the configured executablePath (C:Program Files (x86)MicrosoftEdgeApplicationmsedge.exe)`。
- **`executablePath` 必须用正斜杠**：反斜杠会被 bash heredoc 吞掉，变成 `C:Program Files (x86)MicrosoftEdge...`。更稳的做法是把脚本写成 `.js` 文件再 `node file.js`，不用 heredoc。

省事技巧：**页内 `fetch` 是同源请求、绕开 CORS**——

```js
p.evaluate(async () => { await fetch('/api/...') })
```

取目标站 API 数据优先走这条路，而不是在 Node 侧直连。

## 分页 API 的教训：先 dedupe 再计数

抓 `webbrain-one` 的 following 时用 `/api/users/webbrain-one/following?limit=50&page=N` 循环，**HF 忽略 `page` 参数**，同一页被抓了 6 遍：

```
raw entries: 738 | unique usernames: 123 | dup ratio: 6.0x
738 = 123 × 6
```

于是「738 following」是抓取代码的 artifact，以 profile 页显示的 191 为准。通用规则：

> 任何分页 API 拿到多页结果，必须先 dedupe 再计数，否则误差可以是整数倍。

## 其他现场事实

- 本机 hosts 文件（非注释行）只有两条 Tailscale 记录：`100.84.67.49 node.tailc3af92.ts.net. node`、`100.79.96.82 tianque.tailc3af92.ts.net. tianque`。
- HF API 行为杂记：`/api/users/webbrain-one` → 404，但其 `/following`、`/followers` 端点可用；`/followers?limit=3` → `400 {"error":"✖ Too small: expected number to be >=10"}`（limit 有下限 10）。
- 抓取脚本与落盘名单留在 `C:/Users/27063/AppData/Local/Temp/`（`hfprobe.js` … `hfprobe5.js`、`webbrain_following.json`）——临时产物，不保证留存。

## 遗留未决

- DevSidecar 放行/拦截的确切判定机制未钉死（为何 curl 显式指定其端口仍不通）。
- 「following API 对非 owner 返回 `[]` 而页面显示 1 following」的分歧未定论（端点限制 vs 页面 stale）；followers 一侧是硬的。
