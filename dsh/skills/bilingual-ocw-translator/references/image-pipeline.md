> **按需加载章节**（主文档 `SKILL.md` 的 progressive disclosure 拆分件）。本技能全流程唯一模型：v4.1 flash = `deepseek-v4.1-flash`；契约与铁律见主文档「🎯 核心契约」与第 1 章。

---

# 第 10 章 图像流水线：原书插图保留 + 自创图（2026-09-23 用户拍板）

> 本章为**追加**章节（既有章节零改动），配套 **🚨 铁律 26**。
> **用户原话（2026-09-23）**："技能里面有没有写可以保留原书图片，反正是视觉模型，还有就是遇到难问题可以自己写出图片，创作图片？"
> **结论：两条都补，且两条都要给出可复现的命令**——本章给路线 A（保留原图）与路线 B（自创图）的完整做法、脚本、规范与实测坑。

## 10.0 三条原则

1. **图是内容，不是装饰**——原书 Figure 与定理陈述同级，丢图 = 内容缺失（铁律 26）。
2. **视觉模型负责"看得见"**——定位插图、转写图内文字、读图表数值、复核自绘图，全走 `deepseek/deepseek-v4.1-flash` 的图像输入（能力与两坑见 references/vision-check.md §9.1）。
3. **"画什么"必须写清楚，图由脚本或 dsh 产出**——按 references/ps-workflow.md §8.8 第 3 条，**主代理不亲自做内容生成**；脚本重绘属于机械动作（主代理可跑），但**设计说明（画什么、坐标含义、要传达哪一步）必须落到文字**，才可能被复核。

## 10.1 路线总览（先选对路线再动手）

| 场景 | 路线 | 产物 |
|------|------|------|
| 原书有 Figure / 曲线图 / 示意图 / 框图 / 谱图 | **A. 保留原图**（§10.2） | `assets/fig_<pdf页号>_<name>.png` + 图注双语 + 来源行 |
| 原图糊/小/含大量英文印字，而图形本身可用 LaTeX 或代码重排 | **A′. 重排或并列**（§10.2.5） | 行内 LaTeX 重排，或"原图 + 中文重绘版"并列 |
| 概念抽象、原书无图或图讲不清（DAG、递推树、子空间、收敛路径、误差曲面…） | **B. 自创图**（§10.3） | `assets/mine_<slug>.png` + 图注末尾标"译者绘制" |
| 只需"看一眼"的层次/顺序关系 | **B-轻量**：内联 Mermaid / ASCII | 直接写在正文或注里，不落盘 |

## 10.2 路线 A：保留原书插图

### 10.2.1 三种取图方式（务必先选对，选错会白跑）

| 方式 | 依据 / 命令 | 适用 | 本机实测 |
|------|-------------|------|----------|
| **渲染 + `clip` 裁切（首选）** | `page.get_pixmap(dpi=300, clip=Rect(...))` | 一切情况；**扫描版唯一可行** | ✅ Strang LaLFD p.208 图 IV.1 → 5247×1883 px，图形与标注完整 |
| 抽嵌入图 | `page.get_images()` + `fitz.Pixmap` / `pdfimages -png` | **原生数字 PDF** 里的独立插图 | ❌ 扫描版：`pdfimages -list` 显示每页**只有 1 张整页 JPEG**（2243×3041，96 ppi）——抽出来是整页 |
| 屏幕截图 | — | 不可用 | ❌ 分辨率/色彩不可控 |

→ **默认走「渲染 + clip」**：从"百分比 bbox → 换算 PDF 点 → 高 dpi 重渲染"，比"先渲染整页再裁图"更清晰。

### 10.2.2 让视觉模型给出插图 bbox（已实测可用）

要求模型输出三件东西：`HAS_FIGURE`、`FIGURES`（每个图一行：`name | bbox 百分比 | caption 原文逐字转写`）、`CAPTION_LANG`。四条纪律：

- **bbox 用百分比 + 左上原点**（模型给的整数百分比实测可直接换算，见 §10.4 坑 6）；
- **`max_tokens` ≥16384**（🚨 4096 会被 reasoning 吃满、`content` 返回空 —— references/vision-check.md §9.8 实测坑，最容易误判成"视觉通道坏了"）；
- **必须带浏览器 UA**（否则 Cloudflare 403 / code 1010，references/vision-check.md §9.1）；
- **一次一页、并发 3–6**（别把多张页图塞进一条消息）。

**实测样例（p.208，书页 206）**：`Figure IV.1 | 10,32,90,50 | Figure IV.1: The powers of w are also the powers of ω. They are the N solutions to z^N = 1.` —— 与已译稿图注逐字对上，双向确认。

**⚠️ bbox 会浮动**：同一页两次调用分别给出 `10,32,90,50` 与 `6,28,94,54`（差 ±4 个百分点）→ **裁切必须带 1–2% padding**（`fig_crop.py` 的 `pad` 参数），裁完**人眼抽查一张**（`view_image`）再批量。

**批量定位脚本 `fig_find.py`**（通道与坑同 references/vision-check.md §9.1；已内置 `max_tokens=16384`、浏览器 UA、`deepseek/` 前缀模型名）：

```python
# -*- coding: utf-8 -*-
"""Locate the figures on each PDF page with the vision model -> figs.tsv.

Output (tab separated, one line per figure):
    page <TAB> name <TAB> x0,y0,x1,y1 (percent, top-left origin) <TAB> caption (verbatim)

Two things that DO matter (both measured 2026-09-23):
  * max_tokens >= 16384 -- with 4096 the whole budget goes to reasoning and
    `content` comes back EMPTY (finish_reason=length), which looks exactly like
    "the vision channel is broken".
  * the browser User-Agent is mandatory, otherwise Cloudflare answers 403/1010.

Usage: python fig_find.py <pdf> <first_page> <last_page> [workers] [out.tsv]
"""
import base64, io, json, os, re, sys, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor

import fitz
from PIL import Image

sys.stdout.reconfigure(encoding="utf-8")

PDF = sys.argv[1]
A = int(sys.argv[2]) if len(sys.argv) > 2 else 1
B = int(sys.argv[3]) if len(sys.argv) > 3 else A
WORKERS = int(sys.argv[4]) if len(sys.argv) > 4 else 3
OUT = sys.argv[5] if len(sys.argv) > 5 else "figs.tsv"
MODEL = os.environ.get("VISION_MODEL", "deepseek/deepseek-v4.1-flash")   # NOTE the deepseek/ prefix
MAXTOK = int(os.environ.get("VISION_MAXTOK", "16384"))

HOME = os.path.expanduser("~")
key = None
for ln in open(os.path.join(HOME, ".dsh", ".env"), encoding="utf-8", errors="replace"):
    m = re.match(r"^\s*COMMANDCODE_API_KEY=(.*)$", ln.strip())
    if m:
        key = m.group(1).strip().strip('"').strip("'")
stxt = open(os.path.join(HOME, ".dsh", "settings.yaml"), encoding="utf-8-sig", errors="replace").read()
BASE = re.search(r"(?mi)^\s*baseURL:\s*(\S+)", stxt).group(1).strip().strip('"')
URL = BASE.rstrip("/") + "/chat/completions"

PROMPT = ("This is a scanned textbook page. Answer in exactly this form and nothing else:\n"
          "HAS_FIGURE: yes|no\n"
          "FIGURES: one line per figure/illustration: <name> | <x0,y0,x1,y1 as integers, "
          "percent of the page, top-left origin> | <caption text transcribed verbatim>\n"
          "CAPTION_LANG: language of the captions\n"
          "If there is no figure, print HAS_FIGURE: no and nothing after it.")


def ask(page):
    doc = fitz.open(PDF)
    pix = doc[page - 1].get_pixmap(dpi=200)
    im = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    im = im.resize((1100, int(pix.height * 1100 / pix.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=85)
    b64 = base64.b64encode(buf.getvalue()).decode()
    payload = {"model": MODEL, "max_tokens": MAXTOK,
               "messages": [{"role": "user", "content": [
                   {"type": "text", "text": PROMPT},
                   {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + b64}}]}]}
    req = urllib.request.Request(
        URL, data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "Accept": "application/json",
                 "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                               "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
                 "Authorization": "Bearer " + key})
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            out = json.load(r)
        ch = out["choices"][0]
        txt = ch["message"].get("content") or ""
        if not txt.strip():
            return page, f"# EMPTY content (finish={ch.get('finish_reason')}, tokens={out.get('usage')})"
        return page, txt
    except urllib.error.HTTPError as e:
        return page, f"# HTTP {e.code} {e.read()[:200].decode('utf-8', 'replace')}"
    except Exception as e:
        return page, f"# ERR {type(e).__name__} {e}"


def parse(page, txt):
    rows, found = [], False
    for ln in txt.splitlines():
        ln = ln.strip()
        if ln.upper().startswith("HAS_FIGURE") and "yes" in ln.lower():
            found = True
        m = re.match(r"^FIGURES?:\s*(.+)$", ln)
        if m and m.group(1).strip():
            parts = [p.strip() for p in m.group(1).split("|")]
            if len(parts) >= 2:
                rows.append((str(page), parts[0], parts[1].strip("() "), parts[2] if len(parts) > 2 else ""))
    if not found and not rows:
        return []
    return rows


if __name__ == "__main__":
    pages = list(range(A, B + 1))
    lines = []
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        for page, txt in ex.map(ask, pages):
            got = parse(page, txt)
            if got:
                lines += ["\t".join(r) for r in got]
            print(f"p{page}: " + (" | ".join("\t".join(r) for r in got) if got
                                  else (txt.splitlines()[0] if txt.startswith("#") else "no figure")), flush=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + ("\n" if lines else ""))
    print(f"\nfigs.tsv -> {OUT} ({len(lines)} figure(s))")
```

实测输出（PDF 207–210 页，3 并发）：

```
p207: no figure
p208: 208	Figure IV.1	6,28,94,54	Figure IV.1:The powers of w are also the powers of ω. They are the N solutions to z^N = 1.
p209: no figure
p210: no figure
```

### 10.2.3 裁切脚本 `fig_crop.py`（实测版）

```python
# -*- coding: utf-8 -*-
"""Crop a figure out of a PDF page given a PERCENT bbox (top-left origin).

Why percent: that is the unit the vision model returns (§10.2.2), and it is
page-size independent, so the same numbers work for any dpi.

Usage: python fig_crop.py <pdf> <page> <x0> <y0> <x1> <y1> [pad%] [out.png] [dpi]
Example: python fig_crop.py book.pdf 208 10 32 90 50 1 assets/fig_208_figIV1.png 300
"""
import os, sys
import fitz

sys.stdout.reconfigure(encoding="utf-8")

pdf, page = sys.argv[1], int(sys.argv[2])
x0, y0, x1, y1 = [float(v) for v in sys.argv[3:7]]
pad = float(sys.argv[7]) if len(sys.argv) > 7 else 1.0        # percent padding
out = sys.argv[8] if len(sys.argv) > 8 else f"fig_p{page}.png"
dpi = int(sys.argv[9]) if len(sys.argv) > 9 else 300
maxw = int(os.environ.get("FIG_MAX_W", "1600"))               # down-sample ceiling

doc = fitz.open(pdf)
pg = doc[page - 1]
r = pg.rect                                                    # PDF points, top-left origin
clip = fitz.Rect(r.x0 + (x0 - pad) / 100 * r.width,  r.y0 + (y0 - pad) / 100 * r.height,
                 r.x0 + (x1 + pad) / 100 * r.width,  r.y0 + (y1 + pad) / 100 * r.height)
pix = pg.get_pixmap(dpi=dpi, clip=clip)
os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
pix.save(out)
w, h = pix.width, pix.height
if w > maxw:                                                   # keep PDF size sane (§10.4 坑 5)
    from PIL import Image
    im = Image.open(out)
    im = im.resize((maxw, max(1, int(h * maxw / w))), Image.LANCZOS)
    im.save(out)
print(f"{out} {w}x{h} -> {min(w, maxw)}px {os.path.getsize(out)//1024} KB")
```

### 10.2.4 交付形态（命名 / 引用 / 图注）

- **目录**：与译文同目录 `assets/`（与 references/notes-guide.md §3.1 图解注一致）；命名 `fig_<pdf页号>_<name>.png`
- **引用形态**（图片 + 灰色来源行 + 双语图注）：

````markdown
![图 IV.1：$w$ 的各次幂与 $\omega$ 的各次幂](assets/fig_208_figIV1.png)
> <span style="color:#7f8c8d;">原书 Figure IV.1，书页 206（PDF p.208）；裁切自扫描页，图形未改动</span>
图 IV.1：$w$ 的各次幂也就是 $\omega$ 的各次幂。它们是 $z^N = 1$ 的 $N$ 个解。
````

- **图注**：照双语铁律（中文主体 + `English（中文）`）；编号保留原书编号、回原文核对（铁律 18）；颜色可用灰色 `#7f8c8d` 与正文区分
- **alt 文本**：写中文 + 英文术语即可；带 `$` 的 LaTeX 放正文行，别只放 alt（部分渲染器会把 alt 原样显示）
- **跨页大图**：分别裁切并按顺序引用，来源行标"跨 p.X–p.Y"

### 10.2.5 图内印字（坐标轴 / 顶点标注 / 框图文字）三选一决策树

| 分支 | 触发条件 | 做法 |
|------|----------|------|
| **1. 重排** | 印字少（一张标签表能列完）且可 LaTeX 化 | 译文里给行内 LaTeX + 标注"（图内印字，重排）"；**原图照留**（原图是权威） |
| **2. 保留 + 转写** | 印字多，或位置本身承载语义（流程图、依赖图、信号流图） | **原图不译**，在译者注里给"印字转写 + 翻译"（转写由视觉模型给，references/vision-check.md §9.8 四查第 3 项） |
| **3. 并列** | 图是概念图、需中文才读得顺 | **"原图 + 中文重绘版"并列**，重绘版标"（译者重绘自 Figure X.Y）" |

**禁止**：把图内印字当普通正文译掉却不保留原图；**改写/覆盖原图**（不许 P 图盖字）。

## 10.3 路线 B：自创图（难问题鼓励画）

### 10.3.1 判定清单（命中任一 → 值得画）

- **空间 / 几何**：单位圆、子空间、投影、$L_1$ 球与菱形、收敛路径、条件数几何
- **结构**：DAG、递推树、稀疏结构、依赖图、嵌套谱系
- **流程 / 时序**：FFT 蝶形、信号流图、迭代推进顺序、流水线
- **多步比较**：三种方法的误差曲线、谱衰减、条件数对比
- **反例 / 边界**："为什么这里必须开区间"类的反例图

### 10.3.2 四条生成通道（本机可用性已实测）

| 通道 | 命令 | 适用 | 本机实测 |
|------|------|------|----------|
| **matplotlib / mathtext** | `python fig_mpl.py` | 函数曲线、散点、矩阵结构、几何图形；公式走 mathtext（不依赖 TeX 编译） | ✅ 中文（`Microsoft YaHei`/`SimHei`）+ `$\lambda$` 均正常 |
| **HTML + SVG/Mermaid → Edge headless 截图** | 见下方 PowerShell | 需要精确排版、KaTeX 公式、自定义配色、Mermaid 图 | ✅ 实测写出 PNG（stderr 里的 QQBrowser importer 报错无害） |
| **graphviz** | `pip install graphviz` + 装 Graphviz 本体 | 复杂图结构与自动布局 | ❌ **本机当前未安装**（要用先装；`dot` 不存在） |
| **内联 Mermaid / ASCII** | 直接写进 md 代码块 | 层次、顺序类轻量关系 | ✅ MarkText 支持 Mermaid |

**Edge 截图（实测版）**：

```powershell
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
& $edge --headless=new --disable-gpu --no-sandbox `
  --user-data-dir="$env:TEMP\edge-fig" `
  --window-size=1000,700 `
  --screenshot="C:\path\to\assets\mine_xxx.png" `
  "file:///C:/path/to/fig.html"
```

- 🚨 `--user-data-dir` **必须是独立目录**——否则命令被转发到已在运行的 Edge 会话、**不产出文件**（同 references/ps-workflow.md §8.9）
- 🚨 输出路径**必须绝对**；`--window-size` 就是画布尺寸
- 截完可用 PIL 裁白边（`getbbox()`）

**matplotlib 模板（中文 + mathtext，实测通过）**：

```python
# -*- coding: utf-8 -*-
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

plt.rcParams["font.sans-serif"] = ["Microsoft YaHei", "SimHei"]   # 中文（本机可用）
plt.rcParams["axes.unicode_minus"] = False                        # 负号不显示成方框
plt.rcParams["figure.dpi"] = 200

fig, ax = plt.subplots(figsize=(5.2, 3.2))
ax.plot([0, 1, 2, 3], [0, 1, 0, 1], marker="o", color="#c0392b")   # 沿用 references/format.md §4.1 配色
ax.set_title(r"奇异值 $\sigma_k$ 的衰减")                           # mathtext，不编译 TeX
ax.set_xlabel(r"序号 $k$")
fig.tight_layout()
fig.savefig("assets/mine_svd_decay.png")
```

### 10.3.3 自创图规范

- **尺寸**：宽 ≤1600 px；`dpi ≥200`；单张图控制在一页内能放下
- **图内文字尽量少**：中文说明能放图注就放图注，图内只留数学符号与必要标签
- **配色**：沿用 references/format.md §4.1（标签蓝 `#2471a3`、强调红 `#c0392b`、注绿 `#1e8449`），别用 matplotlib 默认色环
- **公式**：mathtext 或 KaTeX→Edge；**图内公式同样不翻译**（铁律 5）
- **图注**：一律双语，末尾标 **（译者绘制）** / **（译者重绘自 Figure X.Y）**
- **纪律**：一个概念一张图；**不做装饰性配图**（与 references/notes-guide.md §3.1 第 6 条同款）

### 10.3.4 视觉模型"生成 → 复核 → 纠错"闭环（本轮新增用法）

自创图最大的风险是**画错**（轴标注反了、点位置错、矩阵结构错位），而脚本作者（人）看不出自己写错的假设。**把视觉模型当审查员**：

1. 生成 PNG；
2. 把 PNG + **一句期望**（"这是 $N=8$ 时 $w^k$ 在单位圆上的分布，$k=0,\ldots,7$ 逆时针，第一个点在 $1$"）发给 `deepseek/deepseek-v4.1-flash`；
3. 要求固定格式回答：`MATCH: yes|no` / `WRONG: 逐条列出与期望不符处` / `READ_BACK: 只描述你在图上看到什么（不要参考期望）`；
4. `MATCH: no` → 改脚本重画；**`READ_BACK` 与期望冲突但 `MATCH: yes`** → 先怀疑期望写错，再改图。

> **为什么有效**：模型读图走"视觉 → 符号"的独立通道，能抓住人看不见的错位；而它**看不到**的东西（"这个极限为什么存在"）它也会明说不确定——正是我们需要的边界。

## 10.4 实测坑清单（本章每条都在本机实跑过）

| # | 坑 | 现象 | 对策 |
|---|----|------|------|
| 1 | 图像任务 `max_tokens` 太小 | `finish_reason=length`、`content` 空（0 字符）→ 误判"视觉通道不可用" | **≥16384**（4096 时 100% 被 reasoning 吃满） |
| 2 | 模型名漏 `deepseek/` 前缀 | `HTTP 400 unsupported_model` | 用 `deepseek/deepseek-v4.1-flash`；判"能力不存在"前**逐字照抄**技能里的模型名（references/vision-check.md §9.1 事故） |
| 3 | 缺浏览器 UA | `HTTP 403 error code 1010`（Cloudflare） | 四个头都给全：`Content-Type` / `Accept` / `User-Agent` / `Authorization` |
| 4 | 扫描版用 `pdfimages` 抽图 | 抽出整页 JPEG，不是插图 | 走 §10.2.1「渲染 + clip」 |
| 5 | 裁切 dpi 过大 | 单图 5000+ px、PDF 体积暴涨 | 300 dpi 裁切后按 `FIG_MAX_W` 降采样（≤1600 px） |
| 6 | bbox 百分比当像素用 | 裁到角落/裁出空白 | 换算 `r.x0 + x/100*r.width`；fitz `Rect` 是左上原点、y 同向 |
| 7 | Edge `--screenshot` 无产物 | 命令被转发到已运行会话 | `--user-data-dir` 独立目录 + 绝对输出路径 |
| 8 | matplotlib 中文变方框 | glyph missing | 显式设 `Microsoft YaHei`/`SimHei` + 关 `axes.unicode_minus` |
| 9 | PowerShell 内联 python 吃引号 | `python -c "...\$x\$..."` → SyntaxError / `$` 被变量替换 | **先落盘脚本再跑**（`python fig_crop.py …`），与全局"命令写法铁律"一致 |
| 10 | 自绘图与原书图混淆 | 读者以为中文图是原书内容 | 图注末尾强制标"（译者绘制）"/"（译者重绘自 Figure X.Y）" |

## 10.5 交付前检查清单（图专门）

- [ ] 视觉模型逐页列出的 Figure 数 = 交付稿里的图片数 + 明确标注的"重排/并列"数（**数不对就是丢图**）
- [ ] 无残留 `<!-- FIG ... -->` 占位（每个占位都已被真实图片替换）
- [ ] 每张图都有：Markdown 引用 + 灰色来源行（原书 Figure 编号 + 书页/PDF 页）+ 双语图注
- [ ] 图内印字已按 §10.2.5 处理（重排 / 保留 + 转写 / 并列），无"译掉即丢图"
- [ ] 自创图标了"译者绘制"，且过了 §10.3.4 的 `READ_BACK` 复核
- [ ] `assets/` 内无 0 字节、无重名；随 md 一起交付（Linux 侧输出目录见附录 A2）
- [ ] **渲染出的 PDF 里图真的显示**——抽查 2–3 页成品 PDF，不能只看 md 源（呼应 references/ps-workflow.md §8.9 泄漏扫描）

## 10.6 与其它章节的接口

| 本章 | 对接 |
|------|------|
| 铁律 26（不许丢图） | §10.2（怎么留） |
| references/vision-check.md §9.8（查有没有丢） | §10.5（交付前清单） |
| references/notes-guide.md §3.1 图解注 / references/notes-guide.md §3.2 配图辅助 | §10.3（规范细化：判定清单 / 通道 / 规范 / 复核闭环） |
| references/prompts.md §6.1 翻译 worker prompt | 已加"插图处理"段（`<!-- FIG ... -->` 占位 + 图注翻译 + 图内印字三选一） |
| references/format.md §4.1 配色 / references/format.md §4.2 标签 | 自创图配色沿用；图注双语格式沿用正文铁律 |
| references/ps-workflow.md §8.9 PDF 渲染 | 图会让 PDF 变大 → 渲染后仍跑泄漏扫描 + 图显示抽查 |

## 10.7 双机与同步

- 本章 2026-09-23 写入 **Windows 侧 SKILL.md**；**Linux 侧（小电脑）待同步**（同 references/vision-check.md §9.7）
- 脚本落点：`fig_crop.py` 建议与references/vision-check.md脚本同处（工作区 `.reasonix/attachments/` 或项目目录内），**不要散落在临时目录**——临时目录会被会话重定向（references/ps-workflow.md §8.9 坑 1）

