---
id: mem-eb621ecccfe5301b7c4a6aca1517b3e9
revision: 1
created_at: "2026-11-19T17:04:39.104Z"
updated_at: "2026-11-19T17:04:39.104Z"
name: info-theory-lec07-notes-扩写产出
description: "IT Lec07（MacKay l7）8 条译者注扩写完成，含字数、术语格式规则与 4 处实质修正"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 产出
`C:/Users/27063/_wb/lald/notes_work/IT__Lec07/notes.md`（截至 2026-11-20），8 个 `===NOTE n BEGIN/END===` 块，
纯汉字 1051/1092/1063/962/898/1135/1011/943（全部 ≥800，≤1200 上限）。

## 自检脚本
`C:/Users/27063/_wb/lald/notes_work/count_notes.py`：剔 ```` ```math ```` 与 `$...$` 后数 `[\u4e00-\u9fa5]`，
同时报每块「不以 > 开头的行号」。复用于同系列其它 Lec 的验收。

## 硬约束踩坑点
- 术语必须 `English（中文）` 方向，写成「中文（English）」要翻转（初稿错了 20 处）。
- 行内公式全走 `$...$`，块级才用 ```math；混用会让计数脚本把汉字算进公式。
- 用 python heredoc 批量替换含 LaTeX 反斜杠的句子时，`\times` 会被 python 当转义 ——
  要用 `chr(92)` 拼反斜杠，否则匹配为 0。

## 本轮改掉的实质错误（同类稿子要复查）
1. Monty Hall「随机开门」协议的似然是 1/2、1/2、0（证据 1/3），初稿误写 1/6 —— 把先验 1/3 混进似然。
2. 英文文本熵别写 1.5 bpc 无出处：Shannon 1951（BSTJ 30(1):50-64）给的是 0.6–1.3 bpc。
3. 「偏心硬币」基准：文件长度按比特说，10^6 比特 = 125000 字节 = 122 KB。
