---
name: tool-offline-wiki
description: 离线维基百科搜索 — ZIM 49.1GB/~1900万篇（主力机 C:\wiki-data），libzim 库
---

---
name: tool-offline-wiki
description: 离线维基百科搜索 — ZIM 文件（英文 51.9GB，~1900万篇），libzim 库，替代联网搜索
---

# Tool: 离线维基百科搜索

英文维基百科离线版（ZIM 格式，~1900万篇文章），用于百科知识类问题（定义/概念/人物/历史/科学），无需联网。

## 资源位置

- **ZIM 文件（主力机）**: `C:\wiki-data\zim\wikipedia_en_all_nopic_2026-06.zim`（49.1GB，2026-06-26 版）
- 旧路径参考: `D:\迅雷下载\wikipedia_en_all_nopic_2026-03.zim`
- **本机 Linux**: 需先 SSH 到主力机或本地挂载；libzim 库（Python）在本机 Linux 需 `pip install libzim`

## 使用时机

用户问题涉及**百科知识**（定义、概念、人物、地点、历史、科学、技术等）且**不需要实时信息**时，优先离线维基，不凭空回答。

## 搜索代码模板（主力机 Windows 上运行）

```python
from libzim.reader import Archive
from libzim.search import Searcher, Query
from libzim.suggestion import SuggestionSearcher
import re

zim_path = r'C:\wiki-data\zim\wikipedia_en_all_nopic_2026-06.zim'
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

## 远程执行（本机 Linux 触发主力机搜索）

```python
# 通过 control-main-machine 技能 SSH 到主力机后执行上述 Python
```

## 注意

- kiwix-tools 32 位旧版**不支持 ZIM v6**，必须用 Python libzim 库
- libzim 需支持 ZIM v6 的版本（≥3.x）
