#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""批量打印中心 (Batch Print Center)

一次挑选 / 拖入多个文件 -> 逐份显示页数 + 第一页预览 -> 一键全部提交到 CUPS。
图片自动套 A4 白页并居中；预览用 pdftoppm / Pillow 自行渲染，
不经过 GTK 那个坏掉的打印预览部件。

依赖（Ubuntu 24.04 均已预装）：
    GTK4 + libadwaita + PyGObject + Pillow + poppler-utils + cups-client
"""
import hashlib
import os
import subprocess
import sys
import tempfile
import threading

import gi

gi.require_version("Gtk", "4.0")
gi.require_version("Adw", "1")
gi.require_version("Gdk", "4.0")
gi.require_version("Pango", "1.0")
from gi.repository import Adw, Gdk, Gio, GLib, Gtk, Pango  # noqa: E402
from PIL import Image  # noqa: E402

APP_ID = "cn.tianque.PrintCenter"
CACHE_DIR = os.path.join(GLib.get_user_cache_dir(), "print-center")
os.makedirs(CACHE_DIR, exist_ok=True)

A4_300 = (2480, 3508)
IMG_EXT = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".webp", ".gif"}
ENV = dict(os.environ, LC_ALL="C")


def run_cmd(args, timeout=25):
    try:
        p = subprocess.run(args, capture_output=True, text=True, timeout=timeout, env=ENV)
        return p.returncode, ((p.stdout or "") + (p.stderr or "")).strip()
    except Exception as exc:
        return -1, str(exc)


def is_pdf(path):
    return path.lower().endswith(".pdf")


def is_image(path):
    return os.path.splitext(path)[1].lower() in IMG_EXT


def page_count(path):
    if is_pdf(path):
        rc, out = run_cmd(["pdfinfo", path], timeout=20)
        if rc == 0:
            for line in out.splitlines():
                if line.startswith("Pages:"):
                    try:
                        return int(line.split()[1])
                    except (IndexError, ValueError):
                        pass
        return None
    return 1 if is_image(path) else None


def human_size(n):
    f = float(n)
    for unit in ("B", "KB", "MB"):
        if f < 1024:
            return f"{f:.0f} {unit}" if unit == "B" else f"{f:.1f} {unit}"
        f /= 1024
    return f"{f:.1f} GB"


def list_printers():
    rc, out = run_cmd(["lpstat", "-p"], timeout=15)
    names = []
    for line in out.splitlines():
        if line.startswith("printer "):
            parts = line.split()
            if len(parts) > 1 and parts[1] not in names:
                names.append(parts[1])
    return names


def default_printer():
    rc, out = run_cmd(["lpstat", "-d"], timeout=15)
    for line in out.splitlines():
        if ":" in line and ("default destination" in line.lower() or "默认目标" in line):
            cand = line.split(":", 1)[1].strip()
            if cand:
                return cand
    ps = list_printers()
    return ps[0] if ps else ""


def printer_info():
    rc, out = run_cmd(["lpstat", "-p"], timeout=15)
    info = []
    for line in out.splitlines():
        if line.startswith("printer "):
            parts = line.split(None, 2)
            name = parts[1] if len(parts) > 1 else ""
            rest = (parts[2] if len(parts) > 2 else "").lower()
            if "disabled" in rest:
                state, ok = "已停用", False
            elif "printing" in rest:
                state, ok = "打印中", True
            elif "idle" in rest:
                state, ok = "空闲", True
            else:
                state, ok = "就绪", True
            info.append([name, state, ok])
        elif info and line[:1] in (" ", "	") and line.strip():
            reason = line.strip()
            if reason.lower().startswith("unplugged"):
                reason = "没插 USB / 没开机"
            info[-1][1] = "%s（%s）" % (info[-1][1], reason)
    return [(n, s, ok) for n, s, ok in info]


def thumb_path(path):
    try:
        stamp = str(os.path.getmtime(path))
    except OSError:
        stamp = "0"
    digest = hashlib.md5(("v2|" + path + stamp).encode("utf-8")).hexdigest()[:12]
    return os.path.join(CACHE_DIR, "prev-%s.png" % digest)


def render_thumb(path, out_png):
    try:
        if is_pdf(path):
            base = out_png[:-4] if out_png.endswith(".png") else out_png
            run_cmd(["pdftoppm", "-f", "1", "-l", "1", "-r", "110", "-png",
                     "-singlefile", path, base], timeout=30)
            return out_png if os.path.exists(out_png) else None
        if is_image(path):
            im = Image.open(path).convert("RGB")
            im.thumbnail((1000, 1400), Image.LANCZOS)
            im.save(out_png, "PNG")
            return out_png
    except Exception:
        return None
    return None


def image_to_a4_pdf(src, dst):
    im = Image.open(src)
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, "white")
        bg.paste(im, mask=im.split()[-1])
        im = bg
    else:
        im = im.convert("RGB")
    sc = min(A4_300[0] / float(im.width), A4_300[1] / float(im.height))
    nw, nh = max(1, int(im.width * sc)), max(1, int(im.height * sc))
    if (nw, nh) != im.size:
        im = im.resize((nw, nh), Image.LANCZOS)
    page = Image.new("RGB", A4_300, "white")
    page.paste(im, ((A4_300[0] - nw) // 2, (A4_300[1] - nh) // 2))
    page.save(dst, "PDF", resolution=300.0, quality=92)
    return dst


class FileRow(Gtk.ListBoxRow):
    def __init__(self, path, owner):
        super().__init__()
        self.path = path
        self.pages = None

        box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=12)
        box.set_margin_top(8)
        box.set_margin_bottom(8)
        box.set_margin_start(12)
        box.set_margin_end(8)

        text = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=2)
        text.set_hexpand(True)

        self.name_lbl = Gtk.Label(label=os.path.basename(path))
        self.name_lbl.set_xalign(0.0)
        self.name_lbl.set_ellipsize(Pango.EllipsizeMode.MIDDLE)

        self.sub_lbl = Gtk.Label(label="读取中…")
        self.sub_lbl.set_xalign(0.0)
        self.sub_lbl.add_css_class("dim-label")
        self.sub_lbl.add_css_class("caption")

        text.append(self.name_lbl)
        text.append(self.sub_lbl)

        rm = Gtk.Button.new_from_icon_name("window-close-symbolic")
        rm.add_css_class("flat")
        rm.set_tooltip_text("从列表中移除")
        rm.set_valign(Gtk.Align.CENTER)
        rm.connect("clicked", lambda *_: owner.remove_row(self))

        box.append(text)
        box.append(rm)
        self.set_child(box)

    def set_sub(self, value):
        self.sub_lbl.set_text(value)


class PrintCenter(Adw.ApplicationWindow):
    def __init__(self, app, initial_paths=()):
        super().__init__(application=app, title="批量打印中心")
        self.set_default_size(1100, 750)
        self.rows = []
        self.printer_names = []
        self.printer_warn = ""
        self._printer = ""
        self.busy = False

        self.toasts = Adw.ToastOverlay()
        self.toolbar = Adw.ToolbarView()

        header = Adw.HeaderBar()
        self.add_btn = Gtk.Button(label="添加文件")
        self.add_btn.add_css_class("suggested-action")
        self.add_btn.connect("clicked", self.on_add)
        header.pack_start(self.add_btn)

        self.clear_btn = Gtk.Button.new_from_icon_name("edit-clear-all-symbolic")
        self.clear_btn.set_tooltip_text("清空列表")
        self.clear_btn.connect("clicked", lambda *_: self.clear())
        header.pack_end(self.clear_btn)

        self.print_btn = Gtk.Button(label="全部打印")
        self.print_btn.add_css_class("suggested-action")
        self.print_btn.set_sensitive(False)
        self.print_btn.connect("clicked", self.on_print)
        header.pack_end(self.print_btn)
        self.toolbar.add_top_bar(header)

        bar = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=10)
        bar.set_margin_top(8)
        bar.set_margin_bottom(8)
        bar.set_margin_start(12)
        bar.set_margin_end(12)

        bar.append(Gtk.Label(label="打印机"))
        self.printer_dd = Gtk.DropDown.new_from_strings(["（检测中…）"])
        self.printer_dd.set_size_request(250, -1)
        bar.append(self.printer_dd)

        bar.append(Gtk.Label(label="单双面"))
        self.sides_dd = Gtk.DropDown.new_from_strings(["单面", "双面（长边翻页）"])
        bar.append(self.sides_dd)

        bar.append(Gtk.Label(label="份数"))
        self.copies_sp = Gtk.SpinButton.new_with_range(1, 99, 1)
        self.copies_sp.set_value(1)
        bar.append(self.copies_sp)

        self.status = Gtk.Label(label="就绪")
        self.status.set_xalign(1.0)
        self.status.set_hexpand(True)
        self.status.set_ellipsize(Pango.EllipsizeMode.END)
        self.status.add_css_class("dim-label")
        bar.append(self.status)
        self.toolbar.add_bottom_bar(bar)

        self.listbox = Gtk.ListBox()
        self.listbox.set_selection_mode(Gtk.SelectionMode.SINGLE)
        self.listbox.add_css_class("boxed-list")
        self.listbox.set_margin_top(12)
        self.listbox.set_margin_bottom(12)
        self.listbox.set_margin_start(12)
        self.listbox.set_margin_end(6)
        self.listbox.connect("row-selected", self.on_row_selected)

        self.placeholder = Adw.StatusPage()
        self.placeholder.set_icon_name("printer-symbolic")
        self.placeholder.set_title("把文件拖进来")
        self.placeholder.set_description(
            "支持 PDF 和常见图片（jpg / png / webp …）\n"
            "点左上角「添加文件」也可以\n"
            "每个文件会显示页数和第一页预览，确认后一键全部打印")

        self.list_stack = Gtk.Stack()
        self.list_stack.add_named(self.placeholder, "empty")
        list_sw = Gtk.ScrolledWindow()
        list_sw.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)
        list_sw.set_child(self.listbox)
        self.list_stack.add_named(list_sw, "list")
        self.list_stack.set_visible_child_name("empty")

        self.preview = Gtk.Picture()
        self.preview.set_content_fit(Gtk.ContentFit.CONTAIN)
        self.preview.set_can_shrink(True)
        self.preview.set_hexpand(True)
        self.preview.set_vexpand(True)

        self.preview_lbl = Gtk.Label(label="选中左边的文件看第一页")
        self.preview_lbl.set_wrap(True)
        self.preview_lbl.add_css_class("dim-label")

        pv_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=10)
        pv_box.set_margin_top(16)
        pv_box.set_margin_bottom(16)
        pv_box.set_margin_start(6)
        pv_box.set_margin_end(16)
        pv_box.append(self.preview)
        pv_box.append(self.preview_lbl)

        paned = Gtk.Paned.new(Gtk.Orientation.HORIZONTAL)
        paned.set_start_child(self.list_stack)
        paned.set_end_child(pv_box)
        paned.set_position(540)
        paned.set_resize_start_child(True)
        paned.set_shrink_start_child(False)
        self.toolbar.set_content(paned)

        drop = Gtk.DropTarget.new(Gdk.FileList, Gdk.DragAction.COPY)
        drop.connect("drop", self.on_drop)
        self.add_controller(drop)

        self.toasts.set_child(self.toolbar)
        self.set_content(self.toasts)

        self.refresh_printers()
        self.update_summary()
        if initial_paths:
            self.add_paths(list(initial_paths))
        if os.environ.get("PC_AUTOTEST"):
            GLib.timeout_add(2000, self._autotest)

    def _autotest(self):
        self.on_print(None)
        return False

    # ---------- helpers ----------
    def toast(self, msg):
        self.toasts.add_toast(Adw.Toast.new(msg))

    def set_status(self, msg):
        self.status.set_text(msg)
        return False


    def refresh_printers(self):
        info = printer_info()
        self.printer_names = [n for n, _s, _ok in info]
        labels = [n if ok else "%s — %s" % (n, s) for n, s, ok in info]
        if not labels:
            self.printer_names = []
            labels = ["（未检测到打印机）"]
        self.printer_dd.set_model(Gtk.StringList.new(labels))
        want = default_printer()
        idx = self.printer_names.index(want) if want in self.printer_names else 0
        self.printer_dd.set_selected(idx)
        if self.printer_names and not info[idx][2]:
            self.printer_warn = "打印机%s" % info[idx][1]
        else:
            self.printer_warn = ""
        self.update_summary()

    def update_summary(self):
        total = sum(r.pages or 0 for r in self.rows)
        pending = sum(1 for r in self.rows if r.pages is None)
        txt = "%d 个文件 · 共 %d 页" % (len(self.rows), total)
        if getattr(self, "printer_warn", ""):
            txt = "%s · %s" % (self.printer_warn, txt)
        if pending:
            txt += "（%d 个读取中）" % pending
        self.set_status(txt)
        self.print_btn.set_sensitive(bool(self.rows) and not self.busy)

    # ---------- list management ----------
    def add_paths(self, paths):
        added = 0
        for p in paths or []:
            if not p or not os.path.isfile(p):
                continue
            if not (is_pdf(p) or is_image(p)):
                continue
            if any(r.path == p for r in self.rows):
                continue
            row = FileRow(p, self)
            self.rows.append(row)
            self.listbox.append(row)
            added += 1
            threading.Thread(target=self._probe, args=(row,), daemon=True).start()
        if added:
            self.list_stack.set_visible_child_name("list")
            self.refresh_printers()
            self.update_summary()
            first = self.listbox.get_row_at_index(0)
            if first is not None and not first.is_selected():
                self.listbox.select_row(first)
        return added

    def _probe(self, row):
        n = page_count(row.path)
        try:
            size = human_size(os.path.getsize(row.path))
        except OSError:
            size = "?"
        GLib.idle_add(self._probe_done, row, n, size)

    def _probe_done(self, row, n, size):
        row.pages = n
        row.set_sub("%s · 读不出页数" % size if n is None else "%d 页 · %s" % (n, size))
        self.update_summary()
        return False

    def remove_row(self, row):
        if row in self.rows:
            self.rows.remove(row)
        self.listbox.remove(row)
        if not self.rows:
            self.list_stack.set_visible_child_name("empty")
            self.preview.set_paintable(None)
            self.preview_lbl.set_text("选中左边的文件看第一页")
        self.update_summary()

    def clear(self):
        for r in list(self.rows):
            self.listbox.remove(r)
        self.rows = []
        self.list_stack.set_visible_child_name("empty")
        self.preview.set_paintable(None)
        self.preview_lbl.set_text("选中左边的文件看第一页")
        self.update_summary()

    # ---------- preview ----------
    def on_row_selected(self, _lb, row):
        if row is None:
            return
        self.preview_lbl.set_text("正在渲染 %s …" % os.path.basename(row.path))
        threading.Thread(target=self._render, args=(row,), daemon=True).start()

    def _render(self, row):
        out = thumb_path(row.path)
        png = out if os.path.exists(out) else render_thumb(row.path, out)
        GLib.idle_add(self._render_done, row, png)

    def _render_done(self, row, png):
        if png and os.path.exists(png):
            try:
                self.preview.set_paintable(Gdk.Texture.new_from_filename(png))
            except Exception as exc:
                print("preview load failed:", png, repr(exc), file=sys.stderr, flush=True)
                self.preview.set_paintable(None)
            extra = " / 共 %d 页" % row.pages if row.pages else ""
            self.preview_lbl.set_text("%s — 第 1 页%s" % (os.path.basename(row.path), extra))
        else:
            self.preview.set_paintable(None)
            self.preview_lbl.set_text("%s\n（渲染不出预览）" % os.path.basename(row.path))
        return False

    # ---------- import ----------
    def on_add(self, _btn):
        dlg = Gtk.FileDialog()
        dlg.set_title("选择要打印的文件")
        docs = Gtk.FileFilter()
        docs.set_name("PDF 与图片")
        docs.add_mime_type("application/pdf")
        docs.add_pixbuf_formats()
        every = Gtk.FileFilter()
        every.set_name("所有文件")
        every.add_pattern("*")
        store = Gio.ListStore.new(Gtk.FileFilter)
        store.append(docs)
        store.append(every)
        dlg.set_filters(store)
        dlg.set_default_filter(docs)
        dlg.open_multiple(self, None, self._on_open_done)

    def _on_open_done(self, dlg, result):
        try:
            files = dlg.open_multiple_finish(result)
        except GLib.Error:
            return
        paths = []
        for i in range(files.get_n_items()):
            p = files.get_item(i).get_path()
            if p:
                paths.append(p)
        if paths:
            self.toast("已添加 %d 个文件" % self.add_paths(paths))

    def on_drop(self, _tgt, value, _x, _y):
        paths = []
        try:
            for gf in value.get_files():
                p = gf.get_path()
                if p:
                    paths.append(p)
        except Exception:
            return False
        if paths:
            self.toast("拖入 %d 个文件" % self.add_paths(paths))
        return True


    # ---------- printing ----------
    def on_print(self, _btn):
        if self.busy or not self.rows:
            return
        idx = self.printer_dd.get_selected()
        if idx == Gtk.INVALID_LIST_POSITION or idx >= len(self.printer_names):
            self.toast("没有可用打印机 —— 先确认打印机电源开着、USB 插好")
            return
        self._printer = self.printer_names[idx]
        if self.printer_warn:
            msg = "".join([self.printer_warn, chr(10), chr(10),
                           "任务会排在 CUPS 队列里等着，打印机接好之后才会真的出纸。",
                           "现在就要提交吗？"])
            dlg = Adw.AlertDialog(heading="打印机当前不可用", body=msg)
            dlg.add_response("cancel", "先不提交")
            dlg.add_response("ok", "仍然提交")
            dlg.set_response_appearance("ok", Adw.ResponseAppearance.SUGGESTED)
            dlg.set_default_response("cancel")
            dlg.choose(self, None, self._on_print_confirm)
            return
        self._start_print()

    def _on_print_confirm(self, dlg, result):
        try:
            resp = dlg.choose_finish(result)
        except GLib.Error:
            return
        if resp == "ok":
            self._start_print()

    def _start_print(self):
        duplex = self.sides_dd.get_selected() == 1
        copies = int(self.copies_sp.get_value())
        paths = [r.path for r in self.rows]
        self.busy = True
        self.print_btn.set_sensitive(False)
        threading.Thread(target=self._print_worker,
                         args=(paths, self._printer, copies, duplex),
                         daemon=True).start()

    def _print_worker(self, paths, printer, copies, duplex):
        good, bad = [], []
        staging = tempfile.mkdtemp(prefix="print-center-")
        sides = "two-sided-long-edge" if duplex else "one-sided"
        for i, p in enumerate(paths):
            base = os.path.basename(p)
            GLib.idle_add(self.set_status, "正在提交 %d/%d：%s" % (i + 1, len(paths), base))
            target = p
            try:
                if is_image(p):
                    target = image_to_a4_pdf(p, os.path.join(staging, base + ".pdf"))
                elif not is_pdf(p):
                    bad.append((base, "不支持的格式"))
                    continue
            except Exception as exc:
                bad.append((base, "图片预处理失败：%s" % exc))
                continue
            args = ["lp", "-d", printer]
            if copies > 1:
                args += ["-n", str(copies)]
            args += ["-o", "media=A4", "-o", "sides=" + sides, target]
            rc, out = run_cmd(args, timeout=45)
            (good if rc == 0 else bad).append((base, out))
        GLib.idle_add(self._print_done, good, bad)

    def _print_done(self, good, bad):
        self.busy = False
        self.print_btn.set_sensitive(bool(self.rows))
        if bad:
            self.set_status("提交完成：成功 %d，失败 %d" % (len(good), len(bad)))
            body = "\n".join("• %s：%s" % (n, m) for n, m in bad[:12])
            dlg = Adw.AlertDialog(heading="%d 个文件提交失败" % len(bad), body=body)
            dlg.add_response("ok", "知道了")
            dlg.present(self)
        else:
            self.set_status("已全部提交：%d 个文件" % len(good))
            self.toast("已提交 %d 个打印任务" % len(good))
        return False


class App(Adw.Application):
    def __init__(self, paths=()):
        super().__init__(application_id=APP_ID)
        self.paths = list(paths)
        self.win = None

    def do_activate(self):
        if self.win is None:
            self.win = PrintCenter(self, self.paths)
            self.paths = []
        self.win.present()


def main(argv):
    if argv and argv[0] in ("-h", "--help"):
        print("用法: printcenter.py [文件 …]")
        print("不带参数则打开空窗口，可拖入文件或点「添加文件」。")
        return 0
    files = [p for p in argv if os.path.isfile(p)]
    return App(files).run([sys.argv[0]])


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
