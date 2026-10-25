---
id: "f1153ee7-ee96-4731-b21c-3954bd9f5077"
title: "web_search provider maxResults 隐藏上限（tool 恒传 8）+ UAC 提权装机受限路径 + 天阙机 ZIM 版本核对（2026-10-25 夜）"
description: "2026-10-25 夜 dsh-plugin-local-search 两个遗留问题的结论：① dsh-tool-web 传给 provider 的 request.maxResults 恒为 8，Math.min(request, cfg) 把 maxResults:30 压回 8，修复为「配置优先、仅在 tool 请求更大时放行」；② 安装脚本必须 UAC 提权，D:\\80-系统 与 D:\\Desktop 均为 High IL 保护目录写不进，只能用户手动右键运行 C:\\Users\\27063\\_install_wiki.bat；③ 三 profile symlink 共享同一份代码；④ 天阙机 wiki ZIM 已是最新 nopic 2026-06，官方站不可达、镜像可达矩阵与 flavor 更新节奏。"
status: "active"
created_at: "2026-10-25T11:33:27.787Z"
updated_at: "2026-10-25T11:33:27.787Z"
content_hash: "909e88cb17606e7027235e1c1790f91703d96b515b7eeb929a9c1fc5179323c4"
source_paths:
  - "_new_index5.js"
  - "_install_wiki.ps1"
  - "_install_wiki.bat"
  - ".dsh/profiles/desktop/cordis.patch.yml"
  - ".dsh/profiles/headless/cordis.patch.yml"
  - ".dsh/profiles/web/cordis.patch.yml"
session_ids:
  - "8e5fcb1c-408b-45cc-a219-bd5d11098770"
memory_body_ids:
  []
---

# web_search provider maxResults 隐藏上限 / 提权装机 / 天阙机 ZIM 核对（2026-10-25 夜）

延续 `5bc25216-46cb-4b2a-91a3-e59a7ab8b559`（node:http 修复、maxResults=30、英文维基变体）与 `8785572a-0406-48f6-be8f-3dbd78cfd291`（四源「全是 github」诊断）。本篇只记录这两篇未覆盖的三件事。

## 1. 配置里 `maxResults: 30` 为什么不生效 —— tool 恒传 8

四源实测（查询 `DeepSeek V4 发布 参数 上下文`）全部有返回，但总数只有 8 条：

```
[github] ×2  [deepseekSearch] ×2  [bing] ×2  [wiki] ×2
```

原代码：

```js
const maxResults = Math.max(1,
  Math.min(Number(request?.maxResults || cfg.maxResults), Number(cfg.maxResults)));
```

`dsh-tool-web` 调用 provider 时传入的 `request.maxResults` **恒为 8**（是它给模型的建议值，不是上限），于是 `Math.min(8, 30) = 8`，profile 里配的 30 被这一行完全抵消。**结论：问题不在配置层、不在 patch 合并，而在 provider 内部的 min 语义。**

修复（以配置为准，只有 tool 明确要更多才放行）：

```js
const configuredMax = Math.max(1, Number(cfg.maxResults || 30));
const requestedMax = Number(request?.maxResults);
const maxResults = Number.isFinite(requestedMax) && requestedMax > configuredMax
  ? Math.floor(requestedMax)
  : configuredMax;
```

## 2. 装机必须 UAC 提权，且两个候选目录都写不进去

插件实体在 `D:\80-系统\Toolbox\goat-gateway\dsh-plugin-local-search\index.js`，属 High IL 保护目录；`Start-Process -Verb RunAs` 连续两次**没有弹出 UAC**（无 consent 进程、无新日志、D 盘文件时间仍是旧版）。

想退一步「把 .bat 放到桌面让用户双击」也不行：该机桌面重定向到 `D:\Desktop`，**同样是 High IL 保护目录**（`Access to the path 'D:\Desktop\install-search.bat' is denied`）。

可行路径只有一条：文件放 `C:\Users\27063\_install_wiki.bat`，由用户在资源管理器里**右键 → 以管理员身份运行**。脚本 `_install_wiki.ps1` 的 `$src` 指向 `C:\Users\27063\_new_index5.js`，成功后日志 `C:\Users\27063\_install_wiki_<时间戳>.log` 出现 `installed index.js bytes=<新长度>` 才算装好。

自检脚本的五个断言（装完看日志）：`httpGetJson helper` / `searchAggregator uses it` / `node:http imported` / `deepseekSearch kept` / `endpoint intact`。装前那版日志是 `FAILED: 1 checks failed`（MISS 第二条），装好后应全 OK。

装完必须**重启 dsh**；provider 在 session 建立时注册（`patchReload: live` 亦需新会话），已开的旧会话不生效。

## 3. 三端共享同一份代码

```
.dsh/profiles/desktop/node_modules/dsh-plugin-local-search  -> /d/Toolbox/goat-gateway/dsh-plugin-local-search
.dsh/profiles/headless/node_modules/dsh-plugin-local-search -> /d/Toolbox/goat-gateway/dsh-plugin-local-search
.dsh/profiles/web/node_modules/dsh-plugin-local-search      -> /d/Toolbox/goat-gateway/dsh-plugin-local-search
```

三个 profile 各有一份 `cordis.patch.yml` 覆写（`maxResults` / `enableBing` / `provider` 声明），代码只有一份 ⇒ 改 D 盘那处三端同时变，参数要分别在三个 patch 里改。

## 4. 天阙机（小电脑）wiki ZIM：已是最新，不必更新

```
主机    TianQue · Ubuntu 24.04.5 LTS · kernel 7.0.0-38
服务    python3 /home/tianque/.local/bin/local-search.py  pid 2213  监听 100.79.96.82:8810
ZIM     /media/OS/wiki-data/zim/wikipedia_en_all_nopic_2026-06.zim
        52,690,706,555 B ≈ 49.1 GB   磁盘 803G 用 465G 余 338G
读取    环境变量 LOCAL_WIKI_ZIM，默认值写死指向 2026-06 这个文件名
```

`/health` 返回 `wiki_zim_exists: true`；`/wiki`、`/pocketwiki`、`/status` 均 404（只有 `/health` 与 `/search`）。ssh 走 `tianque`（100.79.96.82，Tailscale）/ `tianque-lan`（192.168.1.13）。

网络可达性：`download.kiwix.org`、`library.kiwix.org` 从 Windows 与天阙机**全不可达**（直连超时，走 DevSidecar 127.0.0.1:31180 亦 400 / 超时）；国内 TUNA / USTC / 阿里云 / 南大 / SJTU 的 kiwix 镜像全部 404（不镜像该目录）。可用的是：

- `https://mirrors.dotsrc.org/kiwix/zim/wikipedia/` 200
- `https://ftp.fau.de/kiwix/zim/wikipedia/` 200
- `https://mirror.accum.se/mirror/kiwix.org/zim/wikipedia/` 200

镜像上各 flavor 现存版本（两个镜像一致）：

| flavor | 现存 | 结论 |
|---|---|---|
| `wikipedia_en_all_nopic` | 2026-03、**2026-06** | 已是最新 |
| `wikipedia_en_all_mini` | 2026-06、2026-09 | 可切但非"更新" |
| `wikipedia_en_all_maxi` | 2026-02、2026-08 | 体积数倍，需先算磁盘 |

nopic 是全量 49 GB 无图版，Kiwix 一年只重建几次；mini/maxi 才月更。**判定：nopic 2026-06 已是头部版本，不更新；换 flavor 会降低 wiki 源召回，不建议。**

附带发现：`kiwix-serve`（kiwix-tools_linux-x86_64-3.7.0）当前未运行，日志残留上次地址 `192.168.1.13:8809`；聚合器不依赖它（直接 `libzim.reader.Archive`），8809 属闲置，需要时自行起服务。
