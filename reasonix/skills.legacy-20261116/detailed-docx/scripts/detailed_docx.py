#!/usr/bin/env python3
"""
Detailed DOCX — 跨Run精确文本替换，保留格式
用法: python detailed_docx.py <操作> <参数JSON文件路径>
"""
import sys, json, re, copy, uuid
from docx import Document
from docx.oxml.ns import qn

def load_args():
    with open(sys.argv[2], 'r', encoding='utf-8') as f:
        return json.load(f)

def result(success, **kwargs):
    kwargs["success"] = success
    print(json.dumps(kwargs, ensure_ascii=False, default=str))

def get_all_runs(doc):
    """收集文档中所有段落和表格的 Run（含属性）"""
    runs = []
    for i, para in enumerate(doc.paragraphs):
        for j, run in enumerate(para.runs):
            runs.append({
                "type": "paragraph",
                "para_idx": i,
                "run_idx": j,
                "element": run._r,
                "text": run.text,
                "para": para
            })
    for ti, table in enumerate(doc.tables):
        for ri, row in enumerate(table.rows):
            for ci, cell in enumerate(row.cells):
                for pi, para in enumerate(cell.paragraphs):
                    for rj, run in enumerate(para.runs):
                        runs.append({
                            "type": "table",
                            "table_idx": ti,
                            "row_idx": ri,
                            "cell_idx": ci,
                            "para_idx": pi,
                            "run_idx": rj,
                            "element": run._r,
                            "text": run.text,
                            "para": para
                        })
    return runs

def merge_runs_text(runs_slice):
    """合并一段连续 Run 的文本"""
    return "".join(r["text"] for r in runs_slice)

def find_runs_span(all_runs, search_text, case_sensitive=False):
    """在连续 Run 中查找匹配文本，返回 (start_run_idx, end_run_idx, matched_text)"""
    for start in range(len(all_runs)):
        for end in range(start, len(all_runs)):
            merged = merge_runs_text(all_runs[start:end+1])
            if not case_sensitive:
                if search_text.lower() in merged.lower():
                    idx = merged.lower().index(search_text.lower())
                    return start, end, idx, idx + len(search_text)
            else:
                if search_text in merged:
                    idx = merged.index(search_text)
                    return start, end, idx, idx + len(search_text)
    return None

def replace_in_runs(all_runs, start, end, find_start, find_end, replace_text):
    """在跨 Run 匹配范围内替换文本，保持每个 Run 的格式"""
    runs_slice = all_runs[start:end+1]
    merged = merge_runs_text(runs_slice)
    
    # 计算各 Run 在原合并文本中的字符范围
    run_ranges = []
    pos = 0
    for r in runs_slice:
        run_ranges.append((pos, pos + len(r["text"])))
        pos += len(r["text"])
    
    # 构建替换后的文本分片
    before = merged[:find_start]
    matched = merged[find_start:find_end]
    after = merged[find_end:]
    
    # 修改第一个匹配 Run 的文本为 "before + replace"
    first_run = runs_slice[0]
    first_len = run_ranges[0][1] - run_ranges[0][0]
    
    if find_start < first_len:
        # 替换起始在当前 Run 内
        before_part = before[:find_start]
        keep_after = first_run["text"][find_start + len(matched):] if find_start + len(matched) < first_len else ""
        first_run["element"].text = before_part + replace_text + keep_after
        # 清空中间 Run
        for r in runs_slice[1:]:
            r["element"].text = ""
        # 后面部分追加到最后一个 Run
        if after:
            runs_slice[-1]["element"].text += after
    else:
        # 替换起始不在第一个 Run
        first_run["element"].text = before[:first_len]
        # 中间的清空
        text_pos = first_len
        for r in runs_slice[1:]:
            r_len = len(r["text"])
            if text_pos + r_len <= find_start:
                r["element"].text = ""
                text_pos += r_len
            elif text_pos < find_start:
                # 替换开始于这个 Run 中间
                local_start = find_start - text_pos
                before_part = r["text"][:local_start]
                match_end_in_run = min(local_start + len(matched), r_len)
                after_part = r["text"][match_end_in_run:]
                r["element"].text = before_part + replace_text + after_part
                text_pos += r_len
            else:
                r["element"].text = ""
            text_pos += r_len

def op_find_replace(args):
    path = args["path"]
    find_text = args["find"]
    replace_text = args.get("replace", "")
    case_sensitive = args.get("case_sensitive", False)
    
    doc = Document(path)
    all_runs = get_all_runs(doc)
    
    count = 0
    span = find_runs_span(all_runs, find_text, case_sensitive)
    while span:
        start, end, f_start, f_end = span
        replace_in_runs(all_runs, start, end, f_start, f_end, replace_text)
        count += 1
        # 重新搜索（从替换位置之后）
        span = find_runs_span(all_runs[start+1:], find_text, case_sensitive)
        if span:
            span = (span[0] + start + 1, span[1] + start + 1, span[2], span[3])
    
    output = args.get("output_path", path)
    doc.save(output)
    result(True, output_path=output, message=f"跨Run替换完成: {count} 处")

def op_find_all(args):
    path = args["path"]
    find_text = args["find"]
    case_sensitive = args.get("case_sensitive", False)
    
    doc = Document(path)
    all_runs = get_all_runs(doc)
    
    matches = []
    span = find_runs_span(all_runs, find_text, case_sensitive)
    while span:
        start, end, f_start, f_end = span
        merged = merge_runs_text(all_runs[start:end+1])
        context_start = max(0, f_start - 20)
        context_end = min(len(merged), f_end + 20)
        matches.append({
            "run_start": start,
            "run_end": end,
            "char_start": f_start,
            "char_end": f_end,
            "context": merged[context_start:context_end]
        })
        span = find_runs_span(all_runs[start+1:], find_text, case_sensitive)
        if span:
            span = (span[0] + start + 1, span[1] + start + 1, span[2], span[3])
    
    result(True, matches=matches, count=len(matches))

def main():
    if len(sys.argv) < 3:
        result(False, error="用法: python detailed_docx.py <操作> <参数JSON文件>")
        return
    args = load_args()
    op = sys.argv[1]
    handlers = {
        "find_replace": op_find_replace,
        "find_all": op_find_all,
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
