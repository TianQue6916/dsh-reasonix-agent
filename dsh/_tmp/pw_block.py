_PAGE_CACHE = {}
_SPLIT_RE = re.compile(r"""[\s,，、;；:：!！?？()（）\[\]【】"'“”‘’<>《》/\\|+=*#~`]+""")


def _page_body(path):
    """读页面正文，按 (mtime, size) 缓存，避免每次请求重读全部 md。"""
    try:
        st = os.stat(path)
    except OSError:
        return None
    hit = _PAGE_CACHE.get(path)
    if hit is not None and hit[0] == st.st_mtime and hit[1] == st.st_size:
        return hit[2]
    try:
        with open(path, "r", encoding="utf-8") as f:
            body = f.read()
    except OSError:
        return None
    _PAGE_CACHE[path] = (st.st_mtime, st.st_size, body)
    return body


def _pocketwiki_terms(query):
    """切词：空白 + 中英文标点；保留长度 >= 2 的词（单个汉字太泛，容易全命中）。"""
    return [t.lower() for t in _SPLIT_RE.split(query.strip()) if len(t.strip()) >= 2]


def search_pocketwiki(query, max_results):
    """PocketWiki 检索：整串子串 + 多词 AND。

    2026-11-08 升级（原来只有整串子串匹配，长句自然 query 必然 0 命中）：
      * score 3：整串（lowercase）出现在 title+content 里 —— 旧行为，最精确
      * score 2：按空白/标点切词（>= 2 字符），所有词都命中 —— 长句也能中
      * 都不命中则跳过；按 score 降序、文件名升序取前 max_results 条
    """
    results = []
    try:
        names = os.listdir(PAGES_DIR)
    except OSError:
        return results
    needle = query.lower().strip()
    if not needle:
        return results
    terms = _pocketwiki_terms(query)
    hits = []
    for fname in names:
        if not fname.endswith(".md"):
            continue
        path = os.path.join(PAGES_DIR, fname)
        content = _page_body(path)
        if content is None:
            continue
        title = os.path.splitext(fname)[0]
        low = content.lower()
        hay = (title + "\n" + content).lower()
        pos = hay.find(needle)
        if pos >= 0:
            score = 3
            anchor = low.find(needle)
            span = len(needle)
        elif terms and all(t in hay for t in terms):
            score = 2
            anchor = low.find(terms[0])
            span = len(terms[0])
        else:
            continue
        if anchor >= 0:
            start = max(0, anchor - 60)
            end = min(len(content), anchor + span + 140)
            snippet = content[start:end].replace("\n", " ").strip()
            if start > 0:
                snippet = "…" + snippet
            if end < len(content):
                snippet += "…"
        else:
            snippet = content[:200].replace("\n", " ").strip()
        url = f"http://{HOST}:{PORT}/pocketwiki/" + urllib.parse.quote(title)
        hits.append(
            (
                -score,
                fname,
                {"url": url, "title": title, "snippet": snippet[:400], "provider": "pocketwiki"},
            )
        )
    for _neg, _fname, item in sorted(hits, key=lambda h: (h[0], h[1])):
        results.append(item)
        if len(results) >= max_results:
            break
    return results


