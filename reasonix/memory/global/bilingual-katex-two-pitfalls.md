---
id: mem-a39a05aa5f410b0e44df21202b427244
revision: 1
created_at: "2026-10-27T19:52:57.453Z"
updated_at: "2026-10-27T19:52:57.453Z"
name: bilingual-katex-two-pitfalls
description: "双语 md 的 KaTeX 校验两个真实坑：extract-formulas 吞公式、批量替换脚本的正则转义"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 坑 1（工具缺陷）：`extract-formulas.py` 会吞掉同一行的 `<` 与 `>` 之间内容

`C:/Users/27063/.dsh/tools/extract-formulas.py:14` 有 `body = re.sub("<[^>]+>", "", body)`（剥 HTML 标签）。
所以 md 里只要**同一行**同时出现裸 `<` 和 `>`，之间的一切（包括公式）被当标签删掉 → KaTeX 报
`Expected 'EOF', got '}' at position N: ...`，且 tex 串明显被截断（如 `p 0}(-x - 1/x)` 来自 `\sup_{x>0}` 被切）。

**规避**：数学里的裸 `<` 写 `\lt`、`>` 写 `\gt`（KaTeX 支持，渲染相同）；同一行不要混着放裸 `<`/`>`。
`$f'(x)^2$`、`$f' ' (x)$` 这类写法另会报 `Double superscript`，要写 `(f'(x))^2`、`f''(x)`。

## 坑 2（我自己踩的）：批量改稿脚本里 `$` 和 `\` 必须 re.escape

- 正则里 `$` 是行尾锚点：`'\$([^$]+)\$'` 若是拼出来的字符串且漏了反斜杠，就变成"几乎不匹配"或"跨行乱配"。
- 字符集里写 `[A-Za-z\\]` 拼接不当会让 `]` 被吞、模式失控，结果是**逐字符插入替换串**（把 `$x$` 变成 `$ \gt \ \gt lt \gt x \gt $` 这种）。
- 替换串里的 `\lt` 会被 re 当转义：必须 `re.sub(pat, lambda m: '\\lt', s)`，不要直接塞字符串。

**铁律**：脚本里所有字面 `$`、`\` 一律 `re.escape()`；**改别人文件前先 `cp` 备份**（2026-10-28 我没备份，毁掉 19 行，靠逆向去噪 `\gt`/`\lt` 才救回来）。

## 交付前校验（实测可用）

```bash
cd C:/Users/27063/.dsh/tools
timeout 120 python extract-formulas.py "<输出目录>" /tmp/ee.json
timeout 120 node katex-check.js /tmp/ee.json "C:/Users/27063/.dsh/tools" /tmp/ee-report.json
```
验收看 report 的 `files_with_errors`。2026-10-28 EE364a 全目录实测 33 files / 4538 formulas / 0 fails。

## 读取大 PDF 文本时的省 token 手法

`sed -n 'A,Bp' x.txt | grep -vE '^[0-9eE.+-]+$' | grep -vE '^\s*$'` —— 过滤掉 beamer 图里的坐标刻度纯数字行，
可把 200+ 行压到可读规模，且不触发 headroom 折叠（约 7000 字符是折叠阈值）。
