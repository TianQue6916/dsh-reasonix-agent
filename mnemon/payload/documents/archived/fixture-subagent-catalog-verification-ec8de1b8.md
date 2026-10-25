---
id: "ec8de1b8-5a29-4020-a62b-39d076e6c6e0"
title: "[fixture] subagent catalog verification"
description: ""
status: "archived"
created_at: "2026-09-29T19:07:29.935Z"
updated_at: "2026-09-29T19:07:46.430Z"
content_hash: "2d2d72b03bc32d8a7c95280503bfde5b88b845b74445b70b573a8f91e1179747"
source_paths:
  []
session_ids:
  - "session-a0d5fbf8-0fb1-419e-9baf-d95df0190144"
memory_body_ids:
  - "default"
---

# Subagent catalog fix — verification fixture

This is a throwaway document created solely to exercise the
`mnemon_document_manage(action="archive")` path, which spawns a real delegated
subagent via `archiveDocumentLocked -> this.delegate(..., "spawn", ...)`.

It exists to verify two fixes made on 2026-09-30:

1. `tool-bootstrap.mjs` no longer narrows a delegated child's tool catalog.
   Before the fix, `toolFilter.allow` (a pure-mnemon tool list) intersected the
   bootstrap keep-set (`bash`, `str_replace_editor`, `dev_tool_search`,
   `skill_search`, `skill_load`) to the EMPTY SET, so the child's first
   `request/header` carried no `tools` field at all and the model emitted
   tool-call syntax as plain text.

2. `subagent-language.mjs` appends the 中文/英文术语 contract to the child's
   persona, which `dsh-subagent` had shadowed with dsh-mnemon's English one.

Safe to archive and delete.
