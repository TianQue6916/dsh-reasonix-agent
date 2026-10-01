---
id: mem-92dccd26cf0fb493ca8b3b34e2f3063d
revision: 3
created_at: "2026-09-30T10:56:33.894Z"
updated_at: "2026-09-30T13:54:03.951Z"
name: bilingual-ocw-translator-v3.3-muse-refactor
description: "【已作废】v3.3/v3.4 重构基于陈旧 fork，被 bilingual-ocw-translator-v3.7-converged 取代"
metadata:
  type: user
  fact_type: project
  scope: project
---

## ⚠️ 本条已作废（2026-09-30 当日废弃）

它描述的 v3.3（muse 口径）/ v3.4（回退 v4.1 flash）重构，是**在 Windows `.reasonix` 那份陈旧 fork（v3.2 / 1338 行）上**做的——那份 fork 因同步器「冲突绝不覆盖」而从 2026-09-10 冻结，落后 Linux/Roaming 侧的 v3.6 谱系 **937 行**（缺铁律 24/25/26 与第 8/9/10 章）。

**当前唯一权威条目 → `bilingual-ocw-translator-v3.7-converged`**：v3.7 以 v3.6 为底座重做 progressive disclosure，主文档 697 行 + `references/` 8 文件，三端 sha256 一致。

仍成立的零星事实：
- 翻译技能收敛为唯一入口 `bilingual-ocw-translator`（另两个三端停用不删）；
- 模型口径 = v4.1 flash（`deepseek-v4.1-flash`），一度试用 `meta/muse-spark-1.3-contributor` 后放弃。
