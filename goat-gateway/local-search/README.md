# local-search

Linux 侧本地搜索聚合器，给 Windows 上的 `dsh-plugin-local-search` 用。

## 组成

- PocketWiki：`/media/OS/wiki-data/pages/*.md`
- 离线 Wikipedia：`/media/OS/wiki-data/zim/wikipedia_en_all_nopic_2026-06.zim`
  - 用 Python `libzim` 全文检索 + 正文摘要，不依赖 `kiwix-serve`
- 监听 Tailscale 地址 `100.79.96.82:8810`

## 接口

| 路径 | 鉴权 | 说明 |
|---|---|---|
| `/health` | 无 | 健康检查 |
| `/search?q=&max=` | `x-local-search-token` | 返回 `{ sources: [...] }` |
| `/wiki/<title>` | 无（仅 Tailscale） | 返回离线维基正文纯文本，便于点击来源 |
| `/pocketwiki/<title>` | 无（仅 Tailscale） | 返回 PocketWiki Markdown 原文 |

> 内容端点不加 token 是为了让 web_search 返回的链接能在浏览器直接打开；
> 服务只绑定 Tailscale，`/search` 仍需要 token，避免被随意枚举。

## 部署

```bash
mkdir -p ~/.local/bin ~/.config/local-search
# 写入 token（0600）
umask 077
openssl rand -hex 32 > ~/.config/local-search/token

cp local_search.py ~/.local/bin/local-search.py
cp local-search.service ~/.config/systemd/user/local-search.service
systemctl --user daemon-reload
systemctl --user enable --now local-search.service
```

## 环境变量

| 变量 | 默认 |
|---|---|
| `LOCAL_SEARCH_HOST` | `100.79.96.82` |
| `LOCAL_SEARCH_PORT` | `8810` |
| `LOCAL_SEARCH_TOKEN_FILE` | `~/.config/local-search/token` |
| `LOCAL_WIKI_ZIM` | `/media/OS/wiki-data/zim/wikipedia_en_all_nopic_2026-06.zim` |
| `LOCAL_POCKETWIKI_PAGES` | `/media/OS/wiki-data/pages` |
| `LOCAL_WIKI_LABEL` | `离线维基 2026-06` |

## 注意

- 当前 ZIM 是**英文** Wikipedia 2026-06 版，没有中文维基。
- 首次搜索会加载 libzim Archive；之后通常 <0.2s。
- `~/.config/systemd/user/` 服务随用户登录启动；如果希望不登录也常驻，可 `loginctl enable-linger $(whoami)`。
