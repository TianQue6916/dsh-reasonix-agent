---
id: legacy-8aa48c5826dddbff2d695ce9
revision: 4
created_at: "2026-06-10T15:38:26Z"
updated_at: "2026-08-02T09:53:40.8652022Z"
name: offline-wiki-autosearch
description: 离线维基百科（2026-06 新版 49.1GB，已迁至 C:\wiki-data\zim\）— 自动搜索流程与 aria2 下载方法
metadata:
  type: user
  fact_type: project
  scope: global
---

# 离线维基百科自动搜索（内化能力）

## 资源
- **ZIM 文件**: `C:\wiki-data\zim\wikipedia_en_all_nopic_2026-06.zim`（英文维基，2026-06-26版，无图，49.1GB，~1919万篇文章）
- **Python 库**: `libzim` 3.10.0（已安装），支持 ZIM v6 格式
- **Kiwix 工具**: `C:\Users\27063\Desktop\工具箱\wiki\kiwix-tools_win-i686-3.7.0-2/`（32位，**不支持 ZIM v6**——必须用 Python libzim 库）

## 路径变更记录
- 2026-06-10：`D:\迅雷下载\wikipedia_en_all_nopic_2026-03.zim`
- 2026-07-31：迁至 `D:\知识库\`
- **2026-08-02：迁至 `C:\wiki-data\zim\` 并升级为 2026-06 新版**（wiki.sh / WIKI_README 原设计路径，C/D 同一块 NVMe SSD 无性能损失）
- 2026-03 旧版已删除；桌面快捷方式已改名 `wikipedia_en_all_nopic_2026-06.zim - 快捷方式.lnk` 并指向新路径

## 下载工具（2026-08-02 新增）
- **aria2 便携版**：`C:\Users\27063\Desktop\工具箱\工具\aria2\aria2-1.37.0-win-64bit-build1\aria2c.exe`（winget 数据库损坏装不了，GitHub release 手动解压）
- 用法：`aria2c --dir=<目录> --out=<文件名> -x 16 -s 16 -k 1M --continue=true <URL>`（16线程分片，支持断点续传）
- 2026-06 官方 URL：`https://download.kiwix.org/zim/wikipedia/wikipedia_en_all_nopic_2026-06.zim`（301→302→mirrors.dotsrc.org）
- 官方 sha256（已验证一致）：`441a56d9e05b2d98f8ae9acb7986a513ed47904d73852c92dc6b7d50baa122e5`

## 什么时候自动使用

当用户的问题**涉及百科知识**（定义、概念、人物、地点、历史、科学、技术等），且**不需要实时/最新信息**（2026-06 之前），先用离线维基百科搜索，而不是凭空回答或上网搜。

## 搜索代码模板

### 快速搜索（全文检索 + 标题建议）
```python
from libzim.reader import Archive
from libzim.search import Searcher, Query
from libzim.suggestion import SuggestionSearcher
import re

zim_path = r'C:\wiki-data\zim\wikipedia_en_all_nopic_2026-06.zim'
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
