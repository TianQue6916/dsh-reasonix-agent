---
id: mem-2f2be9664348df66940decbc72091d8c
revision: 1
created_at: "2026-10-28T07:01:13.214Z"
updated_at: "2026-10-28T07:01:13.214Z"
name: md2html-lite-离线katex预览
description: "md → 离线 KaTeX HTML 的单文件转换器，用于翻译产物的浏览器预览；含两个已修的死循环/错配坑"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 工具

`C:/Users/27063/.dsh/tools/md2html-lite.py`（2026-10-28 新建，随 6.042J 翻译工程 p061-080 落地）

用法：
```
python md2html-lite.py <in.md> [out.html]
```
默认输出同名 `.html`，并把 `~/.dsh/tools/node_modules/katex/dist` 的 `katex.min.css`、`katex.min.js`、`contrib/auto-render.min.js` 复制到输出目录的 `_assets/`（**离线、无 CDN**）。

支持的 Markdown 子集：ATX 标题、fenced code（` ```math ` → display math，其余 → `<pre>`）、`> ` 引用块（递归转）、有序/无序列表、管道表格、`---`、`**粗体**`、`*斜体*`、行内 code、行内 `$...$`、原始 HTML 标签透传（`<span style="color:#1e8449;">` 译注配色能保留）。`<!-- ===== pXXX ===== -->` 页块标记渲染成锚点小标题。

## 预览服务

```
python -m http.server 8123 --directory "C:/Users/27063/Documents/翻译产出/教材/6042J离散数学"
```
（Windows 下用 `Start-Process -WindowStyle Hidden` 起后台；`pwsh` 直接 `Invoke-WebRequest` 验证 200）

## 两个必踩的坑（都已修，改这脚本前先读）

1. **孤立 `|` 行会死循环**：表格分支要求「下一行是 `|---|` 分隔行」，不满足就跳过；随后段落分支的 while 条件里又排除 `|` 开头行 ⇒ `buf` 为空且 `i` 不前进 ⇒ 无限循环，`timeout` 给 RC=124 且无输出。修法：段落 gather 后若 `buf` 为空，输出该行原文并 `i += 1`。
2. **`\$` 与 `$$` 混排会错配 inline math**：`\$1,000,000` 的转义美元会被 `\$[^$]+\$` 当成公式起点，一路吃到下一个公式，导致整段被当 TeX（症状：KaTeX 报 `Expected 'EOF', got '&' at position N`，且坏式子跨度上千字符）。修法：在 keep_math 正则**之前**把 `\$` 替换成占位符，最后还原成 `&#36;`。
3. 原始 HTML 标签必须在 `esc()` 之前用占位符保护，否则 `<span ...>` 被转义成 `&lt;span` 并再次污染后续 inline math 匹配。

## 验收口径

生成的 HTML 里从 `<script>` 区块剔除后抽出 `$$…$$`（display）与 `$…$`（inline），喂 `katex-check.js` 应 0 失败；`<script>` 里的 auto-render 配置本身含 `$$` 字面量，不剔除会报 1 个假失败。
