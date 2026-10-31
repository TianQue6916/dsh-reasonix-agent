---
id: mem-cef59b756771b2682d0a2c208bff2bc0
revision: 1
created_at: "2026-10-27T20:03:54.884Z"
updated_at: "2026-10-27T20:03:54.884Z"
name: cover信息论目录实为mackay-itila
description: "源料鉴定：`源料-教材/Cover信息论/*.pdf` 实为 MacKay《ITILA》，PDF 页 = 书内页 + 12"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 结论（2026-10-28 核实）

`C:/Users/27063/Documents/源料-教材/Cover信息论/Cover信息论_pXXX-YYY.pdf`（13 份，每份 20 页）**不是 Cover & Thomas《Elements of Information Theory》**，而是 **David J.C. MacKay《Information Theory, Inference, and Learning Algorithms》(Cambridge UP 2003, Version 7.2 / 4th printing 2005)** 的分块 PDF。目录名 `Cover信息论` 只是分类桶名（与 `04-snapshots/00-16_mackay.pdf` 1054 页分章版可能同源）。

## 判别证据
- 每页页脚：`Copyright Cambridge University Press 2003. On-screen viewing permitted. Printing not permitted. http://www.cambridge.org/0521642981` + `See http://www.inference.phy.cam.ac.uk/mackay/itila/ for links.`
- 页眉为 MacKay 节号：`4.1: How to measure the information content of a random variable?`、`4 -- The Source Coding Theorem`、`5 -- Symbol Codes`、`5.5: Optimal source coding with symbol codes: Huffman coding` 等。
- 术语属 MacKay 体系：raw bit content $H_0(X)$、essential bit content $H_\delta(X)$、smallest $\delta$-sufficient subset、typical set $T_N$、Huffman coding algorithm、Kraft inequality。**没有** Cover 的 AEP / entropy rate / stationary process。

## 页码映射（恒定）
**PDF 页 = 书内页 + 12**。即 `p081-100` = 书内 p069-p088（§4 全章），`p101-120` = 书内 p089-p108（§4.8 Solutions 尾 + §5 Symbol Codes 全章）。

## 产出位置（已按此改名）
`C:/Users/27063/Documents/翻译产出/教材/MacKay信息论/Cover信息论_pXXX-YYY.bilingual.md`（保留原 PDF 文件名做 stem，便于下游对回源料）。头行元信息写「源书：MacKay ITILA …，本块 PDF pXXX-pYYY = 书内 pXXX-pYYY」。

## 教训
派翻译任务前必须先 `pdftotext` 抽一页页脚确认书目，不能只信目录名——本次因此白写了 5 页内容并返工（页界重排 + 删除一段臆造参考文献著录）。
