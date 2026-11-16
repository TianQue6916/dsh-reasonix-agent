# 交接文档 · goat 面板 / 零 token 连通性 / 速度口径

更新时间 2026-11-12 01:55 · 会话 `session-ffefd266-8dc5-4493-b8bc-10c1ebb13b15`
用户环境：**桌面版 dsh（profile `desktop`，Electron）**

## 1. 一句话现状

面板能显示「最近 12 小时连通性 + 探针背景 + 出字速度」，数据全部来自本地日志，不额外发请求、不花 token。
当前卡在速度口径：`loop-guard` 已记 TTFT，`quota-http` 的接入补丁**多次因会话中断没打上，需先确认**。

## 2. 架构

```
dsh(Electron, profile=desktop)
  provider commandcode-goat, api: openai-completions
  baseURL http://127.0.0.1:8788/v1
        │
   gateway.mjs (8788)  ── loop-guard.mjs ─→ logs/loop-guard.jsonl
        │                 (durMs / ttftMs / usage / 复读检测)
        ▼
   api.commandcode.ai  (gateway 自带上游 key，不校验 client key)
        │
   quota-http.mjs (8790, 启动器 start-quota-http.vbs)
     /quota  /health  /connectivity?hours=12&bucket=15
       ├─ 读 ~/.dsh/sessions/*/*/session.v4.jsonl.zstd（多帧 zstd）
       └─ 读 logs/loop-guard.jsonl（尾部 12MB，mtime 缓存 60s）
        │
   dsh-plugin-goat-panel/lib/client.js  (60s 心跳轮询)
```

插件名 `@local/dsh-plugin-goat-panel`，link 到 desktop 与 web 两个 profile。
`lib/index.js` 是空 `apply(){}`（纯 UI），逻辑全在 `lib/client.js`。

## 3. 口径（最容易搞错）

| 指标 | 公式 | 说明 |
|---|---|---|
| 端到端 tok/s | `ct / durMs` | 含排队 + prefill + TTFT |
| **纯 decode** | `(ct-1)/(durMs-ttftMs)` | vLLM `generation_time_ms` 口径 |
| TTFT | 请求发出 → 第一个 token | 首字延迟 |

vLLM 官方把 `generation_time_ms`（不含 prefill）与 `tokens_per_second`（含 prefill）分开报；
Artificial Analysis 的 throughput 也从 first output token 起算。
[HuggingFace 有个同款翻车案例](https://huggingface.co/datasets/LostGentoo/hf-inference-endpoint-benchmarks/blob/main/benchmarking-methodology.md)：
vLLM 被测成 33.5 tok/s，真实 75–85，「prefill time hiding in the denominator」，**结论被撤回**。
我们踩的是同一个坑：实测固定开销 **a ≈ 4.7–9 秒/请求**，导致回答越短读数越低、上下文越长读数越低。

## 4. 已完成

**连通性历史（零 token）**：数据源 `~/.dsh/sessions/*/*/session.v4.jsonl.zstd`；
事件 `step/start`、`step/end`、`llm/retry.data.failure.code`、`request/header`；
`/connectivity?hours=12&bucket=15` → 49 桶，从 cutoff 铺到 now；`computeMs` 385（12h）/ 7977（7d）。

**探针（零 token，硬证明）**：`PROBE_URL=http://127.0.0.1:8788/v1/models`、`PROBE_MS=900000`；
只发 GET；连打 3 次前后 `/quota?force=1` 的 requests/tokens 一位没动；gateway 日志里 `v1/models` 计数为 0。
成本 96 次/天 ≈ 1.5 MB/天。

**色带**：真实桶按失败率（`>=5% #f87171 / >=2% #fbbf24 / >0 #a3e635 / 0 #34d399`，opacity 1.0）；
探针桶按延迟分档（`>=3000 #f59e0b / >=2000 #eab308 / >=1000 #84cc16 / else #22c55e`，**opacity 0.18**）；
无样本桶灰 `#6b7280` opacity 0.35。

**TTFT 记录（已生效）**：`loop-guard.mjs` 三处 —— `begin()` 加 `ttftMs: null`；
`feed()` 加 `if (st.ttftMs == null) st.ttftMs = Date.now() - st.startTs;`；落盘带 `ttftMs`。
实测：`ct=2378 dur=19131 ttftMs=4136 → decode 158.5`、`ct=567 dur=5768 ttftMs=2098 → decode 154.2`。

**协议已切回** `openai-completions`（`~/.dsh/profiles/desktop/cordis.patch.yml:854`）。

## 5. 待办

1. **确认 `quota-http.mjs` 的 TTFT 补丁是否打上**：`grep -c ttftMs quota-http.mjs`，应为非 0。
   若为 0，需在 3 处插入（`durMs: d,` 后、`const fit = fitDecode(rows);` 后、`decodeRatio:` 后）。
2. `client.js` 显示还没改成「出字 / 端到端」两栏（代码已按 decode 改过，需 Ctrl+R 验证）。
3. 面板加「更新于 HH:MM:SS」，让 60s 心跳可见。
4. 逐日样本门槛从 40 提到 200，或让当天不参与峰谷（现在 11-12 才过 1 小时就参与比较，谷值乱跳）。

## 6. 必记的坑

1. **zstd 多帧**：session `.zstd` 是多帧追加。Node `zlib.zstdDecompressSync` 只解第一帧**且不报错**（357606 字节只出 205 字节）。必须按魔数 `28 B5 2F FD` 切帧逐帧解。
2. **换行符**：`pathlib.write_text()` 会把文件统一成 CRLF。`quota-http.mjs` 是纯 CRLF、`loop-guard.mjs` 是纯 LF。改文件一律 `open('rb')` + `bytes.replace` + `open('wb')`，否则 `diff` 会出几千行假差异。
3. **`splitlines(True)` 在 bytes 上返回 bytes**，拿 str 比较永远 False。
4. **重启 quota-http**：`Get-NetTCPConnection` 的 OwningProcess 恒为 0（dev-sidecar 的 WFP 过滤）。正解：
   `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*quota-http.mjs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`，再 `cscript //nologo start-quota-http.vbs`。
5. **重启 gateway**：`pwsh -NoProfile -File restart-gateway.ps1`（实测 8 秒恢复）。
6. **改 client.js 必须单点改、每步让用户在 UI 里验证**：`node --check` + stub factory **覆盖不到组件渲染**（`QuotaPanel` 是函数声明，stub 的 `jsx.jsx=()=>null` 不执行函数体）。曾因一次改 4 处导致整个面板从 UI 消失。
7. **装错 profile**：曾把插件装进 `profiles/web`，用户跑的是 `profiles/desktop`。「没找到」的真因是装错 profile。
8. **切协议不破坏 prompt cache**：cache 按 token 序列前缀命中，与 wire format 无关。实测切换前后加权命中 93.9% vs 94.5%，切换后第一条就 98.1%。

## 7. 常用命令

```bash
# 健康
curl -s http://127.0.0.1:8790/health
# 连通性 + 速度
curl -s "http://127.0.0.1:8790/connectivity?hours=12&bucket=15&force=1"
# 探针健康度
tail -5 D:/Toolbox/goat-gateway/logs/conn-probe.jsonl
# 进程
pwsh -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -like '*quota-http*' } | Select ProcessId,CommandLine"
```

## 8. 备份清单

`quota-http.mjs.bak-20261111-pre-{speed,week,resp-usage,decode,ttft,ttft2,ttft3}`
`client.js.bak-20261111-pre-{speed,week,probe-fade,decode}`
`loop-guard.mjs.bak-20261111-pre-responses` / `.bak-20261112-pre-ttft`
`cordis.patch.yml.bak-20261111-pre-responses` / `.bak-20261112-pre-chat-back`
`watchdog.ps1.bak-20261109-pre-quota` / `start-quota-http.vbs.bak-20261109-pre-log`

## 9. 已知数据结论

- **降速是真的**：decode 从十月初 180–197 掉到 11-11 的 80.6（-55%）。11-12 凌晨 23h 单小时回到 145.6。
- **探针中转延迟** p50 862ms / p90 1694ms / max 3693ms，100% 成功。
- **一周 decode**：均 96.9 / 峰 11-09 122.8 / 谷 11-11 85.1。
- 社区佐证：DeepSeek 官方 11-03 承认 V4.1 Flash「仍存在性能下降」；11-10 Workbuddy 同样「极度拥堵」。

## 10. 补记 2026-11-12 02:00（会话 `session-e411ee1c`）

### 10.1 §5 待办 #1 已完成

`quota-http.mjs` 已打 TTFT/TPOT 补丁（备份 `quota-http.mjs.bak-20261112-pre-ttft4`）：
- `readSpeedRows()` 的 `rows.push` 增加 `ttftMs: Number(e.ttftMs) || 0`
- `buildSpeed()` 里 `const fit = fitDecode(rows);` 之后建 `ttftList` / `tpotList`（`TPOT = (durMs-ttftMs)/(ct-1)`）与 `pct2()`
- 返回对象 `decodeRatio` 之后加 `ttftN / ttftP50 / ttftP90 / tpot / tpotP90 / tpotRatio`
- `client.js` 的 speed 行 `title` 里追加同口径文字（只改字符串，不动 jsx 结构）

实测（`/connectivity?hours=12&force=1`）：`ttftN=80, ttftP50=2550, ttftP90=4333, tpot=7.2, tpotP90=8.6, tpotRatio=1.4`。
交叉校验：同 84 条样本上逐条 TPOT p50=7.16 ms/tok（139.7 tok/s），最小二乘 msPerTok=7.11（140.6 tok/s），差 0.7%。

### 10.2 「输出反复中断 / 退化」的根因（已定位）

报错 `[ACP] stream error: the turn degenerated again after the continuation nudge` 来自
billion-context `retryEmptyTurn()`：`finish ∈ {stop,end_turn,stop_sequence}` 且无可见文本、无 tool_call
→ 注入一次 continuation nudge 重试；再犯即抛 in-band error（`#870`）。

上游实际返回的是 **reasoning-only**：gateway 日志里 BAD 行全部满足 `rt == ct - 1`（其余 1 token 是 EOS），
`content` 为空、`finish=stop`。01:42–01:56 共 21 次，其中 6 次致命；`pt` 全部落在 218k–267k 的 `h:dd8eec`。

时间线：`cordis.patch.yml` 01:41 把 `api:` 从 `openai-responses` 改回 `openai-completions`；
最后一次 `/provider/v1/responses` 在 17:41:39Z，第一次 BAD 在 17:42:01Z（间隔 22 秒）。
responses 期间 788 次请求 `reasoning_tokens` 恒为 0、0 次 degenerate。

排除项：`loop-guard.mjs` 与 `loop-guard.mjs.bak-20261112-pre-ttft` 的 diff **只新增 ttftMs 指标**，不碰转发路径，
不是它误杀（`mode: abort` 仍在，但该窗口内没有 abort 记录造成空 turn）。

复现/对照：把 `api:` 切回 `openai-responses` 建新会话，跑几轮后看 `logs/loop-guard.jsonl` 里
`reasoning_tokens` 是否回到 0、`bili.log` 是否还有 `degenerate terminal turn`。


### 10.3 本地 patch：退化不再致命（2026-11-12 02:25 生效）

文件：`C:\Users\27063\.dsh\profiles\desktop\node_modules\billion-context\dist\index.js`
备份：同目录 `index.js.bak-20261112-pre-degenerate-passthrough`

改动（唯一一处，`retryEmptyTurn()` 的第二次退化分支）：

```js
// 原：emitStreamError(res,protocol,"the turn degenerated again after the continuation nudge",...) ; return true
// 现：log2?.("... passing the empty turn through (local patch 2026-11-12, #4913 option A: no in-band error)"); return false
```

语义：`retryEmptyTurn` 返回 `false` 后，调用点
`if(turnTerminal!==void 0 && await retryEmptyTurn(turnTerminal)) continue;`
不再 `continue`，于是当前 finish chunk 正常写出 → 客户端收到一个**空但完整**的 turn，
不会再出现 `[ACP] stream error: the turn degenerated again after the continuation nudge`。
第一次退化仍照旧 nudge 重试一次（行为不变）。

**重启 bili proxy 的正确方法**（2026-11-12 实测；它没有计划任务、没有全局 `bili` CLI、
原父进程已退出，命令行是 `node dist/index.js start --host 127.0.0.1 --port 18787`）：

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like '*billion-context*dist\index.js start*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

Start-Process -FilePath 'C:\Users\27063\.dsh\storages\tools\run-hidden.exe' `
  -ArgumentList '"C:\Program Files\nodejs\node.exe" "C:\Users\27063\.dsh\profiles\desktop\node_modules\billion-context\dist\index.js" start --host 127.0.0.1 --port 18787' `
  -WorkingDirectory 'C:\Users\27063\.dsh\profiles\desktop\node_modules\billion-context' -WindowStyle Hidden
```

验证：`curl -s http://127.0.0.1:18787/__bili/status` 返 200，且 `bili.log` 出现新会话的 `[acp-usage]` 行。
回滚：把 `.bak` 覆盖回 `index.js`，再跑上面的重启两步。

**注意**：升级 npm 包（`bili update` / `npm i -g`）会覆盖该文件，patch 需重打。
