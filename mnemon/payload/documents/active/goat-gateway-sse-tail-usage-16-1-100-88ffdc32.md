---
id: "88ffdc32-99cb-4833-9053-4d1dafc490a4"
title: "goat-gateway SSE tail 窗口截断：usage 覆盖率 16.1% → 100% 的根因、回归验证与踩坑"
description: "2026-10-02 修复记录：gateway.mjs 的 SSE tail 缓冲写成「前 64KiB 封顶」导致长流 usage 永远读不到（覆盖率 16.1%），改为滑动窗口；含双跑对照回归用例 selftest-tail-window.mjs、经一次性计划任务挑空闲窗口重启的生产验证、覆盖率 13/13=100%、环境踩坑（loop-guard 同目录依赖 / .mjs 扩展名 / schtasks MSYS 路径转换 / python 插 JS），以及 Linux 侧同 bug 未修（行 1101）。"
status: "active"
created_at: "2026-10-02T08:06:08.755Z"
updated_at: "2026-10-02T08:06:08.755Z"
content_hash: "6ea71fb3d10e8d9ef82129f0209b27516a433cf2a876688f7aa262d1a83347f0"
source_paths:
  - "gateway.mjs"
  - "selftest-tail-window.mjs"
  - "restart-gateway.ps1"
  - "watchdog.ps1"
  - "PLAN.md"
session_ids:
  - "ffc0b182-beab-4522-aea8-aa8657797a96"
memory_body_ids:
  []
---

# goat-gateway SSE tail 窗口截断：usage 覆盖率 16.1% → 100%

**性质**：带运行时证据的根因调查 + 已上线修复 + 回归保护交接记录。2026-10-02，Windows 侧（`D:\Toolbox\goat-gateway\`）已修复并重启生效。
**背景**：为「双机四 agent 用量总视图」找数据源时发现，gateway 日志里唯一带真实 token 桶的那一段约 85% 的请求都丢了。
**关联文档**：`63920537-afab-454b-b365-0c70e74a206d`（同一 gateway 的 pathPrefixes/pathAllowed 修复记录）。

## 根因

`gateway.mjs`（CRLF，1183 行附近）SSE 分支里，`tail` 是给 `extractLastUsage(tail)`（`gateway.mjs:823`，用 JSON 扫描而非正则，为正确处理嵌套结构）做末尾提取的缓冲：

```js
const chunkStr = c.toString('utf8');
if (tail.length < 65536) tail += chunkStr;   // ← 累积到 64KiB 就永久停手
```

这是**前 64KiB 封顶**，不是「保留最后 64KiB」。而 `usage` 只出现在流的最后一帧 ⇒ 缓冲涨到 64KiB 后不再增长，长流的结尾永远进不来。短流（<64KiB）不受影响，所以覆盖率 ≈ 短请求占比。

修法（滑动窗口）：

```js
tail += chunkStr;
if (tail.length > 65536) tail = tail.slice(-65536);
```

改后 81065 B，`node --check` 通过；备份 `gateway.mjs.bak-20261002-155831-pre-tail-window`。

**量级**：重启前实测 471 条 OK / 76 条带 `usage=` = **16.1%**（当日日志 458 OK / 72 带 usage）。

## 验证（三重，均为本人实跑）

**① 双跑对照（证明用例有灵敏度）** — 新写的独立回归用例 `~/.dsh/storages/tools/selftest-tail-window.mjs`，不改动既有 `selftest.mjs`：在临时目录写 config/keys/state 并用 `GATEWAY_LOG_DIR` 隔离，端口 18789，本地 upstream 先吐 300 个 pad 帧共 149547 B（> 64KiB），再吐 `usage.prompt_tokens=424242` + `[DONE]`。

| 被测文件 | 结果 |
|---|---|
| 修好的 `gateway.mjs` | `PASS tail-window: 灌入 149547 B`，usage 完整解析，EXIT=0 |
| patch 前备份 | `ASSERT FAIL: 长流末尾的 usage 必须被记录`，okLine 无 `usage=`，EXIT=1 |

**② 生产重启（在安全窗口内）** — `gateway.mjs` 的**代码**改动必须重启进程（只有 `keys.json` 有 mtime 热重载）；而 dsh 自身的模型调用就走 127.0.0.1:8788，重启会打断进行中的流（`restart-gateway.ps1` 注释已警示）。做法是用一次性计划任务 `Goat-Gateway-Restart-Once` 挑空闲窗口触发：

```
16:03:03  restart requested; current owner of 8788 = 6308
16:03:06  old process stopped, port released
16:03:07  OK: gateway back up on 8788, new PID 24680
```

新进程命令行 `"C:\Program Files\nodejs\node.exe" "D:\Toolbox\goat-gateway\gateway.mjs"`；本轮会话未被打断。任务用完即删，`schtasks` 只剩原有 `Goat-Gateway` / `Goat-Gateway-Watchdog` / `GoatQuotaHttp`。

**③ 覆盖率实测** — 重启后 **13/13 条 OK 行带 usage = 100%**。真实样例含 `cached_tokens` 与 `reasoning_tokens`，即 cache hit/miss 拆分与 reasoning 量的请求级台账齐备：

```
usage={"prompt_tokens":68450,"completion_tokens":2659,"total_tokens":71109,
       "prompt_tokens_details":{"cached_tokens":68352,…},"completion_tokens_details":{"reasoning_tokens":2521,…}}
```

## 踩坑（复用价值高）

- **旧文件复制到别的目录跑不起来**：`gateway.mjs:15` 有 `import … from './loop-guard.mjs'`，同目录依赖必须一起带；且备份文件名**没有 `.mjs` 扩展名**时 node 按 CJS 解析 ⇒ `import` 语法错，只表现为 `gateway health timeout`（易误判成「旧代码本来就跑不了」）。用同目录 + `.mjs` 扩展后才拿到真实 FAIL。
- **用 python 往 JS 源码里插用例**时 `\n` 字面量会被写成真换行 ⇒ `SyntaxError: Unexpected token ':'`。改 JS 应改用**文件里已存在的锚点**做替换。
- **`schtasks` 在 Git Bash 里被 MSYS 路径转换吃掉参数**（`/Create` → `C:/Git/Create`），必须 `export MSYS_NO_PATHCONV=1`。
- **`restart-gateway.ps1`** 流程：停占用 8788 的进程 → 等端口释放 → 跑 `Goat-Gateway` 计划任务 → 校验新进程，日志 `logs/restart-gateway.log`；`watchdog.ps1` 由 `Goat-Gateway-Watchdog` 每分钟兜底（连查两次 `/health` 都失败才判定真挂，顺带刷 GOAT 额度缓存到 `%TEMP%\goat-usage-cache.json`）。
- `~/.dsh/PLAN.md` 有并发 session 同时写（本人写入 3690 B 后被发现变成 5429 B）；改动用行索引插入 + 单点替换，改完核验两处标记都在。

## 待办 / 未修

**Linux 侧同一 bug 未修**：`~/goat-gateway/gateway.mjs` 1642 行（Windows 是 1744 行，版本已漂移），bug 在**行 1101**。等 Linux 恢复流量会同样丢约 85% 的 token 数据；需按它自己的锚点单独打一遍。

## 交付物

- `D:\Toolbox\goat-gateway\gateway.mjs`（已改 + 已重启生效）
- `~/.dsh/storages/tools/selftest-tail-window.mjs`（新回归用例，双跑对照通过）
- `~/.dsh/PLAN.md`（该条已勾 ✓，含 16.1% → 100% 实测数字）
