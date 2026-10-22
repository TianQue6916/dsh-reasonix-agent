---
id: mem-18039e3136cddba3b5d9926e64c7f311
revision: 1
created_at: "2026-10-04T14:39:59.978Z"
updated_at: "2026-10-04T14:39:59.978Z"
name: dsh-asar-inspection-and-objective-9-10-findings-20261004
description: "asar 只读工具用法、desktop 产物布局、reasoning-autofold 未进 asar 的三条硬约束、session 面板差额的准确数字与坑"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 工具（新增，只读，不解包）

- `node ~/.dsh/storages/tools/asar-list-grep.mjs <archive.asar> <pattern> [...]` —— 读 asar 目录表并 grep entry 路径
- `node ~/.dsh/storages/tools/asar-read-entry.mjs <archive.asar> <entryPath> [needle]` —— 读单个 entry 的内容（含 needle 上下文）
- `python ~/.dsh/storages/tools/session-orphan-audit.py` —— 面板数据源 vs 磁盘 session 的差额审计

asar 格式（脚本依据）：`[u32 headerPickleSize][u32 headerSize][u32 jsonSize][u32 jsonStrSize]` + JSON 目录表 + 文件数据；
JSON 起点 = offset 16，数据起点 = `8 + jsonStrSize`，每个 entry 的绝对 offset = `数据起点 + entry.offset`。

## desktop 产物布局（2026-10-04 实测）

`C:\Users\27063\AppData\Local\Programs\DeepSeek Harness\resources\app.asar`（121,348,951 B，mtime 2026-10-03 13:47）：
- 顶层：`dsh/`、`node_modules/`、`lib/`、`package.json`、`renderer/`
- **dsh core** 在 `dsh/node_modules/@deepseek-ai/...`，**聊天 UI 客户端**在
  `dsh/node_modules/@deepseek-ai/dsh-client-ui-chat/lib/client.js`（565,053 B @ offset 19213654）
- 共 12967 个 entry；其中 1497 个带 `unpacked: true`

## reasoning-autofold 的现状（objective ⑩）

- **asar 内 client.js 未打补丁**：`__dspDisclosure` NOT FOUND，原行 `const { expanded, toggle } = useDisclosure();` 仍在
- **CLI 那份已打**：`%APPDATA%/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-client-ui-chat/lib/client.js`
  （565,455 B，`__dspDisclosure` × 3；备份 `*.bak-pre-autofold` 565,361 B）
- `~/.dsh/storages/tools/_asar-work.asar` **只是生产 asar 的逐字节副本**（同 121,348,951 B），**未打补丁**

## 为什么不能「免重建」改 asar（三条硬约束）

1. **补丁非等长**：565,053 → 565,455（+402 B）。原方案假设等长 ⇒ 不成立。
2. **entry 带 integrity**：`{"integrity":{"algorithm":"SHA256","hash":"a33cbb81…","blockSize":4194304,"blocks":[…]}}`
   ⇒ 内容变了 hash 就不匹配（Electron asar integrity）⇒ **等长 patch 也过不了校验**。
3. **`app.asar.unpacked/` 不能手动覆盖**：unpacked 语义由 header 的 `unpacked: true` 决定，
   不是「目录里存在同名文件就优先」。`client.js` 无此标记 ⇒ 放进去不会被读。

⇒ **唯一路径 = 重建整个 asar**（12967 entries，重排 4 字节对齐 offset + 重算 integrity hash）。
风险：动 121 MB desktop 主产物，出错即 desktop 打不开。收益：仅 desktop 端「思考链运行中自动展开、结束自动收回」。

## 面板 vs 磁盘 session 差额（objective ⑨）

- projcache `storages/session_projcache/sessions/*.json` = **1665**
- 磁盘 `sessions/<slug>/session-<uuid>/` = **1491**，其中 **570 个没有 `session.v4.jsonl.zstd`**
- **matched 1490**，**panel-only 175**，**disk-only 1**
- projcache 记录结构 = `{version, record:{identity, rows}}`；**数据本体在 `rows`**
- 磁盘大头 slug `--C-Windows-system32--` = 1211 dirs（798 有 stream，153.6 MB）
- **坑**：projcache 文件名含 `session-` 前缀、磁盘目录名也含，但首版脚本只在一侧剥离 ⇒ 交集误算成 0。
  两边统一剥成裸 `<uuid>` 才正确。
