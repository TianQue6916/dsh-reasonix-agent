---
id: "c7fb1eaf-710f-4758-b8ab-b628d7e49746"
title: "anchored-standard 工具面常驻化：RESIDENT_CONTEXT_TOOLS + compactionTools 加 compress，以及「必须重启」的边界"
description: "2026-10-23 在 ~/.dsh 把 compress/decompress/acp_status/search_context 变成 promoted 常驻工具，并给 compactionTools 补 compress 以解 minecraft 会话死锁；含三处改动位置、patchReload:live 与 .mjs 都不热加载 plugin 实例 config 的实测边界、dump 配置≠运行时、验证与回滚。承接 aad793db（/compact 可用条件）与 1c10152c（memory_profile 常驻）。"
status: "active"
created_at: "2026-10-23T04:54:18.331Z"
updated_at: "2026-10-23T04:54:18.331Z"
content_hash: "96d0c34e0be8a91436390521f1bd1691128cef390abb024dd6b8f5a8bff7177c"
source_paths:
  - ".agent-presets/anchored-standard/tool-bootstrap.mjs"
  - "profiles/desktop/cordis.patch.yml"
session_ids:
  - "7f6beecc-865c-4204-9f6d-87cf03ca68c0"
memory_body_ids:
  []
---

# anchored-standard 工具面常驻化（2026-10-23）

状态：三处改动已落盘、`node --check` 通过、行尾为 LF；**尚未重启 dsh 验证**。
承接 `aad793db-0067-4db5-8256-6733debbde7b`（/compact 真正可用的条件）与 `1c10152c-903f-48df-b23e-2f44c6c126f1`（memory_profile 进 promoted resident 集）。

## 问题：compaction 态会话的死循环

`minecraft` 会话 84%、729K tok、`blocks=0`，可见工具恰好 9 个：

```
ask_user_question bash edit glob grep read str_replace_editor todo_write write
```

这 9 个 = `bootstrapTools`（bash / str_replace_editor）∪ `compactionTools`（read write edit glob grep todo_write ask_user_question）。也就是说它既没有 `compress`（压不了），也没有 `dev_tool_search` / `skill_search`（解锁不了能压的工具）。不是模型偷懒，是 catalog 层面无路可走。

## 三处改动

| # | 位置 | 改动 |
|---|---|---|
| 1 | `.agent-presets/anchored-standard/tool-bootstrap.mjs:147` | 新增 `const RESIDENT_CONTEXT_TOOLS = ['compress','decompress','acp_status','search_context']` |
| 2 | 同文件 `:309` | promoted 分支 keep 集合并入 `RESIDENT_CONTEXT_TOOLS` |
| 3 | `profiles/desktop/cordis.patch.yml:224` | `compactionTools` 末尾追加 `compress` |

设计取舍：
- **不动第一轮 bootstrap 对**。`tool-bootstrap.mjs` 头注释记着 issue #11 的实测：Minimal 那对 schema（persistent `bash` + `str_replace_editor`）在 adapter 默认 maxTokens 下锚定 5/5，标准族 schema 11/11 全崩。所以 `compress` 只进 promoted 之后与 compaction 态的集合。
- `RESIDENT_CONTEXT_TOOLS` 与既有 `RESIDENT_DISCOVERY_TOOLS` / `RESIDENT_MEMORY_TOOLS` 同一套模式：bili 不在线时 `keepTools` 只 warn 一次 missing-name，不致命。
- 选择 `compress` 而非依赖 bili 的自动 fold：bili 的 preflight 从没触发过（`bili.log` 零条 `[preflight]`，全是 `nudge idle … reason="growth < floor, blocked: T1 (cadence)"`），它要求 `growth > floor` 且满足 cadence 两个条件。摘要由模型写，不依赖 bili 那个从没成功过的摘要后端。

## 生效边界（本次最重要的纠正）

**`.yml` 与 `.mjs` 两端都不能热生效，必须重启 dsh 进程。**

- `.mjs` 是 cordis 加载 preset 时 `import` 的，改文件内容对已运行进程无效（这条 2026-09-27 已实测过，见 `dev-tool-search-false-unlock-fix-and-preset-reload-boundary-20260927`）。
- `cordis.patch.yml` 参与 `patchReload: live` 的 HMR，但**重载的是配置文件本身；已经加载的 plugin 实例手里的 config 不会随之更新**。本轮曾据 `patchReload: live` 断言"不用重启就生效"，被 minecraft 仍显示 9 个工具证伪。
- **`dump-desktop-config.ps1` 只读磁盘上的合成结果，不等于运行时已加载**。本轮曾据此误判生效，随后自我更正。判断运行时状态只能看实际会话的工具列表。

结论：两条改动都卡在"进程没重载"。重启后 minecraft 的工具集应从 9 个变 10 个（多出 `compress`）；`/compress` 后 `blocks` 从 0 变 1，`/compact` 才可用（见 aad793db 的 bili 分支 A 条件）。

## 验证与回滚

验证：重启 → 在 minecraft 会话发一句话看工具列表 → 出现 `compress` 后执行 `/compress` → 查 `curl http://127.0.0.1:18787/__bili/sessions` 确认 `session-9cf09938` 的 `tokensSaved` 不再为 0。

回滚（两个备份，重启后同样需要重启才回退）：

```bash
cd ~/.dsh
cp .agent-presets/anchored-standard/tool-bootstrap.mjs.bak-20261023-122906-pre-resident-context-tools \
   .agent-presets/anchored-standard/tool-bootstrap.mjs
cp profiles/desktop/cordis.patch.yml.bak-20261023-122906-pre-resident-context-tools \
   profiles/desktop/cordis.patch.yml
```

## 操作提醒

- 用 python 脚本改写这两个文件会把 LF 转成 CRLF（原文件 `CRLF=0`），写完须复核行尾并还原。
- 差分复核口径：相对备份，`tool-bootstrap.mjs` 只应有 2 处改动（常量 + keep 那行），`cordis.patch.yml` 只应有 1 行。
