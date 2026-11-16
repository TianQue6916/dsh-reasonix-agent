"""连本机 Edge（--remote-debugging-port=9222）操作 PaperPass 免费版 AIGC 检测。"""
import asyncio, sys, json, time
from pathlib import Path
from playwright.async_api import async_playwright

CDP = "http://127.0.0.1:9222"
PANEL = "https://www.paperpass.com/panel/index"

async def conn():
    pw = await async_playwright().start()
    b = await pw.chromium.connect_over_cdp(CDP)
    ctx = b.contexts[0]
    return pw, b, ctx

async def open_url(url):
    pw, b, ctx = await conn()
    page = ctx.pages[0] if ctx.pages else await ctx.new_page()
    await page.goto(url, wait_until="domcontentloaded")
    print("opened:", await page.title(), "|", page.url)
    await pw.stop()

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    if cmd == "login":
        asyncio.run(open_url("https://www.paperpass.com/login"))
    elif cmd == "panel":
        asyncio.run(open_url(PANEL))
    else:
        async def st():
            pw, b, ctx = await conn()
            print("contexts:", len(b.contexts), "pages:", len(ctx.pages))
            for p in ctx.pages: print("  -", p.url)
            await pw.stop()
        asyncio.run(st())
