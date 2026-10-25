---
id: "784243df-dd9c-413a-b220-7a5c3a5bd207"
title: "bili/billion-context 前缀缓存命中率归因（2026-10-13）：cache-report 取证、会话内切模型与 ACP compress 双元凶、T1–T5 方案待拍板"
description: "2026-10-13 排查本机 bili(acp-proxy 18787) 缓存命中偏低的归因调查：/__bili/cache-report 的 miss breakdown 与 GRAND LEDGER 逐字数字、压缩仅占 4.8% 的更正、会话内切模型(37.3K/8 次)与 ACP fold 后掉到 44% 的活体证据、tool-result-pruner 三重改写叠加分析、社区经验三条硬原则、T1–T5 方案对比与推荐（等用户拍板，未执行）。"
status: "active"
created_at: "2026-10-13T13:51:42.008Z"
updated_at: "2026-10-13T13:51:42.008Z"
content_hash: "27a362940adebdc6fc08c1cb028419f87dfd71cc1f1663c4708138a7084139aa"
source_paths:
  - ".config/billion-context/billion-context.json"
  - ".local/share/billion-context"
session_ids:
  - "dc43106f-fc83-471e-a9e2-0f91337308d2"
memory_body_ids:
  []
---

# bili / billion-context 前缀缓存命中率归因调查

**触发**：用户 m00001 逐字「根据社区经验优化」（未附带其他约束）。
**日期**：2026-10-13（会话内时间戳跨度 10-04 ~ 10-13）。
**本机事实**：acp-proxy 监听 `http://127.0.0.1:18787`（v0.1.193，lane `dsh`，MITM 白名单开）；日志里出现过 `v0.1.178/0.1.191/0.1.192/0.1.193`。
**状态**：调查完成，方案已提交，**等用户拍板后才落地**（未执行任何配置改动）。

## 1. 权威归因工具（社区推荐）

- `GET http://127.0.0.1:18787/__bili/cache-report` → **200 / 566751 B / `reports: list[128]`**（128 个 session 的逐 session 报告）。
- 反面教训：先按猜测打了 `8787` 上的 `/__bili/cache-report` 与 `/__bili/stats`，都返回 `http=000 bytes=0`（端口错，白打）。**本机 bili 端口是 18787，不是 8787。**
- 另有 web UI `http://127.0.0.1:18787/__bili/`；零配置用法是给任意 baseURL 前缀 `http://127.0.0.1:18787/bili/`。

## 2. 核心结论一：压缩不是主因（推翻上一轮判断）

父 agent 上一轮判「压缩是主因」，被 cache-report 逐字数据推翻并当场更正。

`session-d60ed9f2`（109 requests）的 GRAND LEDGER 逐字：

```
total input    5.92M tok
total cached   4.85M tok  (hit 82.0%)
total output   157.0K tok
miss breakdown (input − cached = 1.07M tok):
  new content     440.5K tok  (fresh append — not an invalidation)
  compress re-pay 51.3K tok  (caused by folds)
  upstream-ttl-or-client-rewrite (unattributed)  576.2K tok
    （stable-prefix misses: upstream TTL expiry / eviction 或 client-side wire rewrite —
      kernel 无法区分）
identity check   OK — 5.92M = 4.85M + 440.5K + 51.3K + 576.2K (residual 0)
```

⇒ **compress re-pay 仅 51.3K / 1.07M ≈ 4.8%**；总有约 54% 落在 provider 侧 TTL/eviction，本地无法修。

FOLD ECONOMICS（同 session，15 folds @ w=0.13 r=0.006 q=0.52）：gross saved 13.10M tok · repay cost 51.3K · summary cost 8750 → **净 +13.04M tok**；verdict `14 paid back, 1 not paid back, 0 unobserved`。**折叠整体是赚的。**

两条侧证：
- `nudge idle: usage=5% (46008/868928)` / `usage=4%` / `usage=15% (145963/977489)` ⇒ 远低于 `emergencyThresholdPercent: 95%`，**bili 的紧急截断从未触发过**。
- `dsh-headroom` 的 CCR store `entries: len=12` ⇒ 13 天一共折叠 12 次，谈不上「不断压缩」。

## 3. 核心结论二：两个真正可本地修的元凶

主 session `a0d5fbf8`（1823 requests）的 stable-prefix 再计费归因：

```
stable-prefix re-bill by cause: 648.9K tok charged · 4.66M tok unattributed
  restart/refork:  537.1K (15)   ← 最大的「可归因」项
  model switch:     37.3K (8)
  wire switch:      37.3K (8)
  upstream switch:  37.3K (8)
  key switch / prompt rewrite: 0
⚠ 88% of your stable-prefix re-bill is unnameable provider-side behavior
```

### ① 会话内切模型 —— 每次切走必然击穿前缀

```
#100 20:44:13  deepseek/deepseek-v4.1-flash → deepseek-v4-flash · hit 37.6%
#104 20:44:39  deepseek-v4-flash → deepseek/deepseek-v4.1-flash · hit 96.7%
#117 20:53:10  v4.1-flash → v4-flash · hit 30.2% · attributed 12.4K
#131 21:08:14  v4-flash → v4.1-flash · hit 96.0%
```

⇒ 切走那轮 30–42%，切回立即 94–97%。汇总行 `MODEL SWITCHES 8 switch(es) · 37.3K tok re-billed`。

### ② ACP compress 那一下确实断崖（但次数少）

```
13:32:59.878Z [acp-proxy: compress requested 2 range(s): m10471–m10482, m10487–m10558]
13:33:00.094Z [plugin] tool compress executed via plugin (outcome=applied)
13:33:50.796Z [acp-usage] input=137768 cached=61056 (cache hit 44%) fold=new
```

同一 session 相邻正常轮：`13:32:01 (95%)`、`13:32:59 (96%)` ⇒ **fold 后掉到 44%**。

另有一个历史 ACP 失败样例可作对照：`compress FAILED m00206–m00265 → 0 blocks ... endId="m00265" does not exist in this session`——ref 是按 session 快照分配的，切模型/上游会开新 session 使 refs 从 m00001 重来，**旧 ref 在新 session 无效**。

### 最差 hit 的 line items（节选，`hit%` 列）

```
1480 21:54:20  15.6K  0      0.0   0      0  15.6K
1481 21:54:53  26.5K  2048   7.7   10.9K  0  13.5K
1482 21:55:58  32.0K  0      0.0   5525   0  26.5K
1552 00:15:58  82.2K  14.3K 17.4   6673   0  61.2K
1593 11:10:31 123.3K  14.3K 11.6   5477   0 103.4K
1810 21:28:32 156.0K  2048   1.3   6770   0 147.2K
   2 17:01:41  12.7K  2048  16.1   4499   0   6176
  22 17:07:25  84.5K   256   0.3   5276   0  78.9K
  59 17:17:27  87.7K  4096   4.7      0  40.6K 43.0K   #5
```

## 4. 社区经验三条硬原则（`billion-context/README.zh-CN.md` 逐字）

> **缓存健康速览**：健康会话的前缀缓存命中率在 **95–97%** 左右——压缩本身代价 ≤2%。
> **压缩什么时候发生？** 由模型驱动：注入的上下文工具由模型在上下文增长时自行调用，温和的增长 nudge（按设计固定约 **50K token 步长**）沿途提醒它。
> `dsh 自动压缩关(web profile 除外……可经 profile 层完整快照覆盖 preset-standard 关掉,#1772/#2474)`

本机配置现状：`C:/Users/27063/.config/billion-context/billion-context.json` 只有 **25 B 空壳** `{"providers": {}}` ⇒ 一切走默认值，无任何本地调参。

bili 自身的配置解析（从 bundle 反查）：
- `configDir() = path.join(xdg("XDG_CONFIG_HOME", ".config"), "billion-context")`
- `configFile()` 优先 `env.BILI_CONFIG_FILE`，否则 `<configDir>/billion-context.json`
- `dataDir() = xdg("XDG_DATA_HOME", ".local/share")/billion-context` → 实测存在，含 `ca/` 与 `sessions/`
- `allowDshCompactionState(env)`：`BILI_ALLOW_DSH_COMPACTION !== "0"` 时启用（env 优先），否则读 config `dsh.allowDshCompaction === true`
- 未设 MITM 域名的客户端走盲隧道，**bili 看不到也压不了它的请求**；要压缩需把模型域名加进 `mitm.domains`（或 `BILI_MITM_DOMAINS`）并信任 bili root CA

## 5. dsh 侧发现：`tool-result-pruner` 也在改写 session surface

源码事实（`pruner/lib/index.js`，`/pruner` 包，2026-09-30 构建）：
- `DEFAULTS = deepFreeze({ thresholdChars: 8192, headChars: 4096, tailChars: 1024 })`
- `PRUNE_MARKER = "\n\n[... tool result middle pruned ...]\n\n"`
- `class ToolResultPruner extends Service`，`static inject = ["tokenMeter"]`
- `pruneSession(session)`（约 index.js:151 调 `pruneContent`）：遍历 `session.surface.nodes` 找 `tool/result`，超预算就 `session.append("compaction/prune", {...})` 再以 `surfaceOp: { op: "replace", startSeq: seq, endSeq: seq }` 追加替换事件
- 配置校验只允许 `thresholdChars / headChars / tailChars`；`headChars + marker + tailChars` 必须 ≤ `thresholdChars`

⇒ 它**改写 session surface 中间**，每次都会击穿一次前缀；本机 bili 与 `dsh-headroom` 也各自在压工具结果，属**三重叠加**。

## 6. 方案表（父 agent 已提交，等用户拍板）

| # | 动作 | 预期收益 | 代价/风险 | 回滚 |
|---|---|---|---|---|
| T1 | **会话内永不切模型**（行为纪律，零配置） | 消除 37.3K + 8 次 30–42% 断崖 | 无 | — |
| T2 | **大幅降低 ACP compress 频率**（只在 >60% 窗口时压，不再「顺手压」） | 每次 fold 少一次断崖 | 自身 context 更满，成本略升 | — |
| T3 | 放宽 `tool-result-pruner`：`thresholdChars` 8192 → **32768**（或整行删掉） | 去掉一层 surface 改写 | 工具结果进历史更完整 ⇒ 单轮 prompt 变大（由 bili 兜） | 改回 8192 |
| T4 | 关掉 `dsh-headroom`（从 `bundles` 移除） | 少一层改写（12 次/13 天，收益有限） | 失去 `headroom_retrieve` 可逆取回 | 加回 bundle |
| T5 | 查 `restart/refork 537.1K (15)` 的来源 | 它是**最大可归因项**，值得先诊断 | 纯调研 | — |

**推荐**：先做 T1+T2（零风险、立刻生效），同时做 T5 诊断；T3/T4 等拍板。理由是 T3/T4 都要重启 App 才生效，而 T1/T2 是行为层的，能用 `cache-report` 直接对比验证。

## 7. 可复用要点

- 归因**必须用 `/__bili/cache-report`**，别靠猜插件行为；同 session 的 `identity check` 恒等式可验证数据自洽（residual 0）。
- 命中率低 ≠ 本地有 bug：先看 `unattributed` 占比，本机高达 88%，改本地配置的天花板很低。
- `compress re-pay` 与 `FOLD ECONOMICS` 要一起看——单次 fold 会断崖（44%），但累计净收益仍是大正数（+13.04M tok）。
- 会话内切模型是纯亏操作：切走那轮必掉到 ~30–40%，且伴随 refs 重编号（旧 `mNNNNN` 失效）。
