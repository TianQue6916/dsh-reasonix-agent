# wave-mackay121 · MacKay《Information Theory, Inference, and Learning Algorithms》p121–p160

`WORKER_ID` = mackay121 ｜ `UNIQ` = mackay121 ｜ 书页 = PDF − 12 ｜ 输出目录 `C:/Users/27063/Documents/翻译产出/教材/MacKay信息论`

## 一、交付清单（逐份实测）

| 文件 | bytes | 行数 | 页标记 | 覆盖 PDF 页段 | 书内页段 |
|---|---|---|---|---|---|
| `MacKay信息论_p121-140.bilingual.md` | 68 614 | 768 | 20 | p121–p140 | p109–p128 |
| `MacKay信息论_p141-160.bilingual.md` | 56 502 | 816 | 20 | p141–p160 | p129–p148 |

两份合计 **40 页、1 584 行、125 116 bytes**，页标记 40/40 齐全且一一对应，页段无缺口（p121…p160 连续）。

**重要前置事实（影响可复现性）**：这两份文件在本次 session 开工前**已由同一 `WORKER_ID` 的上一实例落了大部分**（p121–140 落到 p140、p141–160 落到 p156），但两处不完整。本次工作是**补齐 + 去重 + 加译注 + 校验**，不是从零翻译：

1. `p121-140`：上一实例已写 p121–p140 全 20 页；我曾并行追加一份 p131–p140 的新译（4 万字节），造成**同页双份**，已用 `<!-- ===== p131 ===== -->` 双标记定位、整段删除（保留上一实例版本，其"译本复算"标注更细），再补 `[译注]` 1 条。
2. `p141-160`：上一实例只写到 p156（缺 p147–p152、p157–p160 共 10 页，且 9.4 + Example 9.1 完全缺失）。我先插入自译的 p147–p152 / p157–p160，随后发现上一实例在我插入前又补了 p147–p152 与 p157–p159 → 再次双份 → 再次按标记去重，只保留我写的 **p160 尾部（9.4 + Example 9.1 + Figure 9.3 说明）**，并补 `[译注]` 1 条。
3. 另补 **Table 7.3（$C_3$ / $C_7$ 两码表）** —— 上一实例整表静默丢失。
4. 过程中出现一次**自伤事故**：向文件插入表格时锚点匹配失败（`str.index` 返回 -1），脚本把表格插到文件末尾、随后切片把文件截成 1 byte。已用开工时的 `AppData/Local/Temp/mk2/` 备份（55 482 bytes，20 页标记，含译注）完整恢复，再用行号锚点（断言 `len(idx)==1`）重新插入 Table 7.3。**教训：批量改稿的插入锚点必须断言唯一命中，且改前先落备份。**

## 二、KaTeX 渲染校验（阻塞验收）

命令按任务规范，临时 JSON 一律绝对路径：

```
cd C:/Users/27063/.dsh/tools
timeout 120 python extract-formulas.py "C:/Users/27063/AppData/Local/Temp/mk3"                C:/Users/27063/AppData/Local/Temp/mackay121-mine2.json
timeout 120 node  katex-check.js     C:/Users/27063/AppData/Local/Temp/mackay121-mine2.json    "C:/Users/27063/.dsh/tools" C:/Users/27063/AppData/Local/Temp/mackay121-mine2-r.json
```

| 口径 | files | formulas | fails | files_with_errors |
|---|---|---|---|---|
| **我这两份（独占，终稿复测）** | 2 | **995** | **0** | **0** |
| **OUT_DIR 合并**（12 份） | 12 | 6 261 | 0 | 0 |

行式抽取会漏"一行多公式"的长行，故另跑一次自写完备体检（逐行扫 `$` 奇偶、fence 内跳过、剔除行内 code span）：

| 指标 | p121-140 | p141-160 |
|---|---|---|
| `$` 奇偶不平衡行 | **0** | **0** |
| `$$` 残留 | 0 | 0 |
| `\[` / `\]` 残留 | 0 / 0 | 0 / 0 |
| Unicode 上下标（`²³ⁿ` 等） | **0 行** | **0 行** |
| `[Figure …]` 括号标记 | 8 | 10 |
| `[Table …]` 括号标记 | 1（另以"（上表为 Table 6.6/6.7：…）"体例标注 2 处） | 2（Table 7.3 新补；Table 7.1/7.2/7.5 以表头 + 编号引用呈现） |
| `[Algorithm …]` 保留 | 1（6.3） | 1（7.4） |
| `[exercise]` 标记 | 22 处 | 14 处 |
| `[译注]`（`#1e8449`） | 1 条 | 1 条 |

## 三、术语表（19 条，本批实际用法定型）

| English（首次出现给的短注） | 之后一律用 |
|---|---|
| data compression（数据压缩） | data compression |
| symbol code / stream code / block code | 原词 |
| codeword / codelength / prefix code / complete code | 原词（"完备"只在 Kraft 取等号语境用） |
| arithmetic coding（算术编码） | arithmetic coding |
| predictive distribution（预测分布） | predictive distribution |
| Lempel–Ziv coding / dictionary / phrase / pointer | 原词 |
| source coding theorem | 原词 |
| Kraft inequality / Kraft equality | 原词 |
| universal code（通用码） | universal code |
| self-delimiting code（自定界码） | self-delimiting code |
| headless binary representation（去头二进制表示） | 原词 |
| unary code（一元码） | unary code |
| end-of-file symbol（文件结束符号） | end-of-file symbol |
| joint ensemble（联合总体） | joint ensemble |
| joint / conditional / marginal entropy | 原词 |
| mutual information（互信息） | mutual information |
| relative entropy / $D_{\mathrm{KL}}$ | 原词 |
| data processing theorem / Markov chain | 原词 |
| discrete memoryless channel / transition probability | 原词 |
| capacity $C(Q)$（容量） | capacity |
| Binary symmetric / erasure channel（BSC / BEC） | BSC / BEC |
| posterior / Bayes' theorem | 原词 |

MacKay 体系纪律：**不用** Cover & Thomas 的 typical set / AEP / entropy rate 叙事；`typical` 只在 MacKay 自己用的 `typical radius` / `typical substring` / `typical set of an N-dimensional Gaussian`（Figure 6.8 原文）处出现，并保留原措辞。

## 四、我最没底的三处

1. **Table 6.6 / 6.7 的时间列空缺**。`bzip` / `bzip2` / `ppmz` 三行的 compression / uncompression 秒数在 PyMuPDF 文字层里**取不到任何数字**（我已逐 span 检查，确认不是 CMap 吞符号，而是该格无文本）。无法判定是原书排版留空还是扫描/生成时丢失 → 全部标 `†` + "原书该表只给了 compressed size，秒数格为空，此处保留空缺而不猜数"。**若上游有该书的 LaTeX 源码（itila 目录里确实发布过 .tex），这一处应回源码核对，不要信我的 †。**
2. **Lempel–Ziv 解析表（p.119）的列对齐**。原文四行（substrings / $s(n)$ / $s(n)$ binary / (pointer, bit)）在文字层被拉成单列流，列归属不可直接读出。我用"每个 substring = 前缀指针 + 一位新 bit，指针宽 $\lceil\log_2 s(n)\rceil$"逐列回填，并**用书自己给的输出串 `100011101100001000010` 反向验证通过**（$11\to$`01`+1、$010\to$`100`+0、$10\to$`001`+0 全部吻合），但仍属重建，已在正文标 † 说明。
3. **Figure 9.2 / 9.3 的编号**。第 9 章 p.148 的 BSC / BEC 转移图在原书里**没有图号**（只是行内小图）。我为了满足"图不许静默丢弃"给它俩挂了 `Figure 9.2` / `Figure 9.3` 的**临时占位编号**，并在描述里写明"原书无编号的小图"。若后续统一编号体系，这两处需要改名，否则会与真图号冲突。

## 五、跳过或降级处理的结构

- **页眉版权行**（`Copyright Cambridge University Press 2003. On-screen viewing permitted...`）逐页删除，不译。
- **p137（书内）Part II 扉页**：整页只有 `Part II` + `Noisy-Channel Coding`，仅保留标题与页码锚点，并注明"整页只有编号与标题"。
- **p091（书内 p091，属上一份文件）章首页**：同类处理（非本批）。
- **Figure 8.3（p.156，Venn 图）**：图中被文字层抽成乱码噪声（连续控制字符），只保留可读的 5 个标签 `H(Y|X,Z)`、`H(X)`、`H(Z)`、`I(X;Y)`、`H(Z|X)`，并在正文说明"图内网格与配色无法从文字层重建"。**这是本批唯一一处图内容降级。**
- **Figure 6.12 / 6.13 / 6.14**：原始 caption 未随文字层抽出（纯图像块），据题注上下文与他人转述重建描述，句首都标了 "Figure N：…" 形式以便读者分辨这是译本补写。
- **习题**：一律留英文题干 + `[exercise]` 标签（共 36 处），例题（Example 9.1）与全部 Solutions 已译。

## 六、原文自身的错误 / 记号不一致（本节最重要）

1. **§6.4 Lempel–Ziv 的指针宽度：正文与同页表格互相矛盾（p.119）。** 正文写"pointer 的值可以用 $\lceil \log_2 s(n)\rceil$ bit 表示"，但同页表的 `s(n) binary` 行把 $s(n)=1,\ldots,7$ **一律写成三位**（`001`…`111`）；而 `(pointer, bit)` 行实际是**变宽**的（$s(n)=2$ 时指针 `0`、$s(n)=3$ 时 `01`）。两者不可能同时是 $\lceil\log_2 s(n)\rceil$ 的实现 —— 前者只是"三位定宽示意"，后者才是真码。**这不是抽取错误，我按原 PDF 的 span 逐字确认过。**
2. **$s(n)$ 的定义在全书没有统一（同一张表）。** 正文定义为"到第 $n$ 个 bit 时已枚举了多少 substring"，但表中 $s(n)=0$ 对应 $\lambda$ 那一列，而指针是从 $\lambda$ **之后**才开始发的。于是 $s(n)$ 到底是"已枚举数"还是"下一个可用编号"，读者必须自己按 `(pointer, bit)` 行反推。
3. **unary code 与"整数"的边界含糊（第 7 章 p.133–134）。** p.133 说 unary 是"最简单的整数唯一可译码"，但 unary 对 $n=0$ 无定义（$n=0$ 会产出与 $n=1$ 相同的 `1`）。p.134 自己也承认 C₃ / C₇ 类码"还提供了编码整数零与空串的能力，而这两者都不是我们需要的"—— 也就是说"整数码"这个词在章内既指 $\mathbb{Z}^+$ 又暗含 $\mathbb{N}$，前后不一致，教材没有明说。
4. **微波炉 Roman 键位的命名与罗马数字不自洽（exercise 6.21, p.127）。** 原文 $M$ = 10 minutes、$C$ = 1 minute、$X$ = 10 seconds、$I$ = 1 second。按罗马数字值是 $M=1000>C=100>X=10>I=1$，但按键的"时间值"序列是 $10\text{min} > 1\text{min} > 10\text{s} > 1\text{s}$ —— 只有 $X>I$ 与 $C$ 的位置对得上，$M$ 被借去当"10 分钟"（应为 $X$ 的 60 倍，而 $M/C=10$ 而非 $60$）。这是 MacKay 的玩笑式命名，但它让 (6.21)/(6.22) 的对照阅读更容易出错，译本已在例后保留原键位不变。
5. **Figure 6.11 的 caption 位置误导（p.129）。** 该 caption 实际讲的是"(b) 二维图像 / fax"的例子（"每行与上一行 $f=5\%$ 的 bit 不同，宽 400 像素"），但它被排在 (a) 小节的段落之间，读者极易把它归给 (a) 的电话簿例子。原书这里是双栏排版把插图挤到了 (a) 中间。
6. **Solution 6.13(e) 指向"In Chapter 31"（p.130）**：frustrated triangular Ising model 的讨论确实在第 31 章，但第 31 章属 Part IV（Learning），与本章 stream code 无前置关系 —— 这是全书常见的"前向引用"，不是错误，但对自学读者是断链，译本保留了 "第 31 章" 原号未改。
7. **Solution 6.3 的 "standard deviation 21" 无单位（p.128）**：我复算为 bit（$1000$ 样本、$p=0.01$ ⇒ $k$ 的标准差 $=\sqrt{1000\times0.01\times0.99}\approx3.15$，每多一个 1 约多 $\log_2 100 \approx 6.64$ bit ⇒ $3.15\times6.64\approx21$ bit）。数值对，**省略单位**，初读极易误解成"21 个样本"。

## 七、两条译者注（各 800–1200 字，均含"机制 + 可点开落点"）

- `p121-140` 末条：**"pointer 是 LZ 全部的压缩预算来源"** —— 抽掉 pointer ⇒ 重复内容必须重发，压缩率回到 1（不是变差而是概念消失）；给出 $\sum_i(\lceil\log_2 i\rceil+1)\le t\log_2 t+2t$ 的粗估（明确标注"原书未给 LZ 码长的界，此为笔者粗估"）；落点：`zlib/deflate.c:longest_match()` / `deflate_slow()`、`trees.c:build_tree()`、表 6.6/6.7、exercise 6.18 的 $\log Z=0$ 与 Kraft 的对应。
- `p141-160` 末条：**"'信息'为什么不能当集合来数"** —— $I(X;Y)\ge0$ 之于第二编等于能量守恒之于力学（抽掉它，capacity 的下界论证与 Hamming 的冗余核算同时失效）；三种证明（$D_{\mathrm{KL}}$、Jensen、cross-entropy）同源于 $\log$ 的凹性；Venn 图负面积的机制用 exercise 8.8 的 $z=x+y \bmod 2$（$I(X;Y)=0$ 但 $I(X;Y|Z)=1$）说清；落点：p.44 Gibbs、式 8.1–8.12（p.139）、exercise 8.8/8.9 解答（p.143）、§9.4 式 9.4–9.5（p.148）、第 10 章 $C=\max_{P_X}I(X;Y)$、LDPC 的 belief propagation。
- 两条均未使用 `[theorem]/[remark]/[definition]` 等原书标签，只用 `[译注]` + `#1e8449` 绿色，读者可分辨作者与译者。

## 八、未做 / 不做

- 未改 `PLAN.md`（并发 worker 多，避免互相覆盖）。
- 未对同目录其它 10 份文件做任何写操作（只读校验，合并数 6 261 / 0 fails）。
- 未把本文档渲染成 PDF（不在本批 OUT_FILES 范围）。

## 九、终稿复核时间戳说明

交付前最后一次复测（含上游实例对 p141-160 追加的约 1.3 KB 补充）结果：**995 formulas / 0 fails / 0 files_with_errors**，两份文件页标记 20+20 且无任何重复标记。若后续再有并发实例改这两份文件，请以 `grep -o "===== p[0-9]*" | sort | uniq -c` 查重 + 重跑本报告第二节的命令为准。
