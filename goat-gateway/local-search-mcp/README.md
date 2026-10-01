# local-search-mcp

reasonix 用的 stdio MCP server，把「Linux 离线维基/PocketWiki + GitHub 全站」暴露成一个 `web_search` 工具。

## 协议

- stdio，newline-delimited JSON-RPC
- `initialize` / `tools/list` / `tools/call` / `resources/list` / `prompts/list`

## 工具

`web_search(query, max_results=8)`

顺序：

1. Linux local-search 聚合器（PocketWiki + 离线 Wikipedia ZIM）
2. GitHub 全站（repositories + code + issues，自己的仓库优先）
3. 返回 Markdown 来源列表

## 配置（环境变量）

| 变量 | 默认 |
|---|---|
| `LOCAL_SEARCH_AGGREGATOR_URL` | `http://100.79.96.82:8810` |
| `LOCAL_SEARCH_TOKEN_FILE` | Windows `%USERPROFILE%\.dsh\local-search-token`；Linux `~/.config/local-search/token` |
| `GITHUB_TOKEN_FILE` | Windows 空（用 git credential）；Linux `~/.config/local-search/github-token` |
| `GITHUB_CA_FILE` | Windows dev-sidecar CA；Linux `~/.dev-sidecar/dev-sidecar.ca.crt` |
| `GITHUB_PRIORITY_OWNER` | `TianQue6916` |

## reasonix 配置

在 `config.toml` 加：

```toml
[[plugins]]
name = "local-search"
command = "node"
args = ["D:/Toolbox/goat-gateway/local-search-mcp/local-search-mcp.mjs"]
```

Linux：

```toml
[[plugins]]
name    = "local-search"
command = "/home/tianque/.local/node22/bin/node"
args    = ["/home/tianque/goat-gateway/local-search-mcp/local-search-mcp.mjs"]
```

并加一条全局 memory 规则：本地搜索优先，只有无结果才用 exa / parallel / nothumansearch。
