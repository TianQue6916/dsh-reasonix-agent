---
id: mem-d5c8fd0edcded73999932b666e62e192
revision: 1
created_at: "2026-10-24T17:03:50.001Z"
updated_at: "2026-10-24T17:03:50.001Z"
name: markdown-KaTeX渲染校验与无效数学公式
description: "MarkText 里 <无效数学公式> 的根因（\\\\[2pt] 的 \\[ 被当成 display math 定界符）+ 两条 KaTeX 机械校验脚本与基线"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 症状

MarkText 里出现 `<无效数学公式>` 占位符，且**一处真错显示成四五处**（用户 2026-10-24 报告「七部分图片的上面」）。

## 根因（2026-10-24 实测）

MarkText 的 KaTeX 规则把 `\[` 当作 **display math 的起始定界符**。于是 `\begin{cases}` 里的换行尺寸参数 `\\[2pt]` 被解析成「`\\` + `\[`」→ `\[` 开了一个永不闭合的 display math，KaTeX 抛

```
KaTeX parse error: Undefined control sequence: \[ at position 40: …u_i(h) & h\in Z\[2pt]
```

后续内容的 `$...$` 配对全被打乱，于是一个源头错误在渲染时放大成多个占位符。

## 判据与修法

1. **禁止在公式里写 `\\[2pt]` / `\\[4pt]` 这类换行尺寸参数**（KaTeX 不支持；且在 MarkText 里还会被当成 `\[`）。需要间距就换行即可，或用 `\\[6pt]`→`\\` + 拆成两个公式。
2. 交付前必须跑两条机械校验（脚本已入库到文档同目录 `tools/`）：
   - `node tools/check-katex.js <file.md>` —— 用 MarkText **同款** KaTeX（`~/.dsh/profiles/desktop/node_modules/katex`）逐条 `renderToString({throwOnError:true})`，覆盖行内 `$...$` 与 ```` ```math ```` 块。**基线要求：失败数 0**。
   - `node tools/check-dollar.js <file.md>` —— 逐行统计 `$` 个数（跳过代码块），奇数即说明该行公式会吞到下一行；同时查 `$$` 残留。**基线要求：异常行 0**。
3. `grep -n '\\\\\['` 必须无输出（防 `\[` / `\]` 混入）。

## 已修记录

2026-10-24：`backward-induction-逆向归纳法与最优性原理.md` 两处 `\\[2pt]` → `\\`（L74 定理 1 递归式、L205 硬币行递推式），修后 35 条公式 0 失败、`$` 配对 0 异常，md5 `9da4bdd3…`。

## 一般化教训

**渲染器 ≠ LaTeX 编译器**。在 Word/PDF 里合法的换行参数，在 KaTeX 里可能是未定义命令，而在 markdown-it-katex 里还可能撞上定界符规则。⇒ 写公式后**必须用目标渲染器实际解析一遍**，不能靠「LaTeX 里这么写没事」推断。
