---
id: legacy-8aa48c5826dddbff2d695ce9
revision: 5
created_at: "2026-06-10T15:38:26Z"
updated_at: "2026-09-04T00:00:00Z"
name: offline-wiki-autosearch
description: 离线维基百科（2026-06 新版 51.9GB）— 本机 Linux 挂载盘 /media/OS/wiki-data/zim/，libzim 直搜；只有小电脑有知识库
metadata:
  type: user
  fact_type: project
  scope: global
---

# 离线维基百科自动搜索（内化能力）

## 资源（2026-09-04 实测修正：**只有小电脑（本机 Linux）有知识库**）

- **ZIM 文件在本机 Linux**：`/media/OS/wiki-data/zim/wikipedia_en_all_nopic_2026-06.zim`（英文维基，2026-06-26 版，无图，51.9GB，~1919 万篇文章）
  - `/media/OS` = Windows C 盘 NTFS，由小电脑 Linux 挂载（fstab 自动挂载）
  - 该 C 盘物理属于小电脑；**主力机（天阙九泉）没有任何 ZIM/wiki-data**（实测 `C:\wiki-data` False、`D:\知识库` False）
- **Python 库**: `libzim` 3.x（小电脑 Linux 已装），支持 ZIM v6 格式
- **Kiwix 工具**: 32 位旧版**不支持 ZIM v6**——必须用 Python libzim 库

## 路径变更记录（迁移史，最终落点在本机挂载盘）
- 2026-06-10：`D:\迅雷下载\wikipedia_en_all_nopic_2026-03.zim`（当时在 Windows 侧）
- 2026-07-31：迁至 `D:\知识库\`
- 2026-08-02：迁至 C 盘 `wiki-data\zim\` 并升级 2026-06 新版
- **2026-09-04 确认**：该 C 盘现由小电脑 Linux 挂载为 `/media/OS`，即 ZIM 实际路径 = `/media/OS/wiki-data/zim/wikipedia_en_all_nopic_2026-06.zim`。搜索在小电脑本机直接跑，无需 SSH。
- 2026-03 旧版已删除

## 下载工具（2026-08-02 新增）
- **aria2 便携版**：`C:\Users\27063\Desktop\工具箱\工具\aria2\aria2-1.37.0-win-64bit-build1\aria2c.exe`（winget 数据库损坏装不了，GitHub release 手动解压）
- 用法：`aria2c --dir=<目录> --out=<文件名> -x 16 -s 16 -k 1M --continue=true <URL>`（16线程分片，支持断点续传）
- 2026-06 官方 URL：`https://download.kiwix.org/zim/wikipedia/wikipedia_en_all_nopic_2026-06.zim`（301→302→mirrors.dotsrc.org）
- 官方 sha256（已验证一致）：`441a56d9e05b2d98f8ae9acb7986a513ed47904d73852c92dc6b7d50baa122e5`

## 什么时候自动使用

当用户的问题**涉及百科知识**（定义、概念、人物、地点、历史、科学、技术等），且**不需要实时/最新信息**（2026-06 之前），先用离线维基百科搜索，而不是凭空回答或上网搜。

## 搜索代码模板

### PocketWiki（8808，本机本地个人知识库）
- 启动：`cd ~/.reasonix/global-workspace/scripts/wiki && python3 pocket-wiki.py`（验证：curl http://127.0.0.1:8808 返回 200）
- 数据：`~/.reasonix/global-workspace/pages/` 每 .md = 一页
- **2026-09-04 实测：105 页 = 6 基础页（首页/个人/天阙九泉/DeepSeek对话记录/DeepSeek人格分析 等）+ 99 个 DS_*.md 对话页**（口径以 pages/ 实际为准，旧记忆「100/103/15 个对话」均为旧快照）
- 查询：`rg "关键词" pages/` 或 curl PocketWiki API（答案段落 + 页面标题）

### 快速搜索（全文检索 + 标题建议）
```python
from libzim.reader import Archive
from libzim.search import Searcher, Query
from libzim.suggestion import SuggestionSearcher
import re

zim_path = '/media/OS/wiki-data/zim/wikipedia_en_all_nopic_2026-06.zim'
f = Archive(zim_path)

# --- 标题建议（前缀匹配）---
sug = SuggestionSearcher(f)
sug_results = sug.suggest(query)
smatches = sug_results.getEstimatedMatches()
suggestions = []
for entry in sug_results.getResults(0, min(smatches, 8)):
    t = str(entry).strip()
    if t: suggestions.append(t)

# --- 全文检索 ---
q = Query()
q.set_query(query)
searcher = Searcher(f)
results = searcher.search(q)
total = results.getEstimatedMatches()
entries = results.getResults(0, min(total, 8))

for entry in entries:
    path = entry.title()
    # 通过标题查找
    title_str = path.replace('_', ' ')
    try:
        if f.has_entry_by_title(title_str):
            e = f.get_entry_by_title(title_str)
            title = e.title
            if e.is_redirect:
                e = e.get_redirect_entry()
            item = e.get_item()
            html = str(bytes(item.content), 'utf-8', errors='replace')
            text = re.sub(r'<[^>]+>', ' ', html)
            text = re.sub(r'\s+', ' ', text).strip()
    except:
        pass
```

## 输出约定
- 返回结果时标注来自离线维基百科（2026-06版）
- 重点给出答案段落 + 文章标题
- 搜索结果上限 8 条，避免输出过长
- 如果搜索无结果，回落普通回答
