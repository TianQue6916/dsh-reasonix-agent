"""从 PaperPass AIGC 报告页 HTML 提取片段级分数。
结构：<a href="sentence_detail_ai.html" data-id="N" data-score="56.52"><span class="... purple">文本</span></a>
同一 data-id 的多个 <a> 属于同一片段（文本按行切碎）。
用法：python score_parse.py out/_ai.html
"""
import re, sys, json, html as H
from pathlib import Path

def parse(path):
    h = Path(path).read_text(encoding="utf-8")
    frag = {}
    order = []
    for m in re.finditer(
        r'<a href="sentence_detail_ai\.html"\s+data-id="(\d+)"\s+data-score="([\d.]+)"[^>]*>(.*?)</a>',
        h, re.S):
        fid, sc, inner = m.group(1), float(m.group(2)), m.group(3)
        txt = re.sub(r"<[^>]+>", "", inner)
        txt = H.unescape(txt).replace("\u200b", "").strip()
        if fid not in frag:
            frag[fid] = {"id": int(fid), "score": sc, "text": ""}
            order.append(fid)
        frag[fid]["text"] += txt
    return [frag[k] for k in sorted(order, key=lambda x: int(x))]

if __name__ == "__main__":
    fs = parse(sys.argv[1] if len(sys.argv) > 1 else "out/_ai.html")
    hz = lambda s: len(re.findall(r"[\u4e00-\u9fff]", s))
    tot = sum(hz(f["text"]) for f in fs)
    print(f"片段 {len(fs)}，汉字 {tot}")
    for f in fs:
        f["hz"] = hz(f["text"])
    band = lambda s: "红" if s >= 70 else "橙" if s >= 60 else "紫" if s >= 50 else "黑"
    from collections import Counter
    print(Counter(band(f["score"]) for f in fs))
    print()
    for f in sorted(fs, key=lambda x: -x["score"]):
        print(f"[{f['score']:5.2f}] {band(f['score'])} {f['hz']:4d}字  {f['text'][:70]}")
