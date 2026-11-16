"""把 docx 提交到 PaperPass 免费版 AIGC 检测，返回报告 id。
用法：python upload.py out/essay-1-v6.docx [dry]
"""
import asyncio, sys, re
from pathlib import Path
from playwright.async_api import async_playwright

CDP = "http://127.0.0.1:9222"
PANEL = "https://www.paperpass.com/panel/index"

async def main(docx, dry=False):
    pw = await async_playwright().start()
    b = await pw.chromium.connect_over_cdp(CDP)
    ctx = b.contexts[0]
    page = ctx.pages[0] if ctx.pages else await ctx.new_page()
    await page.goto(PANEL, wait_until="domcontentloaded", timeout=60000)
    await page.wait_for_timeout(3000)

    f = Path(docx).resolve()
    sel = 'input[type=file][accept=".doc,.docx,.pdf"]'
    await page.set_input_files(sel, str(f))
    await page.wait_for_timeout(2500)
    body = await page.inner_text("body")
    print("上传后页面提示片段:", [l for l in body.split("\n") if "字" in l or "上传" in l][:6])

    if dry:
        print("DRY: 已选文件，未提交"); await pw.stop(); return

    title = f.stem
    try:
        await page.fill("#submitkeypaperform-title", title)
    except Exception as e:
        print("填标题失败", e)
    await page.click("#preSubmit")
    await page.wait_for_timeout(3000)
    body2 = await page.inner_text("body")
    print("preSubmit 后:", [l for l in body2.split("\n") if l.strip()][-12:])
    try:
        await page.click("#submitPaper", timeout=8000)
        print("已点确认提交")
    except Exception as e:
        print("确认提交失败:", e)
    await page.wait_for_timeout(5000)
    print("当前 URL:", page.url)
    await pw.stop()

if __name__ == "__main__":
    asyncio.run(main(sys.argv[1], len(sys.argv) > 2 and sys.argv[2] == "dry"))
