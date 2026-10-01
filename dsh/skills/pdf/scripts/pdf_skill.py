#!/usr/bin/env python3
"""
PDF Skill — 精确理解与识别
用法: python pdf_skill.py <操作> <参数JSON文件路径>
"""
import sys, json, os
from pypdf import PdfReader, PdfWriter, PdfMerger
from pdfplumber import open as pdfplumber_open
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
import io

def load_args():
    with open(sys.argv[2], 'r', encoding='utf-8') as f:
        return json.load(f)

def result(success, **kwargs):
    kwargs["success"] = success
    print(json.dumps(kwargs, ensure_ascii=False, default=str))

def op_extract_text(args):
    path = args["path"]
    pages = args.get("pages", None)  # None=all, or list like [1,3,5]
    reader = PdfReader(path)
    text = ""
    page_info = []
    for i, page in enumerate(reader.pages):
        if pages and (i + 1) not in pages:
            continue
        page_text = page.extract_text() or ""
        text += f"\n--- Page {i+1} ---\n{page_text}"
        page_info.append({"page": i+1, "chars": len(page_text)})
    result(True, text=text, pages=page_info, total_chars=len(text))

def op_extract_tables(args):
    path = args["path"]
    pages = args.get("pages", None)
    all_tables = []
    with pdfplumber_open(path) as pdf:
        for i, page in enumerate(pdf.pages):
            if pages and (i + 1) not in pages:
                continue
            tables = page.extract_tables()
            for ti, table in enumerate(tables):
                rows = []
                for row in table:
                    rows.append([str(cell or "") for cell in row])
                all_tables.append({
                    "page": i + 1,
                    "table_index": ti,
                    "rows": len(rows),
                    "cols": len(rows[0]) if rows else 0,
                    "data": rows
                })
    result(True, tables=all_tables, count=len(all_tables))

def op_merge(args):
    paths = args["paths"]
    output = args["output_path"]
    merger = PdfMerger()
    for p in paths:
        merger.append(p)
    merger.write(output)
    merger.close()
    result(True, output_path=output, message=f"合并 {len(paths)} 个PDF")

def op_split(args):
    path = args["path"]
    output_dir = args.get("output_dir", os.path.dirname(path))
    mode = args.get("mode", "single")  # single=每页一个, range=按范围分组
    os.makedirs(output_dir, exist_ok=True)
    reader = PdfReader(path)
    output_files = []
    if mode == "single":
        for i, page in enumerate(reader.pages):
            writer = PdfWriter()
            writer.add_page(page)
            out_path = os.path.join(output_dir, f"page_{i+1}.pdf")
            with open(out_path, 'wb') as f:
                writer.write(f)
            output_files.append(out_path)
    elif mode == "range":
        ranges = args.get("ranges", [[1, len(reader.pages)]])
        for ri, (start, end) in enumerate(ranges):
            writer = PdfWriter()
            for i in range(start - 1, end):
                writer.add_page(reader.pages[i])
            out_path = os.path.join(output_dir, f"part_{ri+1}.pdf")
            with open(out_path, 'wb') as f:
                writer.write(f)
            output_files.append(out_path)
    result(True, output_files=output_files, count=len(output_files))

def op_add_watermark(args):
    path = args["path"]
    text = args.get("text", "CONFIDENTIAL")
    output = args.get("output_path", path)
    reader = PdfReader(path)
    writer = PdfWriter()
    
    packet = io.BytesIO()
    can = canvas.Canvas(packet, pagesize=A4)
    can.setFont("Helvetica", 60)
    can.setFillColorRGB(0.5, 0.5, 0.5, 0.3)
    can.saveState()
    can.translate(300, 420)
    can.rotate(45)
    can.drawCentredString(0, 0, text)
    can.restoreState()
    can.save()
    packet.seek(0)
    watermark = PdfReader(packet)
    
    for page in reader.pages:
        page.merge_page(watermark.pages[0])
        writer.add_page(page)
    
    with open(output, 'wb') as f:
        writer.write(f)
    result(True, output_path=output)

def op_set_password(args):
    path = args["path"]
    password = args["password"]
    output = args.get("output_path", path)
    reader = PdfReader(path)
    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)
    writer.encrypt(password)
    with open(output, 'wb') as f:
        writer.write(f)
    result(True, output_path=output, message="密码保护已添加")

def main():
    if len(sys.argv) < 3:
        result(False, error="用法: python pdf_skill.py <操作> <参数JSON文件>")
        return
    args = load_args()
    op = sys.argv[1]
    handlers = {
        "extract_text": op_extract_text,
        "extract_tables": op_extract_tables,
        "merge": op_merge,
        "split": op_split,
        "add_watermark": op_add_watermark,
        "set_password": op_set_password,
    }
    handler = handlers.get(op)
    if not handler:
        result(False, error=f"不支持的操作: {op}")
        return
    try:
        handler(args)
    except Exception as e:
        result(False, error=str(e))

if __name__ == "__main__":
    main()
