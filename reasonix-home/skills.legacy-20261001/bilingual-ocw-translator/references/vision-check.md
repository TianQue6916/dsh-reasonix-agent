> **按需加载章节**（主文档 `SKILL.md` 的 progressive disclosure 拆分件）。本技能全流程唯一模型：v4.1 flash = `deepseek-v4.1-flash`；契约与铁律见主文档「🎯 核心契约」与第 1 章。

---

# 第 9 章 视觉核对流水线（扫描版教材**必做**，2026-09-23 用户拍板「以后可以多侧重视觉」）

> 🚨 **定位：这是「无文字层的扫描版」教材/讲义翻译的必做环节，不是可选优化。** 凡是 `pdftotext` 提取为空、只能靠 OCR 的源文件，交付前都要过一遍本章。
>
> **动因（Strang LaLFD part004 实测）**：Windows OCR（winrt）会**整段丢公式**——
> ① p.169 的公式 (4) 在 OCR 里只剩一个 `and`（正文两式全丢）；
> ② p.196 的 $\delta<\sqrt{2}-1$ 被读成 `軛 一 1`，译者据上下文误还原为 `0.1`，并在译者注里围绕这个错误常数写了整整一段；
> ③ p.197 的示例矩阵 $A_0,B_0,C_0$ 被写成 $A_{11},A_{12},A_{13}$。
> 这些**都不是翻译问题**，靠 OCR 文本也查不出来——只有**看原页**才能发现。

## 9.1 能力事实（前置，必读）

- 🚨 **`deepseek/deepseek-v4.1-flash` 支持图像输入**（GOAT endpoint）→ 可当「扫描页权威转写器」用
- 端点与鉴权：`~/.dsh/settings.yaml` 的 `baseURL: https://api.commandcode.ai/provider/v1` + `/chat/completions`；key 取 `~/.dsh/.env` 的 `COMMANDCODE_API_KEY`
- 请求体形态：

```json
{"model": "deepseek/deepseek-v4.1-flash",
 "messages": [{"role": "user", "content": [
   {"type": "text", "text": "Transcribe this scanned book page verbatim; all math as LaTeX; keep equation numbers."},
   {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,<...>"}}]}],
 "max_tokens": 8192}
```

- 🚨 **两个必踩的坑**：
  1. **必须带浏览器 `User-Agent`**（`Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36`），否则 **HTTP 403 error code 1010**（Cloudflare 拦 UA）
  2. `deepseek-v4-flash-vision-exp` **在该端点不被支持**（`unsupported_model`）——能用的就是 `deepseek/deepseek-v4.1-flash`
- 🚨🚨 **模型名必须带 `deepseek/` 前缀，漏写会被误判成"没有视觉通道"**（2026-09-23 part005 真实事故）：
  - `deepseek/deepseek-v4.1-flash` → ✅ 正常读图并逐式转写（实测 954 字符，Toeplitz/Circulant 矩阵与 $e^{in\theta}=1$ 全部正确）
  - `deepseek-v4.1-flash`（**漏前缀**）→ ❌ `HTTP 400 unsupported_model`
  - 上一轮正是因为漏了前缀 + 用错模型名，连续两次"实测"失败后就宣布「dsh headless 无图像通道」，**把整章视觉核对改成主代理逐页看图改稿**，绕过了本流水线（不留下"权威原文"转写件、不可审计、且改稿引入了 203 处术语格式违规）。
  - **教训**：判定"某能力不可用"之前，必须**逐字照抄技能里给的模型名与请求体**再测一次；测失败要区分「模型名错」「漏 UA」「端点不支持」三种原因，不能笼统归为"通道不存在"。
- 图像预处理：200 dpi 页面 PNG（1654×2339）→ 缩到**宽 1100** + JPEG q85。每页约 30–60 秒；**3 并发跑 50 页约 6 分钟**

## 9.2 流程（四步，插在原流程的 OCR 之后、翻译之前）

| 步 | 动作 | 产物 |
|----|------|------|
| 1 | 渲染 + Windows OCR（原流程） | `pages/page_NNN.txt`（初稿，允许有噪声） |
| 2 | **视觉转写**：每页丢给 v4.1 → 权威原文 | `vision_out/page_NNN.txt`（LaTeX 公式 + 印刷编号） |
| 3 | **比对**：编号存在性 + 缺失判据 | 缺编号/缺公式清单 |
| 4 | **终校订正**：派 dsh 任务，输入=【权威原文】+【当前译文】，输出=修订后全文 | 覆盖 `pages/` |

- 波 1 的翻译 worker 可以只吃 OCR 初稿（第 2 步的转写在**审计/终校阶段**注入更划算）；
- 但**终校任务必须同时给两份材料**，并要求「凡与原译文冲突，一律以权威原文为准」；输出协议仍用 `@@PAGE:NNN@@` / `@@BREAK@@`；
- 单任务规模：**每 2 页一个任务**（输入 ≈ 6 KB 转写 + 6–12 KB 译文 + prompt），实测 25 个任务分 4 批跑 3–6 分钟。

## 9.3 可靠比对信号（按可信度排序）

| 信号 | 含义 | 处理 |
|------|------|------|
| 原文有 `\tag{n}` 而译文无该编号 | 编号丢失（公式在但没编号）**或**整段漏译 | 用公式特征串二次判定（见 `check_missing.py`） |
| OCR 里出现**孤立 `and`**、只剩编号无主体、只剩运算符 | **OCR 丢了整条公式** | 视觉补读原页，补齐并加 OCR 修正注 |
| 译文里公式特征串也搜不到 | 真·整段漏译 | 必须补译 |
| 页末引用行出现 `§11.x` / `§111.x` | 罗马数字被转写成阿拉伯数字 | 机械改回 `§II.x` / `§III.x`（正则 `§\s*(1{1,3})\.(\d+)`） |
| 「译文多出编号」 | **多为假阳性**（vision 用 `align`/`equation` 环境，抽取漏了） | 抽查 1–2 处再决定，别急着改 |

## 9.4 🚨 副作用检查清单（part004 真实踩过，逐条必查）

1. **订正会删注**：波 5 订正后译者注 **84 → 75**（page_173 丢 4 条、page_188 丢 1 条）。→ **订正前后都要统计译者注条数**（`count_notes.py`），丢失的从 `backup/<stamp>-before-*` 按段落定位回插。
   - 注指纹必须用「**标签文字 + 正文前 20 字**」；只取前 40 个字符会因所有注的标签前缀相同而误判"已存在"（本轮踩过，导致恢复 0 条）。
2. **math 围栏失衡**：订正会删掉 `> ```math` 开头、留下孤立的结束 ```。→ 必跑 `check_format.py` 的 fence 检查；统计围栏时要**先剥掉 blockquote 前缀 `> `**，否则漏计。
3. **超长任务静默失败**：输入=原文+译文时极易超 **32767 字符**（Windows 命令行上限）→ dsh `rc=0` 但**零输出**。单页任务也可能 36 KB（注多的页）→ 需再拆或跳过。
4. **订正后必跑**：`check_format.py` → `check_crosspage.py` → `assemble.py` → 重新生成 PDF（WPS 打开）。
5. **人眼抽查仍有价值**：视觉转写让机器能比对，但**结论要人看**——part004 的 5 处实质错误里，有 3 处是「机器只报相似度低、人一看就懂」的类型。

## 9.5 可复用脚本（第 9 章产物，直接抄到新工作区）

**`vision_ocr.py`** — 批量视觉转写：渲染页 → 缩图 → v4.1 → `vision_out/page_NNN.txt`（带宽 1100 + JPEG q85 + 浏览器 UA）

```python
# -*- coding: utf-8 -*-
"""Batch-transcribe the scanned pages with the vision-capable GOAT model.

Purpose: get an authoritative transcription (formulas in LaTeX) of each source
page, so the translation can be diffed against the original instead of against
the noisy Windows-OCR text.

Usage: python vision_ocr.py [start_page] [end_page] [workers]
Writes: <WS>/vision_out/page_NNN.txt  (one file per page)
"""
import base64, io, json, os, re, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
sys.stdout.reconfigure(encoding='utf-8')

WS = r"C:\Users\27063\AppData\Roaming\reasonix\文件翻译\strang_p004"
PNG = r"C:\Users\27063\strang_ocr_pages_p004"
OUT = os.path.join(WS, "vision_out")
os.makedirs(OUT, exist_ok=True)

HOME = os.path.expanduser("~")
key = None
for ln in open(os.path.join(HOME, ".dsh", ".env"), encoding="utf-8", errors="replace"):
    m = re.match(r'^\s*COMMANDCODE_API_KEY=(.*)$', ln.strip())
    if m:
        key = m.group(1).strip().strip('"').strip("'")
stxt = open(os.path.join(HOME, ".dsh", "settings.yaml"), encoding="utf-8-sig", errors="replace").read()
base = re.search(r'(?mi)^\s*baseURL:\s*(\S+)', stxt).group(1).strip().strip('"')
URL = base.rstrip("/") + "/chat/completions"
MODEL = os.environ.get("VISION_MODEL", "deepseek-v4-flash-vision-exp")

PROMPT = ("This is a scanned page from Gilbert Strang's 'Linear Algebra and Learning From Data'. "
          "Transcribe it faithfully: every sentence and EVERY formula. "
          "Write all mathematics as LaTeX (\\\\frac, \\\\lambda, \\\\begin{bmatrix} ...). "
          "Keep equation numbers like (23). Do not summarize, do not translate, do not add commentary.")

def transcribe(pdfpage):
    dst = os.path.join(OUT, f"page_{pdfpage}.txt")
    if os.path.exists(dst) and os.path.getsize(dst) > 400:
        return (pdfpage, "cached")
    idx = pdfpage - 150
    src = os.path.join(PNG, f"page_{idx:03d}.png")
    im = Image.open(src).convert("RGB")
    w, h = im.size
    im = im.resize((1100, int(h * 1100 / w)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=85)
    b64 = base64.b64encode(buf.getvalue()).decode()
    payload = {"model": MODEL, "messages": [{"role": "user", "content": [
        {"type": "text", "text": PROMPT},
        {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + b64}}]}],
        "max_tokens": 8192}
    req = urllib.request.Request(URL, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json",
                                          "Accept": "application/json",
                                          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                                                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                                                        "Chrome/126.0.0.0 Safari/537.36",
                                          "Authorization": "Bearer " + key})
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            out = json.load(r)
        msg = out["choices"][0]["message"]["content"]
        open(dst, "w", encoding="utf-8").write(msg)
        return (pdfpage, f"ok {len(msg)} chars")
    except urllib.error.HTTPError as e:
        return (pdfpage, f"HTTP {e.code} {e.read()[:200].decode('utf-8','replace')}")
    except Exception as e:
        return (pdfpage, f"ERR {type(e).__name__} {e}")

if __name__ == "__main__":
    a = int(sys.argv[1]) if len(sys.argv) > 1 else 151
    b = int(sys.argv[2]) if len(sys.argv) > 2 else 200
    workers = int(sys.argv[3]) if len(sys.argv) > 3 else 3
    pages = list(range(a, b + 1))
    print(f"transcribing {len(pages)} pages with {MODEL}, {workers} workers", flush=True)
    done = 0
    with ThreadPoolExecutor(max_workers=workers) as ex:
        for pg, res in ex.map(transcribe, pages):
            done += 1
            print(f"[{done}/{len(pages)}] page_{pg}: {res}", flush=True)
    print("ALL DONE", flush=True)
```

**`diff_tags.py`** — 编号存在性比对：原文 vs 译文的 `\tag{n}` / `(n)`，输出缺失编号及其原文公式

```python
# -*- coding: utf-8 -*-
"""Reliable diff: equation-number presence, plus the original formula body for
each number the translation is missing (so a human can judge quickly).
"""
import os, re, sys, glob
sys.stdout.reconfigure(encoding='utf-8')

WS = r"C:\Users\27063\AppData\Roaming\reasonix\文件翻译\strang_p004"
PAGES = os.path.join(WS, "pages")
VIS = os.path.join(WS, "vision_out")

DISPLAY = re.compile(r'(?:\\\[(.*?)\\\]|\$\$(.*?)\$\$|\\begin\{equation\*?\}(.*?)\\end\{equation\*?\})', re.S)

def vision_tags(text):
    out = {}
    for m in DISPLAY.finditer(text):
        body = next(g for g in m.groups() if g is not None)
        for tg in re.finditer(r'\\tag\{(\d+)\}', body):
            out[int(tg.group(1))] = body.strip()
    # inline tags (vision sometimes emits plain (n) at line end after a formula line)
    for m in re.finditer(r'(?m)^(.*?)\s*\\tag\{(\d+)\}\s*$', text):
        out.setdefault(int(m.group(2)), m.group(1).strip())
    # bare printed numbers like  (13)  at line end
    for m in re.finditer(r'(?m)^(.*?)\s*\((\d{1,2})\)\s*$', text):
        out.setdefault(int(m.group(2)), m.group(1).strip())
    return out

def trans_tags(text):
    out = {}
    for m in re.finditer(r'```math\s*\n(.*?)\n```', text, re.S):
        body = m.group(1)
        tg = re.search(r'\\tag\{(\d+)\}', body)
        if tg:
            out[int(tg.group(1))] = body.strip()
    for m in re.finditer(r'(?m)^(.{0,300}?)\\tag\{(\d+)\}\s*$', text):
        out.setdefault(int(m.group(2)), m.group(1).strip())
    for m in re.finditer(r'(?m)^(.{0,300}?)\s*\((\d{1,2})\)\s*$', text):
        out.setdefault(int(m.group(2)), m.group(1).strip())
    return out

print("page\t缺编号\t原文该编号的公式（截断）")
rows = []
for f in sorted(glob.glob(os.path.join(VIS, "page_*.txt"))):
    p = int(re.search(r'page_(\d+)\.txt', f).group(1))
    tp = os.path.join(PAGES, f"page_{p}.bilingual.md")
    if not os.path.exists(tp):
        continue
    vt = vision_tags(open(f, encoding="utf-8").read())
    tt = trans_tags(open(tp, encoding="utf-8").read())
    missing = sorted(set(vt) - set(tt))
    extra = sorted(set(tt) - set(vt))
    if missing:
        print(f"\npage_{p}\t缺 {missing}")
        for n in missing:
            print(f"   ({n}) 原文: " + re.sub(r'\s+', ' ', vt[n])[:230])
    if extra:
        print(f"page_{p}\t译文多出编号 {extra}（疑错号，需核对）")
        rows.append((p, missing, extra))

print("\n===== 汇总 =====")
print("有缺号的页:", [r[0] for r in rows])
```

**`check_missing.py`** — 对每个缺失编号，用公式特征串在译文里搜 → 区分「编号丢失」与「整段漏译」

```python
# -*- coding: utf-8 -*-
"""For each equation number that the vision transcript has but the translation
lacks, test whether the translation already contains that formula in another
form (search a few characteristic tokens from the original formula)."""
import os, re, sys
sys.stdout.reconfigure(encoding='utf-8')
WS = r"C:\Users\27063\AppData\Roaming\reasonix\文件翻译\strang_p004"
PAGES = os.path.join(WS, "pages")
VIS = os.path.join(WS, "vision_out")

CASES = [
    (154, 8,  [r'\\partial\s*\)?\{?\s*L', r'p_j\^2', r'\\lambda']),
    (156, 9,  [r'Q_C', r'Q_R', r'widehat\{C\}', r'\\perp']),
    (163, 4,  [r'E\^\{-1\}', r'begin\{bmatrix\}\s*I\s*&\s*0']),
    (171, 1,  [r'dA\^\{-1\}', r'Delta\s*A\^\{-1\}', r'\\frac\{dA\^\{-1\}\}\{dt\}']),
    (173, 8,  [r'\\frac\{du\^T\}\{dt\}', r'du\^T', r'\\sigma\(t\)']),
    (173, 11, [r'zI\s*-\s*S', r'\(zI']),
    (175, 15, [r'lambda_\{\\max\}', r'lambda\^\{\\max\}', r'\\lambda_\{\\rm max\}']),
    (181, 2,  [r'y_1\s*z_1', r'y_\{1\}', r'Y_1\s*F\s*Z_1']),
    (183, 4,  [r'begin\{bmatrix\}\s*1\s*&\s*x_1', r'x_1\^\{n-1\}', r'Vandermonde']),
    (183, 5,  [r'begin\{bmatrix\}\s*x_1', r'x_\{n\}\^\{n\}', r'x_n\^n']),
]

print("page\ttag\t译文里有编号\t译文里有公式特征\ttranscript")
for pg, tag, pats in CASES:
    tp = os.path.join(PAGES, f"page_{pg}.bilingual.md")
    t = open(tp, encoding="utf-8").read()
    has_tag = bool(re.search(r'\\tag\{%d\}' % tag, t) or re.search(r'\(%d\)' % tag, t))
    hits = [p for p in pats if re.search(p, t)]
    vt = open(os.path.join(VIS, f"page_{pg}.txt"), encoding="utf-8").read()
    print(f"{pg}\t({tag})\t{has_tag}\t{hits}\t{'vision 有该编号' if re.search(r'\\\\tag\{%d\}' % tag, vt) else '-'}")
```

**`fix_restore.py`** — 从备份恢复被订正误删的译者注 + 重建被删掉开头的 ```math 块

```python
# -*- coding: utf-8 -*-
"""Retry the two repairs with correct logic.

A) page_155: the stray ``` fence closes a ```math block whose opening line was
   deleted by wave-5 -> rebuild the block around the orphan formula line.
B) page_173 / page_188: restore dropped translator notes; identity is now
   (label text + first 20 chars of prose) instead of a shared 40-char prefix.
"""
import os, re, sys, glob, difflib
sys.stdout.reconfigure(encoding='utf-8')

WS = r"C:\Users\27063\AppData\Roaming\reasonix\文件翻译\strang_p004"
PAGES = os.path.join(WS, "pages")
BK = sorted(glob.glob(os.path.join(WS, "backup", "*before-wave5-reback*")))[-1]

# ---------- A) fence ----------
f = os.path.join(PAGES, "page_155.bilingual.md")
lines = open(f, encoding="utf-8").read().splitlines()
opens = [i for i, l in enumerate(lines) if l.strip().lstrip(">").strip().startswith("```")]
if len(opens) % 2 == 1:
    out, fixed = [], False
    for i, ln in enumerate(lines):
        if (not fixed and ln.startswith("C=\\sum")
                and i + 1 < len(lines) and lines[i + 1].strip() == "```"):
            out += ["> ```math", "> " + ln, "> ```"]
            fixed = True
            skip_next = True
            continue
        if fixed and skip_next and ln.strip() == "```":
            skip_next = False
            continue
        out.append(ln)
    open(f, "w", encoding="utf-8").write("\n".join(out) + "\n")
    n = sum(1 for l in out if l.strip().lstrip(">").strip().startswith("```"))
    print(f"page_155 fence rebuilt -> ``` count = {n}")
else:
    print(f"page_155 fence already balanced ({len(opens)} markers)")

# ---------- B) notes ----------
LABEL = re.compile(r'<span style="color:#1e8449;">\*\*\[note\]\s*([^*]{0,40})\*\*</span>\s*(.{0,30})')

def note_blocks(text):
    lines = text.splitlines()
    out = []
    for i, ln in enumerate(lines):
        m = LABEL.search(ln)
        if not m or "OCR" in m.group(1):
            continue
        key = re.sub(r'\s+', '', m.group(1) + m.group(2))[:34]
        j = i + 1
        while j < len(lines):
            s = lines[j]
            if s.strip() == "":
                break
            if s.lstrip().startswith(">") or s.lstrip().startswith("```"):
                j += 1
                continue
            break
        out.append((key, i, j, lines[i:j]))
    return out

for pg in (173, 188):
    cur_f = os.path.join(PAGES, f"page_{pg}.bilingual.md")
    cur = open(cur_f, encoding="utf-8").read()
    old = open(os.path.join(BK, f"page_{pg}.bilingual.md"), encoding="utf-8").read()
    cur_keys = {k for k, *_ in note_blocks(cur)}
    old_blocks = note_blocks(old)
    cur_lines = cur.splitlines()
    added = 0
    for key, oi, oj, block in old_blocks:
        if key in cur_keys:
            continue
        prev = [l for l in old.splitlines()[:oi] if l.strip()]
        prev = prev[-1] if prev else ""
        target = None
        if len(prev) > 12:
            best = None
            for i, l in enumerate(cur_lines):
                if not l.strip():
                    continue
                r = difflib.SequenceMatcher(None, l, prev).ratio()
                if r > 0.55 and (best is None or r > best[0]):
                    best = (r, i)
            if best:
                target = best[1] + 1
        if target is None:
            target = next((i for i, l in enumerate(cur_lines) if re.search(r'Strang\s*§', l)), len(cur_lines))
        cur_lines[target:target] = [""] + block
        added += 1
    open(cur_f, "w", encoding="utf-8").write("\n".join(cur_lines) + "\n")
    print(f"page_{pg}: restored {added} note(s); now {len(note_blocks(open(cur_f, encoding='utf-8').read()))} translator note(s)")
```

## 9.6 成本与收益（part004 实测）

- 成本：50 页转写 ≈ 6 分钟（3 并发）；25 个终校任务分 4 批 ≈ 6 分钟；加上人工抽查，全流程约 30 分钟
- 收益：**公式编号缺失页 8 → 1（且那 1 页经查是假阳性）**；纠正 5 处实质错误（错误常数、错误矩阵名、丢公式、错不等式、概念混淆 normal/symmetric）；汉字从 11.3 万 → 13.4 万（补齐了丢失的公式与正文）
- 结论：**对扫描版教材，视觉核对是"性价比最高的一道审计"**——它抓到的问题，任何基于 OCR 文本的审计都抓不到

## 9.7 双机与同步

- 本章 2026-09-23 写入 **Windows 侧 SKILL.md**；按双机同步铁律（以 Linux 版为准），**Linux 侧待同步**（Linux 机当时 SSH 不通）
- 相关记忆：`v4-1-vision-扫描页权威转写流水线-2026-09-23`（全局 reference）

## 9.8 图像层核对：图丢失 / 图注 / 图内文字 / 图表读数（2026-09-23 增补，配套铁律 26）

> 🚨 §9.2–§9.6 核的是**文字与公式层**，**图完全在盲区**。本节把视觉核对扩展到**图像层**——它与铁律 26（原书插图不得丢弃）是同一件事的两端：铁律 26 负责"不许丢"，本节负责"查有没有丢、丢没丢错"。

**为什么要单独查**：扫描版原页的 Figure 在 OCR 里只剩图注文字（甚至一段乱码）；译文若**只保留了图注文字**，流水线里没有任何环节会报错——文本层全绿，而图已经没了（part005 图 IV.1 就是活例）。

**四查（按可信度排序，全部基于 §9.2 的权威转写件）**

| # | 查项 | 判据 / 处理 |
|---|------|------|
| 1 | **图是否丢失** | 权威转写页里有 Figure 或图注，而译文对应页既无图片引用、也无 `<!-- FIG ... -->` 占位 → 缺图，走 references/image-pipeline.md §10.2 补图 |
| 2 | **图注（caption）翻译** | 比对 caption 原文与译文；编号（Figure X.Y）必须回原文核对后再写（铁律 18） |
| 3 | **图内印字** | 坐标轴标签 / 顶点标注 / 框图文字 / 矩阵角标是否按 references/image-pipeline.md §10.2.5 决策树处理（重排 / 保留 + 转写 / 并列） |
| 4 | **图表读数** | 曲线斜率、峰值位置、交点坐标、表格图里的数字——**只能看图**，OCR 与译文都可能错（与 §9.1 的公式丢失同类） |

**方法 A（全量，扫描版推荐）**：把"定位插图"并入视觉核对任务，prompt 里加结构化段：

```
FIGURES: 每个图一行：name | bbox 百分比 x0,y0,x1,y1（左上原点，整数） | caption 原文逐字转写
```
与译文的图注 / `<!-- FIG ... -->` 占位做集合比对 → 输出「缺图清单」。

**🚨 实测坑（2026-09-23 本轮踩到，极容易误判成"视觉通道坏了"）**：该任务是**开放式**输出、模型思考很长——
- `max_tokens=4096` → `completion_tokens=4096` **全是 `reasoning_tokens`**、`finish_reason=length`、**`content` 长度 = 0**；
- 同一请求改 `max_tokens=16384` → `finish_reason=stop`，正常返回（实测 reasoning 6,931 + 答案 119）。
→ **"找图 / 给 bbox / 转写 caption"这类图像任务的 `max_tokens` 一律 ≥16384**（§9.5 `vision_ocr.py` 里窄任务用的 8192 不足以覆盖开放式问答；把默认值改大，别靠猜）。

**实测样例（可直接当验收基准）**：Strang LaLFD PDF p.208（书页 206，`vision_ocr.py` 同通道 + 上面的 FIGURES 段）返回：

```
Figure IV.1 | 10,32,90,50 | Figure IV.1: The powers of w are also the powers of ω. They are the N solutions to z^N = 1.
```

与 part005 已译稿那条图注逐字对上（"图 IV.1：$w$ 的各次幂也就是 $\omega$ 的各次幂。它们是 $z^N = 1$ 的 $N$ 个解。"）——**双向确认**：既证明 bbox 可用（按 references/image-pipeline.md §10.2.3 裁切后肉眼复核 = 两个单位圆 + $N=8$ + 两条 $e^{\pm 2\pi i/8}$ 对照），也证明该页图注翻译无误。

**方法 B（省成本）**：只对"译文里出现图注文字 或 出现 `图 X.Y` / `Figure X.Y` 字样"的页做视觉复核。

**订正纪律**：图像层订正同属审计，**审计 + 修复一体**（铁律 20）；订正后必跑 §9.4 副作用清单（删注 / math 围栏失衡 / 超 32767 字符静默失败），再重跑格式化与 PDF。

---
