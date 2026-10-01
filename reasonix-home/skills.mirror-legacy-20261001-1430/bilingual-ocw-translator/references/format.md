> **按需加载章节**（主文档 `SKILL.md` 的 progressive disclosure 拆分件）。本技能全流程唯一模型：v4.1 flash = `deepseek-v4.1-flash`；契约与铁律见主文档「🎯 核心契约」与第 1 章。

---

# 第 4 章 配色与标签速查（唯一权威定义 + 交叉引用体系）

> 本章是全技能**唯一的**配色、标签、格式、交叉引用权威定义。**格式审计（dsh flash）对照本章逐条核对。**

## 4.1 配色方案

| 用途 | 颜色 | 色值 |
|------|------|------|
| 功能标签 | 蓝色 | `#2471a3` |
| 大标题/定理/推论 | 深红 | `#c0392b` |
| 定义标题 | 深蓝/深红 | `#2471a3` / `#c0392b` |
| 定义核心句 | 深青 | `#00838f` |
| 强调/侧注 | 深绿 | `#1e8449` |
| 译者补充（`[note]`） | 深绿 | `#1e8449` |
| 替代解法/现代视角（`[alternative]`） | 深紫 | `#7d3c98` |
| 元信息/脚注/交叉引用行 | 灰色 | `#7f8c8d` |

## 4.2 功能标签表

每个功能模块前加蓝色标签，统一 `#2471a3`：

| 标签 | 用途 | 示例 |
|------|------|------|
| `[theorem]` | Theorem（定理） | `[theorem] ### Theorem（定理）` |
| `[proof]` | Proof（证明） | `[proof] *Proof（证明）.*` |
| `[definition]` | Definition（定义） | `[definition] #### Definition（定义）` |
| `[corollary]` | Corollary（推论） | `[corollary] ### Corollary（推论）` |
| `[property]` | Property（性质） | `[property] **Property（性质）**` |
| `[question]` | Question（问题） | `[question] **Question（问题）**` |
| `[example]` | Example（例） | `[example] **Example（例）**` |
| `[reference]` | Reference（参考文献） | `[reference] **Reference**` |
| `[source]` | Source（来源） | `[source] **Source（来源）**` |
| `[note]` | Note（译者注/补充） | `[note] **Note（补充）:**` |
| `[alternative]` | Alternative（替代解法） | `[alternative] **Alternative（替代解法）:**` |
| `[application]` | Application（应用） | `[application] **Application（应用）**` |

实现方式（标题标记在行首，铁律 7）：
```
### <span style="color:#2471a3;">**[theorem]**</span> <span style="color:#c0392b">Theorem（定理）</span>
```

## 4.3 标题层级规范

```
# 课程全称
## 讲次/大节（Lecture N）
### 定理/推论（Theorem / Corollary）
#### 定义（Definition）
```

用标题层级实现视觉区分，**不使用 `<div>`**（铁律 8，MarkText 中不渲染）。`>` blockquote 可用于虚化次要内容（MarkText 中自动虚化）。

**🚨 标题标记必须位于行首**（铁律 7）：
```markdown
✅ ### <span style="color:#2471a3;">**[problem]**</span> <span style="color:#c0392b">Title</span>
❌ <span style="color:#2471a3;">**[problem]**</span> ### <span style="color:#c0392b">Title</span>
```

对于习题集/Problem Set 类文档，遵循以下层级与字号规范：

| Markdown 层级 | 字号 | 颜色 | 用途 |
|:---|:---:|:---:|:---|
| `#` h1 | 最大 | 默认 | 课程全称 |
| `##` h2 | 大 | `#c0392b` 深红 | 讲次/大节标题（如 Problem Session N） |
| `###` h3 | 中 | `#c0392b` 深红 | 题目标题（如 Problem N-M. Title） |
| `<span>正文</span>` | 1em | 默认 | **题目描述**——完整的双语行内翻译 |
| `> blockquote` | 虚化 | 默认虚化 | **答案/解答**——完整行内双语翻译 + 虚化显示 |

## 4.4 习题与例题的差异化翻译规则

| 模块类型 | 翻译策略 | 说明 |
|---------|---------|------|
| **Exercises（习题）** | **非必要习题直接跳过**（🚨 铁律 9） | 不保留原文、不收录进翻译稿；被正文核心引用、不翻译会破坏可读性的必要习题才保留英文原题并最小翻译 |
| **Examples（例题）** | **完整行内双语翻译** | 描述、推导、结论全部按标准格式翻译 |
| **Notes / 译者注** | **完整行内双语翻译** | 正文注释和译者补充均按标准格式 |
| **Theorems / Proofs / Definitions** | **完整行内双语翻译** | 定理名用 `English（中文）` 标注 |
| **正文段落实例描述** | **完整行内双语翻译** | 过渡段、介绍性文本均按标准格式 |

示例对比：
```
✅ Example（例题）——需要翻译：
[example] **Example 2.32: Geometric Progressions（例 2.32，几何级数）**
设 $r$ 是一个实数。序列 $1, r, r^2, \ldots$ 构成一个 geometric progression（几何级数）。
若 $r > 1$，则 $r^n \to \infty$。

❌ Exercise（习题）——不需要翻译：
**2.11.7** Which statements are true?
(a) If $\{s_n\}$ is unbounded then it is true that either $\lim_{n\to\infty} s_n = \infty$ or $\lim_{n\to\infty} s_n = -\infty$.
```

习题答案保持英文原文，只有过程性描述可以做最小必要翻译（如"Proof（证明）"标签本身）。

## 4.5 内容层次原则

对「题目 + 答案」成对结构：

1. **题目（原文）**——**不得缩颈**。保持完整的行内双语翻译，正文 1em，默认色。原文的故事、背景、细节全部保留。
2. **答案（解答）**——**完整翻译 + 虚化显示**。用 `>` blockquote 包裹答案全文（与题目一样完整的行内双语翻译），MarkText 自动渲染为虚化文字。答案内容同样保留完整论证，不缩减。
   ```
   > [solution] **Solution（解答）:** 完整翻译的答案内容。
   ```

代码块（```python 等）不受上述字号缩放影响，保持默认大小。

## 4.6 数学规范

- **🚨 所有数学公式必须使用 LaTeX 行内公式 `$...$`，不允许用文字代替**。包括：复杂度 $O(n \log n)$、变量 $\delta(s, v)$、下标 $G_k$、上标 $k^*$、负数 $-6$、集合 $\{a, b, c\}$、运算符 $\min$、$\max$、$\le$、$\ge$ 等
- **🚨 禁止 `$$...$$`**。行内公式用 `$...$`；块级公式（需要独立居中显示的大表达式、多行推导等）用 fenced math block：
  ````markdown
  ```math
  公式
  ```
  ````
- 在 blockquote 内使用 fenced math block 时，每行加 `>` 前缀：
  ````markdown
  > ```math
  > 公式
  > ```
  ````
- 数集用 `\mathbb{}`：$\mathbb{R}, \mathbb{Q}, \mathbb{Z}, \mathbb{N}$
- 变量用斜体：$x, m, n, h$
- 定理陈述作为独立命题，证明以 $\square$ 结尾
- **禁止 Unicode 上下标字符**（铁律 6）：₀₁₂₃₄₅₆₇₈₉、⁰¹²³⁴⁵⁶⁷⁸⁹ 渲染成黑块，一律用 LaTeX
- ✅ 正确：复杂度为 $O(|V|^3)$，其中 $\delta(s, v)$ 表示最短路径距离
- ❌ 错误：复杂度为 O(|V|³)，其中 δ(s, v) 表示最短路径距离（文字代替 LaTeX）
- ❌ 错误：用 `$$...$$` 包裹公式（应用 fenced math block 替代）

## 4.7 示例对照（✅ 唯一正确 / ❌ 四类错误）

### 原文
```
The intermediate value theorem says that there exists a c between a and b where f(c) = 0.
```

### ✅ 正确输出
```
[theorem] ### Theorem（定理）
**Intermediate Value Theorem（介值定理）.**
若 $f$ 在 $[a,b]$ 上连续且 $f(a)f(b)<0$，则存在 $c\in(a,b)$ 使得 $f(c)=0$。

[proof] *Proof（证明）.* ……
```

### ❌ 错误输出 1（中文在前，英文在后）
```
**介值定理（Intermediate Value Theorem）** 表明：...
```
（问题：`中文（English）` 而非 `English（中文）`）

### ❌ 错误输出 2（全部中文化）
```
**介值定理** 表明：...
```
（问题：所有英文术语被强行翻译，失去双语对照价值）

### ❌ 错误输出 3（使用 div）
```
<div style="...">Theorem（定理）...</div>
```
（问题：MarkText 中 div 不渲染或显示"空的HTML块"）

### ❌ 错误输出 4（英中分段对照）
```
In a weighted directed graph G = (V, E), the weighted eccentricity ε(u) of a vertex u ∈ V is...
在带权有向图 G = (V, E) 中，顶点 u ∈ V 的 weighted eccentricity（带权离心率）ε(u)...
```
（问题：先写完整英文段落，再写中文翻译段落。✅ 正确写法：中文为主体，英文术语 `English（中文）` 行内嵌入，没有完整英文原句——见铁律 1）

## 4.8 交叉引用标注体系（Cross-Reference Mapping）

为每个定理/定义/例子/公式标注其在主教材（源 PDF）中的位置，便于读者在翻译版中快速查询原文。

### 4.8.1 编号体系映射规则

对每个结构单元，在标题后添加灰色引用行：
```
Theorem 2.28 (Monotone Convergence Theorem, 单调收敛定理)
> <span style="color:#7f8c8d;">TBB §2.9, p.47</span>
```
格式模板：`<教材缩写> <章节>，p.<页码>`。
- 教材缩写：TBB (Thomson-Bruckner-Bruckner)、CLRS、CSAPP、Rudin、Strang、Horn、Boyd 等
- 章节：`§2.9` 表示第 2 章第 9 节
- 页码：`p.47` 表示源 PDF 的书页编号（非 PDF 文件页码）

### 4.8.2 覆盖范围

| 单元类型 | 标注要求 | 示例 |
|---------|---------|------|
| Theorem | 必标 | `TBB §2.9, p.47` |
| Definition | 必标 | `TBB §2.9, p.47` |
| Example | 必标 | `TBB §2.10, p.50` |
| Corollary | 必标 | `TBB §2.8, p.43` |
| Formula (关键公式) | 建议标 | `TBB §2.10, p.51` |
| Exercise | 选标（仅在跨卷引用时） | `TBB §2.9, p.49` |
| Lemma | 必标 | `TBB references/notes-guide.md §3.4, p.85` |

### 4.8.3 跨教材交叉引用

如果翻译内容引用了其他教材中的定理（如讲义中说"见 CLRS Theorem 24.8"），也要标注：
```
> <span style="color:#7f8c8d;">CLRS §24.5, p.661 | TBB §2.9, p.47</span>
```

### 交叉引用锚点命名（可选增强）

统一锚点便于读者检索：`sec:` 节、`thm:` 定理、`def:` 定义、`eq:` 公式、`lem:` 引理、`ex:` 例子。引用写作格式：`见 [thm:2.28] Theorem 2.28（单调收敛定理）的证明`，同时保留灰色引用行。

## 4.9 质量检查清单（交付前逐项核对）

### 交叉引用
- [ ] **每个定理/定义/例子/推论都有灰色引用行**
- [ ] 引用行格式统一：`<教材缩写> <章节>, p.<页码>`
- [ ] 页码是源 PDF 书页编号（非 PDF 文件页码）
- [ ] 跨教材引用已额外标注

### 排版基础
- [ ] **🚨 行内用 `$...$`，块级用 ` ```math ` fenced block，无 `$$`**
- [ ] 所有代码块标识符保持原文
- [ ] 所有 URL 和文件路径保持原文
- [ ] 标题层级正确，无跳级（`#` → `##` → `###` → `####`）
- [ ] **🚨 标题标记在行首** —— `###` / `##` 前无 `<span>` 等 HTML tag
- [ ] 表格结构完整
- [ ] 未使用 `<div>`（MarkText 中不兼容）；`>` blockquote 可用于虚化答案
- [ ] **🚨 公式用 LaTeX** —— 所有数学公式必须用 `$...$`，不得用文字代替
- [ ] 无 Unicode 上下标（₀₁₂…⁰¹²…，铁律 6）
- [ ] 配色方案统一（蓝标签、红定理、蓝定义、绿强调、青定义句、灰脚注）

### 双语格式
- [ ] **🚨 无完整英文原句** —— 输出中没有任何一行是完整英文句子，英文只以术语片段出现在中文中
- [ ] **每句首字为中文**（铁律 2）
- [ ] 关键术语首次出现都有括号翻译，格式为 `English（中文）`
- [ ] 无被中文化了的 LaTeX 命令
- [ ] 句子读起来自然，不是翻译腔
- [ ] **不是英中对照** —— 不是「一段英文 + 一段中文」的逐段翻译模式

### 内容层次
- [ ] **字体层次** —— 题目正文 / 答案 blockquote 虚化，视觉可区分
- [ ] **原文完整** —— 题目和答案均保留完整行内双语翻译，未被缩颈
- [ ] **虚化区分** —— 答案用 `>` blockquote 包裹，题目用正文
- [ ] **代码块未缩放** —— 代码块没有被包裹在 font-size span 中
- [ ] 习题保留英文原文（铁律 9）

### PDF 与字幕
- [ ] PDF 提取完整性：对比不同 pdftotext 模式，确认无遗漏节/定理
- [ ] 如课程有视频，已完成 2.4 字幕搜索，提取了教授口语化素材
- [ ] 字幕引用已用 `🎥` 标注来源

### 译者注
- [ ] **译者注已分散插入到对应内容后**，而非堆在文件末尾
- [ ] 每个关键定理至少一条注
- [ ] 每条注 800-1200 字，成"小专题"（机制展开 + 例子 + 连接）
- [ ] 证明策略已命名模板（如"ε-剥离法""上确界夹逼法"）
- [ ] 跨课程连接精确到课程名 + 具体概念 + 连接路径
- [ ] 🚫 **无裸甩名词** —— 每个高级概念要么从用户已知概念出发解释，要么不提
- [ ] 📖 **交叉引用已标注** —— 指向用户已有的讲义/教材（如 L01、L02、CLRS §x.y）
- [ ] 拓展概念使用用户已有知识作为脚手架（等价关系、二分搜索、浮点表示等）
- [ ] 历史标注了具体年份
- [ ] 如使用了字幕素材，已标注 🎥 来源且附中文翻译
- [ ] **（可选）译者补充标记** —— 如有补充内容，正确使用 `[note]` / `[alternative]` 标签 + 对应颜色
- [ ] **（可选）补充来源可查** —— 补充内容有可靠来源（web search / GitHub 等），非训练数据编造

### 资源搜索（2.2）
- [ ] 已做全资源搜索（本机双盘区 + 主力机 + 网络 + 离线维基本机 ZIM），搜索成果已用于查证/写注

### 审计+修复一体（🚨 铁律 20）
- [ ] 全部审计环节（页级/超强/格式）输出的是**修订后文件**而非只列意见清单
- [ ] 主代理只做回填与抽查，不整批另派修复批

---
