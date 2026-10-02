---
id: mem-e37e515d54e2201a981f8cca31288ae7
revision: 2
created_at: "2026-10-02T08:01:58.361Z"
updated_at: "2026-10-02T08:04:46.564Z"
name: goat-gateway-sse-tail-truncation-fix-20261002
description: "goat-gateway usage 覆盖率 16%→100% 的根因（SSE tail 前 64KiB 封顶）与已验证修复"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 现象（已修并验证 2026-10-02 16:03）
`D:\Toolbox\goat-gateway\logs\gateway-*.log` 的 OK 行只有约 15–16% 带 `usage={...}`（2026-10-02 重启前实测 471 条 OK / 76 条带 usage = 16.1%；10-01 dsh 1530/219；10-02 reasonix 117/20）。而 `session-cost.ps1`、跨机用量台账、峰谷归属都依赖这行里的 token 桶。

## 根因（代码级）
`D:\Toolbox\goat-gateway\gateway.mjs`（CRLF，1744 行）SSE 分支写的是

```js
const chunkStr = c.toString('utf8');
if (tail.length < 65536) tail += chunkStr;
```

这是**前 64KiB 封顶**，不是滑动窗口：流一旦超过 64KiB 就永久停止累积，而 `usage` 只出现在流的**最后一帧** ⇒ `extractLastUsage(tail)`（`gateway.mjs:823`，用 JSON 扫描而非正则以正确处理嵌套）永远看不到。短流（<64KiB）不受影响，所以覆盖率 ≈ 短请求占比 ≈ 15%。

## 修法
```js
tail += chunkStr;
if (tail.length > 65536) tail = tail.slice(-65536);
```
始终保留**最后** 64KiB。备份 `gateway.mjs.bak-20261002-155831-pre-tail-window`；80591 → 81065 B；`node --check gateway.mjs` OK。Linux 侧 `~/goat-gateway/gateway.mjs`（1642 行，md5 `37a831e9235110bf669c4a840958e887`）有同一 bug 在**行 1101**，未修。

## 验证证据（三重）
1. **双跑对照**：独立回归用例 `~/.dsh/storages/tools/selftest-tail-window.mjs`（临时目录写 config/keys/state + `GATEWAY_LOG_DIR` 隔离、端口 **18789**、本地 upstream 先吐 300 个 pad 帧共 **149547 B** 再吐 `usage.prompt_tokens=424242` + `[DONE]`）。
   - 对修好的 `gateway.mjs` → `PASS tail-window: 灌入 149547 B`，EXIT=0
   - 对 patch 前备份 → `ASSERT FAIL: 长流末尾的 usage 必须被记录`，`okLine=... OK id=1 ... 8ms ...`（无 `usage=`），EXIT=1
   ⇒ 用例有真实灵敏度。
2. **生产重启**：16:03:03 一次性任务 `Goat-Gateway-Restart-Once`（`restart-gateway.ps1`：停 8788 → 跑计划任务 `Goat-Gateway` → 校验）→ 16:03:07 新 PID **24680**，命令行 `"C:\Program Files\nodejs\node.exe" "D:\Toolbox\goat-gateway\gateway.mjs"`。**重启后 13/13 条 OK 行带 usage = 100.0%**。
3. **真实样例**：`2026-10-02T08:03:27.030Z OK id=1 ... model=deepseek/deepseek-v4.1-flash stream=true clientUa="deepseek-harness/0.2.0-rc.2" usage={"prompt_tokens":68450,"completion_tokens":2659,"total_tokens":71109,"prompt_tokens_details":{"cached_tokens":68352,...},"completion_tokens_details":{"reasoning_tokens":2521,...}}`。

## 踩坑（复用价值高）
- **代码改动必须重启进程**（只有 `keys.json` 有 mtime 热重载）。`restart-gateway.ps1` 会打断经 `127.0.0.1:8788` 的进行中流 ⇒ 用 `schtasks /Create /SC ONCE /ST <now+2min>` 挑空闲窗口触发；**在 bash 工具调用执行期间没有活跃 LLM 流**，所以「在大 sleep 里让它触发」是安全的窗口（实测本轮重启未打断任何请求）。
- 旧文件复制到别处再跑会起不来：`gateway.mjs:15` 有 `import ... from './loop-guard.mjs'`，同目录依赖必须一起带；且备份文件名无 `.mjs` 扩展时 node 按 CJS 解析 ⇒ `import` 语法错，只表现为 health timeout。
- 用 python 往 JS 源码里插用例时 `\n` 字面量会被写成真换行（`SyntaxError: Unexpected token ':'`）——改 JS 文件时改用「已存在于文件里的锚点」做替换，不要在字符串里重建整段代码。
- `schtasks` 在 Git Bash 里被 MSYS 路径转换吃掉参数（`/Create` → `C:/Git/Create`），必须 `export MSYS_NO_PATHCONV=1`。
