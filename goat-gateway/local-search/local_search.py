#!/usr/bin/env python3
"""
local-search.py — Tailscale 侧的本地搜索聚合器。

只做两件事：
  1. PocketWiki（/media/OS/wiki-data/pages/*.md）全文子串搜索
  2. 离线 Wikipedia ZIM（libzim 全文搜索 + 正文抽取）

给 Windows 侧的 dsh-plugin-local-search 调用；GitHub 全站搜索放在 Windows 插件里，
避免把 GitHub token 复制到 Linux。

接口：
  GET /health
  GET /search?q=<query>&max=<n>      # 需要 x-local-search-token
  GET /wiki/<title>                  # 返回离线维基正文纯文本（便于点击来源）
  GET /pocketwiki/<title>            # 返回 PocketWiki Markdown 原文

环境变量：
  LOCAL_SEARCH_HOST        默认 100.79.96.82
  LOCAL_SEARCH_PORT        默认 8810
  LOCAL_SEARCH_TOKEN_FILE  默认 ~/.config/local-search/token
  LOCAL_WIKI_ZIM           默认 /media/OS/wiki-data/zim/wikipedia_en_all_nopic_2026-06.zim
  LOCAL_POCKETWIKI_PAGES   默认 /media/OS/wiki-data/pages
  LOCAL_WIKI_LABEL         默认 "离线维基 2026-06"
"""

import html
import hmac
import json
import os
import re
import sys
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST = os.environ.get("LOCAL_SEARCH_HOST", "100.79.96.82")
PORT = int(os.environ.get("LOCAL_SEARCH_PORT", "8810"))
TOKEN_FILE = os.environ.get(
    "LOCAL_SEARCH_TOKEN_FILE", os.path.expanduser("~/.config/local-search/token")
)
WIKI_ZIM = os.environ.get(
    "LOCAL_WIKI_ZIM",
    "/media/OS/wiki-data/zim/wikipedia_en_all_nopic_2026-06.zim",
)
PAGES_DIR = os.environ.get("LOCAL_POCKETWIKI_PAGES", "/media/OS/wiki-data/pages")
WIKI_LABEL = os.environ.get("LOCAL_WIKI_LABEL", "离线维基 2026-06")
DEFAULT_MAX = 8
MAX_MAX = 20


def load_token():
    try:
        with open(TOKEN_FILE, "r", encoding="utf-8") as f:
            return f.read().strip()
    except OSError:
        return os.environ.get("LOCAL_SEARCH_TOKEN", "").strip()


TOKEN = load_token()
if not TOKEN and os.environ.get("LOCAL_SEARCH_ALLOW_NO_TOKEN") != "1":
    print(
        f"[local-search] no token: {TOKEN_FILE} missing and LOCAL_SEARCH_TOKEN empty; "
        "refusing to start",
        file=sys.stderr,
        flush=True,
    )
    sys.exit(2)

_archive = None
_archive_lock = threading.Lock()


def get_archive():
    global _archive
    if _archive is None:
        from libzim.reader import Archive

        _archive = Archive(WIKI_ZIM)
    return _archive


def strip_html(markup):
    text = re.sub(r"(?is)<(script|style|noscript)[^>]*>.*?</\1>", " ", markup)
    text = re.sub(r"(?is)<br\s*/?>", "\n", text)
    text = re.sub(r"(?is)</p>", "\n", text)
    text = re.sub(r"(?is)<[^>]+>", " ", text)
    text = html.unescape(text)
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n\n", text)
    return text.strip()


def extract_intro(markup, limit=700):
    """尽量从 Wikipedia HTML 里取正文开头的 <p> 段落，跳过导航/信息框。"""
    text = re.sub(r"(?is)<(script|style|noscript)[^>]*>.*?</\1>", " ", markup)
    marker = re.search(r'(?is)<div[^>]+id="mw-content-text"', text)
    if marker:
        text = text[marker.start() :]
    paras = re.findall(r"(?is)<p[^>]*>(.*?)</p>", text)
    picked = []
    total = 0
    for p in paras:
        t = strip_html(p)
        t = re.sub(r"\[\d+\]", "", t)
        t = re.sub(r"\s+", " ", t).strip()
        if len(t) < 40:
            continue
        low = t.lower()
        if "jump to content" in low or "from wikipedia" in low:
            continue
        picked.append(t)
        total += len(t)
        if total >= limit:
            break
    return " ".join(picked)[:limit]


def extract_full_text(markup, limit=120000):
    text = strip_html(markup)
    text = re.sub(r"\[\d+\]", "", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text[:limit]


def resolve_entry(title):
    archive = get_archive()
    raw = str(title).split("#", 1)[0].strip()
    candidates = [raw]
    if "_" in raw:
        candidates.append(raw.replace("_", " "))
    try:
        dotted = raw.title()
        candidates.append(dotted)
        if "_" in dotted:
            candidates.append(dotted.replace("_", " "))
    except Exception:
        pass
    seen = set()
    for cand in candidates:
        cand = cand.strip()
        if not cand or cand in seen:
            continue
        seen.add(cand)
        try:
            if archive.has_entry_by_title(cand):
                entry = archive.get_entry_by_title(cand)
                if entry.is_redirect:
                    entry = entry.get_redirect_entry()
                return entry
        except Exception:
            continue
    return None


def search_wikipedia(query, max_results):
    with _archive_lock:
        archive = get_archive()
        raw_items = []
        try:
            from libzim.search import Query, Searcher

            q = Query()
            q.set_query(query)
            results = Searcher(archive).search(q)
            total = results.getEstimatedMatches()
            raw_items = [str(x) for x in results.getResults(0, min(total, max_results * 3))]
        except Exception as exc:
            print(f"[local-search] zim search failed: {exc}", file=sys.stderr, flush=True)

        if not raw_items:
            try:
                from libzim.suggestion import SuggestionSearcher

                sug = SuggestionSearcher(archive).suggest(query)
                total = sug.getEstimatedMatches()
                raw_items = [str(x) for x in sug.getResults(0, min(total, max_results))]
            except Exception as exc:
                print(f"[local-search] zim suggest failed: {exc}", file=sys.stderr, flush=True)

        sources = []
        for raw in raw_items:
            entry = resolve_entry(raw)
            if entry is None:
                continue
            title = entry.title
            try:
                item = entry.get_item()
                content = bytes(item.content).decode("utf-8", "replace")
                intro = extract_intro(content)
            except Exception:
                intro = ""
            url = f"http://{HOST}:{PORT}/wiki/" + urllib.parse.quote(title)
            snippet = f"[{WIKI_LABEL}] {intro}".strip()
            sources.append(
                {
                    "url": url,
                    "title": title,
                    "snippet": snippet[:600],
                    "provider": "wikipedia",
                }
            )
            if len(sources) >= max_results:
                break
        return sources


def search_pocketwiki(query, max_results):
    results = []
    try:
        names = os.listdir(PAGES_DIR)
    except OSError:
        return results
    needle = query.lower().strip()
    if not needle:
        return results
    for fname in names:
        if not fname.endswith(".md"):
            continue
        path = os.path.join(PAGES_DIR, fname)
        try:
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
        except OSError:
            continue
        title = os.path.splitext(fname)[0]
        hay = (title + "\n" + content).lower()
        idx = hay.find(needle)
        if idx < 0:
            continue
        ci = content.lower().find(needle)
        start = max(0, ci - 60)
        end = min(len(content), ci + len(needle) + 140)
        snippet = content[start:end].replace("\n", " ").strip()
        if start > 0:
            snippet = "…" + snippet
        if end < len(content):
            snippet += "…"
        url = f"http://{HOST}:{PORT}/pocketwiki/" + urllib.parse.quote(title)
        results.append(
            {
                "url": url,
                "title": title,
                "snippet": snippet[:400],
                "provider": "pocketwiki",
            }
        )
        if len(results) >= max_results:
            break
    return results


class Handler(BaseHTTPRequestHandler):
    server_version = "local-search/1.0"

    def log_message(self, fmt, *args):
        sys.stderr.write("[local-search] " + (fmt % args) + "\n")

    def _send_json(self, status, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _send_text(self, status, text, content_type="text/plain; charset=utf-8"):
        body = text.encode("utf-8", "replace")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _authorized(self):
        provided = self.headers.get("x-local-search-token", "")
        return bool(TOKEN) and hmac.compare_digest(provided, TOKEN)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        params = urllib.parse.parse_qs(parsed.query)

        if path == "/health":
            pages = 0
            try:
                pages = len([n for n in os.listdir(PAGES_DIR) if n.endswith(".md")])
            except OSError:
                pass
            self._send_json(
                200,
                {
                    "ok": True,
                    "service": "local-search",
                    "wiki_zim": WIKI_ZIM,
                    "wiki_zim_exists": os.path.exists(WIKI_ZIM),
                    "pocketwiki_pages": pages,
                    "host": HOST,
                    "port": PORT,
                },
            )
            return

        if path == "/search":
            if not self._authorized():
                self._send_json(403, {"ok": False, "error": "forbidden"})
                return
            query = (params.get("q") or [""])[0].strip()
            try:
                max_results = max(1, min(MAX_MAX, int((params.get("max") or [DEFAULT_MAX])[0])))
            except ValueError:
                max_results = DEFAULT_MAX
            if not query:
                self._send_json(400, {"ok": False, "error": "missing q"})
                return
            sources = []
            try:
                sources.extend(search_pocketwiki(query, max_results))
                if len(sources) < max_results:
                    sources.extend(search_wikipedia(query, max_results - len(sources)))
            except Exception as exc:
                self._send_json(500, {"ok": False, "error": str(exc)})
                return
            self._send_json(200, {"ok": True, "query": query, "sources": sources})
            return

        # 内容端点不加 token：服务只绑 Tailscale，链接要能在浏览器直接打开；
        # /search 仍然需要 token，避免被枚举。
        if path.startswith("/wiki/"):
            title = urllib.parse.unquote(path[len("/wiki/") :])
            try:
                with _archive_lock:
                    entry = resolve_entry(title)
                    if entry is None:
                        self._send_text(404, f"wiki entry not found: {title}")
                        return
                    item = entry.get_item()
                    content = bytes(item.content).decode("utf-8", "replace")
                    text = extract_full_text(content)
            except Exception as exc:
                self._send_text(500, f"wiki read failed: {exc}")
                return
            self._send_text(200, text)
            return

        if path.startswith("/pocketwiki/"):
            title = urllib.parse.unquote(path[len("/pocketwiki/") :])
            target = os.path.join(PAGES_DIR, title + ".md")
            try:
                with open(target, "r", encoding="utf-8") as f:
                    text = f.read()
            except OSError:
                self._send_text(404, f"pocketwiki page not found: {title}")
                return
            self._send_text(200, text)
            return

        self._send_json(404, {"ok": False, "error": "not found"})


def main():
    httpd = None
    for attempt in range(1, 61):
        try:
            httpd = ThreadingHTTPServer((HOST, PORT), Handler)
            break
        except OSError as exc:
            print(
                f"[local-search] bind {HOST}:{PORT} failed ({exc}); retry {attempt}/60",
                file=sys.stderr,
                flush=True,
            )
            time.sleep(2)
    if httpd is None:
        print(f"[local-search] could not bind {HOST}:{PORT}", file=sys.stderr, flush=True)
        sys.exit(1)
    print(f"[local-search] listening on http://{HOST}:{PORT}", flush=True)
    httpd.serve_forever()


if __name__ == "__main__":
    main()
