# 图的**做法**：静态总图与联动动图生产规格

> 分工：**画什么、为什么画**（判据 / 五条硬标准 / 数学图专规 / 视觉复核）在 `references/figures.md`；
> **怎么把图做出来**（拼接参数 / `render(t)` 骨架 / 逐帧渲染 / ffmpeg / 环境实测）在本文件。
> 主文件 SKILL.md 只留判据与指针——因为这份内容只在「要出图」时才用得上，不该进每次加载的正文。
>
> 来源：`metric-ball-nesting` / `球套球-静态总图与联动动图` 两轮返工。用户三次否决（"图还是不明所以"→"乱七八-糟"→"cde 长的没区别"）后收敛出的规格。**照做即可，不要重新发明。**


## 0. 什么时候该画（先判断，再动手）

**第一步永远是写一句主张句**：这张图要让人相信的那句话是什么？它必须**可被反驳**——"内圆右缘 $1.366$ 越过大圆边界 $1$" ✓；"这是一个球" ✗（不可反驳，所以不构成主张）。**写不出主张句 → 不画**。

### 0.1 硬触发：出现下列任一结构，必须画

| 结构 | 例 | 图型 |
|---|---|---|
| 几何对象或点集 | 球 $B(x,r)$、开集/闭集、区间、凸包、单纯形 | 单张几何图 |
| 包含 / 越过 / 相交 | 球套球、子空间嵌套、$A\subseteq B$ 破裂 | 几何+长度一体 |
| "越来越近"、极限、收敛 | $\varepsilon$-论证里 $x_n$ 落进 $B(x,\varepsilon)$ | 带 $\varepsilon$ 的数轴或圆 |
| 不等式链的几何含义 | 三角不等式 = "绕道不更近" | 三角形 + 三条边长标注 |
| 随参数变化且有临界值 | $d_p=|x-y|^{p}$，$p>1$ 就越界 | 参数图（横轴变量 + 临界线） |
| 反例构造 | $d(x,y)=(x-y)^2$ 让球套球塌 | 必须画出**塌在哪一点**，并把那个点标出来 |
| 证明里唯一的非等号步 | 球套球证明中只有 $d(x,z)\le d(x,y)+d(y,z)$ 不是等号替换 | 几何图 + 高亮该步 |

判据一句话：**这个结论能不能"看"出来？能看出来就必须画。**

### 0.2 不必画（画了是噪音）

- 纯符号变形：行列式展开、生成函数化简、递推式代数整理
- 离散计数：组合恒等式、"循环执行 $n$ 次"
- 单个数值事实：一句 "$d(a,b)=1$、$d(b,a)=2$" 就说完的
- **已在第 1 张图里完整表达的内容**——不许重画同一几何换配色（铁律 43）

判据：**如果画的每一笔都能被一句公式替代，就不要画。**

### 0.3 出图 = 四件套（2026-11-22 用户定稿，不再逐次商量）

**只要决定画图，就按下面这套出齐，不问、不缩水、不退回单图：**

| # | 产物 | 内容 | 文件名示例 |
|---|---|---|---|
| 1 | **视角 A 静态图** | 对象本身：圆 / 球 / 区间 / 集合关系 | `fig-combined.png` |
| 2 | **视角 B 静态图** | 同一件事的参数视角：横轴放变量、画临界线 | `G3-function-plot-v2.png` |
| 3 | **静态总图** | A、B 左右并排 + 标题条 + 中缝分隔线 | `fig-two-panel.png` |
| 4 | **联动动图** | 单画布双面板，共享一个 `render(t)`，A 与 B 同步 | `paneldemo/dual.gif` |

用户原话（2026-11-22）：「只要生成图片，就按照我要求的这次这样两个视角的静态图加他们的动图然后拼接吧。」

**第二个视角从哪来**：优先「对象 vs 参数」。对象本身没有参数维度时，用**同一对象的两个不同取值 / 两个状态**充当第二视角（$p=1$ 与 $p=2$、开集与闭集、收敛与不收敛、有解与无解），把其中一个变成横轴变量。**不要因为找不到参数就退回单图**——先把"变化"显式化，再画。

**为什么强制四件套而不是按需给**：静态图只给端点，动图给过程，总图给对照；三者缺一，读者就要在脑子里做拼接（这正是 2026-11-17 三轮返工的根本原因）。固定格式也消除了"每次都要先问你要哪种"的往返。

### 0.4 自我否决信号

出现任一条，说明判断错了，回到 §0.1 重来：

- 说不出这张图的主张句
- 图上任何一个标注要读正文才能懂
- 两张图除了配色 / 线宽没有区别
- 遮住标题后看不出结论
- 用户说"看不懂 / 莫名其妙 / 这想说明什么"——**这是判断失败的信号，不是他理解力的问题**

## 1. 产物四件套（缺一即未完成）

| # | 产物 | 规格 | 作用 |
|---|---|---|---|
| 1 | **几何+长度一体图** `fig-combined.png` | 上半对象、下半三条标尺，一条竖直参考线贯穿 | 说"现在越界多少" |
| 2 | **参数图** `G3-function-plot-v2.png` | 横轴变量、纵轴函数值、临界水平线 | 说"从哪开始越界" |
| 3 | **静态总图** `fig-two-panel.png` | 上两图左右并排 + 标题条 + 分隔线 | 一眼对照两个视角 |
| 4 | **联动动图** `paneldemo/dual.gif` | 双面板共享一个变量，同步运动 | 说"中间那一段怎么走" |

**动图不是把 1、2 各自录一段再拼**——那是两个动画。必须是**一个画布、一个变量、两个视角同时响应**（见 §4）。

## 2. 静态总图拼接规格

```python
from PIL import Image, ImageDraw, ImageFont
import numpy as np

def trim(img, pad=26):                      # 裁掉四周白边，否则并排后两侧各留一大块空
    a = np.array(img.convert('L')); ys, xs = np.where(a < 246)
    return img.crop((max(0,xs.min()-pad), max(0,ys.min()-pad),
                     min(img.width,xs.max()+pad), min(img.height,ys.max()+pad)))

H = 1150                                    # 统一高度：两图比例不同，按高度对齐才不会被拉变形
a = trim(Image.open('fig-combined.png').convert('RGB'));  a = a.resize((int(a.width*H/a.height), H), Image.LANCZOS)
b = trim(Image.open('G3-function-plot-v2.png').convert('RGB')); b = b.resize((int(b.width*H/b.height), H), Image.LANCZOS)
GAP, PAD, TOP = 74, 58, 124                 # 中缝 / 外边距 / 标题区高度
C = Image.new('RGB', (a.width+b.width+GAP+2*PAD, H+TOP+PAD), 'white')
C.paste(a, (PAD, TOP)); C.paste(b, (PAD+a.width+GAP, TOP))
d = ImageDraw.Draw(C)
f1 = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 44)
d.text((PAD, 42), '球套球：为什么 p > 1 就越界', font=f1, fill=(24,24,24))
xm = PAD + a.width + GAP//2
d.line([(xm, TOP), (xm, TOP+H)], fill=(230,230,230), width=2)   # 中缝分隔线
C.save('fig-two-panel.png')
```

硬指标：**输出宽 ≥ 1600 px**（实测 2878×1332）、中文字体必须是 `C:/Windows/Fonts/msyh.ttc`（matplotlib 同理要 `font.family=['Microsoft YaHei']`，否则 `\u754c` 变方框）、标题条与图之间留白 ≥ 40 px。

## 3. 标尺类图的核心规则（这一条最容易画错）

三条标尺**不是**"三个长度左端对齐"就完事。正确的是：

- **第一条 $r=1$**：从圆心量，右端**正好落在参考线上**（参考线 = 半径 1 处）。
- **第二、三条 $r-d$**：**从 $y$ 量**（不是从圆心），右端就是**内圆的右缘**。
- 于是 $p=1$ 时第二条右端恰好贴住参考线（"贴住"），$p>1$ 时第三条右端越过去（"越界"）——**同一段余量的三种状态在一条竖直线上读出**。

```js
const start = (i===0) ? CX : CX + U*XD;                 // 第一条从圆心，后两条从 y
const L     = (i===0) ? U  : U*v;                       // v = r-d 的值
bar.setAttribute('x1', start); bar.setAttribute('x2', start + L);
```

反例（2026-11-17 实犯）：三条全从圆心量 → 第三条右端落在 0.715 处、仍在线左侧，而旁边的文字写着"越界 0.215"，**图与标注自相矛盾**。

## 4. 联动动图规格

**结构**：单画布 1600×900，左面板 A（几何+标尺）、右面板 B（曲线），共用一个 `render(t)`，`t∈[0,1]` 映射到被扫过的变量（如 $p: 1\to2$）。

**关键实现**：不要用 `requestAnimationFrame` 自动播放，而是暴露**纯函数** `render(t)`：

```js
function render(tt){
  const p   = 1 + Math.max(0, Math.min(tt,1));   // 唯一变量
  const rho = 1 - Math.pow(0.5, p);              // 由它派生的一切
  // 左面板：圆半径、越界弧、标尺右端 …
  // 右面板：点坐标、投影虚线、着色区 …
}
window.render = render;                           // 供逐帧驱动
```

**渲染管线（本机实测可用）**：

```python
import pathlib
from playwright.sync_api import sync_playwright
url = pathlib.Path('dual.html').resolve().as_uri(); N = 49
with sync_playwright() as p:
    b  = p.chromium.launch(channel='msedge', args=['--allow-file-access-from-files'])
    pg = b.new_page(viewport={'width':1600,'height':900}, device_scale_factor=1.4)
    pg.goto(url); pg.wait_for_timeout(900)          # 必须等字体/KaTeX 加载完
    for i in range(N):
        pg.evaluate(f'render({i/(N-1):.6f})'); pg.wait_for_timeout(30)
        pg.screenshot(path=f'frames/f{i:03d}.png')
    b.close()
```

```bash
FF=/d/Octave-11.3.0/mingw64/bin/ffmpeg.exe
"$FF" -y -framerate 12 -i frames/f%03d.png -c:v libx264 -pix_fmt yuv420p -crf 20 dual.mp4
"$FF" -y -framerate 12 -i frames/f%03d.png -vf "scale=1200:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=200[p];[b][p]paletteuse" dual.gif
```

**为什么不用 `record_video`**：playwright 录屏依赖它自带的 ffmpeg，本机 `C:\Users\27063\AppData\Local\ms-playwright\ffmpeg-1013\ffmpeg-win64.exe` **不存在**，`new_page()` 直接抛 `Executable doesn't exist`。逐帧 screenshot 反而更好——**每一帧都能单独取出来当静态图/海报**。

**验收判据**：
- 冻结任意一帧，左右两面板的数值必须自洽（左边标尺长度 == 右边点的纵坐标）；
- 临界帧（$p=1$）两侧同时到位：左边标尺右端贴线、右边点落在 $\rho=0.5$ 上；
- 越界后左弧变红、右点进入着色区，**颜色变化只发生在越界部分**（圆本身保持白色）。

## 5. 出图环境实测（别再重新踩）

| 项 | 状态 | 结论 |
|---|---|---|
| `playwright` + `channel='msedge'` | 可用 | 首选渲染器，能渲染任意 HTML/SVG/MathML/KaTeX |
| KaTeX 字体 | 60 个，`katex-check/node_modules/katex/dist/fonts/` | Computer Modern 的 web 版，**教材字形不依赖 LaTeX** |
| MiKTeX | 缺 `grfext.sty`，补包时写注册表 `error 5` 被拒 | TikZ 编译不了；除非要投期刊要矢量 PDF，**不值得修** |
| manim | 未装（缺 cairo） | 视频级动画用上面的 HTML+逐帧方案替代，效果足够 |
| `ffmpeg` | `D:\Octave-11.3.0\mingw64\bin\ffmpeg.exe` | 合成 mp4/gif 用它 |
| `Pillow` / `numpy` | 可用 | 拼接静态总图 |

## 6. 交付前自检清单

- [ ] 单图宽 ≥ 1600 px，字号 ≥ 12 px，中文无方框
- [ ] 标注互不重叠；有重叠就加白底或换位置
- [ ] 换行是真换行（字符串里 `\\n` 会渲染成字面 `\n`）
- [ ] 静态总图：两图高度统一、白边已裁、中缝有分隔线
- [ ] 动图：冻结任意帧数值自洽；临界帧两侧同时到位
- [ ] 两个媒体 base64 内嵌进 md（铁律 19/42），源码同目录（铁律 31）
- [ ] 双端 `md5sum` 一致（铁律 42）
- [ ] KaTeX 全量解析 0 失败（铁律 32）

