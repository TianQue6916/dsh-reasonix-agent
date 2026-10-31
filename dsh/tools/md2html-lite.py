"""md2html-lite: bilingual Markdown -> standalone HTML with local KaTeX.

Usage: python md2html-lite.py <input.md> [output.html]
KaTeX assets are linked from C:/Users/27063/.dsh/tools/node_modules/katex/dist
via a relative copy into ./_assets (created if missing).

Supports: ATX headings, fenced code (math -> display math, else <pre>),
blockquote, ordered/unordered lists, markdown tables, hr, bold, inline code,
inline $...$, and raw HTML passthrough (colored spans).
"""
import io
import os
import re
import shutil
import sys

KATEX_DIST = r"C:/Users/27063/.dsh/tools/node_modules/katex/dist"

CSS = """
:root { color-scheme: light; }
body { max-width: 980px; margin: 0 auto; padding: 28px 20px 120px;
  font-family: "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
  font-size: 16px; line-height: 1.75; color: #1a1a1a; background: #fff; }
h1 { font-size: 1.7em; border-bottom: 2px solid #d0d7de; padding-bottom: .3em; }
h2 { font-size: 1.35em; margin-top: 2.2em; border-bottom: 1px solid #e2e6ea; padding-bottom: .25em; }
h3 { font-size: 1.15em; margin-top: 1.9em; }
h4 { font-size: 1.02em; margin-top: 1.6em; color: #333; }
pre { background: #f6f8fa; border: 1px solid #d8dee4; border-radius: 6px;
  padding: 12px 14px; overflow-x: auto; line-height: 1.45; }
code { font-family: Consolas, "Cascadia Mono", monospace; font-size: .92em;
  background: #f0f2f5; padding: 1px 5px; border-radius: 4px; }
pre code { background: none; padding: 0; font-size: .88em; }
table { border-collapse: collapse; margin: 1em 0; width: 100%; font-size: .95em; }
th, td { border: 1px solid #d0d7de; padding: 7px 10px; vertical-align: top; text-align: left; }
th { background: #eef2f6; }
blockquote { margin: 1em 0; padding: .2em 1em; border-left: 4px solid #b8c4d0;
  background: #f7f9fb; color: #2b2b2b; }
hr { border: none; border-top: 1px solid #d0d7de; margin: 2.4em 0; }
.math-block { margin: 1em 0; text-align: center; overflow-x: auto; }
.pagemark { color: #8a97a5; font-size: .8em; margin-top: 2.4em; }
.katex { font-size: 1.02em; }
"""


def esc(t: str) -> str:
    return (t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def inline(t: str) -> str:
    # protect raw HTML tags (colored spans etc.) before escaping
    hstore = []

    def keep_html(m):
        hstore.append(m.group(0))
        return "\x02%d\x02" % (len(hstore) - 1)

    t = re.sub(r"</?[a-zA-Z][^>]*>", keep_html, t)
    # protect inline code
    store = []

    def keep(m):
        store.append(m.group(1))
        return "\x00%d\x00" % (len(store) - 1)

    t = re.sub(r"`([^`]+)`", keep, t)
    # protect inline math (keep $ so client-side auto-render handles it)
    mstore = []

    def keep_math(m):
        mstore.append(m.group(0))
        return "\x01%d\x01" % (len(mstore) - 1)

    DLR = "\x03DLR\x03"
    t = t.replace("\\$", DLR)
    t = re.sub(r"\$[^$]+\$", keep_math, t)
    t = t.replace(DLR, "&#36;")
    t = esc(t)
    t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
    t = re.sub(r"(?<![\w*])\*([^*\n]+)\*(?![\w*])", r"<em>\1</em>", t)
    t = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', t)
    t = re.sub(r"\x00(\d+)\x00", lambda m: "<code>" + esc(store[int(m.group(1))]) + "</code>", t)
    t = re.sub(r"\x01(\d+)\x01", lambda m: mstore[int(m.group(1))], t)
    t = re.sub(r"\x02(\d+)\x02", lambda m: hstore[int(m.group(1))], t)
    return t


def convert(md: str) -> str:
    lines = md.split("\n")
    out = []
    i = 0
    n = len(lines)
    while i < n:
        ln = lines[i]
        # fenced code
        if ln.startswith("```"):
            lang = ln[3:].strip()
            i += 1
            buf = []
            while i < n and not lines[i].startswith("```"):
                buf.append(lines[i])
                i += 1
            i += 1
            body = "\n".join(buf)
            if lang == "math":
                out.append('<div class="math-block">$$%s$$</div>' % esc_math(body))
            else:
                out.append('<pre><code class="lang-%s">%s</code></pre>' % (lang or "text", esc(body)))
            continue
        # html comment page marker
        m = re.match(r"^<!-- ===== (p\d+) ===== -->$", ln.strip())
        if m:
            out.append('<div class="pagemark" id="%s">&#9679; %s</div>' % (m.group(1), m.group(1)))
            i += 1
            continue
        if ln.strip() == "---":
            out.append("<hr>")
            i += 1
            continue
        # heading
        m = re.match(r"^(#{1,6})\s+(.*)$", ln)
        if m:
            lvl = len(m.group(1))
            out.append("<h%d>%s</h%d>" % (lvl, inline(m.group(2)), lvl))
            i += 1
            continue
        # table
        if ln.strip().startswith("|") and i + 1 < n and re.match(r"^\s*\|[\s:|-]+\|\s*$", lines[i + 1]):
            header = [c.strip() for c in ln.strip().strip("|").split("|")]
            i += 2
            rows = []
            while i < n and lines[i].strip().startswith("|"):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")])
                i += 1
            out.append("<table><thead><tr>%s</tr></thead><tbody>%s</tbody></table>" % (
                "".join("<th>%s</th>" % inline(c) for c in header),
                "".join("<tr>%s</tr>" % "".join("<td>%s</td>" % inline(c) for c in r) for r in rows)))
            continue
        # blockquote
        if ln.startswith(">"):
            buf = []
            while i < n and (lines[i].startswith(">") or lines[i].strip() == ""):
                if lines[i].strip() == "" and (i + 1 >= n or not lines[i + 1].startswith(">")):
                    break
                buf.append(re.sub(r"^>\s?", "", lines[i]))
                i += 1
            inner = convert("\n".join(buf))
            out.append("<blockquote>%s</blockquote>" % inner)
            continue
        # list
        if re.match(r"^\s*([-*+]|\d+\.)\s+", ln):
            ordered = bool(re.match(r"^\s*\d+\.", ln))
            tag = "ol" if ordered else "ul"
            buf = []
            while i < n and re.match(r"^\s*([-*+]|\d+\.)\s+", lines[i]):
                buf.append(re.sub(r"^\s*([-*+]|\d+\.)\s+", "", lines[i]))
                i += 1
            out.append("<%s>%s</%s>" % (tag, "".join("<li>%s</li>" % inline(b) for b in buf), tag))
            continue
        if ln.strip() == "":
            i += 1
            continue
        # paragraph: gather until blank / structural
        buf = []
        while i < n and lines[i].strip() != "" and not lines[i].startswith("```") \
                and not re.match(r"^(#{1,6})\s+", lines[i]) and not lines[i].startswith(">") \
                and not re.match(r"^\s*([-*+]|\d+\.)\s+", lines[i]) and not lines[i].strip().startswith("|") \
                and lines[i].strip() != "---" and not lines[i].strip().startswith("<!--"):
            buf.append(lines[i])
            i += 1
        if not buf:
            # unhandled structural line (e.g. a lone '|' row): emit raw, always advance
            out.append("<p>%s</p>" % inline(lines[i]))
            i += 1
            continue
        out.append("<p>%s</p>" % inline(" ".join(buf)))
    return "\n".join(out)


def esc_math(t: str) -> str:
    return t.replace("<", "\\lt ").replace(">", "\\gt ")


def main():
    src = sys.argv[1]
    dst = sys.argv[2] if len(sys.argv) > 2 else os.path.splitext(src)[0] + ".html"
    base = os.path.dirname(os.path.abspath(dst))
    assets = os.path.join(base, "_assets")
    os.makedirs(assets, exist_ok=True)
    for f in ["katex.min.css", "katex.min.js", "contrib/auto-render.min.js"]:
        s = os.path.join(KATEX_DIST, f)
        d = os.path.join(assets, os.path.basename(f))
        if not os.path.exists(d):
            shutil.copy2(s, d)
    md = io.open(src, encoding="utf-8").read()
    body = convert(md)
    html = """<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>%s</title>
<link rel="stylesheet" href="_assets/katex.min.css">
<style>%s</style>
</head><body>
%s
<script src="_assets/katex.min.js"></script>
<script src="_assets/auto-render.min.js"></script>
<script>
renderMathInElement(document.body, {
  delimiters: [
    {left: "$$", right: "$$", display: true},
    {left: "$", right: "$", display: false}
  ],
  throwOnError: false, strict: false,
  ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code"]
});
</script>
</body></html>
""" % (os.path.basename(src), CSS, body)
    io.open(dst, "w", encoding="utf-8", newline="\n").write(html)
    print("wrote", dst, len(html.encode("utf-8")), "bytes; assets ->", assets)


if __name__ == "__main__":
    main()
