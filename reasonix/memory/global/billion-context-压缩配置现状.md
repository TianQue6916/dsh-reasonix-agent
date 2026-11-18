---
id: mem-93f47c582ccf5d6f1f73f330e89c58c3
revision: 1
created_at: "2026-11-18T14:00:33.779Z"
updated_at: "2026-11-18T14:00:33.779Z"
name: billion-context-压缩配置现状
description: "billion-context 0.1.214 的 compress 配置现值、窗口解析实测、以及 2026-11-18 的三处改动与理由"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 硬件/环境坐标（实测，非文档推断）

- 配置文件：`C:\Users\27063\.config\billion-context\billion-context.json`（覆盖层，字段级回退到内核默认）
- 管理面：`GET http://127.0.0.1:18787/__bili/config`、`POST /__bili/config/reload`（热生效，无需重启）
- 包装位置：`~/.dsh/profiles/web/node_modules/billion-context`（同时有 profiles/desktop 一份）
- 会话库：`~/.local/share/billion-context/sessions/index.db`（sqlite，1.28 GB，759 sessions / 207091 messages / 713 blocks）
- 日志：`~/.local/state/billion-context/bili.log`（约 2 天覆盖，archive 空）

## 窗口解析（关键，决定所有百分比的分母）

`[window] model=deepseek/deepseek-v4.1-flash source=plugin native=1000000 base=1000000 fallback=false`

但 nudge 日志里 usage 分母是 **868928**（不是 1000000）。所以：
- `maxContextLimit: "60%"` → 约 521,357 token 才触发强制压缩
- `emergencyThresholdPercent: "90%"` → 约 782,035
- `nudgeGrowthTokens: 520000` 的 floor = 520000 × 0.45 = **234,000**

## 实际使用分布（决定配置是否值得调）

session contextTokens 分布：p90 = 234,171；≥200K 有 114 个；≥520K 只有 **6** 个（759 中）。
⇒ 这套配置在 90% 的会话里**从不触发压缩**，只在长任务里起作用。

## 2026-11-18 的三处改动（有备份，可回滚）

备份：`billion-context.json.bak-20261118-2200-pre-fold-quality`

1. `compress.preserveRecentTokens`: 20000 → **80000**
   理由：折叠点约 52 万 token，保 2 万 = 折掉 96%，一次只剩摘要；保 8 万保留最近的完整细节。成本约 80K × cache-hit 单价/请求，可忽略。
2. `compress.preserveRecentTools`: 新增 **["read"]**
   理由：`neverPreserveRecentTools` 留空 = 内核默认含 `read`/`bash`，刚读的文件立即可折。上游文档 #1198/#1277 明确点名这条"折叠→重读"死循环，官方推荐解法就是 `preserveRecentTools: ["read"]`（不要用 `neverPreserveRecentTools` 逐字替换，会冻结一份会过时的列表）。
3. `compress.minSummaryLength`: 未设(=50) → **300**
   理由：50 字符约等于 25 个汉字，对一次折 52 万 token 的段落等于没摘要。

## 刻意没动的（理由）

- `nudgeGrowthTokens: 520000` / `tierGrowthTokens.t1: 520000` / `maxContextLimit: "60%"` —— 三者自洽，都指向"用掉半个 1M 窗口才折"，与 1M 原生窗口 + DeepSeek 廉价 prefix cache 匹配。
- `preserveRecentMessages: 10` —— 已是内核默认。
- `protectedTools` —— 留空合理；保护是硬排除、全历史累积，他的 read/bash 是高频大流量工具，保护会让上下文无界增长。
- `storage.jsonWriter: "off"` —— 已迁到 sqlite unified。

## 已知的真实故障（不是配置引起）

`[warn: degenerate-fold] covers 84% of the live context (~166421/198692 tok) leaving 2 active block(s) ... the whole prefix rewrites and the prefix cache restarts from scratch`
根因：`[persist] cold-loaded view is ~1306 min old ... expect preflight pressure to catch up sharply` —— 隔夜冷恢复时 fold 状态陈旧，preflight 追赶式折叠。属恢复一致性问题，不是 nudge 参数问题。

## 本会话 cache 健康度（改动前基线）

`acp_cache`：6 requests，hit 80.8%，miss 43.8K 中 43.5K 是 new content（正常），compress re-pay = 0，unattributed 仅 286 tok。
