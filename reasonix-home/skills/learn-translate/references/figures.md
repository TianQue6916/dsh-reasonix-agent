# 讲解用图标准（v4.3 新增）

> 用户 2026-10-22 要求：「帮助理解的图像也有很高要求，具体可以参照社区经验」。
> 本文件管**为理解而画的图**（自创图 / 示意图 / 解释图）。原书插图的保留与裁切仍走 `image-pipeline.md`。

## 0. 为什么图要单独立规矩

图不是排版装饰，是**论证的一部分**。多媒体学习研究里有可引的结论：

- **coherence principle**：加入与目标无关的材料会**降低**理解（Mayer et al. 2001，三个实验方向一致；`seductive details` 效应量小但方向一致）。⇒ 精致的装饰是负资产。
- **signaling principle**：给关键对象加提示（高亮 / 箭头 / 编号）是多媒体原则里效果较大的几条之一（Noetel et al. 元分析，整体中等改善，原则间差异大）。
- **spatial contiguity**：文字标注**贴着**它解释的图元，显著优于"图例编号 + 远处对照表"；对**新手 + 复杂材料**效应最大。

## 1. 什么时候必须画（满足任一就画，不许只用文字糊过去）

- 概念带**空间 / 顺序 / 包含**结构：内存层次、状态机、调用链、协议时序、树与图
- 核心是**变化率 / 累积 / 分布**：曲线、多步推演、收敛过程
- **反例比正例更清楚**：图能画出"去掉这个前提后在哪一步崩"
- 一句话说不清的**三元以上关系**（三元交互、竞态、依赖环）

## 2. 什么时候不许画（画了就是负分）

- 画出来**比文字更难懂**（纯抽象代数式关系、符号推导）——此时该用公式和文字
- **装饰性元素**：渐变、阴影、3D、卡通图标、无关背景、花边框 ⇒ coherence principle 明确有害
- **为"显得专业"而存在**的图（没有它结论不变）
- 一张图塞**多个主张**（应拆成多帧）

## 3. 五条硬标准（每条都有可判定判据，不是风格偏好）

| # | 标准 | 判据（能当场判真假） |
|---|---|---|
| 1 | **coherence：删掉一切不承载信息的东西** | 指着图上任一元素问「删掉它，读者会失去什么信息？」——答不出就删 |
| 2 | **signaling：3 秒内知道先看哪** | **遮住标题**只看图，能否指出重点？不能就加箭头 / 高亮 / 编号 / 局部放大 |
| 3 | **contiguity：标注贴着对象** | 图上有没有「编号 ①②③ + 远处对照表」？有就改成贴标注（对新手复杂材料效应最大） |
| 4 | **one idea per figure** | 这张图能用一句主张概括吗？不能就拆帧；多步推演**帧间只变一个量** |
| 5 | **caption = 主张句** | 图注是「这张图说明 X ⇒ Y」，不是「某某示意图」。把图注单独抽出来，**它应该能被反驳** |

## 4. 数学 / CS 图专规

- **坐标轴**：写单位与量级；**截断轴必须画 break 标记**（不标 = broken scale，Tufte 列的头号失败模式）
- **量纲一致**，横纵轴不同量纲时在轴标题里写清；多子图**共享 min/max**，别让 matplotlib 自动缩放各画各的
- **离散量不用连续曲线暗示**（整数 n 的变化不要画成光滑曲线）
- **不确定性要画出来**：误差棒 / 区间 / 样本数；不许只画均值（也不许把 n=1 画成趋势）
- 一个数量级以上的差异用**对数轴并标注**
- **黑白可读**（用户会打印讲义）：线型（实/虚/点划）+ 标记形状 承担区分，颜色只作辅助
- **色盲友好调色板**（社区标准，直接用）：Okabe-Ito；Paul Tol high-contrast `#DDAA33 / #BB5566 / #004488`；CUDO accent `#FF4B00 / #F6AA00 / #03AF7A / #005AFF / #4DC4FF`。**禁止**红绿对比作为唯一区分手段
- Tufte 其余失败模式：over-labeling（只标外侧刻度）、eyespan 违规（图宽超过视线跨度）、装饰性边框、按字母排序而非有意义排序

## 5. 交付要求：图必须可重画

- **源码入库**：`assets/src/<概念>.py`（matplotlib）或 `.html`（HTML+SVG）或 `.tex`（TikZ）；**禁止只交 PNG**
- 文件名带主张：`<概念>-<它说明什么>.svg`；优先矢量（SVG / PDF），位图仅用于截图类
- 自创图仍走 `image-pipeline.md` §10.3 的三步复核：**生成 → 视觉模型读图复核（标注 / 数值 / 轴）→ 对原文纠错**；读不出图注的图 = 不合格
- 图放进 Markdown 后必须检查：**渲染后是否泄漏 LaTeX**、图注是否被截断、`assets/` 相对路径是否可用

## 6. 交付前自检（5 条，逐条打勾）

□ 删任一元素都能说出失去的信息（否则删掉它）
□ 遮住标题仍能看出重点
□ 标注挨着对象，没有「编号 + 远处对照表」
□ 图注是可被反驳的主张句
□ 黑白打印仍可区分，且源码已入库
□ **用 read_image 读过生成的 PNG**（不是只跑通代码）：标题遮挡测试是看图看出来的，不是推断出来的
□ **公式渲染校验通过**：目标渲染器同款 KaTeX 全量解析 0 失败、逐行 `$` 全为偶数、无 `\[` 残留（见 §8）

## 7. 社区经验出处（可点开核对）

- coherence principle（无关材料有害）：[learning-wiki claims/coherence-principle-irrelevant-material-hurts-learning](https://github.com/Learning-Design-Alliance/learning-wiki/blob/b2df14b37a92e9cccc75b1bcc5874f14d78aa3ae/claims/coherence-principle-irrelevant-material-hurts-learning.md)（Mayer et al. 2001，三实验）
- contiguity（标注贴近图元）：[learning-wiki principles/contiguity](https://github.com/Learning-Design-Alliance/learning-wiki/blob/b2df14b37a92e9cccc75b1bcc5874f14d78aa3ae/principles/contiguity.md)
- signaling（提示关键对象，属效应较大的原则）：[learning-wiki principles/signaling](https://github.com/Learning-Design-Alliance/learning-wiki/blob/b2df14b37a92e9cccc75b1bcc5874f14d78aa3ae/principles/signaling.md)
- seductive details（花哨无关细节降低学习）：[claims/seductive-details-effect](https://github.com/Learning-Design-Alliance/learning-wiki/blob/b2df14b37a92e9cccc75b1bcc5874f14d78aa3ae/claims/seductive-details-effect.md)
- 色盲友好调色板（含 Paul Tol 与 CUDO 具体色值）：[sksat/bambu-rs color-universal-design/SKILL.md](https://github.com/sksat/bambu-rs/blob/ad3da2b6e86bae853eafc51d4fb487dc0efebf87/.claude/skills/color-universal-design/SKILL.md)
- Tufte 图表失败模式清单（broken scale / over-labeling / eyespan）：[DATA_VISUALIZATION_BEST_PRACTICES_MASTER.md](https://github.com/DailyForkCast/osint-foresight/blob/e44beb6bedbb5ee1d44e9cc3486a78771a23b082/docs/summaries/DATA_VISUALIZATION_BEST_PRACTICES_MASTER.md)

> 证据级别沿用 `learning-science.md`：多媒体原则整体 **[MA]**（Noetel et al. 元分析，中等平均改善，原则间差异大）；coherence **[EXP]**（Mayer et al. 2001）；seductive details **[EXP]，效应量小**。Tufte 与调色板属**工程规范 [D]/[OBS]**，但方向明确、代价为零，照做即可。

## 8. 视觉复核的权重 + KaTeX 渲染校验（v4.4 新增）

> 触发事件（2026-10-24）：一份四问锚点卡交付后用户连报两轮缺陷——「问题有点多啊」，以及「我这看到有几个<无效数学公式>」。复盘结论：**图与公式都属于"代码跑通不等于成品合格"**，缺的都是同一件事——没有把目标渲染器/视觉模型真的当作验收关口。

### 8.1 顺序硬规定（不许调换）

```
出图（代码跑通）→ 立刻 read_image 读 PNG → 逐条过 §6 自检 → 通过才写进 md → 交付前跑 §8.4 渲染校验
```

- **视觉复核是阻塞步骤，不是收尾抽查**。上一版把它排在"文档写完后顺手看一眼"，结果三处硬缺陷（根节点数值被标题挤掉、箭头穿过格内文字、零值柱高度 0 看不见）全部漏到用户手里。
- 判据必须是**看图能判**的：能指出「遮住标题后我第一眼看哪里」；指不出就是 signaling 不合格，回去加箭头/高亮。
- 代码跑通只证明「没报错」，不证明「读者看得懂」。这两件事没有任何蕴含关系。

### 8.2 实测失败三例（照抄判据，别重犯）

| 症状 | 判据（哪条硬标准被打穿） | 修法 |
|---|---|---|
| 根节点的 `V=3` 被顶部主张句压住，读图时根本看不到 | signaling：遮标题看不出重点 | 数值标注移到节点侧边（`ha='left'`），标题上移并留白 |
| 依赖箭头从源格中心直连目标格中心，穿过格内 `(i,j)` 文字，读起来像 "V1,3" | contiguity + coherence：标注没有贴身，元素互相污染 | 箭头只跨格缝（用 `posA/posB` 给边缘坐标 + 小 `shrink`），格内不再放第二个标签 |
| 三情形对比柱状图，零值那根高度为 0，视觉上不存在 | 数值可读性：三个数看得见两个 | 换哑铃/横条图，0 值用点标记 + 显式 `0` 标签；参考值用竖向虚线 |

### 8.3 读图时逐条核的清单

1. 数值对不对（把我预期的数与图上读到的数逐个比对，不许跳过）
2. 遮住标题后重点还在不在
3. 有没有两个标注互相压、或压住图元
4. 黑白（去色）还能不能区分不同系列
5. 图注（caption）单独抽出来是不是一句可被反驳的主张

### 8.4 KaTeX 渲染校验（交付前必跑，基线 0 失败）

**根因（实测）**：MarkText 的 markdown-it-katex 把 `\[` 当成 display math 的**起始定界符**。于是 `egin{cases}` 里的换行尺寸参数 `\[2pt]` 被拆成 `\` + `\[` → 开了一个永不闭合的 display math：

```
KaTeX parse error: Undefined control sequence: \[ at position 40: …u_i(h) & h\in Z\[2pt]
```

后续 `$...$` 配对全被打乱，**一个源头错误在渲染时放大成四五处 `<无效数学公式>`**。

**规则**：禁止 `\[2pt]` / `\[4pt]` 这类换行尺寸参数（KaTeX 不支持）；要间距就拆成两个公式或换行。

**脚本已入库**（可直接复制到任何文档目录；除目标渲染器自带的 katex 外零依赖）：

- `references/tools/check-katex.js` —— 逐条 `renderToString({throwOnError:true})`，覆盖行内公式与数学围栏块。源码**刻意不含任何反斜杠字面量**（用 `String.fromCharCode(10)` 代替换行），这样贴进 heredoc / 模板 / 代码块都不会被二次转义破坏——这是上一版把脚本写进文档时踩到的坑。
- `references/tools/check-dollar.js` —— 纯文本检查：逐行 `$` 奇偶、双美元定界符、方括号公式定界符（`\[` / `\]`）。

用法（第二个参数给目标渲染器自带 katex 的路径；MarkText 桌面版本机为 `~/.dsh/profiles/desktop/node_modules/katex`）：

```bash
node references/tools/check-katex.js <doc.md> /path/to/katex
node references/tools/check-dollar.js <doc.md>
```

两条脚本都以退出码表示结果（0 = PASS），可直接挂进交付前的流水线。

**验收基线**：`渲染失败 0 条` + `奇数行 0 处` + `\[ 残留 0`。三条都过才算能交付。
