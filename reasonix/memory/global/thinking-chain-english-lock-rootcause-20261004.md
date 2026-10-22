---
id: mem-a88cc4881382b398df4c841b98219ddd
revision: 1
created_at: "2026-10-03T16:18:45.541Z"
updated_at: "2026-10-03T16:18:45.541Z"
name: thinking-chain-english-lock-rootcause-20261004
description: "思考链恒英文的真根因（gateway 回灌自锁）与 reasoning-echo-filter 修法、实测棘轮数据、复现命令"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 结论（已复验）

「思考链长期锁英文」的根因**不在 dsh 配置**，而在 **goat-gateway 把上一轮的英文 `reasoning_content` 原样回灌**，形成语言自锁（模型看到自己过去 24 段英文独白 ⇒ 继续英文）。dsh 侧的 `thinking-language.json` / `thinking-anchor` / persona 语言契约全部健康但压不过它。

## 修法（已上线）

`D:\Toolbox\goat-gateway\gateway.mjs` 的 `reasoning-echo-filter`：
- 一带 `:951` 起 `function filterReasoningEcho(parsed, req, cfg)` + `:960 echoFilterConfig()` + `:971 cjkRatioOf(text)`；调用点在 `:1650-` 的 `// echo-filter-call-start … end` 块。
- 开关文件 `D:\Toolbox\goat-gateway\logs\.reasoning-filter.json` = `{"enabled": true, "minCjk": 0.25, "mode": "strip", "uaHints": ["deepseek-harness"], "verbose": false}`。删掉即关闭。
- 只在 `dropped > 0` 时打日志 `ECHO-FILTER id=… dropped=… kept=… chars=… minCjk=… mode=… bytes=…`。

## 实测证据

- 棘轮：首条 `08:11:05 id=1 dropped=27 kept=0 chars=116281` → 末期 `id=56 dropped=1 kept=12`；全日志 171 条。kept 0→12–15、dropped 27–28→1–5。
- 本 session `session-a0d5fbf8-0fb1-419e-9baf-d95df0190144`（3011 个 reasoning block）按本地小时分桶、只取带 tool-call 的 step：
  - 10-02 15 `n=63 median=0.000 zh=0%` · 10-03 13 `0.005/0%` · 10-03 15 `0.000/0%`
  - **10-03 16（filter 16:11 上线）`0.001/35%`** → 17 `0.487/91%` → 18 `0.504/96%` → 23 `0.495/92%` → 10-04 00 `0.534/95%`
  - 全期：ALL `n=3011 median=0.480 zh=64.9%`；**WITH tool-call `n=2852 median=0.472 zh=64.0%`**；NO tool-call `n=159 median=0.605 zh=79.9%`
- ⇒「调工具 ⇒ 英文」这个 register 压过 system 契约的现象已消除（口径 = 剥离 code fence / inline code / URL / 盘符路径后 `cjk/(cjk+latin)`，阈值 zh 取 ≥0.30）。

## 复现与前提

- 复现：`python ~/.dsh/tmp-probe/stat-reasoning-cjk.py session-a0d5fbf8-0fb1-419e-9baf-d95df0190144`
- ⚠️ 会话读取：`data.message.content[]` 的块类型才是 `'reasoning'`（不是 `data.content`）。
- ⚠️ 依赖 gateway 常开；**Linux 侧 `~/goat-gateway/gateway.mjs`（1642 行 / md5 `37a831e9235110bf669c4a840958e887`）尚未打此补丁**，Linux dsh 出口同样走本机 `127.0.0.1:8788/v1` ⇒ 那边仍会被锁。截至 2026-10-04，`ssh tianque`（Tailscale 100.79.96.82:22）连接超时，未能补。
