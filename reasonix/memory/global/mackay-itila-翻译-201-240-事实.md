---
id: mem-239bd744f9ee6007d0673e8b685d3516
revision: 2
created_at: "2026-10-27T20:25:20.993Z"
updated_at: "2026-10-27T20:34:13.520Z"
name: mackay-itila-翻译-201-240-事实
description: "MacKay ITILA 各 PDF 块实际章范围、fitz 抽取、headroom 折叠、反斜杠与译注 span 事故"
metadata:
  type: user
  fact_type: project
  scope: global
---

## MacKay ITILA 分章块的实际内容（截至 2026-10-28 实测，PDF→书内页 = −12）
源料目录 `C:/Users/27063/Documents/源料-教材/Cover信息论/` 全是 MacKay《Information Theory, Inference, and Learning Algorithms》(CUP 2003)，**不是 Cover & Thomas**，目录名是历史误标。
- `Cover信息论_p201-220.pdf` = 书内 p189–208：§11.10 Solutions → Part III 扉页(p191) → About Ch.12 → **第 12 章 Hash Codes 全章**(p193–204) → About Ch.13 → Ch.13 §13.1–13.3。
- `Cover信息论_p221-240.pdf` = 书内 p209–228：**第 13 章 Binary Codes 主体**（13.3 Perfect codes → 13.5 GV distance → 13.6 Berlekamp's bats → 13.7 concatenation → 13.9 union bound → 13.10 Dual codes → 13.11 MDS → 13.14 Solutions）→ About Ch.14。
- `Cover信息论_p241-260.pdf` = 书内 p229–248：**第 14 章 Very Good Linear Codes Exist 全章**(229–232) + **第 15 章 Further Exercises 纯习题章**(233–240, Ex 15.1–15.21) + **第 16 章 Message Passing**(241–247) + **第 17 章开头**(248, Channel A/B/C 三个受约束二元信道)。
产出目录 `C:/Users/27063/Documents/翻译产出/教材/MacKay信息论/` 已有 `_p201-220`、`_p221-240`、`_p241-260` 三份 bilingual.md。

## 抽取与校验教训
- **pdfplumber 对这套 PDF 会把连字与符号打成 `(cid:xx)`（上千处），不可用**；PyMuPDF `fitz` 的 `page.get_text()` **零 cid**。抽法：逐页 `get_text()`，页间插 `===PDFPAGE n===`。
- **headroom 会把长页文本折叠**（如 13562→2882 字符）。要读完整页时用 `python` 逐页打印并用 `sum(ch.isalpha() or ch.isspace())/len(l) > 0.5` 过滤矢量图乱码行，不要一次 cat 多页。
- **LaTeX 反斜杠事故**：用 python 就地改写含公式正文时，字符串里写单反斜杠命令（`\binom`/`\beta`/`\approx`）会被解释成 0x08/0x07，KaTeX 报 `Unexpected character: '\b'`。规避：`chr(92)+'b'` 拼接或先写模板文件再读入。**脚本改完含公式正文必须立刻重跑 KaTeX**。
- **译注必须包绿色 span**：只写 `> **[译注]**` 不算，须 `<span style="color:#1e8449;">…</span>`；每个 part 写完就查，不要收尾统一洗（p241-260 首稿 13 行全裸露）。
- 「重建说明」里不要留演算中的自我推翻过程，只留结论 + 一条能对的算式（积分图 0-based/1-based 那次）。
- 验收（`C:/Users/27063/.dsh/tools`）：`python extract-formulas.py <目录> <json>` → `node katex-check.js <json> <tools目录> <out.json>`；输出顶层 `{total, fails, files_with_errors, bad}`。独占校验 = 把目标文件单独拷到临时目录再跑一遍。目录里 13 份合并为 6741 公式 / 0 失败（2026-10-28）。
- 本项目约定：编号公式写块尾 `\qquad (14.7)`，**不用 `\tag`**。
- 译注判据以 `~/.dsh/tools/译注判据.md` 为准：**200–400 字 + 至少一个公式或数**（技能铁律 8 的 800–1200 字只适用于原书没有的长篇注）。
