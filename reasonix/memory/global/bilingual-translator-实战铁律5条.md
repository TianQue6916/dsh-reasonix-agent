---
id: legacy-cd50bcddca104daaf0909640
revision: 1
created_at: "2026-07-25T04:56:57.7983744Z"
updated_at: "2026-07-25T04:56:57.7983744Z"
name: bilingual-translator-实战铁律5条
description: bilingual-translator 实战补充5条铁律：英文不开句、无箭头对照、术语仅首次加括号、不合并句子、LaTeX内不翻译
metadata:
  type: feedback
  scope: global
---

在翻译《Elementary Real Analysis》50页实战中，bilingual-translator 技能补充了5条铁律（2025.07）：

1. **英文句子开头（铁律）**：每句话第一个字必须是中文，不能以英文单词开句。❌ `A sequence（序列）就是...` → ✅ `一个 sequence（序列）就是...`
2. **引导箭头式英中对照（铁律）**：禁止"英文原句 → 中文翻译"模式，也禁止先写英文再写中文。必须纯中文主体 + 英文术语嵌入。
3. **同一术语反复加括号（建议）**：同一段落中术语首次出现时加 `English term（中文翻译）`，后续出现时省略括号。❌ `用 real numbers（实数）来研究 real numbers（实数）` → ✅ `用 real numbers（实数）来研究实数的性质`
4. **多句合并式压缩（铁律）**：原文每一句都对应至少一句中文翻译，不得将3-5句压缩为1句。逐句阅读→逐句翻译→逐句输出。
5. **LaTeX 环境内不翻译（铁律）**：`$...$`、`$$...$$`、`\begin{}...\end{}` 环境内的任何文本（包括 `\text{}` 内的内容）保持英文原样，不做翻译。

**Why:** 这5条是在逐句翻译50页教材的实战中反复犯错后总结的。前两条是格式硬伤，第3条是冗余，第4条导致内容不全被用户批评，第5条是数学写作规范。

**How to apply:** 每次调用 bilingual-translator 时，先默念这5条铁律。以第4条为最耗时的约束——逐句翻译比概括式翻译慢3-5倍，但用户要求的就是逐句。
