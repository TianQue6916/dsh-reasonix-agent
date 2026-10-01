# 起点小说下载任务档案（2026-08-15）

## 交付
- `/home/tianque/桌面/输出文件/小说下载/烂柯棋缘.txt` — 4.0MB，1021 章正文+42 番外，真费事
- `/home/tianque/桌面/输出文件/小说下载/全修真界最奇怪的店铺.txt` — 1.6MB，251 章，妙笔生小草

## 渠道与反爬
- **起点网页**：瑞数 JS 挑战（probe.js），curl 直接 202，无法绕过
- **烂柯棋缘 → 62小说网**（www.62xsw.com）：正文用 `qsbs.bb('base64')` 混淆；目录 `/index/{bookid}/{page}/` 9 页后循环（只覆盖 1-598 章+番外），但实际全本可抓；URL 格式 `/bqg/12071/{cid}.html`
- **全修真界 → 歌姬书屋**（www.geji520.cc）：正文用 base64 内联图片替换高频字（每章 60-100 个 hash，全书约 260 个唯一 hash）；图片=被删字；还原方法=QQ 阅读免费章节（book.qq.com/book-read/24037926/1-94，干净文本）做邻字符/全文对齐投票；bookId 24037926；URL `/211703918/{n}.html`，n-3=书内章节号
- **工具链**：playwright-core@1.42（Node18 兼容）+ 本机 chromium（~/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome）；tesseract chi_sim（~/.local/share/tessdata，jsdelivr 下载）

## 教训
- 62小说网目录页 10+ 后循环返回旧模板，必须用 cid 去重 + 连续空页退出
- 歌姬 hash 跨章基本稳定（同一 hash=同一图），个别 hash 在不同章节可能对应不同字（如 a901bfd0=抽），需上下文校验
- novel_dl v1 的 URL 缺 book_id 导致正文全空（只有标题）——必须验证正文字数，不能只看标题数量
