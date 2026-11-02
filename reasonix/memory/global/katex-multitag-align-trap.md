---
id: mem-737aa0240a7642635027380f18e48b0d
revision: 1
created_at: "2026-11-01T18:11:05.265Z"
updated_at: "2026-11-01T18:11:05.265Z"
name: katex-multitag-align-trap
description: "KaTeX align 环境多 tag 静默丢内容；D:/gh-publish 基线口径是 98 份文件"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## KaTeX 多 `\tag` 的正确修法（2026-11-02 实测）

`katexcheck/check.js` 用 `renderToString({throwOnError:true, displayMode:true})` 判门。

- `\begin{aligned} ... \tag{1} \\ ... \tag{2} \end{aligned}` → 抛 `Multiple \tag`（aligned/gathered 都如此）。
- **陷阱**：`\begin{align} ... \tag{1} \\ ... \tag{2} \end{align}` 在 display mode 下 **不抛错**，
  但实测只渲染第一个 `\tag`（HTML 里 `class="katex-tag"` 只出现 1 次），其余编号被静默丢弃。
  → 靠 `throwOnError` 的门禁查不出这种内容丢失。判据要数渲染结果里 `class="katex-tag"` 的出现次数。
- 唯一可靠改法：拆成多个 ```math 围栏，每块一个 `\tag`；续行用 `\phantom{L(C,X)}` / `\phantom{S}`
  占位左边，使等号仍对齐，零内容损失。
- `\tag` 只在 display mode 可用（inline 抛 `\tag works only in display equations`）。

## D:/gh-publish 的「基线口径」

- `_bak_20261102_0145/` 的 **98 份**文件才是 KaTeX 门的基线集合（98502 formulas），
  不是全仓 595 份（189313 formulas）。两者混用会把「14 条」和「全仓 137 条」搞混。
- 全仓另有 137 failed，集中在 12 个文件（HW5_附加题 / HW6 / prob_chunk07 / mackay_ch01_exercises /
  PartVII / VII.4 / clrs_chunk05 / HW7 / alg046-lec15 / mackay_ch02 / mackay_ch03 / PS02），
  形态是整段正文被塞进 ```math 围栏 + 围栏错位，属另一类工程。

## 复扫脚本

`C:/Users/27063/_wb/lald/katexfix/_hygiene_rescan.py` = hygiene_scan.py 的副本，OUTDIR 改到 katexfix，
输出 `_hygiene_rescan.md/json`，不覆盖基线报告。自写的简化版 `_rescan.py` 因跨行 `$` carry 处理粗糙会出 3 处假阳性，别用。
