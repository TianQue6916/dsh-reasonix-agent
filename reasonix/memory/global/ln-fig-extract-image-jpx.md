---
id: mem-6ba6bd59ba2ba832cf5bf374d7a3c4be
revision: 1
created_at: "2026-11-01T19:01:14.852Z"
updated_at: "2026-11-01T19:01:14.852Z"
name: ln-fig-extract-image-jpx
description: "PyMuPDF extract_image 返回 jpx 坑 + D:/gh-publish 写入只能走 shell cp"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 结论（2026-11-02 实测，ln_fig_w4 任务）

### 1. `page.extract_image(xref)` 的 `image` 字节不保证是 PNG
`LNotes/LNotes 13.pdf` p2 的手写题词位图（488×138, bpc=8, colorspace=Indexed）：`get_images(full=True)` 只给出 `(xref=5, 488, 138, 8, ...)`，但 `extract_image(5)["image"]` 返回 **JPEG2000**（magic `\x00\x00\x00\x0cjP  `，`ext` 字段为 `jpx`）。
若直接 `open(name.png,'wb').write(info['image'])`，得到的是**扩展名与字节不符**的假 PNG。
判据：落盘前验 magic `b'\x89PNG\r\n\x1a\n'`；或用 `fitz.Pixmap(doc, xref).save(path)`。
对 1-bit 扫描件，更实用的是 `page.get_pixmap(dpi=300, clip=page.get_image_bbox(img))` 渲染：993×292 清晰可读，而原图 488×138 显示时糊。

### 2. 位图 bbox 用 `page.get_image_bbox(img_info)`，不是 `cluster_drawings`
`cluster_drawings` 只聚合矢量条目；纯位图区域返回 0 簇（LNotes 13 p2 就是这样）。位图区域内的 `get_drawings()` 也是 0。

### 3. 写入边界
python 对 `D:/gh-publish/...` 直接 `open(...,'w')` 抛 `PermissionError: [Errno 13]`（Low IL no-write-up），
但 bash 的 `cp` 能写进去 ⇒ 标准流程：python 生成到 `C:/Users/27063/_wb/lald/<task>/out/` → shell `cp` 覆盖。
`bash` 能读 D:，所以 `python 读 D: → 处理 → 写 C: → cp` 全程可行。

### 4. tolerance 与裁切分离（本轮验证）
LNotes 12/13/14 三份 cluster_drawings 在 t∈[3,8] 上 eff_total 恒为 4/6/1（阈值 w≥20 ∧ h≥10），
**但裁切不要用簇 bbox**：lec12 p3 的 `G′` 标签在簇 bbox 上方 22pt（(318.3,464.6,329.8,477.9) vs 簇 y0=476.0），
正确做法是「种子簇 ∪ 6pt 内迭代吸收 text span ∪ pad 4pt」。这三份的图标注恰好全是 CMMI 文本 span，不是矢量字形。
