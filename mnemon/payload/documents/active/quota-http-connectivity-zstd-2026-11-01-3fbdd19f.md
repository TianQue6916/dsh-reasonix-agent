---
id: "3fbdd19f-ed63-4bca-bc23-5b23b022ac7d"
title: "quota-http 新增 /connectivity 失败率端点 + zstd 多帧解压静默截断陷阱（2026-11-01）"
description: "2026-11-01 给 goat-gateway 的 quota-http.mjs 加 GET /connectivity（扫 session.v4.jsonl.zstd 统计每小时失败率/retry/TTFT，带 mtime 缓存）并在 dsh-plugin-goat-panel 面板加「连通」色带行。含关键陷阱：Node/Python zstd 流式解压只解第一帧且不报错，必须按魔数 28 B5 2F FD 分帧；以及集成现状（待用户重启 quota-http）、性能数据、备份与回滚路径。"
status: "active"
created_at: "2026-11-01T08:18:51.029Z"
updated_at: "2026-11-01T08:18:51.029Z"
content_hash: "3a22c43fc390cbf1a4a7a40b44202cce6187a871723513dc96d7ebefa7a527a1"
source_paths:
  []
session_ids:
  - "12d7c111-6658-4a6b-99cc-a82394a32553"
memory_body_ids:
  []
---

# quota-http /connectivity 端点 + zstd 多帧解压陷阱

**性质**：已完成的实现 + 取证记录（代码已写入、语法校验通过、8792 测试实例实测跑通；收尾只差用户重启 8790 生产实例）。后端与 UI 两侧都已落地，属于交接型知识。

## 1. 做了什么

`D:/Toolbox/goat-gateway/quota-http.mjs` 新增 `GET /connectivity?days=7`（可选 `force=1` 强制重算）。它扫 `~/.dsh/sessions/*/*/session.v4.jsonl.zstd`，折叠出每小时的失败率、retry 数、中位耗时，**不发任何模型请求**，因此不消耗额度。

实测输出（8792 测试实例）：

```json
totals: { steps: 13717, failSteps: 447, rate: 3.3, retries: 1131,
          byCode: { SERVER: 840, TRANSPORT: 291 }, ttftP50: 4639 }
hours:  56 个桶，每桶 { h, n, fail, rate, retries, medMs, codes }
worst:  [{ 11-01 01时, 6.1%, n=602, retries=110 }, ...]
```

`D:/Toolbox/goat-gateway/dsh-plugin-goat-panel/lib/client.js` 在面板底部加一行「连通」，配一条 56 格色带（每格 1 小时，按失败率绿→黄→红分档，格高按请求量），hover 显示该小时明细，最差 5 小时写进 tooltip。数据源是 `http://127.0.0.1:8790/connectivity`（常量 `CONN_ENDPOINT`），由 `useConnectivity(open, 7, cacheTick)` 在面板打开时拉取。

## 2. 关键陷阱：zstd 多帧只解第一帧，且不报错

`~/.dsh/sessions/**/session.v4.jsonl.zstd` 是**多帧追加**的（每次 flush 一个独立 zstd 帧）。而两种「流式」写法都只解第一帧、静默返回：

```js
zlib.zstdDecompressSync(buf)              // 357606 字节 → 205 字节（无异常）
zlib.createZstdDecompress(); s.end(buf)   // 同样只出 205 字节
```

后果极隐蔽：99.9% 的事件静默消失，看起来就像"这个 session 没有 step 事件"，而不是报错。正确做法是**按帧魔数 `28 B5 2F FD` 切开逐段解压**——同一个 session 83 个帧全部解出，得 1.24 MB / 234 行，帧数与字节数都对得上（`frames ok: 83 bad: 0`）。

Python 侧同坑：`zstandard.stream_reader(f).read()` 一次调用也会提前返回，所以先前 Python 脚本给出的 `13534 steps` 偏少（Node 逐帧解为 13717）。**失败率结论不受影响**（3.2% vs 3.3%），但凡是"读全量 session 事件做统计"的脚本，计数类指标一律不可信，除非改成按帧解。

## 3. 性能与缓存设计

- 首扫 946 个文件：**7.98 s**；第二次请求：**1.1 ms**（http 200，`real 0m0.040s`）。
- 机制：文件级 mtime 缓存 + 60 s TTL + stale-while-revalidate（先返回旧值并标记 `warming`，后台重算）。命中缓存时响应里带 `stale`、`ageMs`、`computeMs` 供判读。
- 扫描时每 64 个文件让出一次 event loop，避免把同进程的 `/quota` 拖住。
- 面板侧 `useCache` 用 nonce 区分「打开面板（走服务端 TTL）」与「点 ⟳（`?force=1`）」：缓存命中率是按天粒度的量，没有理由每次打开都重扫日志。

## 4. 当前状态 / 待办

- 代码已改完、`node --check` 语法通过、插件 factory 可正常 `apply`/`inject`（`inject: ['slots']`）。
- **未生效的原因**：8790 上的旧 quota-http 进程杀不掉 —— 从 sandbox 里看 `Get-NetTCPConnection | OwningProcess` 恒为 `0 (Idle)`，`Stop-Process -Id 0` 无效。用户需在真实终端执行：
  ```powershell
  Get-NetTCPConnection -LocalPort 8790 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }
  cscript //nologo "D:\Toolbox\goat-gateway\start-quota-http.vbs"
  ```
- 若刷新后 UI 无变化，说明 client bundle 被缓存，再跑 `wscript "C:\Users\27063\.dsh\_restart-web.vbs"`。
- 备份：`quota-http.mjs.bak-20261101-pre-connectivity`、`client.js.bak-20261101-pre-connectivity`（回滚即复制回原名）。
- 悬而未决（用户未答）：早前装的 `dsh-llm-latency` 仍挂在 profile bundles 里且未生效，功能与本面板重叠——卸掉还是留着。

## 5. 相关基础设施（同一套 goat 三件套）

- `D:/Toolbox/goat-gateway/restart-all.ps1`：延迟重启 gateway(8788) / quota-http(8790) / dsh web(3080)。必须「延迟 + 脱离调用方管道」（`Start-Process` + `UseShellExecute`），因为发起重启的 agent 自身就跑在 dsh web 和 gateway 上，同步重启会打断 in-flight 请求。
- `D:/Toolbox/goat-gateway/start-quota-http.vbs`：无控制台窗口启动 quota-http。
- 端口约定：8788 gateway、8790 quota-http（生产）、8791/8792 临时测试实例。

## 6. 操作提示

`Get-NetTCPConnection` 在受限/沙箱上下文里返回 OwningProcess=0，据此做进程管理会失败；PowerShell 里 `Write-Host ($p + ' => ' + ...)` 这种字符串拼接也会因类型强制转换报 `Cannot convert value "=>" to type "System.Int32"`。排查端口占用时两条都要避开。
