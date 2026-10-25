---
id: "956f6754-806c-456b-8339-bb7206c9c43a"
title: "@ethanwong-hk/dsh-thinking-guard 第二轮调参（2026-10-01）：流式复刻证伪离线误报率、MEANINGFUL 过滤落地、gram-density 退役与 novelty 定位"
description: "2026-10-01 完成的 dsh-thinking-guard（reasoning 复读熔断插件）第二轮调参：用流式复刻证明 cordis.patch.yml 注释里的 3.7% 误报是离线数字（真实 9.2%）、15 例误报的根因（句子切分把有序列表编号/勾选标记/表格分隔线当短句）、加了 lib/index.js:86 的 MEANINGFUL 实义字符过滤后误报 9.2%→2.5%、gram-density 档贡献 0 检出且量纲反向故设 gramDensity=2.7 等效禁用（最终 40/40 检出 + 0/163 真实误报、中位命中 3072）、novelty 在五档合并中物理上永不触发只作进程外遥测、pnpm patch-commit 落地验证，以及待用户拍板的 dsh 重启（代码改动不走 HMR）。"
status: "active"
created_at: "2026-10-01T13:46:55.889Z"
updated_at: "2026-10-01T13:46:55.889Z"
content_hash: "2835de8bddebc396c0288b1733c38e8e4c72d7dbb71a195c98994da79b9fc79d"
source_paths:
  - "profiles/web/cordis.patch.yml"
  - "profiles/web/node_modules/@ethanwong-hk/dsh-thinking-guard/lib/index.js"
  - "patches/@ethanwong-hk__dsh-thinking-guard@1.0.2.patch"
  - "profiles/web/pnpm-lock.yaml"
session_ids:
  - "24f0b81d-e9db-48ea-b0c1-1e1078af7d86"
memory_body_ids:
  []
---

# dsh-thinking-guard 第二轮调参（2026-10-01）

前置：接入过程与首次默认参数评测见文档 `507f579b-3bc2-4abb-91bb-070771968bf6`（registry 404 绕过、bundle 自动注册、空白单元判据 bug）。本文档只记录**第二轮**：novelty 判据回灌 + 误报归零，并**修正**前文给出的误报率数字。

## 状态
- 代码改动已 `pnpm patch-commit` 落地并验证（`patches/@ethanwong-hk__dsh-thinking-guard@1.0.2.patch`，2032 → **9861 字节**）。
- `cordis.patch.yml` 的 `gramDensity: 2.7` 走 live（开新 session 生效）；`MEANINGFUL` 过滤与 `noveltyWindow: 4096` 在 `lib/index.js` 里，**必须重启 dsh 进程才生效**。
- 报告时点：用户当前 session 仍跑旧代码；「现在重启还是用户自己挑窗口」待用户拍板。

## 1. 关键教训：离线校准 ≠ 流式行为（本轮第三次踩）
`cordis.patch.yml` 注释里记的「sparseMinCount=30 + gramDensity=0.40 → 误报 3.7%」是**离线全文一次判定**的数字。用 `C:/tmp/fx/{ev6.mjs,degen.jsonl,normal.jsonl}` 做**流式复刻**（每 1024 字符 check 一次，与插件真实行为一致）后真实误报翻 2.5 倍：

| 判据配置 | 退化检出 | 流式误报 | 中位命中 |
|---|---|---|---|
| 上游 DEFAULTS（sparseMinCount=5 / gramDensity=0.16） | 40/40 | 52.1% | — |
| 现网 sparseMinCount=30 / gramDensity=0.40 | 40/40 | **9.2%（15/163）** | 3072 |
| cordis.patch.yml 注释声称 | 40/40 | 3.7% | — |

根因：离线是全文一次判定，流式是 163 样本 × 最多 70 次判定，**命中机会多一个数量级**。前两次同类教训是 loop-guard 的 CODE/MD 样本与 novelty 的 1024 窗口。结论已写进 `cordis.patch.yml` 注释块。

## 2. 15 例误报的根因与修法（MEANINGFUL 过滤）
命中样本全是三类，天然高频但零语义重复，与前一轮修的「纯空白单元」是同一类问题：
- 有序列表编号 `"3."` `"13."` `"6."` `"8."`（count 30~48）
- 勾选标记 `"\" ✓"` `"\" ✓."`（count 30~38）
- 表格分隔线 `"\|**#**\|#\|#\|#\|..."`（count 12）

修法落在 `lib/index.js:86`：

```js
const MEANINGFUL = /[\p{Script=Han}\p{Script=Latin}]/u;
```

`sentence-repeat` 与 `sparse-repeat` 两处 filter 各加 `&& MEANINGFUL.test(part)`。**零代价**：误报 9.2% → 2.5%，退化检出 40/40 不变，中位命中 3072 不变。

## 3. gram-density 退役（量纲是坏的，但不必改公式）
剩余 3 例误报全是 **LaTeX 数学文本**（人工核对原文确认）：`\frac` / `\partial` / `s_n` / `\to` 在 600 窗口里天然高重复。而 gram-density 在 40 条真实退化上**贡献 0 条**（全被 sparse-repeat 抓到）。

量纲对照（真实数据实跑）：

| 量纲 | degen max | normal max | 可分？ |
|---|---|---|---|
| 旧 `peak / grams.size` | 0.597 | **2.699** | 分布重叠，不可分 |
| 新 `peak / total`（真实占比） | 0.066 | **0.649** | **反向**：degen 反而更低 |

反向原因：**真退化的循环周期长**（33 字符），600 窗口里每个 6-gram 只出现约 18 次；LaTeX 的 `\partial` 这类 gram 出现几百次。即 **gram-density 测的是「符号级重复」，不是「语义级循环」——不是同一个现象**。

真正可分的是 `grams.size` 本身（degen 62~86 / normal 143~427），但换算成占比即短窗口 novelty，阈值余量极窄（0.25 → 40/40；0.20 → 24/40 崩），且 2648 与 3072 **都是第 3 次 check 命中**（落在 `n=600,1600,2624` vs `n=1024,2048,3072`），实际延迟一致，不值得引入。

阈值扫描（阈值 → 从 0.4 递增）结论：`gramDensity = 0.7/0.8/0.85/0.9/0.95` 均 2/163=1.2%；`2 / 2.7 / 3 / 5` 均 1/163=0.6%。故设 **`gramDensity: 0.40 → 2.7`（等效禁用）**。

最终配置（`cordis.patch.yml`，`id: thinking-guard`）：enabled / thinkingOnlyMs 45000 / maxThinkingChars 80000 / repeatThreshold 3 / sparseMinCount 30 / gramDensity 2.7 / autoContinue / notify；新增 `noveltyWindow: 4096`。

| 配置 | 退化检出 | 流式误报 | 中位命中 |
|---|---|---|---|
| + MEANINGFUL | 40/40 | 2.5% | 3072 |
| **+ gramDensity 2.7（最终）** | **40/40** | **0.6%（1/163）** | **3072** |

那唯一 1 例（`0d5fbf8-0fb1@10240`）人工看原文是 `好。`/`跑。`/`我写。`/`我写命令。` 循环几百行，**真阳性**，只是当初被误归进 `normal.jsonl`。⇒ **真实误报 0/163，中位命中 3072 字符。**

## 4. novelty 的真实定位（备援 + 遥测，不是主力）
- 退化 40/40 全部由 `sparse-repeat` 抓到，中位 3072；novelty 单独开窗口时检出 40/40 但中位 6144（最早 4096 / 最晚 8192）。
- 两个假说均被数据证伪：① 重排为 `repeat → novelty → sentence → sparse → gram`，结果与现网逐位相同（都 40/40、15/163=9.2%）；② 「novelty 窗口未满时门控弱证据」只把 9.2% 降到 8.6%。
- 物理原因：`sparse-repeat` 在 3072 就命中，而 novelty 窗口 4096 才 ready ⇒ **五档合并时 novelty 永远不会触发**。
- 定位：**防御未来新形态的备援 + 进程外遥测接口**。此结论已写进代码注释，避免以后误当误报率解药。

## 5. 落地验证
- `pnpm patch-commit` 成功；patch 文件 2032 → 9861 字节，`pnpm-lock.yaml:8` 的 `patchedDependencies['@ethanwong-hk/dsh-thinking-guard@1.0.2']` hash → `c4613448446000455522fcd54c7b126f85d6a95a9d694848286acab81a85ce86`。
- `node_modules/@ethanwong-hk/dsh-thinking-guard/lib/index.js` 实体文件已含 `MEANINGFUL` 与 `noveltyWindow: 4096`，`node --check` 通过。
- 合成基线测试 11 通过 / 0 失败（含文本复读、长正常文本放行、稀疏复读熔断不抛异常）。
- 已知环境坑：`ERR_PNPM_EDIT_DIR_NOT_EMPTY` —— `.pnpm_patches/@ethanwong-hk/dsh-thinking-guard@1.0.2` 在 patch-commit 后**未被自动清理**且内容与实体文件相同（无害），但下次再改时基线已不是 registry 原版，需先删除该目录再 `pnpm patch`。
- 另一个坑：Node v24 下 ESM 直接 `import` Windows 绝对路径（`c:\...`）会抛 `ERR_UNSUPPORTED_ESM_URL_SCHEME`，需转 `file://` URL；写 patch 脚本时 heredoc 里的 `\p` 触发 `SyntaxWarning` 并曾导致 `SyntaxError: Invalid or unexpected token`，应避免未转义的反斜杠。

## 6. 生产 gateway 侧验证（loop-guard）
`D:/Toolbox/goat-gateway/restart-gateway.ps1` 重启（旧 PID 5904 → 新 PID 34160，`/health` ok:true）。重启后第 2 个请求即命中真实退化：`sess=8149ad2c` 的 reasoning 里 `Go.` 循环（`LOOP-GUARD HIT id=2#1 mode=shadow at=1916ch fast=0.0195 period={period:10,repeats:4}`）。同批对照：该 session `fast 0.0508 / slow 0.0032 / 8 hits`，其余 session 全在 0.69~0.96，无误报。

## 7. 未决
重启 dsh 进程以使 `MEANINGFUL` 过滤与 `noveltyWindow` 生效（`lib/index.js` 改动不走 HMR；`preset .mjs` 与 node_modules bundle 同属此边界）。会话可持久化续接，由用户挑窗口。
