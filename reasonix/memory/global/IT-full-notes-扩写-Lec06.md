---
id: mem-0d490143b26737a1f9bca95822650348
revision: 1
created_at: "2026-11-19T17:24:58.786Z"
updated_at: "2026-11-19T17:24:58.786Z"
name: IT-full-notes-扩写-Lec06
description: "IT-full Lec06 七条 note 扩写完成，产出路径与自检口径"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 产出（2026-11-20）

`C:/Users/27063/_wb/lald/notes_work/ITfull__Lec06/notes.md` —— IT-full Lec06（MacKay ITILA l6）7 条译者注，逐条
`===NOTE n BEGIN/END===` 包裹，块内每行以 `>` 开头。

纯汉字（剔除 `$...$` 后数 `[\u4e00-\u9fa5]`）：869 / 847 / 1034 / 1076 / 1076 / 1085 / 991。

## 自检口径（可复用脚本 check.py、check2.py 同目录）

- 方向正则 `[\u4e00-\u9fa5]{2,}（[A-Za-z][A-Za-z \-'’]{2,}` 必须为 0
- `$$` = 0、`<div>` = 0、行首 `#` = 0、块内非 `>` 行 = 0
- notes.md 不含 `Lnnnn |` 前缀、不含 CRLF

## 踩过的坑

首稿有 7 处写成「中文（English）」：理想码长（ideal codelength）、等价关系（equivalence relation）、
被划分（partition）、伪随机数生成器（pseudo-random number generator）、物理随机源（physical random source）、
链式法则（chain rule）、度量（metric）。批量替换成英文在前后归零。
⇒ 经验：写中文正文时，术语一旦「先想到中文词」就会自动写成反向；先写 English 再补括号才稳。

## 内容上的争议点（已写进注 #1）

p.2 那道「随机抽一个 bit 得 1 的概率」：源页答案 A（1/3）对应「先按 P_X 抽符号、再在码字内均匀抽位」；
若按 bit 位置等概率抽，本 ensemble 恰得 1/2。两种读法都自洽，差别是 E[o/l] 与 E[o]/E[l]。MacKay 原 slide 未在线定位。
