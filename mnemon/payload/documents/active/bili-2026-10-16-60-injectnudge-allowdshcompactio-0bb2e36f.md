---
id: "0bb2e36f-ef0d-4ea1-b110-bc7f0e68eed8"
title: "bili 压缩策略定案（2026-10-16）：60% 阈值 + 关 injectNudge、allowDshCompaction 放行手动 /compact、plan-anchor skipIdentical 修复 prefix cache"
description: "2026-10-16 bili(acp-proxy 18787) 压缩策略收尾：cache 50× 价差下的压缩经济学与 60% 决策、/compact 仍失败的隐藏开关 allowDshCompaction、plan-anchor 每步删旧加新击穿 prefix cache 的根因与 skipIdentical 修法、kill bili 不自动重启的操作事实。承接 3912c06c / 784243df，修正前者的修法结论。"
status: "active"
created_at: "2026-10-16T08:51:51.469Z"
updated_at: "2026-10-16T08:51:51.469Z"
content_hash: "00ed6fc500a735bbe124686f6fc507b07139789e7ec8cd620faa84b3d1ad2204"
source_paths:
  - ".agent-presets/anchored-standard/plan-anchor.mjs"
  - ".config/billion-context/billion-context.json"
session_ids:
  - "4eb6edbc-3a6f-4b42-a72b-7a86bf2d8081"
memory_body_ids:
  []
---

# bili 压缩策略定案（2026-10-16）

承接并**修正**既有文档：`3912c06c-b67c-42a0-bf41-3b3ad3142d42`（「Compaction could not produce a useful summary」根因，其 `auto: false` 修法被本日实测证伪为不充分）、`784243df-dd9c-413a-b220-7a5c3a5bd207`（2026-10-13 cache-report 归因）。

## 1. 压缩的经济学：为什么「压得早」是纯亏损

同机价格（面板口径，`models.dev` 刊登价，provider commandcode-goat · deepseek/deepseek-v4.1-flash）：

| | ¥/百万 token |
|---|---|
| 缓存输入 hit | **0.02** |
| 未缓存输入 miss | **1.01** |

差 **50×**；gateway `LOCAL_PRICES` 同比例（`hit: 0.0030285` vs `miss: 0.151425`）。

300k 上下文算账：不压 = 300k × ¥0.02/M ≈ **¥0.006**；压掉 200k 后剩 100k（cache 被打断，余下全部按 miss 计）≈ 100k × ¥1.01/M ≈ **¥0.101** ⇒ **压一次反而多花约 ¥0.1，是「不压」的约 16 倍**。⇒ 压缩只在「不压就超窗」时才有正收益。

bili 自带 `FOLD ECONOMICS` 的 `n*` = 回本所需轮数，也印证这点：

```
#5  17:17:09  h=4.7%  T=40.6K  n*=140.94  → NOT PAID BACK
#9  20:54:13  h=40.3% T=31.1K  n*=146.13  → PAID BACK
#21 21:32:03  h=32.2% T=49.3K  n*=1062.75 → PAID BACK
```

`n*=140` 表示要再跑 140 轮才追平，`n*=1062` 就是 1062 轮（本机每轮间隔数分钟 ⇒ 数十小时）。**325 次 fold 里绝大多数在经济上亏损**，因为 bili 把「省下多少 token」计入收益、却未把「打破 cache 的 50× 价差」计入成本。

社区做法：bili 官方默认 `maxContextLimit: "75%"`（压得越晚越好，只求不超窗）；`Agent-Harness-Develop-Book` 两级压缩同为保守优先（先剪工具结果中间段 `thresholdChars: 8192, headChars: 4096, tailChars: 1024`，再动会话）。**未检索到任何推荐 30% 的资料 ⇒ 30% 是反社区的，会让 cache 更差。**

## 2. 用户拍板的最终 compress 配置（2026-10-16）

用户原话「那就六十吧,还行」（checkpoint 34284）。写入 `C:\Users\27063\.config\billion-context\billion-context.json`：

```json
"compress": {
  "nudgeGrowthTokens": 150000,      // 原 50000
  "preserveRecentTokens": 20000,    // 原 ≈5000
  "preserveRecentMessages": 10,     // 原 3
  "injectNudge": false,             // 新增：关掉增量折叠（degenerate-fold / 96%→44% 断崖的元凶）
  "maxContextLimit": "60%"          // 新增：兜底线
}
```

运行态验证：`curl http://127.0.0.1:18787/__bili/config`（bili pid=16788, version 0.1.197, stale False）返回即上述值。预期：增量折叠（325 次/1867 轮，约每 5.7 轮一次）停用；只在到 60% 窗口时压一次；`/compact` 仍可手动用。代价：上下文比以前更大。

## 3. `/compact` 仍失败的真正开关：`allowDshCompaction`

**`auto: false` 只关自动触发，治不了手动 `/compact`** —— 用户点的是命令，不走自动触发路径。bili 日志（`~/.local/state/billion-context/bili.log`）在用户点击的同一分钟（UTC 与北京 +8 对齐，`08:45:11Z` = 16:45:11）出现：

```
[passthrough] dsh native compaction call identified on the unattributed passthrough lane
(#1117/#2709) — REFUSED, not forwarded: bili owns compression on this lane; a landed dsh
checkpoint would durably shadow the raw history (#1729, cf. #1772/#1206)

[dsh-client] bili-native-dsh: model request sent DIRECT (uncompressed) — takeover gate
refused … no active initiator attribution
```

链路：`/compact` 调 LLM 生成摘要 → 请求落在 bili 眼里的「无归属直通 lane」→ takeover gate 拒接 → 直连未压缩 → 70ms 后 bili 认出是 dsh native compaction → REFUSED → dsh 拿不到摘要 → 报 `Compaction could not produce a useful summary`。

**修法（用户选 A）**：`billion-context.json` 顶层加

```json
"dsh": { "allowDshCompaction": true }
```

验证 `false/null` → `{"enabled": true, "source": "file"}`（`source: file` 证明取自配置文件）。风险：bili 警告 dsh checkpoint 会永久遮蔽原始历史（#1729）——手动压缩语境下符合预期；已关 bili 自动折叠，两条路不会同时跑。备选：改用 bili 自己的压缩入口 / web UI `http://127.0.0.1:18787/__bili/`。

## 4. plan-anchor 每步击穿 prefix cache（根因与修法）

文件 `C:\Users\27063\.dsh\.agent-presets\anchored-standard\plan-anchor.mjs`（203 行 / 10200 B）。

**最初诊断（易变字段 `bytes=`/`sha256=` 污染前缀）是错的**：这些字段是有意设计（`:98-101` 注释——sha256 是**全文**摘要，配合 `truncated` 让模型判断手上这份是否权威），且注入追加在尾部，不击穿前缀。

**真因在 `apply()`**：先 `const kept = cfg.pruneHistory === false ? messages : messages.filter((m) => !isOwnMessage(m))` 删掉历史里上一条自己的消息（**位于历史中间**），再在尾部追加新消息 ⇒ 删除点之后的消息序列整体错位 ⇒ prefix cache 自该处起全部失效，**每步一次**，250 步 = 250 次，而 PLAN.md 多数步一字未变。正对应 cache-report 的 `BODY STABILITY: 338 pair(s): 0 byte-identical · 338 diverged · divergence class: mid-history 338`（338 > 325 次 fold，多出的就是它）。

**补丁**（`:181` 起，delta=1124 B，`node --check` SYNTAX OK）：在 `const payload = render(text, cfg)` 之后加 `skipIdentical` 守卫，仅当历史里存在**逐字节相同**的副本时 `return decision` 一条都不动；比较必须用全文逐字节，禁止 `mtimeMs`/`size`（`:80` 注释记录过 thinking-anchor 的同字节数误判事故）；任何异常 `catch` 后走原路（fail-open，绝不因优化漏注入）。不清空历史，无逐字节副本 ⇒ 照旧重投。

回滚：备份 `.bak-<stamp>-pre-skip-identical` 覆盖，或运行时 `skipIdentical: false`。**生效条件**：`.agent-presets/**` 下 mjs 不参与 HMR，必须重启 dsh 进程；生效后可观测 `stats.skipped` 开始计数。

## 5. 操作事实（已三次验证）

- **kill bili 之后必须自己确认它活着**：3 次 kill 中只有第 1 次由 dsh 自动拉起（4 秒），后两次 `not auto-relaunched -> starting manually`。「dsh 会自动拉起 bili」不是保证；bili 是 dsh 与上游之间的 proxy，它不在就全断流。手动拉起（PowerShell）：
  `Start-Process node.exe -ArgumentList @('<...>\billion-context\dist\index.js','start','--host','127.0.0.1','--port','18787') -WindowStyle Hidden -WorkingDirectory '<...>\node_modules\billion-context'`
- desktop dump 行 874-878 确认 `compaction-basic` 为 `disabled: true` + `config.auto: false`（保住手动 `/compact`）。
- 本轮同时完成的无关项：goat-gateway dead key `deepseek-official` 已禁用（细节见 `~/.dsh/PLAN.md`）。

## 6. 未完成

`plan-anchor` 的 `skipIdentical` 补丁**待重启 dsh 生效**；`thinking-anchor`（每步 +44 token）与 `git-context`（每步 +85 token）疑似同样「删旧加新」模式，已提议同法排查（合计每步 129 token，同样在击穿前缀），尚未执行。
