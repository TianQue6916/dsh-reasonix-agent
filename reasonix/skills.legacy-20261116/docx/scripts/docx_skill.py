#!/usr/bin/env python3
"""
DOCX Skill - Word 文档精确排版控制
用法: python docx_skill.py <操作> <参数JSON文件路径>
"""

import sys, json, os, copy
from docx import Document
from docx.shared import Inches, Pt, Cm, RGBColor, Emu
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.enum.section import WD_ORIENT
from docx.oxml.ns import qn, nsdecls
from docx.oxml import parse_xml
import re

def load_args():
    if len(sys.argv) < 3:
        print(json.dumps({"success": False, "error": "用法: python docx_skill.py <操作> <参数JSON文件>"}))
        sys.exit(1)
    with open(sys.argv[2], 'r', encoding='utf-8') as f:
        return json.load(f)

def result(success, **kwargs):
    kwargs["success"] = success
    print(json.dumps(kwargs, ensure_ascii=False, default=str))

def op_create(args):
    doc = Document()
    title = args.get("title", "")
    if title:
        doc.add_heading(title, level=1)
    for section in args.get("content_sections", []):
        level = section.get("level", 2)
        heading = section.get("heading", "")
        if heading:
            doc.add_heading(heading, level=level)
        for para in section.get("paragraphs", []):
            if isinstance(para, str):
                doc.add_paragraph(para)
            elif isinstance(para, dict):
                p = doc.add_paragraph()
                run = p.add_run(para.get("text", ""))
                if para.get("bold"): run.bold = True
                if para.get("italic"): run.italic = True
                if para.get("size"): run.font.size = Pt(para["size"])
                if para.get("color"): run.font.color.rgb = RGBColor(*hex_to_rgb(para["color"]))
                align = para.get("align", "")
                if align == "center": p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                elif align == "right": p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
                elif align == "justify": p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    output = args.get("output_path", "output.docx")
    doc.save(output)
    result(True, output_path=output, message=f"文档已创建: {output}")

def op_find_replace(args):
    path = args["path"]
    doc = Document(path)
    find_text = args["find"]
    replace_text = args["replace"]
    count = 0
    for para in doc.paragraphs:
        if find_text in para.text:
            for run in para.runs:
                if find_text in run.text:
                    run.text = run.text.replace(find_text, replace_text)
                    count += 1
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for para in cell.paragraphs:
                    if find_text in para.text:
                        for run in para.runs:
                            if find_text in run.text:
                                run.text = run.text.replace(find_text, replace_text)
                                count += 1
    output = args.get("output_path", path)
    doc.save(output)
    result(True, output_path=output, message=f"替换了 {count} 处")

def op_add_table(args):
    path = args["path"]
    doc = Document(path)
    rows = args.get("rows", 3)
    cols = args.get("cols", 3)
    data = args.get("data", [])
    table = doc.add_table(rows=rows, cols=cols, style='Table Grid')
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, row_data in enumerate(data):
        if i >= rows: break
        for j, cell_text in enumerate(row_data):
            if j >= cols: break
            table.cell(i, j).text = str(cell_text)
    output = args.get("output_path", path)
    doc.save(output)
    result(True, output_path=output, message=f"已添加 {rows}x{cols} 表格")

def op_add_toc(args):
    path = args["path"]
    doc = Document(path)
    para = doc.add_paragraph()
    run = para.add_run("目录")
    run.bold = True
    run.font.size = Pt(16)
    # TOC field code
    fldChar1 = parse_xml(f'<w:fldChar {nsdecls("w")} w:fldCharType="begin"/>')
    run._r.append(fldChar1)
    instrText = parse_xml(f'<w:instrText {nsdecls("w")} xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText>')
    run2 = para.add_run()
    run2._r.append(instrText)
    fldChar2 = parse_xml(f'<w:fldChar {nsdecls("w")} w:fldCharType="separate"/>')
    run._r.append(fldChar2)
    fldChar3 = parse_xml(f'<w:fldChar {nsdecls("w")} w:fldCharType="end"/>')
    run._r.append(fldChar3)
    doc.save(path)
    result(True, output_path=path, message="已插入目录（打开Word后按Ctrl+A再按F9刷新）")

def hex_to_rgb(hex_str):
    hex_str = hex_str.lstrip('#')
    return tuple(int(hex_str[i:i+2], 16) for i in (0, 2, 4))

def main():
    args = load_args()
    op = sys.argv[1]
    handlers = {
        "create": op_create,
        "find_replace": op_find_replace,
        "add_table": op_add_table,
        "add_toc": op_add_toc,
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
