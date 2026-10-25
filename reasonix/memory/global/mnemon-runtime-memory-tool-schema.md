---
id: mem-e8b67414bd73ce591e707ce13e8b2a0d
revision: 1
created_at: "2026-10-25T19:45:53.941Z"
updated_at: "2026-10-25T19:45:53.941Z"
name: mnemon-runtime-memory-tool-schema
description: "mnemon_runtime_memory 的正确参数形状（action 枚举 add/replace/remove）与 schema 定位方法，禁用猜测"
metadata:
  type: user
  fact_type: reference
  scope: global
---

`mnemon_runtime_memory`（写 runtime 常驻层的 `USER.md` / `MEMORY.md` / `memories.json`）的参数形状，靠猜会连错两次。

## 正确形状

```json
{ "action": "add", "target": "memory", "content": "..." }
```

- **`action` 是必填**；缺了报 `input is missing required property: action`。
- **枚举只有三个值：`add` / `replace` / `remove`**（源码：`dsh-mnemon-source-runtime/lib/client.js:275/306/324`）。
  `append`、`list`、`upsert` 之类都会报 `not an allowed value`。
- `target` 取 `memory` 或 `user`（分别对应 `MEMORY.md` / `USER.md`）。
- 成功返回里带 **`usage: {used, limit}`**（memory 默认 10240 B）与 **`memoryReceipt.status/completion`** ⇒ 用 `used/limit` 判断余量，不要凭感觉。

## 定位 schema 的方法（比猜快）

```bash
cd ~/.dsh/profiles/web/node_modules
grep -rno "action[^,;)]\{0,80\}" dsh-mnemon-source-runtime/lib/*.js | head
```
`client.js` 里 `action: "add"` / `"replace"` / `"remove"` 三处并排出现，直接给出枚举。

## 写入纪律（与记忆分层一致）

- 新知识先落 canonical 语料（`memory_remember`，自动 sync 进 mnemon），**只有「每轮都必须知道」的约束才写 runtime**；
- `USER.md` / `MEMORY.md` 是**生成投影**，禁止直接编辑；
- 实测余量参考（2026-10-26）：memory 12 条占 7633/10240 B（75%）、user 6 条占 3028/4096 B（74%）⇒ 常驻层已接近 3/4，新增前先看 `usage`。
