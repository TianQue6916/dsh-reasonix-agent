---
id: mem-45d3095647fc59fcf1726d406effe6bf
revision: 1
created_at: "2026-10-27T20:18:09.102Z"
updated_at: "2026-10-27T20:18:09.102Z"
name: MacKay信息论译校-两处硬坑
description: "MacKay《Information Theory》PDF 文本层非 UTF-8 + 并发 worker 覆盖同一产出文件的排障定论"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 坑 1：pdftotext 输出不是 UTF-8（MacKay 源料，截至 2026-10-28）

`C:/Users/27063/Documents/源料-教材/Cover信息论/Cover信息论_p*.pdf`（实为 MacKay 书，目录名是历史误标）。

`pdftotext -layout` 出的 txt 里含裸 latin-1 字节（实测 `0xd7` 乘号、`0xa1`、`0xb7`、`0xa8`、`0xaf`、`0xb1`、`0xb5`），`read` 工具直接读会报 `invalid UTF-8 text`。

修法（已验证）：逐字节 `<0x80` 原样、否则 `bytes([c]).decode('latin-1')`，另存 `*_u.txt` 后再用 `read`。
- `pdfplumber` 可读但对这两个 PDF 会把词粘在一起（`Wenowconsider`），不如上面那条。
- `pdftotext` 出的数学公式几乎全毁：`≠ ≥ ≤ ∈ Σ ∫` 与其上下限丢失，(9.15)/(9.19)/(9.20)/(9.23)/(10.28)/(11.11)/(11.33) 等都是碎片，必须按语义重建 + 加灰色「排版复原/复算校验」注。
- `headroom` 会把超过约 2–3 KB 的 bash 输出折叠（出现 `… [N lines omitted]`），读源文时用 `read` 工具按 100–125 行窗口读，不要用 `sed -n 1,130p` 一次性打。

## 坑 2：多 worker 并发写同一 bilingual.md（2026-10-28 04:14 实测）

worker 完成 cat 落盘后，**同一路径被另一 worker 在数分钟内覆盖**（`MacKay信息论_p161-180.bilingual.md` 64718 B → 63128 B，内容版本不同）。同目录 04:13–04:14 还冒出 p121-140 / p141-160 / p201-220。

纪律：派单时给每 worker 独占块号；交付前 `md5sum` + `mtime` 复核，并检查文件头是否是自己的版本（例如自己有「排版复原/复算校验」灰注）。发现被覆盖要立即向 parent 报，不要默不作声地重复覆盖。
