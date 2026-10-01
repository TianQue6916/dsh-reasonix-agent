---
id: legacy-c1b4c1b7cae4a0e978361fb3
revision: 1
created_at: "2026-07-26T14:11:50.6123597Z"
updated_at: "2026-07-26T14:11:50.6123597Z"
name: strang-translation-lessons
description: Strang 翻译教训：子agent常见陷阱4条 + 亲自逐句翻译优于子agent
metadata:
  type: feedback
  scope: global
---

在翻译《Linear Algebra and Learning From Data》（Gilbert Strang）Part I 前50页的过程中，发现了以下子 agent 常见陷阱：

1. **"English sentence（中文）"单行对照** — 子 agent 写的内容以完整英文句子开头（如"This is how we compute..."），然后跟中文翻译在括号中。这是铁律①和②的复合违反。**英文只能以术语片段形式出现。**

2. **伪逐句翻译** — 子 agent 声称"700行逐句翻译"，但实际中文字符数只有7248，平均每行5.4个字，说明在概括而非逐句翻译。**真正的逐句翻译每页应有30-40行，平均每行6-7个中文字。**

3. **OCR 预处理缺失** — 子 agent 直接翻译OCR乱码（Aæ、鬱等）而不修正。

4. **章节密度差异** — 同一文件中 §I.2 密度38行/页而 §I.5 仅6行/页，用户明显看出不协调。

**解决方案：** 对于高质量逐句翻译，我亲自逐页对照OCR文本逐句翻译，不使用子 agent。子 agent 只适合初步处理后的格式修正。

**Why:** 这次翻译了50页（1184行/63KB），子 agent 的前两版均被用户拒绝（格式错误+密度不足），最后我亲自逐句翻译才通过。

**How to apply:** 下次需要逐句翻译教材时，直接使用"逐句对照OCR文本→中文写作→英文术语嵌入"的流程，不给子 agent 做核心翻译工作。
