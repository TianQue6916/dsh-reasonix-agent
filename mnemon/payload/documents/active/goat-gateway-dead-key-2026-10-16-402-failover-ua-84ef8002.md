---
id: "84ef8002-3659-4b08-ba31-f622fbc184ba"
title: "goat-gateway 欠费 dead key 致「额度已用尽」误报（2026-10-16）：402 failover 因果链、UAC 提权改 keys.json 与 D 盘 create-new 写入边界"
description: "goat-gateway 池中欠费 key `deepseek-official` 被 failover 选中后透传上游 402，导致 dsh 误报「额度已用尽」；含因果链、逐字日志证据、UAC 提权改写 keys.json 的步骤与回滚、D 盘 create-new 被 PermissionError 拦截的写入边界、'\"enabled\": true'→false 的 +1 字符替换算术。"
status: "active"
created_at: "2026-10-16T03:45:03.865Z"
updated_at: "2026-10-16T03:45:03.865Z"
content_hash: "9b0571671bdca342fdaefb086f6e948e2f812190c9d81c60a58871d96a64b1c9"
source_paths:
  - ".dsh/PLAN.md"
  - ".dsh/storages/tools/_elev-disable-official.ps1"
  - ".dsh/logs/elev-disable-official.log"
session_ids:
  - "e5b71353-071b-4a87-9966-b50a11408fb4"
memory_body_ids:
  []
---

# goat-gateway 欠费 dead key 致「额度已用尽」误报（2026-10-16）

## 症状与结论

dsh Web GUI 反复显示「本轮运行失败 / 当前请求的额度已用尽」，但主力 key `qq` 额度充足（2026-10-07 数据：5h 0.53/14、周 9.30/35、月剩 60.70）。

**结论：报错具有误导性。** 真实原因是池中存在一个余额为负的 dead key，被 failover 选中后把上游 402 原样透传，被 dsh 归一化成 `QUOTA`。

## 因果链（2026-10-07 与 2026-10-16 两次同型复现）

1. `qq` 被上游打挂：`ECONNRESET: socket hang up` / `read ECONNRESET` / `ENOTFOUND getaddrinfo ENOTFOUND api.commandcode.ai`（CF `Error 1102` 同型）
2. gateway 对该 key 置 `COOLDOWN reason=network status=0 for=20s`，并 failover 到 `priority:0` 的 `deepseek-official`
3. `deepseek-official` 账户余额 **-0.22（欠费）**，上游返回 **402 `Insufficient Balance`**
4. `gateway.mjs:495` / `gateway.mjs:504` 判为 `quota`，施加 **600s** 冷却，并**把 402 body 原样透传**给客户端
5. dsh 侧 `dsh-llm/lib/types/error.js` 将该错误归一化为 `QUOTA`
6. `failureMessage()` 渲染为「额度已用尽」

**Gateway 日志逐字（2026-10-16）**：

```
2026-10-16T03:12:02.600Z NETWORK id=4 key=qq ECONNRESET socket hang up
2026-10-16T03:12:02.602Z COOLDOWN key=qq reason=network status=0 for=20s :: ECONNRESET: socket hang up
2026-10-16T03:12:02.606Z RETRY id=4 attempt=2/2 -> key=deepseek-official delay=500ms
2026-10-16T03:12:10.626Z FAIL id=4 POST /chat/completions key=deepseek-official status=402 7467ms
  body="{\"error\":{\"message\":\"Insufficient Balance (request_id: ff9ae755-52da-4452-b65d-6ed376073613)\",...}"
2026-10-16T03:12:10.629Z COOLDOWN key=deepseek-official reason=quota status=402 for=600s
2026-10-16T03:20:24.036Z NETWORK id=18 key=qq ENOTFOUND getaddrinfo ENOTFOUND api.commandcode.ai
```

## 修法：禁用该 key（已执行）

- 文件：`D:\80-系统\Toolbox\goat-gateway\keys.json`，把 `deepseek-official` 的 `"enabled": true` → `false`
- 必须走 **UAC 提权**：脚本 `C:\Users\27063\.dsh\storages\tools\_elev-disable-official.ps1`，日志写 `~/.dsh/logs/elev-disable-official.log`（**必须写 C 盘**，见下）
- 提权日志逐字：

```
2026-10-16 11:37:51  === elevated=True ===
2026-10-16 11:37:51  backup = D:\80-系统\Toolbox\goat-gateway\keys.json.bak-20261016-113751
2026-10-16 11:37:52  anchor@504  enabled@593  needleLen=15
2026-10-16 11:37:52  len before=1306 after=1307 (delta=1, expect +1)
2026-10-16 11:37:52  verify keys.json: JSON PARSE OK
2026-10-16 11:37:52    key 163: enabled=False weight=1 priority=
2026-10-16 11:37:52    key qq: enabled=True weight=3 priority=
2026-10-16 11:37:52    key deepseek-official: enabled=False weight=1 priority=0
2026-10-16 11:37:52  RESULT: ok=True
```

- **热生效（无需重启 gateway）**：`curl -s -X POST http://127.0.0.1:8788/_gateway/reload`
  返回 `{"ok": true, "config": "D:\\80-系统\\Toolbox\\goat-gateway\\config.json", "keys": [{163:false},{qq:true},{deepseek-official:false}]}`；
  gateway 日志：`2026-10-16T03:39:22.315Z RELOAD config=… keys=163,qq,deepseek-official`
- 生效后行为变化：`qq` 挂掉时会**如实显示网络错误**，而不是误导的「额度已用尽」

## 回滚

- `keys.json` 里改回 `"enabled": true` + 再调 `_gateway/reload`
- 备份：`D:\80-系统\Toolbox\goat-gateway\keys.json.bak-20261016-113751`（D 盘同目录）、`C:\Users\27063\.dsh\storages\goat-gateway-keys.json.bak-20261016-113543`（1265 B = 原全文）

## ★ D 盘写入边界（重要，别再踩）

非提权身份下对 `D:\80-系统\Toolbox\goat-gateway\keys.json`：

| 操作 | 结果 |
|---|---|
| `[IO.File]::Open('keys.json','Open','ReadWrite','None')` | **能过** |
| `WriteAllText('__wtest.tmp')` | **能过** |
| python `io.open(p,'w')` | `PermissionError: [Errno 13]` |
| `shutil.copy2` 新建 `.bak` | `PermissionError: [Errno 13] Permission denied: 'D:\…\keys.json.bak-20261016-113503'` |

⇒ **create-new 语义被拦截**；改写 gateway 配置一律走 UAC 提权，且提权脚本的日志必须落在 `C:\Users\27063\.dsh\logs\`（D 盘新建会失败，导致脚本"静默不生效"的假象）。

## 替换算术（历史事故教训）

- `'"enabled": true'` = **15** 字符，`'"enabled": false'` = **16** 字符 ⇒ **delta = +1 是正确预期**
- 2026-10-07 写坏 `keys.json` 的原因：PowerShell 硬编码 `Substring($j + 16)` 多吃一个字符、切掉逗号

## 排查入口

- gateway 端口 `8788`（`POST /_gateway/reload`）；当前 `8788` / `18787` / `11434` 三个端口均存活
- 日志目录：`D:\80-系统\Toolbox\goat-gateway\logs\`（`gateway-YYYY-MM-DD.log`、`loop-guard.jsonl`、`watchdog.log`）
- `keys.json` 中 `163` 也长期处于 `enabled=false`，池中实际只有 `qq` 可用

## 相关文档

- `784243df-dd9c-413a-b220-7a5c3a5bd207`：同日 bili/billion-context 前缀缓存命中率归因（compress re-pay 仅 4.8%、会话内切模型与 degenerate fold 为主因、T1–T5 方案待拍板）
