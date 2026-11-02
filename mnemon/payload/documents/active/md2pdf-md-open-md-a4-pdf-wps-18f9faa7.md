---
id: "18f9faa7-6c6d-41be-97a4-9aa380c911b4"
title: "md2pdf / md-open 落地实现：点开 md 才导出横版 A4 PDF 并交 WPS 同步（运行、行为与回滚）"
description: "在 showSaveDialog 劫持方案（文档 d42cd4e5）之上完成的可运行交付：~/.local/share/md2pdf 定制 Electron 运行时、~/.local/bin/md2pdf CLI、~/.local/bin/md-open 触发层、marktext.desktop Exec 改写；含\"用户点击才做、无常驻 watcher\"的行为契约、保存后增量重导、长代码行折行修复、实测耗时与回滚步骤。"
status: "active"
created_at: "2026-11-02T08:39:40.001Z"
updated_at: "2026-11-02T08:39:40.001Z"
content_hash: "86e6651e9eb5e7184de3a80b8092f288ba38db91a97103aaf92eadff429a4eb6"
source_paths:
  []
session_ids:
  - "9894e163-30db-4643-a44d-524a8eb3d948"
memory_body_ids:
  []
---

# md2pdf / md-open 落地实现（MarkText 原生渲染 → 横版 A4 PDF → WPS 同步）

前置方案与原理（劫持 `dialog.showSaveDialog`、走官方 `handleExport`、源码定位）见文档 `d42cd4e5-d2bd-437b-9da4-7bee812d9f33`。本文只记录**该方案落地成可用交付物之后**的形态、行为契约、实测数据、缺陷修复与回滚，不重复原理推导。

## 用户裁定的行为契约（关键约束）

在「常驻 watcher（A）／改 `.desktop` Exec（B）／两者都上（C）」三选一中，用户明确选择**只在自己点击某个 markdown 文件（有打开意图）时才渲染和上传**，即 B 路线：

- 不做常驻 watcher、不定时扫描目录；
- 只在「文件被打开」这一事件发生时触发导出 + 交给 WPS；
- 导出在后台执行，不阻塞编辑器启动。

后续任何扩展（加 watcher、批量预转换、常驻 worker）都需先回问用户，因为默认契约就是「点击才做」。

## 三件交付物

| 路径 | 作用 |
|---|---|
| `~/.local/share/md2pdf/` | 定制 exporter 运行时：`marktext` 为 Electron 二进制（从 `/opt/marktext/marktext` 复制，约 201MB），`icudtl.dat`/`resources.pak`/`locales` 等 symlink 回 `/opt`，`resources/app/main.js`（约 4.5KB）是接管逻辑本体 |
| `~/.local/bin/md2pdf` | CLI：`md2pdf FILE.md [FILE2.md ...] [--wps] [--force] [--portrait] [--margin-tb=] [--margin-lr=] [-q]`，可脱离 GUI 批量转换 |
| `~/.local/bin/md-open` | 用户点击 md 时的入口：先 `execv` 起 MarkText（即时响应约 0.37s），再 fork+setsid 脱离会话做后台导出与跟踪 |

系统配置只改一处：`~/.local/share/applications/marktext.desktop` 的 `Exec=/home/tianque/.local/bin/md-open %U`。

- 原文件备份为 `marktext.desktop.bak-20261102-*`；
- 系统级 `/usr/share/applications/marktext.desktop` **未改动**；
- `xdg-mime query default text/markdown` 仍返回 `marktext.desktop`。

## 运行链路（落地版）

```
md-open FILE.md
  ├─ execv MarkText（立刻，用户可见）
  └─ fork+setsid 后台：
       ~/.local/share/md2pdf/marktext --no-sandbox --disable-gpu \
         --user-data-dir=~/.cache/md2pdf/profile  FILE.md
         → 自定义 main.js 先劫持 dialog.showSaveDialog
         → require(asar/out/main/index.js) 启动真 MarkText 主进程
         → 等窗口 title == 文件名
         → send('mt::show-export-dialog','pdf')
         → executeJavaScript 点 button.button-primary（文案 "Export..."）
         → 官方 handleExport → exportStyledHTML({printOptimization:true}) → printer.renderMarkdown(html,true)
         → 回到被劫持的 showSaveDialog → printToPDF({landscape:true, pageSize:'A4', ...})
       → 若 --wps：唤 `wps <pdf>` 打开，触发 WPS 云自动同步
       → 跟踪期 5s 轮询 mtime，变化后 debounce 2s 重新导出（不再弹新的 WPS 窗口）
       → MarkText 退出后跟踪进程自行结束，不留常驻进程
```

`--user-data-dir=~/.cache/md2pdf/profile` 用于与用户真实 MarkText 配置隔离，避免污染设置与窗口状态；代价是首次冷启动略慢。

## 实测数据

- 探针文档（粗体/斜体/行内代码/行间公式/表格/Python 代码块/引用）：2 页，A4 横向 `842.88 x 595.92 pts`，Producer `Skia/PDF m148`；`pdftotext` 可提取全部文本，证明是矢量文本而非截图。
- 真实笔记 `006-r16-编辑距离-为什么不能局部贪心.md`：4 页、1009–1328 KB、端到端 7.0s。
- 真实笔记 `006-r16-dp-树与链判别.md`：6 页、1297 KB、7.1s。
- 单份总耗时约 5–7s，其中约 5s 是 Electron 冷启动；UI 全程不阻塞。

## 已修复的 upstream 缺陷：长代码行截断（#5307 / #5460）

MarkText 在纸面上会截断超过页宽的长代码行。修复是在 `printToPDF` 之前注入

```css
pre, code { white-space: pre-wrap; word-break: break-all }
```

验证：单行 457–458 字符的代码在 PDF 中折成 4 行，尾部哨兵 `ENDMARK_LONG_LINE_TAIL` 完整出现，且其后的普通段落未被吞掉。

## 日志与排查

`~/.cache/md2pdf/md-open.log`：

```
track start <path>
export <name>.md wps=True rc=0 ✓ <name>.pdf 1009 KB 7.0s
```

stderr 侧有 `[mt2pdf] title ready` / `dialog clicked:Export...` / `showSaveDialog intercepted; printing...` / `WROTE <path> <bytes> in <ms> ms`。

## 回滚

```bash
cp ~/.local/share/applications/marktext.desktop.bak-20261102-* \
   ~/.local/share/applications/marktext.desktop
rm -rf ~/.local/share/md2pdf          # 释放约 210MB
rm -f ~/.local/bin/md2pdf ~/.local/bin/md-open
```

## 已知取舍 / 未做项

- **WPS 弹窗**：当前「首次导出用 WPS 打开，后续更新只静默替换文件」。若嫌吵可加 `--no-wps`，或改为「WPS 已开则不新弹」。
- **7s 偏慢**：压到约 1s 需长驻 worker（复用隐藏 MarkText 进程），会引入常驻进程、与「点击才做」契约相关，须用户拍板。
- **无页码 / 页眉页脚**：`handleExport` 支持 `header/footer/headerFooterStyled`，当前未接线。
- 仍需接受的 upstream 未修缺陷：RTL 文字方向（#4874）、sequence 图箭头（#5561）、导出容器混入布局（#5542）。

## 环境事实（复现所需）

- marktext 0.19.1 / Electron 42.1.0，安装在 `/opt/marktext`；`app.asar` 内 `out/renderer/assets/index-Bjcbqr7S.js` 偏移 6220488 附近即 `handleExport`。
- GUI 相关命令需 `DISPLAY=:0 XAUTHORITY=/run/user/1000/.mutter-Xwaylandauth.CFYFY3`，否则报 `Missing X server or $DISPLAY`。
- 已有校验工具：`pdftoppm` / `pdfinfo` / `mutool` / `gs` / `convert`；无 pandoc、libreoffice、inotify-tools。
- 当前模型中 `deepseek-v4.1-flash` 不支持图像输入，`read_image` 不可用，PDF 只能靠 `pdftotext` 做文本层校验。
- `/opt/marktext/marktext` 无法 hardlink 到其它目录（`Invalid cross-device link`），只能整份复制；复制后运行时文件用 symlink 回 `/opt` 以省空间。
