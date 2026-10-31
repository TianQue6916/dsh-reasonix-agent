---
id: mem-dcb3b996ed495263d73ee977263057c7
revision: 1
created_at: "2026-10-27T20:31:29.328Z"
updated_at: "2026-10-27T20:31:29.328Z"
name: learn-translate-补注-worker-纪律
description: "给已译教材补译者注时的四条硬纪律：行级插入、子序列验证、跨文件查重、只写 _补注 目录"
metadata:
  type: user
  fact_type: feedback
  scope: global
---

## 背景
2026-10-28 夜，多个 learn-translate worker 并发处理 `C:/Users/27063/Documents/翻译产出/教材/<书名>/`。父代理点名两起事故：① 有 worker 反复改写 `Boyd凸优化/p201-220`（字节 84K→148K→162K→100K 抖动），原作者无法定稿；② `MacKay信息论_p161-180` 一个版本因并发写入丢失。KaTeX 校验查不出这类问题。

## 四条纪律（补注 worker 必须遵守）
1. **只写 `_补注` 子目录**：脚本一律 `open(SRC).read()` → `open(DST).write()`，SRC = 原目录，DST = `<书名>_补注/`。永不写原目录。改成 `open(path,"w")` 指向原目录=事故。
2. **行级插入，不要 `anchor+len(anchor)` 句中插入**。句中插入会把原文一行劈成两半（每个 Markdown 段落是单行），读者看到的是断句。正确做法：`idx = [i for i,l in enumerate(lines) if key in l]`，`assert len(idx)==1`，`lines.insert(idx+1, "")` + `lines.insert(idx+2, note)`。key 必须选**散文行**，不能落在 ```` ```math ```` fence 内（否则注进公式块，KaTeX 报 `Expected 'EOF', got '#'`）。
3. **子序列验证代替 md5 比较**：验证「SRC 的每一行按序都是 DST 的子序列」——`it=iter(dst); all(any(x==y for y in it) for x in src)`。这一步当场抓出了上述 bug（p061-080 该项 False）。
4. **跨文件/跨 worker 查重**：原目录可能已被同批 worker 加过注（判据：grep `[译注]` / `[note]` / `#1e8449`）。发现同质注要整条换角度，而不是并列两条。示例：MacKay p141-160 的 `$I(X;Y|Z)$ 与 Venn 负面积` 与已有注完全同质 → 换成 `MAP vs ML 判决差异`；p181-200 已有「Gaussian capacity / −1.59 dB」→ 改做 §10.6 computing capacity 的凹性↔Boyd KKT。

## 标签
译者注统一 `<span style="color:#1e8449;">**[译注]**</span>`（绿色），严禁蹭原书 `[remark]/[theorem]/[definition]` 的配色。

## 页面偏移（MacKay ITILA）
**书页 = PDF − 12**（证据两点：源料 `MacKay信息论_p261-280.pdf` 首页页眉 `17.1: ... 249`；译文自带 `p.47 ⇄ 书内 p.35`）。Boyd：**书页 = PDF − 14**（证据：PDF 61 页眉 `2.5 Separating and supporting hyperplanes 47`）。

## 临时文件
一律 `C:/Users/27063/AppData/Local/Temp/`；**禁写 `/tmp/`**（Git Bash 与 Windows python 的 /tmp 不是同一目录）。每条 shell 前置 `timeout`（默认 30–60s，重活 120s）。
