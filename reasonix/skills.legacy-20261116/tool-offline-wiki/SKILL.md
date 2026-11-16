---
name: tool-offline-wiki
description: 离线维基百科搜索 — ZIM 51.9GB/~1900万篇（本机 /media/OS/wiki-data/zim），libzim 库本机直搜，替代联网搜索
---

# Tool: 离线维基百科搜索

英文维基百科离线版（ZIM 格式，~1900 万篇文章），用于百科知识类问题（定义/概念/人物/历史/科学/术语查证），无需联网。

## 资源位置（2026-09-04 实测修正：只有小电脑有知识库）

- **ZIM 文件在本机（小电脑 Linux 挂载的 Windows C 盘）**：`/media/OS/wiki-data/zim/wikipedia_en_all_nopic_2026-06.zim`（51.9GB，2026-06 版）
- **主力机（天阙九泉）没有 wiki-data / ZIM**——不要 SSH 到主力机搜 ZIM
- 本机 libzim 已装（Python 3），直接本机搜索
- 旧路径参考（历史，勿用）：`D:迅雷下载wikipedia_en_all_nopic_2026-03.zim`（2026-03 版，已弃）

## 使用时机

**任何任务开始前先查 wiki（用户铁律 2026-09-04）**：用户问题涉及百科知识（定义、概念、人物、地点、历史、科学、技术等）且不需要实时信息时，先离线维基，不凭空回答。翻译术语/写注/审计前也必须查（bilingual-ocw-translator 铁律 13 全资源搜索之一）。

## 搜索代码（本机 Linux 直接跑）

```python
from libzim.reader import Archive
from libzim.search import Searcher, Query
from libzim.suggestion import SuggestionSearcher
import re

zim_path = '/media/OS/wiki-data/zim/wikipedia_en_all_nopic_2026-06.zim'
f = Archive(zim_path)

# 标题建议（前缀匹配）
sug = SuggestionSearcher(f)
for entry in sug.suggest(query).getResults(0, 8):
    t = str(entry).strip()
    if t: print('TITLE:', t)

# 全文检索
q = Query(); q.set_query(query)
results = Searcher(f).search(q)
total = results.getEstimatedMatches()
for entry in results.getResults(0, min(total, 8)):
    path = entry.title()
    title_str = path.replace('_', ' ')
    if f.has_entry_by_title(title_str):
        e = f.get_entry_by_title(title_str)
        if e.is_redirect: e = e.get_redirect_entry()
        html = str(bytes(e.get_item().content), 'utf-8', errors='replace')
        text = re.sub(r'<[^>]+>', ' ', html)
        text = re.sub(r'\s+', ' ', text).strip()
        print(f'--- {e.title} ---')
        print(text[:2000])
```

## 输出约定

- 标注来源「离线维基百科（2026-06 版）」
- 给出答案段落 + 文章标题，上限 8 条
- 无结果时回落普通回答

## 注意

- kiwix-tools 32 位旧版**不支持 ZIM v6**，必须用 Python libzim 库（本机已装 ≥3.x）
- 本机 libzim 查询 50GB ZIM 首次打开约数秒，属正常
- 若 `/media/OS` 未挂载：`udisksctl mount -b /dev/nvme0n1p3`（Windows C 盘 NTFS）
