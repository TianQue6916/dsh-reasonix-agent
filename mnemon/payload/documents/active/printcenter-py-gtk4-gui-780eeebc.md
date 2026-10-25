---
id: "780eeebc-2b97-4d34-ae76-bfb84eeae72f"
title: "批量打印中心（printcenter.py）：GTK4 批量打印 GUI 的架构、三入口部署与已验/未验边界"
description: "2026-10-07 为小机 tianque 交付的 GTK4+libadwaita 批量打印工具的定位、三条启动入口、pdftoppm 预览 + lp 提交的实现取舍、离线预检容错、PC_AUTOTEST 自测开关，以及「除真实出纸外全部已验证」的边界。补充 afd8d372（CLI/CUPS 链路）而非重复。"
status: "active"
created_at: "2026-10-07T05:55:00.252Z"
updated_at: "2026-10-07T05:55:00.252Z"
content_hash: "bfb1596006db5525bd53f562c8faea8c7cb91f0e13762e1f5e21528d2d8fe1c3"
source_paths:
  - "printcenter.py"
  - "printcenter-README.md"
  - "print-center.desktop"
session_ids:
  - "883074c5-7c9a-4a65-92e1-9fd90b1f3b31"
memory_body_ids:
  []
---

# 批量打印中心（printcenter.py）

2026-10-07 交付。**配套文档**：`afd8d372-c414-483e-a91b-c5ecb66219c9`（小机 tianque 的 CUPS 打印链路）记录的是 `tar|ssh` → Pillow 规整 A4 → `lp` 的**命令行**流程与「驱动声明双面、硬件实为手动双面」的坑；本文记录的是在其之上包的一层 **GUI 工具**及其部署方式。两者互补，不重复。

## 交付物与真实路径

| 组件 | 位置 | 大小 / 校验 |
|---|---|---|
| 主程序 | `tianque:/home/tianque/printcenter.py` | 21751 B / 534 行 |
| 应用启动器 | `tianque:~/.local/share/applications/print-center.desktop` | 445 B，`desktop-file-validate` → VALID |
| 文件管理器右键入口 | `tianque:~/.local/share/nautilus/scripts/批量打印` | 295 B |
| 交付文档 | `tianque:~/printcenter-README.md` | 6146 B，md5 `5d57805be3335e9bcb74946e978e0c34` |

本机归档副本（只读快照）：`C:/Users/27063/.dsh/storages/tools/{printcenter.py,print-center.desktop,print-center-README.md}`。
源码可用 `cat p1..p7 > printcenter.py` 方式分片重组（分片补丁流程见下文「修补方式」）。

## 三条入口（都可直接用）

1. **应用列表**：搜「批量打印中心」（`.desktop` 的 `Exec=python3 /home/tianque/printcenter.py %F`，`MimeType=application/pdf;image/jpeg;image/png;image/webp;image/tiff;`）。改完 desktop 文件要跑 `update-desktop-database`（已跑，输出 `desktop-db: updated`）；搜不到就注销重登一次。
2. **Nautilus 右键**：选中多个文件 → 右键 → 脚本 → 批量打印，选中项直接灌进列表。（注意 `Categories=Utility;Office;Graphics;` 会触发 `desktop-file-validate` 的 "contains more than one main category" hint，只是 hint，VALID 不受影响。）
3. **终端**：`python3 ~/printcenter.py 文件…`。

## 设计与取舍（关键「because」）

- **绕开 GTK 打印栈**：预览用 `pdftoppm` 渲染、提交用 `lp`，**不碰** GTK print backend。原因：`Gtk.init_check -> False` → `Gtk.PrintOperation` 路径在队列 disabled 时整个打印预览对话框罢工（probe 两页全空白）。自建链路不受此影响。
- **图片 → A4 单页 PDF**：Pillow 等比缩放 + 居中贴白底；实测身份证 jpg 转出 `Page size: 595.2 x 841.92 pts (A4)` 单页、300 dpi。
- **每个文件一个独立 CUPS job**（不拼成一个大 job），所以打错某一页可以单独 `cancel` 重打；出纸顺序 = 提交顺序。
- **预览渲染用 `set_paintable` 而非 `set_filename`**：早期 WID 截图出现预览区空白，追查后确认是 `import` 抓 GL 窗口的**重绘竞态**，不是 `Gtk.Picture.set_filename` 失效；`set_paintable` 版本更可控且带日志。
- **离线时不静默失败**：打印机停用时点「全部打印」会先弹预检对话框（「打印机当前不可用 / 任务会排在 CUPS 队列里等着」），给「先不提交 / 仍然提交」两个选择。
- **`PC_AUTOTEST=1` 自测开关**：`GLib.timeout_add(2000, self._autotest)` 自动触发 `on_print(None)`，用于无人值守验证预检链路（线上截图即由此产生）。

## 修补方式与踩过的坑

- 用编号分片补丁（`PATCHED <n> chars`）+ `python3 -m py_compile`（`COMPILE_OK`）+ 每次部署后 `md5sum` 对齐本机与远端。所有命令前置 `timeout`。
- 踩坑：分片拼接把手写字符串切成两半 → `SyntaxError: unterminated string literal (detected at line 514)`；以及用未定义常量 → `NameError: name 'NL' is not defined`（改为 `chr(10)` 后 `COMPILE_OK`）。教训：**改完必须编译校验再部署**。
- 截图路径：WID 从 `xwininfo` 树的 `0x2200004 "批量打印中心"` 取，用 `import -window <WID>`；`gnome-shell` 的 GDBus `Screenshot.Screenshot` 报 `AccessDenied: Screenshot is not allowed`（正常现象，需 gnome-shell 内部调用）——该路径已放弃。
- 本机 `/tmp` 实际是 `C:/Users/27063/AppData/Local/Temp`，`read_image` 必须用 Windows 路径（`cygpath -w`）。

## 已验证 vs 未验证（边界，别夸大）

**已验证（有实机证据）**：GUI 真机启动；15 个文件全部读出页数（「15 个文件 · 共 15 页」）；`pdftoppm` 预览渲染正常（三张截图逐次修正）；`lp -d HP-LaserJet-M1522nf-MFP -o media=A4 -o sides=one-sided` 被 CUPS 接受（job `-27`，已 cancel 清队列）；`PC_AUTOTEST` 触发预检对话框；三入口文件均已落地并通过校验。

**未验证**：**真实出纸**。打印机自 `12时52分37秒` 起被 CUPS 标记 `Unplugged or turned off`（两个队列均如此），`lsusb` 上无 HP 设备。

**未验证的假设**：用户原先「打印预览没反应」的成因是 GTK 打印对话框依赖可用 print backend、队列 disabled 时罢工。`evince`/`eog` 与 `printcenter.py` 走两套不同路径，插上打印机后可借此假设验证。

## 插上打印机后的待办（README 第 9 节）

1. 真实出纸验证（GUI 点「全部打印」→ 纸出来）。
2. 验 `evince`/`eog` 预览是否自行恢复，以证实/否证上面的假设。
3. 确认 CUPS 队列自动恢复（`lpstat -p`）；没恢复跑 `cupsenable HP-LaserJet-M1522nf-MFP`。
4. 可选：PDF 默认关联是否从 Chrome 改成 evince。

## 隐私提醒

`tianque:/home/tianque/print-spool-20261007/` 留有 15 个原始件 + 15 个 A4 PDF，含身份证、病理报告、出院记录（用户已知晓，留着方便重打；不需要时删掉）。
