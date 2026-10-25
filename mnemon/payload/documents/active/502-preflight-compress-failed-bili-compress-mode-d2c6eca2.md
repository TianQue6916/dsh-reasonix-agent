---
id: "d2c6eca2-14b2-45ce-ab0a-f2bd65862422"
title: "会话 502 preflight_compress_failed 真根因：bili `compress.modelContextLimit` 是预检硬墙（2026-10-22 修复与验证）"
description: "2026-10-22 会话 502 preflight_compress_failed 的真根因：bili `compress.modelContextLimit` 是预检压缩硬墙（生效窗口 = 值 × 0.75，200000→150000；不设时回落 native 1M），config 为启动快照须重启 bili；压缩需带全历史 summary 请求又被同一堵墙拦住形成死锁。含修复步骤（删配置 + taskkill 由 supervisor 重拉 pid 7216）、`/__bili/sessions` 的 contextWindow 验证数据、教训 4 条、自动压缩 A/B/C 待拍板；附同会话 reasonix 记忆系统检索短板审查（子串匹配多词归零、3072 维 embedding 闲置、oplog 99.8% import-skip、USER.md 80%、description 三元铺词规范、建议 C→B→A）。修正 3912c06c / 0bb2e36f 的归因。"
status: "active"
created_at: "2026-10-22T14:37:39.587Z"
updated_at: "2026-10-22T14:37:39.587Z"
content_hash: "e199410ca7636507c825543603d64eb6cd4209dc26e9293147c5b3b53cd94373"
source_paths:
  - ".config/billion-context/billion-context.json"
  - ".reasonix/memory/global/元规则-02-自动记忆规则.md"
  - ".dsh/PLAN.md"
session_ids:
  - "8e1354f7-fe10-43ec-a239-44184d0ee7cc"
memory_body_ids:
  []
---

# 会话 502 preflight_compress_failed 真根因与修复（2026-10-22）

承接并**修正**既有结论：[「Compaction could not produce a useful summary」根因](3912c06c-b67c-42a0-bf41-3b3ad3142d42) 与 [bili 压缩策略定案](0bb2e36f-ef0d-4ea1-b110-bc7f0e68eed8) 把 `/compact` 失败主要归因于 `allowDshCompaction`；本次实证显示还有更上游的一堵墙：`compress.modelContextLimit`。

## 1. 现场

| 项 | 值 |
|---|---|
| 症状 | 旧会话（a0d5fbf8）每条消息都 502 `preflight_compress_failed`；`/compact` 报 `Compaction could not produce a useful summary` |
| 导出包体检 | `session.v4.jsonl` 35355 行 / 153 MB，JSON 解析失败 **0 行**，`testzip` 干净 ⇒ 会话本体（subject）没坏，坏的是 request 通道 |
| bili 版本 | 0.1.204，监听 `127.0.0.1:18787` |
| `/__bili/sessions` | 10-22 全部 session `contextWindow: 150000`；10-16 = 967232；10-17 = 868928 |

## 2. 根因链

1. `~/.config/billion-context/billion-context.json` 的 `compress.modelContextLimit` 被设成 **150000**（后来 200000）。它是**预检压缩的硬墙**，不是截断上限：只要 `context >= 硬墙` 就每轮触发 preflight fold。
2. `compress` 段是 bili **启动时快照**，改 json 不热生效 ⇒ 实测生效窗口 = `modelContextLimit × (1 − 25% output headroom)`：200000 → **150000**（与运行态完全吻合）；不设该值时回落 native 1M：`maxTokens 32768 → 967232`、`maxTokens 131072 → 868928`。native 一直是 registry 的 1M。
3. 旧会话上下文 ~271k > 150k 墙 ⇒ 每轮都试 fold；但 fold 的 raw 折叠与 tier-distillation 都拿不到 summary（报错 `0 summary call(s)` / `distillation summary was unavailable`）⇒ `futile round` ⇒ fail fast 且 `retryable:false`。
4. **死锁本质**：压缩本身要发一次「带全历史的 summary 请求」，而这次请求又必须过同一堵墙（载荷 271k vs 墙 150k）⇒ 只能永远失败。`/compact` 的 `could not produce a useful summary` 只是 dsh 侧 `ManualCompactionError("summary")` 的兜底文案，真正异常是 502。更早的 422 `dsh_compaction_refused`（bili 默认拒 dsh 原生压缩）与 400 `invalid_request_error` 是同一条链的上游症状。

## 3. 修复（已执行，可回滚）

- `~/.config/billion-context/billion-context.json`：**删除** `compress.modelContextLimit`，备份为 `.bak-20261023-pre-drop-ctxlimit`（与 [cache-report 归因](784243df-dd9c-413a-b220-7a5c3a5bd207) 同一配置文件）。
- `taskkill //PID 26068` 后，**dsh supervisor 自动拉起**新 bili 进程（pid 7216，重新监听 18787）。注意：这与 `0bb2e36f` 中「kill bili 不自动重启、需手动 start」的旧结论**冲突**，待复核（可能已随版本/拉起方式变化）。
- 验证数据：重启后 `/__bili/sessions` 所有活跃 session `contextWindow: 150000 → 868928`；本会话 122,639 / 868,928 = 14%；`conflicts` 归零。

## 4. 教训（可直接复用）

1. `modelContextLimit` 只会**制造**硬墙，永远不要低于真实窗口，更不能当省钱旋钮；墙一触发而 summary 后端不可用，整条会话不可救。
2. 判断 bili 实际窗口别猜：直接看 `/__bili/sessions` 的 `contextWindow` 字段（估算值 `contextTokensSource: estimate`，小数即估算而非上游 usage 回填）。
3. 改 bili `compress` 配置后必须重启 bili 才能生效（快照语义）。
4. 回到旧会话前先看估算上下文占比（本次 689,652 ≈ 79% of 868k），进会话第一件事建议 `/compact`，别先聊天把空间耗光。

## 5. 仍待拍板：自动压缩保持关闭

现状两条自动压缩都是 `false`：dsh `compaction-basic.auto: false`、bili `compress.injectNudge: false`（均 10-16 为保留手动 `/compact` 而关）。

| 方案 | 做法 | 生效 | 代价 |
|---|---|---|---|
| A | dsh `compaction-basic.auto: true` | 改 profile patch，开新会话生效 | 需先确认触发阈值口径 |
| B | bili `injectNudge: true`（`nudgeGrowthTokens: 150000`） | 改 json + 重启 bili | nudge 占上下文 |
| C | 保持手动 | — | 真到墙边且 summary 后端不可用会再死锁 |

推荐序：先验证旧会话 `/compact` 真能成功（若 dsh 原生 summary 链路仍有问题，开 auto 只是把失败变成后台静默失败），再在 A/B 中选择。

## 6. 同会话附带产出：reasonix 记忆系统效率审查

对 `~/.reasonix`（334 个 fact / 1.4 MB，mnemon sqlite 1227 万字节，insights 398 / edges 13161）实测：

- 写入链路健康：写入 → `import` 同秒入库，`import-skip` 去重生效。但 oplog 5000 条里 `import` 12 / `import-skip` 4988（99.8%），all-scan 无增量。
- **检索是短板**：`memory_search` 是多词**子串**匹配而非语义检索。`bili`→20 条、`死锁`→3 条、`bili 压缩 死锁`→1 条精准；但 `上下文窗口`→**0**、`bili 压缩 上下文窗口 死锁`→**0**。另有 `bili` ⊂ `bilingual` 的假阳性串味。
- 398 条 insight 中 397 条存了 **3072 维 embedding，未参与检索**（闲置）。
- edges 13161 / 398 节点 = 33 边/节点，entity 占 82%，weight 均值 ~0.97 ⇒ 无区分度；`never-recalled` 235/398（59%）。
- 常驻层：USER.md 3293/4096 ≈ 80%，runtime MEMORY.md 4368/10240。

已落地：`~/.reasonix/memory/global/元规则-02-自动记忆规则.md` 追加硬约束——description 必须铺三种写法（中文词 + 英文术语 + 口语说法，如 `上下文窗口 context window 窗口`），`name` 保持「主体-动作-日期」且英文主体前置，勿堆无关词（子串匹配下噪声同步进来）。

建议顺序 **C（同步增量，按 mtime/sha256 跳过未变文件，改 `memory-to-mnemon.py`）→ B（USER.md 瘦身）→ A（BM25 + 向量混合检索，收益最大但改坏则记忆全瘫）**；用户尚未拍板。
