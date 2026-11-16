"""轮询 PaperPass 报告列表，取指定标题的 AIGC 分数与报告链接。
用法：python poll.py <标题关键字> [最多等待秒]
"""
import asyncio, sys, re
from playwright.async_api import async_playwright

def blocks(body):
    """按 '版本' 切分记录块，返回 [{title,state,aigc}]"""
    out=[]
    for chunk in body.split("版本")[1:]:
        t = re.search(r"论文标题\s*\n\s*(\S+)", chunk)
        s = re.search(r"状态\s*\n\s*(\S+)", chunk)
        a = re.search(r"AIGC总体疑似度\s*\n\s*([\d.]+)%", chunk)
        if t: out.append({"title": t.group(1), "state": s.group(1) if s else "?",
                          "aigc": a.group(1) if a else None})
    return out

async def main(kw, maxt):
    pw = await async_playwright().start()
    b = await pw.chromium.connect_over_cdp("http://127.0.0.1:9222")
    ctx = b.contexts[0]; page = ctx.pages[0] if ctx.pages else await ctx.new_page()
    waited=0; rec=None
    while waited <= maxt:
        await page.goto("https://www.paperpass.com/panel/report", wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(2500)
        body = await page.inner_text("body")
        rec = next((r for r in blocks(body) if kw in r["title"]), None)
        print(f"[{waited:3d}s] {rec}")
        if rec and rec["state"] == "已完成" and rec["aigc"]: break
        await page.wait_for_timeout(15000); waited += 18
    if rec and rec["aigc"]:
        html = await page.content()
        # 找该标题所在块的 online-report 链接（列表中顺序与 filename 出现顺序一致）
        fns = re.findall(r'online-report\?filename=([\w\-]+)', html)
        print("filename 数:", len(fns), "| 最新一个:", fns[0] if fns else None)
    await pw.stop()

asyncio.run(main(sys.argv[1] if len(sys.argv)>1 else "essay-1-v6",
                 int(sys.argv[2]) if len(sys.argv)>2 else 180))
