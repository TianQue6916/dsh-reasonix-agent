---
id: legacy-4cfb7112cb5a58a2db74977a
revision: 1
created_at: "2026-07-24T04:33:46.753024473Z"
updated_at: "2026-07-24T04:33:46.753024473Z"
name: bilingual-translator-no-en-zh-blocks
title: 双语翻译铁律：禁止英中分段对照
description: bilingual-translator 的核心禁令：禁止英中分段对照，必须是中文主体+英文术语行内嵌入
metadata:
  type: feedback
  scope: global
---

## 经验教训：英中分段对照 ≠ 行内双语

**错误做法：** 第一次翻译 prob7sol.pdf 时，输出了「完整英文段落 + 完整中文段落」的英中对照格式。这不符合 bilingual-translator 技能的核心要求。

**正确的格式：** 中文为主体句子，英文术语以 `English term（中文翻译）` 格式行内嵌入，**没有完整的英文原句**。

```
✅ 在带权有向图 G = (V, E) 中，vertex（顶点）u ∈ V 的 weighted eccentricity（带权离心率）...
❌ In a weighted directed graph G = (V, E)...（英文段）
   在带权有向图 G = (V, E) 中...（中文段）
```

**如何自检：** 如果输出中有任何一行以英文单词开头且长度超过 10 个词，后面紧跟着一行中文翻译，那就是错的。

**Why:** 技能名为「双语翻译」而非「双语对照」——目的是让中文读者在读中文时自然接触到英文术语，而不是提供逐段对照。
