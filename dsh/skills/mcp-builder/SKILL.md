---
name: mcp-builder
description: 构建 MCP Server — 使用 FastMCP (Python) 或 SDK (Node.js) 创建、测试、发布 MCP 服务器
---

# MCP Builder — 构建 MCP 服务器

创建自定义 MCP (Model Context Protocol) 服务器。

## 支持的框架

| 框架 | 模板命令 |
|------|---------|
| Python FastMCP | `pip install mcp` → `python -c "from mcp.server.fastmcp import FastMCP"` |
| Node.js SDK | `npm install @modelcontextprotocol/sdk` |

## 快速模板

### Python FastMCP
```python
from mcp.server.fastmcp import FastMCP
mcp = FastMCP("my-server")

@mcp.tool()
def my_tool(param: str) -> str:
    """工具描述"""
    return f"处理: {param}"

@mcp.resource("config://app")
def get_config() -> str:
    return "应用配置"

if __name__ == "__main__":
    mcp.run(transport="stdio")
```

### Node.js SDK
```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new Server({ name: "my-server", version: "1.0.0" }, {
  capabilities: { tools: {} }
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{ name: "my_tool", description: "...", inputSchema: { type: "object", properties: {} } }]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  return { content: [{ type: "text", text: "结果" }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

## 传输方式

| 方式 | 适用场景 |
|------|---------|
| stdio | 本地子进程，直接运行 |
| SSE | 远程 HTTP 连接 |
| Streamable HTTP | MCP 规范新版，支持流式响应 |

## 发布

```bash
# npm 发布
npm publish

# PyPI 发布
python -m build && twine upload dist/*
```

## 测试

```bash
# 本地测试 stdio
node -e "const io = require('child_process').spawn('node', ['server.js']); io.stdout.on('data', d => console.log(d.toString()));"

# 使用 MCP Inspector
npx @modelcontextprotocol/inspector node server.js
```
