---
id: mem-5ce222fe70f2383e8b4248544832daaf
revision: 1
created_at: "2026-10-16T04:05:41.515Z"
updated_at: "2026-10-16T04:05:41.515Z"
name: dsh-preset-effective-path-and-pruner-tuned-20261016
description: "agent preset 真实生效路径（.agent-presets 已废除，须改 profiles/*/cordis.patch.yml）+ T3 pruner 阈值 8192→32768 已落地并双向验证"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## ★★ 最重要：agent preset 的真实生效路径（差点改错文件）
`~/.dsh/.agent-presets/anchored-standard/agent.cordis.yml` **只是「源头文件」，不生效**。逐字证据在 `~/.dsh/profiles/web/cordis.patch.yml:2-4`：
> 旧机制（`$DSH_HOME/.agent-presets/<id>/` 目录 + `dsh-agent-presets` 插件）在 **0.1.7 已废除**：目录不再被扫描，preset 必须由 `@deepseek-ai/dsh-agent-preset` **声明行携带 plugins 列表**。

**⇒ 真正生效的是 `~/.dsh/profiles/{desktop,web}/cordis.patch.yml`**（`profiles/desktop/cordis.patch.yml:10` 有 `default: anchored-standard`、`:13 - id: preset-anchored-standard`、`:16 id: anchored-standard`，其 `plugins:` 列表内嵌了一份 `agent.cordis.yml` 内容的副本）。

**验证方式（有效）**：`DSH_HOME='C:\Users\27063\.dsh' node "$APPDATA/npm/node_modules/@deepseek-ai/dsh/lib/bin.js" --profile web --dump-config`；desktop 侧用 `powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\27063\.dsh\storages\tools\dump-desktop-config.ps1"`。**dump 里会出现多处同名 plugin**（例：`tool-result-pruner` 共 5 处 —— 977 来自 base bundle、1389/1571/1835 是别的 preset 的内置定义、**2400+ 那处才是 anchored-standard**）。**改配置后必须看最后那处（行号最大的）确认生效。**

## 已落地：T3 `tool-result-pruner` 阈值放宽（2026-10-16 12:03）
- `thresholdChars`: **8192 → 32768**（`headChars: 4096` / `tailChars: 1024` 不变）
- 改了三处保持一致：`profiles/desktop/cordis.patch.yml:567`、`profiles/web/cordis.patch.yml:567`、`.agent-presets/anchored-standard/agent.cordis.yml:383`；备份 `*.bak-20261016-115954-pre-pruner-32768`（前两个）与 `agent.cordis.yml.bak-20261016-...-pre-pruner-32768`
- **生效验证**：`--profile web --dump-config` 行 **2340-2343** `thresholdChars: 32768`；`dump-desktop-config.ps1` 行 **2364** `thresholdChars: 32768`；其余 4 处仍是 8192（那是别的 preset / bundle 内置，**正常**）
- **WHY**：`dsh-compaction-tool-result-pruner/lib/index.js:136 pruneSession()` 用 `session.append("tool/result", …, { surfaceOp: { op: "replace", startSeq: seq, endSeq: seq } })` **原地替换历史中间节点** ⇒ 从该 seq 往后 prefix 全失效。8192 太激进（任何 >8K 字符的工具结果都被裁），实测 session-a0d5fbf8 有 **325 次 fold / 1867 requests**、`338 mid-history divergence(s)`，与 fold 次数同量级 ⇒ **怀疑 pruner 是隐形前缀破坏者**（bili 的 cache-seam 报 `no fold/switch/restart attribution`，说明 pruner 的 surface 改写绕过了 bili 的 fold 记账）。
- **生效时机**：profile patch 是 `patchReload: live` HMR，但**改文件内容需新 session 才生效**（不是新 row）。
- 回滚：把 32768 改回 8192。

## 同批完成的 T2（bili 压缩频率）
见 memory fact `bili-compress-frequency-tuned-20261016`：`nudgeGrowthTokens` 50000→150000、`preserveRecentTokens` 5000→20000、`preserveRecentMessages` 3→10，**必须 kill 一次 bili 才生效**（dsh 会自动拉起）。

## 本轮实测的 cache 现状（bili 重启后新取的 cache-report，session-a0d5fbf8 1867 requests）
```
total input 188.31M / total cached 175.04M  (hit 93.0%)
miss: new content 5.99M (45%) + compress re-pay 1.96M (14.8%) + upstream-ttl-or-client-rewrite 5.33M (40.2%)
FOLD ECONOMICS (325 folds): gross saved 4431.21M · repay 1.96M → net +4429.04M · 325 paid back / 0 not
```
⇒ **325 次 fold 全部回本**，但 `compress re-pay` 占 miss 的 14.8%（比 d60ed9f2 的 4.8% 高 3 倍）⇒ 这个 session 折得太频繁。**T2 的 `nudgeGrowthTokens` ×3 应该把 fold 次数降到约 1/3。**

截至 2026-10-16。
