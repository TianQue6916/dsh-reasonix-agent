#!/usr/bin/env python3
"""
XParse Parser — 基于 TextIn API 的 PDF/图片解析
用法: python xparse_skill.py <操作> <参数JSON文件路径>
"""
import sys, json, os, base64, requests

TEXTIN_API_KEY = os.environ.get("TEXTIN_API_KEY", "")
TEXTIN_BASE_URL = "https://api.textin.com"

def load_args():
    with open(sys.argv[2], 'r', encoding='utf-8') as f:
        return json.load(f)

def result(success, **kwargs):
    kwargs["success"] = success
    print(json.dumps(kwargs, ensure_ascii=False, default=str))

def check_api_key():
    if not TEXTIN_API_KEY:
        result(False, error="未设置 TEXTIN_API_KEY 环境变量")
        return False
    return True

def encode_file(path):
    with open(path, 'rb') as f:
        return base64.b64encode(f.read()).decode('utf-8')

def op_parse_to_md(args):
    if not check_api_key(): return
    path = args["path"]
    file_data = encode_file(path)
    ext = os.path.splitext(path)[1].lower()
    
    resp = requests.post(
        f"{TEXTIN_BASE_URL}/ai/ocr/v1/pdf_to_markdown",
        headers={
            "x-ti-app-id": TEXTIN_API_KEY,
            "Content-Type": "application/json"
        },
        json={
            "file_data": file_data,
            "file_type": ext.lstrip('.'),
            "page_details": args.get("page_details", False),
            "table_output": args.get("table_output", "markdown")
        },
        timeout=120
    )
    
    if resp.status_code != 200:
        result(False, error=f"API错误: {resp.status_code} {resp.text[:200]}")
        return
    
    data = resp.json()
    if data.get("code") != 0:
        result(False, error=data.get("message", "未知错误"))
        return
    
    md_content = data.get("result", {}).get("markdown", "")
    result(True, markdown=md_content, pages=data.get("result", {}).get("page_count", 0))

def op_parse_with_toc(args):
    if not check_api_key(): return
    path = args["path"]
    file_data = encode_file(path)
    ext = os.path.splitext(path)[1].lower()
    
    resp = requests.post(
        f"{TEXTIN_BASE_URL}/ai/ocr/v1/pdf_to_markdown",
        headers={
            "x-ti-app-id": TEXTIN_API_KEY,
            "Content-Type": "application/json"
        },
        json={
            "file_data": file_data,
            "file_type": ext.lstrip('.'),
            "page_details": True,
            "table_output": "markdown"
        },
        timeout=120
    )
    
    if resp.status_code != 200:
        result(False, error=f"API错误: {resp.status_code}")
        return
    
    data = resp.json()
    if data.get("code") != 0:
        result(False, error=data.get("message", "未知错误"))
        return
    
    result_data = data.get("result", {})
    md_content = result_data.get("markdown", "")
    
    # 提取目录树
    pages = result_data.get("pages", [])
    toc = []
    for page in pages:
        for block in page.get("blocks", []):
            if block.get("type") == "heading":
                toc.append({
                    "level": block.get("heading_level", 1),
                    "text": block.get("text", ""),
                    "page": page.get("page_num", 0)
                })
    
    result(True, markdown=md_content, toc=toc, pages=len(pages))

def main():
    if len(sys.argv) < 3:
        result(False, error="用法: python xparse_skill.py <操作> <参数JSON文件>")
        return
    args = load_args()
    op = sys.argv[1]
    handlers = {
        "parse_to_md": op_parse_to_md,
        "parse_with_toc": op_parse_with_toc,
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
