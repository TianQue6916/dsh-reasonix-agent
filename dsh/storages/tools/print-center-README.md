# 批量打印中心（printcenter）

给 tianque 装的「一次挑多个文件、先看预览、一键全部打印」的小工具。
2026-10-07 装，纯用户态，没动系统文件、没装新依赖。

---

## 1. 问题

- tianque 上没法批量打印：想打 14 个文件，只能在文件管理器里逐个双击打开、逐个 Ctrl+P。
- PDF 的默认关联程序是 **Chrome**（`com.google.Chrome.desktop`），所以「打开 PDF」= 开浏览器 tab，打印入口藏在浏览器菜单里，跟「打印文件」这件事的心智模型对不上。
- 文档查看器（evince）/ 图片查看器（eog）里点「打印预览」没有任何反应。

## 2. 诊断（实测部分）

| 观测 | 命令 | 结论 |
|---|---|---|
| 队列被禁用 | `lpstat -p` → `从 2026年10月07日 星期三 12时52分37秒 开始被禁用 - Unplugged or turned off` | CUPS 认为打印机不在线 |
| USB 总线上没有打印机 | `lsusb -t` / 搜 HP vendor id `03f0` = 0 条 | 打印机确实物理断开（不是驱动问题） |
| PDF 默认程序 | `xdg-mime query default application/pdf` → `com.google.Chrome.desktop` | 这是「不好批量打」的直接原因 |
| GTK 打印后端不缺 | `/usr/lib/x86_64-linux-gnu/gtk-3.0/3.0.0/printbackends/` 有 `libprintbackend-cups.so` + `libprintbackend-file.so` | 预览失效**不是**缺后端 |

**假设（尚未验证）**：evince/eog 的「打印预览」失效，是由队列 disabled 引起的 —— GTK 打印对话框在拿不到可用 print backend 时会直接罢工。等打印机接上后复验：如果打印预览自己恢复了，假设成立。

## 3. 方案

**绕开 GTK 打印栈**。预览自己渲染，提交自己调 `lp`：

```
文件 ──┬─ PDF ──────────────────────────────► pdftoppm -f 1 -l 1 -r 110 -png  (预览)
       └─ 图片 ──► Pillow 内接缩放居中贴 A4 ──► 单页 PDF ──► lp -d PRINTER -o media=A4 -o sides=...
```

选这条路的理由：`pdftoppm`（poppler-utils）+ `lp`（cups-client）+ Pillow + PyGObject 全是系统自带的，
所以整套东西**零新增依赖**；而且不走 GTK，就完全不受「打印机离线导致打印对话框罢工」的影响。

具体实现（`~/printcenter.py`，534 行）：

- GTK4 + libadwaita，`Gtk.Paned` 左列表 / 右预览
- 每个文件单独一个 CUPS job（**不是**拼成一个大 job）→ 打错一页可以单独 `cancel` 重打
- 有 job 在跑时把「全部打印」置灰；每个文件的耗时/成败都用 `Adw.Toast` 或 `Adw.AlertDialog` 回报
- 打印机离线时点「全部打印」会先弹预检（「任务会排在 CUPS 队列里等着，打印机接好之后才会真的出纸」），给「先不提交 / 仍然提交」两个选择
- 预览缓存 key = `md5(path + mtime)[:12]`，存在 `~/.cache/print-center/`

## 4. 文件清单

| 路径 | 说明 |
|---|---|
| `~/printcenter.py` | 主程序，534 行，md5 `9ff9a79e520119ab5bdacddba41b9bd8` |
| `~/.local/share/applications/print-center.desktop` | 应用启动器（应用列表可搜到；也是 PDF/图片「用其他应用打开」的候选） |
| `~/.local/share/nautilus/scripts/批量打印` | 文件管理器右键 → 脚本 → 批量打印 |
| `~/.cache/print-center/prev-*.png` | 预览缓存，可随时删 |

## 5. 用法

三种入口，任选：

1. **应用列表**：搜「批量打印中心」。（如果搜不到，注销再登录一次，或跑 `update-desktop-database ~/.local/share/applications`）
2. **文件管理器右键**：选中若干文件 → 右键 → 脚本 → 批量打印。选中的文件会直接灌进列表。
3. **终端**：`python3 ~/printcenter.py 文件1 文件2 …`（不带参数就开空窗口）

窗口里：拖拽文件进去可以，点左上角「添加文件」也可以；选中左边某一行，右边显示它的第一页；
底部选打印机 / 单双面 / 份数，然后点右上角「全部打印」。

## 6. 依赖

全部系统自带，实测 tianque 上已装齐：

- `python3`（3.12.3）+ `python3-gi`（PyGObject 3.48.2）
- GTK4 / libadwaita / Gdk / Pango 的 typelib
- `python3-pil`（Pillow 12.3.0）
- `poppler-utils`（`pdftoppm`、`pdfinfo`）
- `cups-client`（`lp`、`lpstat`、`cancel`）

## 7. 验证记录

| 验证项 | 结果 |
|---|---|
| GUI 真机启动（X11 `DISPLAY=:1`） | 窗口出现，stderr 干净 |
| 15 个文件全部读出页数与大小 | 全部正确（1 页 · 162.7 KB … ） |
| PDF 首页预览渲染 | `pdftoppm -r 110` 出 910×1287 RGB PNG，界面正常显示 |
| 图片 → A4 PDF | 身份证 jpg → `Page size: 595.2 x 841.92 pts (A4)` 单页，300 dpi，358505 B |
| 提交参数 CUPS 接受 | `lp -d HP-LaserJet-M1522nf-MFP -o media=A4 -o sides=one-sided` → job `-27` 入队（已 cancel 清队列） |
| 打印机离线时的预检对话框 | 正常弹出，两个选项都在 |
| **真实出纸** | **未验证** —— 打印机物理不在线 |

## 8. 已知限制

- 每次预览都是现渲染的（缓存按 path + mtime），第一次看某页会有 0.5–1 秒延迟。
- 图片统一按 A4 内接居中排版：横图会被缩到很窄，细长截图（手机长截图）字会偏小。
- 「双面」选项依赖打印机真有 duplexer。`HP-LaserJet-M1522nf-MFP` 的 PPD 里声明了 `Duplex`，但 2008 年的入门级机型，HP 官方规格写的是**手动双面**（无自动 duplexer）。所以选「双面（长边翻页）」有可能会被打印机忽略成单面。
- 没做「打印范围」「每页份数」这类细粒度选项 —— 要这些就用 evince 自带的打印对话框。

## 9. 待办

- [ ] 打印机接上 USB 并开机后，跑一次真实出纸验证（GUI 提交 → 出纸）
- [ ] 同一次验证 evince/eog 的打印预览是否自行恢复（验证第 2 节的假设）
- [ ] 打印机接上后 CUPS 队列需要确认已自动恢复（`lpstat -p`）；若没有，跑 `cupsenable HP-LaserJet-M1522nf-MFP`
- [ ] 可选：把 PDF 默认关联从 Chrome 改成 evince（`xdg-mime default org.gnome.Evince.desktop application/pdf`）
