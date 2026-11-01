---
id: "15cf275f-838c-466f-899f-8004e4827df7"
title: "goat-gateway /cache 三层缓存改造：TTL → SWR + single-flight + ETag（含社区经验对照与踩坑）"
description: "2026-10-29 goat-gateway /cache 缓存率端点的三层缓存改造记录：L1 文件级 + L2 结果 TTL(1h)、SWR 非阻塞过期、single-flight 合并并发、ETag 稳定 body 与 no-store 架空 ETag 的修复、execFileSync 阻塞 event loop 的移除；含实测数字、TTL/WARM 解耦教训与回滚点。"
status: "active"
created_at: "2026-10-29T05:58:29.851Z"
updated_at: "2026-10-29T05:58:29.851Z"
content_hash: "e48fa042c72d7f76b089e4f37b088e0b29524ee4dde1e7ad7f6c3cb5298c27c1"
source_paths:
  []
session_ids:
  - "82c83bfa-6d5d-48c7-aa9f-ee7eac69a0d7"
memory_body_ids:
  []
---

# goat-gateway `/cache` 三层缓存与 SWR 改造（2026-10-29）

**性质**：实施 + 归因记录。结论带实测数字；末尾列出**有意不按社区做**的取舍与回滚点。
**背景文档**：额度服务来历见 `878bd757-1e82-4db3-be40-956d74971f80`（Linux 版 quota 服务去 PowerShell 化）、`dbffeb3a-718b-436e-b8f1-e4b9850f4b53`（双机同版）；额度查询路径见 `fb4a6e22-1db0-406a-bd62-9d693e968f7a`；TTFT 基线见 `bad9c4a5-21ee-4a4c-94bf-1312f166299d`。

## 涉及文件（工作区外，D 盘）

- `D:\Toolbox\goat-gateway\quota-http.mjs` — HTTP 小服务本体（`/health` `/cache` `/quota` `/balance`）
- `D:\Toolbox\goat-gateway\dsh-plugin-goat-panel\lib\client.js` — 面板前端（client bundle，**不参与 HMR，改后需 `Ctrl+R`**）

## 为什么要做

`cacheReport` 要扫当天的会话日志算缓存率。原实现"文件没变就复用"，但**当天的日志文件一直在长** → 每次打开面板都整份重扫，成本随当日日志体积线性上升。这是 180ms 冷扫的来由。

## 最终形态：两层缓存 + 三个配套

| 层 | 机制 | 命中成本 |
|---|---|---|
| **L1 文件级** | 按 `(mtime, size)` 判变；没变的日志文件复用上次聚合 | 0 |
| **L2 结果级** | 结果缓存，key = `<from>|<detail>`，TTL 默认 **1h** | 直接返回上次 body |
| 预热 | 启动预热 + 每小时 `warmFileScan()`，只推进 L1（stat + 重扫变化文件），不组装结果 | — |

配套：
- `?force=1` 绕过 L2（面板 ⟳ 按钮走它）。语义是"绕过硬缓存"**而非**"不写缓存"——刚算出的数据照样写回。
- `GOAT_CACHE_TTL_MS`（默认 `3600000`）调 TTL；`GOAT_CACHE_WARM_MS` 调预热周期，**与 TTL 解耦**。
- 面板缓存行末尾显示数据生成时刻（如 `… 94.1% · 13:44`），命中 stale 时追加「（后台刷新中）」。

**1h 这个量级的理由**：缓存率不是瞬时量，由「会话长度 + 冷启动次数」主导，按天变化（实测前几天 92.9% → 97.0% → 95.6%）。1h 陈旧度对任何决策无影响；TTL 短到 5 分钟就等于回到频繁重扫。

## 社区经验查出的 5 个真问题（按解决顺序）

| 社区结论 | 触发的问题 | 处置 |
|---|---|---|
| **single-flight / request coalescing**（Go `singleflight`、MergeShip `single-flight.ts`、tower-resilience coalesce） | 面板注册在**两个** slot（`sidebar.footer.action` + `conversation.input.dock`），可能并发同 key 重算；`/quota` 每次 spawn powershell，并发更痛 | 加 `singleFlight(key, fn)`：leader 干活，其余 await 同一个 in-flight promise |
| **stale-while-revalidate**（RFC 5861 进程内版本） | 原 TTL 过期是**阻塞重算**，有缓存用户照样卡 | 过期同步返回旧 body（`stale:true`）+ `setImmediate` 后台重算 |
| **ETag 的 body 必须稳定**（bot-relay-mcp 的实测修正） | body 里 `ageMs`/`computeMs`/`cached`/`stale`/`ts` 每次都变 → 直接加 ETag 等于没有 304 | 算 ETag 前从 `stable` 副本里剔除这 5 个字段 |
| **polling 端点用 `private, max-age=0, must-revalidate` + ETag** | 原 CORS 头块里有 `Cache-Control: no-store`，而"已有就不覆盖"的逻辑让它赢了 → **`no-store` 下浏览器不保存 ETag，条件请求根本不发**，ETag 被架空 | 统一由 `sendJson` 发 `private, max-age=0, must-revalidate`；仅 `/health` 保留 `no-store` |
| **请求路径禁用 `*Sync` I/O** | `/quota` 用 `execFileSync` 跑 powershell，**300–800ms 内整个 event loop 阻塞**，`/cache`、`/health` 全排队 | 改 `execFile` + Promise；`/balance` 的 `appendFileSync` 也改异步 |

未采用：**TTL jitter**（防同步过期）——只有 1–2 个 key，没有批量同刻写入，同步过期无从发生。

## 两个"被自己的测试骗过"的教训

1. **TTL 与 WARM 绑死会让测试永远走不到 stale 分支**。第一轮令 `CACHE_WARM_MS = CACHE_TTL_MS`，把 TTL 调到 1.5s 时 warm 每 1.5s 也刷一次，`ageMs` 一直很小，看着像"TTL 生效"，其实 stale 路径从未执行。解耦后才验到 `stale=true ageMs=1962`。
2. **后台重算必须用 `setImmediate`，不能用 `Promise.then`**。后者是 microtask，仍在当前轮里，会挡住响应 flush，零等待就没了。

## 实测（每项都有数字）

| 场景 | 结果 |
|---|---|
| SWR 三态 | 首请求 `cached=false computeMs=3` → 过 TTL `cached=true stale=true ageMs=1962`，**耗时 1.65ms** → 约 0.8s 后 `stale=false` 且 `ts` 已更新 |
| single-flight（真并发） | 3 个 `/quota?force=1` 并发 **总 4.50s**；单个 **4.31s** → 只 spawn 一次 powershell（串行约 13s） |
| ETag + 304 | `/cache` 与 `/quota` 均返回 `W/"…"`，带 `If-None-Match` → **304，size=0** |
| 响应头 | `/cache`、`/quota`：`private, max-age=0, must-revalidate`；`/health`：`no-store` |
| 回归 | `/quota` 200；`/balance?format=text` 输出 `qq 5h 10% 周 90% 月 71%` |

排查期两次"假故障"——测试脚本用 `json.loads` 解析带尾随日志的响应体（`Extra data`）、写文件被外部占用（`FileNotFoundError`）——**都是验证脚本的问题，不是服务的问题**。看到这类报错先怀疑测试脚本。

## 一处有意不按社区做的取舍（已写进代码注释）

`cacheReport` 全程同步（`statSync` / `readFileSync` / 单遍正则）。社区标准是"请求路径别做同步 I/O"，但 **SWR 的 stale 分支必须同步拿到旧 body 才能立刻 `res.end()`**；整条链路 async 化就只能 `await` 之后返回，零等待消失。代价是冷扫阻塞 event loop 约 100–200ms；缓解靠三层（启动预热 / 每小时 warm / 结果 TTL），实际请求路径走到同步全扫的概率很低。这是知情选择，不是遗漏。

## 回滚点

```
quota-http.mjs.bak-20261029-pre-swr2   ← 本轮之前（有 TTL，无 SWR/ETag/single-flight）
quota-http.mjs.bak-20261029-pre-swr    ← 更早
quota-http.mjs.bak-20261029-pre-cache  ← 最初无 /cache 的版本
```
同名 stamp 的备份会**保留更早的原始版而非覆盖**，所以 stamp 重复不会毁掉历史版本。

## 待办 / 未决

- 本轮参考的都是 issue / commit / 文档级来源，未安装任何依赖；曾向用户提议把这些仓库（`goceleris/celeris`、`Coder-s-OG-s/MergeShip`、`Maxlumiere/bot-relay-mcp`、`francovp/cabros-bot` 等）补进 star ledger —— **涉及用户 GitHub 账号，等用户答复，未执行**。
- 面板那行改动需用户 `Ctrl+R` 才生效。
