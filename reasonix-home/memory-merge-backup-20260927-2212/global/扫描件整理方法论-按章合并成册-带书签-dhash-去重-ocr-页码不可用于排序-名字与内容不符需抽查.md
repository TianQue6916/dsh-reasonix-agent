---
id: mem-702355f04c098e8fc5d1fb73cc6727c2
revision: 1
created_at: "2026-09-23T08:33:26.987648Z"
updated_at: "2026-09-23T08:33:26.987648Z"
name: 扫描件整理方法论-按章合并成册-带书签-dhash-去重-ocr-页码不可用于排序-名字与内容不符需抽查
description: 扫描件整理方法论：按章合并成册（带书签）+ dHash 去重；OCR 页码不可用于排序；名字与内容不符需抽查
metadata:
  type: user
  fact_type: project
  scope: global
---

# 扫描件合并去重整理（2026-09-23 实战）

## 背景
WPS 知识库的扫描页（手机「扫描全能王」产物）既散又重复：同一页常被扫多次。CSAPP 第8章 58 个单页 PDF 实际只覆盖 p.502-537；6.042J 第18章 53 页实际只覆盖 p.739-765。

## 方法（两个脚本，均可用）
1. **合并**：`D:\gh-publish\_scripts\merge_scans.py` —— 按「章」目录聚合，同小节按序号排序，图片(jpg)用 `fitz.open(p).convert_to_pdf()` 转页，输出带 **小节书签**（`out.set_toc([[1,label,page]])`）的整册 PDF。
2. **去重**：`D:\gh-publish\_scripts\dedup_scans.py` —— 每页渲染 dpi=72 → **dHash**（8x8 灰度差分）→ hamming 距离 ≤ 4 视为同一页，保留首个；支持 `dedup_scans.py <pdf> <out> [key]` 单文件模式。
   - 实测效果：CSAPP 第2章 35→27、第8章 58→38、6.042J 第18章 53→33；线代两册无重复（58/36 原样）。

## 重要教训
1. **别用 OCR 页码排序**：中文教材页眉/正文里的数字会被误读成页码（出现 100/128/213/345 等垃圾值），据此排序会把顺序彻底打乱。页码仅作参考，**保留原扫描顺序**更安全。
2. **OCR 页码可用于抽查**：`ocr_scan.py`（Windows OCR，`winrt.windows.media.ocr`，本机语言 zh-Hans-CN）能可靠识别英文书页脚（`page 739`）与 CSAPP 页眉的三位数（`502`），用来发现「重复扫描」很有效。
3. **「名字与内容不符」真实案例**：6.042J 知识库里名为「附录_Bibliography_参考文献」的 PDF 实为**教材英文原书全本（920 页）**——知识库目录是用户随手建的，命名不可信，必须抽查内容。
4. **知识库 docx 是空壳**：docProps core.xml 的 creator 全是 `python-docx`、Words=0、缩略图同一 8324 字节，说明这些 Word 只是「章节标题占位」，没有正文。
5. 合并时注意 **单文件 <100MB**（GitHub 硬限制）：CSAPP 第8章合并后 77MB，去重后 47.5MB。

## 长路径坑
6.042J 仓库路径极深（章节/小节/小节/同名 docx），Windows clone 会 checkout 失败并**把 index 全部标记为 deleted**（`git status` 全是 `D `）。修复：`git config core.longpaths true` + `git -c core.longpaths=true reset --hard HEAD`。push 前必须确认 `git ls-files` 数量正常，否则会误删远程文件。
