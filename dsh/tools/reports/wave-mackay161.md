# wave-mackay161 · MacKay《Information Theory, Inference, and Learning Algorithms》PDF p161-200

- WORKER_ID / UNIQ：`mackay161`
- 输入：`D:/gh-publish/Information-Theory/03-textbook/book.pdf`（640 页，只读）
- 输出目录：`C:/Users/27063/Documents/翻译产出/教材/MacKay信息论/`
- 页码映射：**书页 = PDF − 12**（本批 PDF p161-200 = 书内 p149-p188）
- STYLE_REF 已对齐：`MacKay信息论_p101-120.bilingual.md`（`<!-- ===== pN ===== -->` 纯数字页标记、`#c0392b` 定理/例标题、`#2471a3` 标签、`#00838f` 定义正文、`#7f8c8d` 灰字边注/图注、`[Figure N：…]` 保留图）

## 1. 交付

| 文件 | bytes | 行数 | 覆盖页段（PDF = 书内） | 主题 |
|---|---|---|---|---|
| `MacKay信息论_p161-180.bilingual.md` | 63606 | 940 | p161-180 = 书内 p149-p168 | §9.5 mutual information → §9.9 Solutions → 第 10 章导读页 → §10.1-§10.5（noisy-channel coding theorem：定理陈述、jointly-typical sequences、random coding + typical-set decoding 证明、expurgation、capacity 以上带错通信、不可达区域） |
| `MacKay信息论_p181-200.bilingual.md` | 70559 | 843 | p181-200 = 书内 p169-p188 | §10.6 计算 capacity（ternary confusion、symmetric channel、Gallager 定义）→ §10.7 其他 coding theorem（$E_r(R)$ / $E_{sp}(R)$）→ §10.8 编码实践 → §10.9-10.10 习题与解答 → 第 11 章导读页 → §11.1 Gaussian channel → §11.2 检测 → §11.3 capacity → §11.4 实用码能力 → §11.5 技术现状 → §11.6-11.8 → §11.9 习题 |

两份合计 134165 bytes / 1783 行 / 40 页全覆盖，页标记连续无缺（161…180、181…200 各 20 个，脚本核验 `contiguous: True`）。

## 2. KaTeX 渲染校验（阻塞验收）

工具链：`extract-formulas.py` + `katex-check.js`（`C:/Users/27063/.dsh/tools`）。

| 口径 | files | formulas | fails | files_with_errors |
|---|---|---|---|---|
| **我这两份独占**（复制到 `AppData/Local/Temp/mk161_own2/` 单独跑） | 2 | 1265 | **0** | **0** |
| **OUT_DIR 目录合并**（12 份，含其他 worker 的文件） | 12 | 6305 | 2 | 1（**不是我这批**，见 §6） |

自写更完备抽取器复算（逐行非贪婪抓 `$…$`，一行多个公式全抓；`math` 围栏内含 `\begin{}` 的整体一条、多行无环境则按行拆）：`MacKay信息论_p161-180` 689 条（inline 608 + block 81）、`MacKay信息论_p181-200` 578 条（inline 525 + block 53），合计 1267 条（终版数据）喂 KaTeX → **0 fails**。与工具口径（1265）差异仅 2 条，来自「多行无环境围栏」的拆并策略不同，不存在「一行多公式被漏抽」的情况。

其他格式自检（脚本 `AppData/Local/Temp/mk161_audit.py`）：
- 逐行 `$` 奇偶：两份均 **0 行奇数**
- `$$` 残留 0、`\[` 残留 0、Unicode 上下标（²/₁ 等）0、`<div>` 0
- `[译注]` + `<span style="color:#1e8449;">`：每份各 1 条
- 英文行首扫描：p161-180 共 15 行、p181-200 共 18 行，**逐条核对全部为 `[exercise]` 题干原文**（规范要求保留），无漏译英文段
- 密度：p161-180 平均 46 行/页（最低 p166 = 17 行，整页是 Figure 9.7/9.8 + exercise 9.14）；p181-200 平均 41 行/页（最低 p187 = 21 行，Figure 10.10 双图页）

## 3. 术语表（MacKay 体系，18 条）

| English（保留原词） | 首现中文短注 | 备注 |
|---|---|---|
| channel | 信道 | 全书基础词，不入括号后不再译 |
| capacity $C(Q)$ | 容量 | 定义为 $\max_{P_X} I(X;Y)$（式 10.1） |
| mutual information $I(X;Y)$ | 互信息 | 一律写 $H(Y)-H(Y\mid X)$ 计算版 |
| ensemble | ensemble（不译） | MacKay 用 ensemble 而非 Cover&Thomas 的 random variable + pmf |
| input ensemble / optimal input distribution $P_X^*$ | 输入 ensemble / 最优输入分布 | |
| binary symmetric channel (BSC) | 二进制对称信道 | |
| binary erasure channel (BEC) | 二进制擦除信道 | 输出字母含 `?` |
| Z channel | Z 信道 | 只错 1→0 方向 |
| noisy typewriter channel | 含噪打字机信道 | $C=\log_2 9$ |
| ternary confusion channel | 三值混淆信道 | §10.6，最优解把某输入概率压到 0 |
| block code $(N,K)$ / rate $R=K/N$ | 分组码 / 码率 | bits per channel use |
| codeword $x^{(s)}$ | 码字 | |
| decoder / typical-set decoder | 解码器 / 典型集解码器 | |
| maximal probability of block error $p_{BM}$ | 最大块错误概率 | |
| jointly typical / jointly-typical set $J_{N\beta}$ | 联合典型 / 联合典型集 | |
| random-coding exponent $E_r(R)$（= reliability function） | 随机编码指数 / 可靠性函数 | |
| sphere-packing exponent $E_{sp}(R)$ | 球堆积指数 | 下界，与 $E_r$ 相对 |
| expurgation | 剔除 | 扔掉最差一半 codeword，把「平均小」升级成「maximal 小」 |
| linear code / parity-check matrix $H$ / $G^{\mathrm T}$ | 线性码 / 校验矩阵 / 生成矩阵 | `t = G^T s mod 2` |
| convolutional code / concatenated code / interleaving | 卷积码 / 级联码 / 交织 | |
| LDPC（low-density parity-check）/ turbo code | 低密度校验码 / turbo 码 | decode 靠 sum–product（message passing） |
| AWGN channel | 加性白高斯噪声信道 | |
| noise spectral density $N_0$ / $E_b/N_0$ | 噪声谱密度 / 每 bit 能量比 | $E_b/N_0$ 无量纲、按 $10\log_{10}$ dB 报 |

## 4. 最没底的三处

1. **`MacKay信息论_p181-200.bilingual.md` 里式 (10.29) 那个 $4\times4$ 矩阵的读法**（PDF p186，书内 p174）。我用 `get_text('words')` 按 y 坐标重建成 4 行 × 4 列（逐格 x 坐标对齐，确认每行 4 个元素），但**列和全为 1、行和为 1.35/1.35/0.65/0.65**。我按「列 = 输入」的唯一自洽读法翻译并加 † 说明（正文已写全）。若原书其实是 2 输入 4 输出（$I=2, J=4$）而排版错位，则我的 † 注释描述的对象就是错的。**这是本批我最不敢拍死的一处**。
2. **Figure 9.7 / 9.8 / 10.2 / 10.4 / 11.6 这类纯坐标图的重建描述**。图内文字在 PDF 文字层里是逐字符散落的（`1`、`0`、`q`、`PPP q` 等），我只能靠 `Figure` 图注 + 正文交叉推断图的结构。Figure 11.6 的 $21$ 格方阵是我数提取出的数字个数（7 行 × 3 列）推的；若原图其实含额外的校验行，我那条 †（blocklength 应为 21）的推理链就断了。
3. **`p161` 开头的「Thus 'x = 1' is still less probable…」**：这是上一页（PDF p160，书内 p148）Example 9.1 的续句，本批从句子中间起。我保留了该句并在页标记里标注「9.5 节起点」，但没有回补 p160 的 Example 9.1 正文——若读者只读本块，会缺一个前件。

## 5. 跳过或降级处理的结构

- **`p173`（书内 p161）About Chapter 10 的 Cast of characters 表**：原书是页边两栏对照表，我用 Markdown 两列表重建（记号 | 含义），逐条对译，未删项（$Q, C, X^N, \mathcal{C}, N, x^{(s)}, s, S=2^K, K, \mathbf{s}, R=K/N, \hat{s}$ 共 12 项）。
- **`p188`（书内 p176）About Chapter 11 的高斯分布回顾**：公式编号在原书是 (11.1)-(11.4)（导读页的公式已属第 11 章编号），正文 §11.1 从 (11.5) 接续 —— 照原编号保留，未重排。
- **`p165`/`p179`/`p187`/`p197` 的图**：只给 `[Figure N：…]` 结构化描述，未做图像裁切/嵌入（本 worker 无插图流水线权限，且规范允许「保留描述」）。
- **`▷` 标记**：原书用它标「值得一试/带陷阱」的习题，我在 `[exercise]` 标签旁注明「▷ 标记」并说明其含义，未静默丢弃。
- **未做**：公式重编号、跨文件交叉引用回填（本批只看 PDF p161-200，引用到的 §28.3 / §47 / §48 / §50 未展开）。

## 6. 目录里不属于我这批的问题（移交线索，未改动）

`OUT_DIR` 目录合并校验报 2 fails / 1 files_with_errors，定位到 **`MacKay信息论_p221-240.bilingual.md` line 229**（另一位 worker 的文件，非本批范围）：

```
inline: \sum_{w} A(w)[\beta(f)]^{w}
err: KaTeX parse error: Unexpected character: '\b' at position 15: \sum_{w} A(w)[\b̲eta(f)]^{w}
inline: [\beta(f)]^{w}
err: KaTeX parse error: Unexpected character: '\b' at position 2: [\b̲eta(f)]^{w}
```

从报错形态看，`\beta` 的 `\b` 被当成了退格控制字符（`\x08`），大概率是该文件里写成了裸 `\beta` 之外还夹了真实控制字符，或 `extract-formulas` 的 JSON 往返把 `\b` 解成了转义。**建议该批 worker 直接 grep `[\\b` 定位**，不要按「KaTeX 不认 \beta」去改（KaTeX 完全认 `\beta`）。我未修改他人文件。

## 7. 原文自身的错误 / 记号不一致（本节最重要）

1. **`MacKay信息论_p181-200.bilingual.md`：Figure 11.6 的 blocklength 原文写 27，实际应为 21。**
   正文说「先用 repetition code R3（$=H(3,1)$）横向、再用 $H(7,4)$ 纵向，concatenated code 的 blocklength 是 27」。但按它自己的构造：$K_1=1$、$K_2=4$ → 横向编码得 $4\times3=12$ 位 → 对 3 列各做 $(7,4)$ 纵向编码 → $3\times7=21$ 位；图 11.6(a)(c) 提取出的方阵恰好是 7 行 × 3 列 = 21 个数字。故 27 与原文自身不符。我按语义改为 21 并标 †（PDF p197，书内 p185 附近）。这条是本批最硬的一个原文错误。

2. **式 (11.33) 的记号不一致：同一段里 $S$ 与 $M$ 指同一个量。**
   PDF p194 先用 $S$ 表示「non-confusable inputs 的最大个数」（式 11.32），紧接着式 (11.33) 写成 $C=\frac1N\log M$。我照录并加 † 说明。这不是排版小事：$M$ 在本书别处没定义，读者会以为来了个新量。

3. **式 (10.29) 的矩阵行列归一约定与全书相反。**
   §9.6 定义 $Q(y\mid x)$ 时所有矩阵按**行 = 输入**（行和为 1，如 PDF p167 的 $5\times10$ 矩阵、PDF p182 的 Example 10.9）。而 PDF p186 这个例子列和为 1、行和不为 1。我在流体文中标 † 并给出唯一自洽读法（列 = 输入），同时点明「疑为排版转置」。**不改原数**。

4. **式 (10.26) 的关系符号在 PDF 文字层缺失**（PDF p183）。提取只能得到 `p_B` 与 `exp[-N E_sp(R)]` 两段，符号丢失。按 sphere-packing bound 的语义补为 $\succeq$（下界），并在文件里标 † 声明「以语义推定」。这是抽取层降级，不是原文错，但不标就会静默改数学。

5. **§11.4 的推理有一处未缝合（不是错，是跳步）**：先说「几乎所有码都（在平均意义下）是好的，但实现需要 $N$ 指数级查表」，随即说一般线性码的 ML 解码是 NP-complete（Berlekamp et al. 1978），然后 §11.5 直接端出 LDPC / turbo 这些「好的且实用的」码。这三步之间缺一个说明：NP-complete 只杀「任意线性码 + 通用解码」，实用码族靠**稀疏结构 + 局部 message passing** 绕开，而这条绕过至今没有一般性定理背书。原文没提醒，读者极易误读为「LDPC 就是那个 random code 的可实现版本」。此点在 p181-200 的译注里已挑明。

6. **已核对确认「不是错误」的两处**（避免误报，一并记录）：
   - PDF p185 式 (10.27) 写 $I=H_2(p_0+p_?/2)-p_?$，而按 channel 定义 $P(y{=}1)=p_1+p_?/2$。看似 $p_0$/$p_1$ 弄反，但由 $H_2(x)=H_2(1-x)$ 且 $p_0+p_1+p_?=1$，两式恒等。**原文正确**。
   - PDF p187 的 $\log\Omega=40.4$ bits 与「两两相连只有约 29 bits」：代入 $g_r=\{1,2,2,1,1\}$ 得 $\Omega\approx1.466\times10^{12}$，$\log_2=40.4$ ✓；$g_2=10$ 得 $\Omega\approx6.55\times10^{8}$，$\log_2=29.3$ ✓。**原文正确**。

## 8. 并发写入事故（必须记）

本批执行期间发现 **`MacKay信息论_p161-180.bilingual.md` 被另一个 worker 覆盖过一次**：我在 04:1x 落盘首版（62191 bytes），04:15 该文件被改写为 64718 bytes 的另一份译文（页标记写成 `<!-- ===== p161（原书 p149） ===== -->`，且 **`[译注]` 计数为 0**）。我核对了那份：结构完整、20 页齐全、术语处理也合格，但**缺硬指标要求的 ≥1 条 800-1200 字译者注**。故我把自己的版本（含 §注：random coding 为什么是证明引擎，约 1100 字，含 §10.3 / §10.10 落点 + union bound / birthday paradox / hash 碰撞的跨课程连接）写回，并**从对方版本吸收了页头那张完整页码映射表**（PDF p161↔书内 p149 … p180↔书内 p168）。对方版本已备份到 `C:/Users/27063/AppData/Local/Temp/mk161_other_writer_backup.md`（64718 bytes），未删除。

`MacKay信息论_p181-200.bilingual.md` 也被动过多次（我落盘 69009 → 补 † 后 69717 → 收尾时观测到 70559），但每次复查内容仍是我的（译注在、† 注释在、页标记 20 个无重复、KaTeX 独立复跑仍 0 fails）。**根因判断：主代理给两个 worker 派了重叠的 OUT_FILES**。建议后续派发时按 `OUT_FILES` 做互斥，否则最后落盘的 worker 会静默吃掉前面的成果。

## 9. 译者注

两份各 1 条，均用 `[译注]` + `<span style="color:#1e8449;">`（绿）：

- `MacKay信息论_p161-180.bilingual.md`（挂在 PDF p172 末，书中 §9.9 Solutions 的 Random coding 小节后）：**「随机编码为什么是信息论的证明引擎」**——机制讲三步替换（average over codes → union bound → expurgation）、抽掉独立性后 $\langle p_B\rangle$ 求和如何崩、birthday paradox 作为 union bound 的最小模型（$S\sim\sqrt A$ 临界点）；落点给 §10.3（PDF p176-179）+ §10.10 exercise 10.13（PDF p185-186）+ 第 4 章 source coding；跨学科挂 6.042J union bound / 6.041 birthday / CSAPP hash 碰撞期望；前沿给 Polar code（arXiv:0807.3917）。
- `MacKay信息论_p181-200.bilingual.md`（挂在 PDF p200 末，§11.9 习题后）：**「从球堆积到 5G」**——$C=\frac12\log(1+v/\sigma^2)$ 的承重位置（MCS 表、link budget、频段定价）+ $E_b/N_0=10\log_{10}(\ln 2)=-1.59$ dB 的推导与「它是下界、不被技术进步侵蚀」；落点给 §11.3 / §11.4 / p.568 的 Figure 47.17 / 式 11.13 页边注；跨学科挂 6.041（Gaussian 熵最大）+ Strang（正定矩阵与二次型）+ 6.046J（高维球体积集中）；前沿给 turbo(1993) / LDPC / Polar / finite blocklength（arXiv:0712.0146）。
