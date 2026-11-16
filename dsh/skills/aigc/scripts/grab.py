"""抓指定 online-report filename 的 AIGC 片段级分数。
用法：python grab.py <filename> <输出前缀>
"""
import asyncio, sys, re
from pathlib import Path
from playwright.async_api import async_playwright

async def main(fn, tag):
    pw = await async_playwright().start()
    b = await pw.chromium.connect_over_cdp("http://127.0.0.1:9222")
    ctx = b.contexts[0]; page = ctx.pages[0] if ctx.pages else await ctx.new_page()
    url = f"https://www.paperpass.com/panel/report/online-report?filename={fn}"
    await page.goto(url, wait_until="domcontentloaded", timeout=90000)
    await page.wait_for_timeout(4000)
    m = re.search(r"/report/([0-9a-z]+)/", page.url)
    if not m:
        print("未拿到 report id, url=", page.url); await pw.stop(); return
    rid = m.group(1); print("report id:", rid)
    ai = f"https://report.paperpass.com/report/{rid}/ai.html"
    await page.goto(ai, wait_until="domcontentloaded", timeout=90000)
    await page.wait_for_timeout(6000)
    html = await page.content()
    out = Path(f"out/_ai-{tag}.html"); out.write_text(html, encoding="utf-8")
    print("saved", out, len(html), "bytes")
    await pw.stop()

asyncio.run(main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "v6"))
