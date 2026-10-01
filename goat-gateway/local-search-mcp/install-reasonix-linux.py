#!/usr/bin/env python3
"""Install/refresh the local-search MCP entry + global memory rule for Linux reasonix."""
import os
import time
import shutil

home = os.path.expanduser("~")
config_path = os.path.join(home, ".reasonix", "config.toml")
with open(config_path, "r", encoding="utf-8") as f:
    text = f.read()

markers = ['[[plugins]]\nname    = "local-search"', '[[plugins]]\nname = "local-search"']
if not any(marker in text for marker in markers):
    shutil.copy2(config_path, f"{config_path}.bak-local-search-{time.strftime('%Y%m%d-%H%M%S')}")
    block = (
        "\n\n# 本地搜索优先：Linux 离线维基/PocketWiki + GitHub 全站\n"
        "[[plugins]]\n"
        'name    = "local-search"\n'
        'command = "/home/tianque/.local/node22/bin/node"\n'
        'args    = ["/home/tianque/goat-gateway/local-search-mcp/local-search-mcp.mjs"]\n'
    )
    with open(config_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text.rstrip() + "\n" + block)
    print("config appended:", config_path)
else:
    print("config already contains local-search")

memory_dir = os.path.join(home, ".reasonix", "memory", "global")
os.makedirs(memory_dir, exist_ok=True)
memory_path = os.path.join(memory_dir, "强制搜索优先级-local-wiki-github.md")
memory = """---
id: forced-search-priority-local-wiki-github
revision: 1
created_at: "2026-09-27T00:00:00Z"
updated_at: "2026-09-27T00:00:00Z"
name: forced-search-priority-local-wiki-github
description: 搜索必须优先 local-search（离线维基/PocketWiki + GitHub 全站），只有无结果才用 exa/parallel/nothumansearch
metadata:
  type: user
  fact_type: project
  scope: global
---

# 强制搜索优先级

需要联网搜索、查资料、查代码/课程笔记/GitHub 内容时：

1. **第一步必须调用 local-search MCP 的 `web_search` 工具**
   - 它先查本机 Linux 上的离线 Wikipedia 2026-06 / PocketWiki，再查 GitHub 全站 repositories/code/issues。
2. 只有当 `local-search` 返回空结果、报错、或用户明确要求实时信息时，才使用：
   - exa
   - search-mcp（Parallel）
   - nothumansearch
3. 不要把 exa / parallel 放在 local-search 前面。
4. 引用结果时保留来源链接；离线维基内容标注 `[离线维基 2026-06]`。
"""
with open(memory_path, "w", encoding="utf-8", newline="\n") as f:
    f.write(memory)
print("memory written:", memory_path)
