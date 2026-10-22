---
id: mem-2fe43a2c14f79a6e6f9814acbf2f2201
revision: 1
created_at: "2026-10-16T03:42:23.719Z"
updated_at: "2026-10-16T03:42:23.719Z"
name: cache-hit-degradation-attribution-20261016
description: "billion-context / dsh cache hit 退化的权威归因（cache-report + degenerate-fold），以及「不是插件在不断压缩」的证据"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 症状
用户 2026-10-13 报「因为有很多压缩的动作，导致缓存很低」。cache hit 实测（gateway 日志 aggregate / median / p10）从 10-03 的 `90.28% / 95.87% / 48.50%` 退化到 10-13 的 `81.61% / 90.71% / 15.85%`；10-13 当天 242 次请求里 47 次 hit<50%。

## ★ 权威归因（不是「插件在不断压缩」）
bili 自带 `GET http://127.0.0.1:18787/__bili/cache-report`（社区文档 README.zh-CN.md:267 的归因工具，GRAND LEDGER 给 `HEALTHY` 或异常判定）实测：
- session-d60ed9f2（109 requests）：`total input 5.92M / cached 4.85M (hit 82.0%)`，miss 拆解 `new content 440.5K (41%)` + `compress re-pay 51.3K (4.8%)` + `upstream-ttl-or-client-rewrite 576.2K (54%)`，identity check residual 0
- session-a0d5fbf8（1823 requests）：`restart/refork 537.1K (15)` + `model switch 37.3K (8)` + `88% unattributed provider-side`
⇒ **`compress re-pay` 只占 4.8%（社区基线「压缩本身只吃掉 ≤2%」，同一量级）**；bili 的 `nudge idle: usage=5% (46008/868928)` 远低于 `emergencyThresholdPercent: 95%` ⇒ 紧急截断从未触发；`dsh-headroom` CCR store `~/.dsh/storages/dsh-headroom-ccr.json` 13 天只有 `entries: 12`。**「不断压缩」的直觉不成立。**

## ★ 两条有逐字证据的可修元凶
1. **会话内切模型**：cache-report MODEL SWITCHES 段 `#100 20:44:13 deepseek/deepseek-v4.1-flash → deepseek-v4-flash · hit 37.6%` / `#104 20:44:39 切回 · hit 96.7%` / `#117 20:53:10 · 30.2%` / `#131 21:08:14 · 96.0%` ⇒ **每次切到 `deepseek-v4-flash` 那一轮 hit 掉到 30–42%，切回立刻回 94–97%**。切模型/换上游还会**开新 session 代次、refs 重置**（bili.log `2026-10-04T02:32:56.923Z … compress FAILED … every ref is unknown to this session … switching model or upstream mid-conversation starts a fresh session whose refs restart at m00001`）。
2. **fold 后断崖**：`13:32:59.878Z [acp-proxy: compress requested 2 range(s): m10471–m10482, m10487–m10558]` → `13:33:00.094Z tool compress executed (outcome=applied)` → `13:33:50.796Z [acp-usage] input=137768 cached=61056 (cache hit 44%) fold=new`，相邻轮次是 95%/96%/97%。

## ★★ 更深一层：`degenerate-fold`（压缩过头，anchor 被压到 ~2K）
bili.log 里 13 天共 **8 次** `[warn: degenerate-fold]`（10-06×3、10-07×1、10-10×1、10-11×1、10-13×2），逐字如：
```
[acp-compress-obs] covers 94% of the live context (~85703/91490 tok) leaving 1 active block(s), anchor≈2295 tok
  — the whole prefix rewrites and the prefix cache restarts from scratch on the next request
covers 89% of the live context (~52362/59106 tok) leaving 2 active block(s), anchor≈1654 tok
covers 91% of the live context (~53953/59515 tok) leaving 3 active block(s), anchor≈1576 tok
```
⇒ **一次 fold 覆盖 89–94% 上下文、只剩 1–4 个 active block、anchor 仅 1546–2295 tok ⇒ 整个 prefix 重写、下次请求缓存从零开始。** 另有 `[cache-seam] suspected mid-history prefix break: hit 8.1% (input=50427, unexplained=46331 tok, no fold/switch/restart attribution); first divergence at byte 14011, message[?] of 118→38`（**118 条消息被砍到 38 条**）。
⇒ **「很多压缩动作」的真身就是这里的 degenerate fold，而不是 headroom / dsh 原生 compaction。**

## 配置位置与默认值
- bili 全走默认值：`C:/Users/27063/.config/billion-context/billion-context.json` **只有 25 B**，全文 `{\n  "providers": {\n  }\n}`
- 关键默认：`dsh.allowDshCompaction` **false**（拦住 dsh 原生 compaction，逐字「其 checkpoint 会永久覆盖原始历史，属显式的不可逆 opt-in」）/ `compress.reasoning {drop:true, threshold:2048}` / `compress.emergencyThresholdPercent "95%"` / `compress.nudgeGrowthTokens` ≈ **50K** / `stableSystemAnchor` false（且**仅纯代理模式生效；dsh plugin 模式自管上下文、永不被锚定**，逐字 CONFIGURATION.zh-CN.md:676）
- env 覆盖键：`BILI_CONFIG_FILE` / `BILI_ALLOW_DSH_COMPACTION` / `BILI_STABLE_SYSTEM_ANCHOR` 等
- dsh 侧 `~/.dsh/.agent-presets/anchored-standard/agent.cordis.yml:367-386` 的 `compaction` group 里 `compaction-basic` / `command-compact` / `tool-result-pruner`（`thresholdChars: 8192, headChars: 4096, tailChars: 1024`）。`dsh-compaction-tool-result-pruner/lib/index.js:136 pruneSession()` 用 `surfaceOp: {op:"replace"}` 改写 session surface（write-time 持久化替换，不是 render 投影）⇒ 每次裁剪都把历史中间节点换掉。

## 待落地的优化（用户 2026-10-16 授权「持续推进」）
T1 会话内永不切模型 / T2 降低 ACP compress 频率（只在 >60% 窗口压，避免 degenerate fold）/ T3 放宽 `tool-result-pruner` 8192→32768 或删行 / T4 关 `dsh-headroom` / T5 查 restart/refork 来源（**已有答案：见上面 degenerate-fold**）。

## 相关：bili 版本漂移（每次 warn 重启才生效）
`~/.local/state/billion-context/bili.log` 里反复出现 `[update] running v0.1.193 but v0.1.195/196 is installed — restart bili to activate (auto-update replaced the on-disk install; this process is still on the old code)`。2026-10-16 03:05 进程已到 **v0.1.196**，而 03:14 又 warn「running v0.1.196 but v0.1.197 is installed」。⇒ auto-update 会换磁盘包但进程不重启，**升级后必须重启 bili 才生效**。

截至 2026-10-16。
