---
id: mem-af610fa6a4e646bb33100dc6f223abe2
revision: 4
created_at: "2026-09-27T15:23:55.863Z"
updated_at: "2026-09-27T16:29:49.875Z"
name: mnemon-three-tier-memory-deployed-20260927
description: "补齐 mnemon 三层记忆的第一层（runtime hot memory）：此前 USER.md/MEMORY.md 全空；纠正\"不要直接编辑那两个 .md\"（记忆中 memories.json 才是唯一事实源，.md 由控制层派生），改用 mnemon_runtime_memory 工具写入并做双向闭环验证"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 一、问题：mnemon 三层记忆的第一层是空的

objective 说「**三层**记忆」。我此前只验证了第三层（memory spaces，195 insights）。
实测 `~/.mnemon/` 下三层的落点：

| 层 | 落点 | 之前状态 |
|---|---|---|
| 1 runtime（**每轮注入**） | `~/.mnemon/runtime/{USER.md, MEMORY.md, memories.json}` | **USER.md 0 B / MEMORY.md 0 B / entries 空** |
| 2 documents | `~/.mnemon/documents/{active,archived,index.json}` | index.json 38 B，**无文档** |
| 3 memory spaces | `~/.mnemon/data/default/mnemon.db` | 5.2 MB / 195 insights ✅ |

**第一层每轮都注入**（dsh 会话开头就有 `USER.md entries: 0 / bytes: 0/4096`）→ **空着等于白占配额。**

## 二、🔴 关键纠正：**不要直接编辑那两个 .md**

插件源码里写死了这条（`lib/client.js:473` / `:520`，中英双语）：

> **"memories.json 是唯一事实源；两个 Markdown 文件由控制层生成，不应直接编辑。"**
> "memories.json is the only source of truth. The control plane generates both Markdown files; do not edit them directly."

**我先踩了这个坑**：直接写了 `USER.md` / `MEMORY.md` → **无效**（会被控制层覆盖）。
**已恢复原状**（清回 0 字节），改走正确入口。

## 三、正确入口：`mnemon_runtime_memory` 工具

```
mnemon_runtime_memory(action="add"|"replace"|"remove", target="user"|"memory", content=..., importance="critical"|"normal"|"low")
```

**闭环验证（双向）**：
```
mnemon_runtime_memory(action="add", target="user", importance="critical", content="语言契约（…）")
→ {"success":true,"entryCount":1,"usage":{"used":598,"limit":4096},
   "memoryReceipt":{"status":"succeeded","completion":"committed"}}

# 事实源随之更新
~/.mnemon/runtime/memories.json:
{"version":1,"entries":[{"content":"语言契约（…）","created_at":"…Z","updated_at":"…Z",
                         "target":"user","importance":"critical"}]}

# 派生文件由控制层重新生成
~/.mnemon/runtime/USER.md → 599 字节（内容 = 刚写入的那条）✅
```

**已写入两条**：
1. `target: user` / `critical` — 语言契约（中英术语规则）`usage 598/4096`
2. `target: memory` / `normal` — dsh 3080 + `patchReload: live`（改配置开新会话即生效）`usage 255/10240`

## 四、`memories.json` 的 schema（从 `lib/index.js:628-638` 读出）

- `version` 必须等于 `RUNTIME_MEMORY_VERSION`
- `entries` 必须是数组
- 每个 entry 必须有：`importance`（**枚举**）、`created_at` / `updated_at`（字符串时间戳）
- `content`：**非空**、**不能含 `§`**、**≤ 8192 字节**

## 五、工具的用法纪律（Host 侧强制）

- **只写用户提供/更正过的事实**，或用户**显式要求保存**的信息
- **绝不**把 `Documents` / `Recall` / `Related` 读到的证据抄进去
- **回答只读问题必须保持只读**（不能顺手写）
- `target=user` 只放"用户是谁"；`target=memory` 放项目/环境/决策/教训
- 跳过：问题、猜测、assistant 自己编的论断、临时进度、完成日志、原始 dump、密钥、可再发现的事实

→ **所以我没有把第三层的 195 条 insight 抄进第一层**（那是 retrieved evidence，明令禁止）。第一层只放"用户明确定过 + 每轮都该看到"的极少数条目。

## 六、三层记忆的完整状态（2026-09-28）

| 层 | 状态 |
|---|---|
| 1 runtime | ✅ **启用**（2 条：语言契约 598B / dsh 主战场 255B），配额 4096 + 10240 |
| 2 documents | ⚪ 空（无项目文档需求，未启用，机制在位） |
| 3 memory spaces | ✅ 195 insights / 5498 条 four-graph 边 / embedding 100% |
