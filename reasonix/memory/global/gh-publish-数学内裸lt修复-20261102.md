---
id: mem-ac3d1c66544e5a29dcaf31e65203b4a2
revision: 1
created_at: "2026-11-01T17:54:35.379Z"
updated_at: "2026-11-01T17:54:35.379Z"
name: gh-publish-数学内裸lt修复-20261102
description: "D:\\gh-publish 行内数学裸 `<` 渲染缺陷已全修；HIGH/MED/S4 归 0，KaTeX 门 failed 14 是既有基线"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 定论（2026-11-02 01:53 完成）

`D:\gh-publish` 双语译注的 markdown 行内数学里，「未转义裸 `<` + 紧跟 ASCII 字母」会被 HTML parser 当标签起始，静默吞掉后续内容。

- **修法**：数学内 `<` → `\lt `（**必须带一个半角空格**，直接接字母会被 TeX 吞成未定义控制词 `\ltr`）；`cases` 里的 `\\[4pt]`/`\\[2pt]` → `\\`。
- **本次改动**：565 处 `\lt ` + 4 处 row-spacing，97 个文件；另 1 处根因修复（`Introduction-to-Probability-6.041/01-教材/prob_chunk06_p251-300.bilingual.md:668` 的未配对 `$` → `\$`，它导致 span 状态机 carry，使 669 行 `<!--` 被判成 HIGH，并把中文原文渲染进 math mode）。
- **重扫**：HIGH 0 / MED 0 / S4 0 / INFO 1218（按契约不动）/ S1 控制字符 0 / S3 0。
- **备份**：`D:\gh-publish\_bak_20261102_0145\<相对路径>.bak_20261102_0145`（98 份；文件名含 `.bak_` 且不以 `.md` 结尾，`hygiene_scan.py` 自动跳过）。

## KaTeX 门的既有基线（重要，别再当新问题追）

`node katexcheck/check.js` 跑这 98 个文件：`formulas 98502, failed 14, files with issue 31` —— **改动前就是这个数**（用同一批 `.bak` 备份跑出完全相同的错误集合）。14 条分四类：
1. `Multiple \tag` × 4（同一 aligned 里多个 `\tag`）
2. `Can't use function '$' in math mode` × 3（math-block 内混入 `$`）
3. `Undefined control sequence: \SigmaV` / `\OmegaP` / `\*` × 3（OCR 控制词粘连，如 `U\SigmaV^{T}`）
4. `Expected 'EOF', got '&'` / 截断的 `X_{ijk} = I\{\text{` × 4（行内公式塞 aligned 内容 / 跨行被切断）

要跑门时请对照基线，否则会把既有缺陷当成新引入。

## 工具链位置

- `C:/Users/27063/_wb/lald/hygiene_scan.py` → 重扫描（可重跑，只读）
- `C:/Users/27063/_wb/lald/hygiene_fix_plan.py` → dry-run 计划
- `C:/Users/27063/_wb/lald/hygiene_fix_apply.py` → 改副本（`--only <rel>` 可单文件试）
- `C:/Users/27063/_wb/lald/hygiene_fix_verify2.py` → 双指针独立校验（除替换点外零改动）
- `C:/Users/27063/_wb/lald/hygiene_fix_ltcheck3.py` → `\lt` 空格/粘连校验（注意同名多处时列要按 seq 累加 +3 偏移）

## 环境约束（再次确认）

python 写不了 `D:/gh-publish`（Low IL PermissionError）；`cp` / `cp -f` 可以。流程：`cp` 到 `C:/Users/27063/_wb/lald/hygiene_fix/` → 改 → `cp -f` 回 → `cmp`。
