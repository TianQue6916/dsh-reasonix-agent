---
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
   - 它先查 Linux 上的离线 Wikipedia 2026-06 / PocketWiki，再查 GitHub 全站 repositories/code/issues。
2. 只有当 `local-search` 返回空结果、报错、或用户明确要求实时信息时，才使用：
   - exa
   - search-mcp（Parallel）
   - nothumansearch
3. 不要把 exa / parallel 放在 local-search 前面。
4. 引用结果时保留来源链接；离线维基内容标注 `[离线维基 2026-06]`。
