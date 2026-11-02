---
id: "d42cd4e5-d2bd-437b-9da4-7bee812d9f33"
title: "MarkText 自带渲染链路导出横版 A4 PDF：showSaveDialog 劫持方案与实测证据"
description: "用 MarkText 自己的 Electron 42 起其 main 进程、劫持 showSaveDialog 并自动点 ExportDialog，从而零改动渲染层拿到 100% 保真的横版 A4 PDF；含渲染链路源码位置、实测数据、upstream 已知打印缺陷与待决项。"
status: "active"
created_at: "2026-11-02T08:34:33.237Z"
updated_at: "2026-11-02T08:34:33.237Z"
content_hash: "5b2673679ff37a8ea15be81e5c58d6aef0e53a45273892e4e8bc5c5b1019fbd9"
source_paths:
  []
session_ids:
  - "f82f8b77-9d8c-472b-8bfb-ba75b0d3d2a9"
memory_body_ids:
  []
---

# MarkText 横版 A4 PDF 自动导出（保真方案）

目标需求：md 文件保存后自动生成 **A4 横向** PDF，再交给 WPS 打开以触发其自动同步到 WPS 云。

## 结论（已验证可跑）

MarkText 没有 CLI 导出，但**可以零改动渲染层**完成自动化：PDF 导出链路上只有一个人工环节 —— `dialog.showSaveDialog`。把它替换掉即可。

实测输出（`/tmp/testdoc.pdf` → `~/桌面/输出文件/marktext渲染探针-横版A4.pdf`）：

```
[mt2pdf] title ready: testdoc.md
[mt2pdf] dialog clicked: Export...
[mt2pdf] showSaveDialog intercepted; printing...
[mt2pdf] WROTE /tmp/testdoc.pdf 220929 bytes in 4814 ms
Page size: 842.88 x 595.92 pts (A4)   Pages: 2   Producer: Skia/PDF m148
```

`pdftotext` 校对：标题、粗/斜/行内代码混合段落、行内 `$E=mc^2$`、行间 `\int_0^\infty e^{-x^2}dx`、两张表格、Python 代码块、引用块全部齐全，**是矢量文本而非截图**。

## 实现步骤

1. 把 `/opt/marktext/marktext`（Electron 42.1.0）复制出来，同级文件全部 symlink，只放自己的 `resources/app/{package.json,main.js}`，`resources/static → /opt/marktext/resources/static`。
2. 在自己 main 里 `require('/opt/marktext/resources/app.asar/out/main/index.js')`（asar 透明读、依赖自解析），启动完整 MarkText。
3. **在启动之前**替换 `dialog.showSaveDialog`，接管后改调 `webContents.printToPDF({printBackground:true, landscape:true, pageSize:'A4'})`。
4. 主进程等窗口 title 变成 md 文件名（确认已加载）→ `webContents.send('mt::show-export-dialog','pdf')`。
5. `executeJavaScript` 点掉弹窗里 `button.button-primary`（文案 `Export...`）→ 触发官方 `handleExport`。

关键点：**方向和纸张不必去操作弹窗的 el-select**。渲染侧只负责 `printer.renderMarkdown(html,true)` 生成打印视图，pageSize / landscape 完全由 main 侧 `printToPDF` 参数决定，横版一行参数搞定。

## 渲染链路（源码真相）

`app.asar` 解出的 `out/renderer/assets/index-Bjcbqr7S.js`，`handleExport` 位于偏移 6220488：

```
menu → webContents.send('mt::show-export-dialog','pdf')
  → emitter.emit('showExportDialog') → ExportDialog 弹窗（挂在 renderer 的 onMounted，偏移 6901080）
  → 用户点「导出」→ ipc 'mt::response-export' {type,pathname,title,pageOptions}
  → main: dialog.showSaveDialog → webContents.printToPDF({printBackground:true, pageSize, landscape})
```

`pdf` 与 `print` 两条分支都是先 `editor.exportStyledHTML({printOptimization:true, extraCss, toc, header, footer, headerFooterStyled})` → `printer.renderMarkdown(html,true)`；`styledHtml` 走同一函数但 `printOptimization:false`。`printToPDF` 调用点在 `out/main/index.js:19399`。

## 环境事实（本机 Linux）

- marktext 0.19.1 / Electron 42.1.0，装在 `/opt/marktext`；md 关联 `marktext.desktop`（`Exec=/opt/marktext/marktext %U`）。
- **无** pandoc / libreoffice / inotify-tools；python3 3.14.4；node 可用；npm registry 200，**pypi 超时**。
- 有 pdftoppm / pdfinfo / pdftotext / mutool / gs。
- 跑 GUI 需 `DISPLAY=:0 XAUTHORITY=/run/user/1000/.mutter-Xwaylandauth.*`，否则 `Missing X server or $DISPLAY`。
- WPS 侧：账号已登录，但 Linux 版**没有可用同步文件夹**（`~/.config/Kingsoft/WPSCloud.conf` 中 `kicSyncFolderSwitch=false`、`lsync\folder` 空、`AutoSync=0`；`~/文档/WPS Cloud Files/` 里只有 `.1819888819/` 缓存库）。用户澄清：**用 WPS 打开该 PDF 即自动同步**，所以"上传层"= `wps <pdf>`，不需要抓 kdocs API token。

## 社区调研结论

- MarkText 官方明确无 CLI/API 导出（`docs/CLI.md` 只有 `--debug/--safe/-n/--user-data-dir/--disable-gpu/-v/-h`），社区把批量导出指向 pandoc 等外部工具；**自动点 ExportDialog 在社区零先例**。
- 通行范式是文件监听 + 独立渲染器（md-to-pdf + Puppeteer、entr + pandoc、hotfold 等），html→pdf 压倒性走 headless Chromium。
- 但 upstream v0.20.0-rc 仍在修 PDF 打印 bug（#5307/#5460 长代码行在纸上被截断、#4874 RTL 方向、#5561 sequence 图箭头丢失、#5542 导出容器混入布局）——绑定官方链路即继承这些缺陷；对应缓解手段是 printToPDF 前注入 `pre, code { white-space: pre-wrap; word-break: break-all }`。

## 备选方案（未采用，留作兜底）

- R2：自行 marked/markdown-it + katex 生成 HTML，仍用本机 Electron 42 printToPDF，样式从 asar 抽 `index-qxyts-q3.css` + KaTeX/DejaVu 字体 → 视觉约 90%，但 DOM 非 muya。
- R3：pandoc + texlive → 保真差、texlive 1GB+、本机未装。

## 待决 / 已知权衡

- **触发层**：`systemd --user` + inotify watcher（debounce 2s，覆盖面最全）vs 改 `marktext.desktop` 的 `Exec` 包装脚本（只在打开时跑，但终端/vim 改动漏掉）。
- **WPS 打开时机**：每次生成都打开（会频繁弹窗）vs 仅当无该 PDF 窗口时打开 vs 只在"打开 md"那次打开。
- **托管目录范围**：`~/桌面/待处理文件夹`、`~/桌面/code learn`、`~/桌面/输出文件` 三者取舍，或全 `~/`。
- **性能**：单份 4.8s，绝大部分是 Electron 冷启动；文件多时需常驻 worker 复用进程（可压到 ~1s）。
- 页边距/页眉页脚/页码是否定制（当前 0.6in 上下、0.5in 左右）。
