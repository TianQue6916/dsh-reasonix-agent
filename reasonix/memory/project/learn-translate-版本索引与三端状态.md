---
id: mem-3c1ffea0b8bf4184e2b335a4d211f51e
revision: 2
created_at: "2026-10-22T14:54:26.222Z"
updated_at: "2026-10-22T15:19:53.970Z"
name: learn-translate-版本索引与三端状态
description: "learn-translate v4.3 终态：174 行 / 20 references / 6 版沿革 / 铁律 31 讲解图 / 三端 2 副本"
metadata:
  type: user
  fact_type: reference
  scope: project
---

## 技能 `learn-translate` 当前版本（截至 2026-10-22 23:20）

**v4.3**：`SKILL.md` **174 行**，references **20 个**（另有 1 个 `.bak`），三端 sha256 一致（SKILL `379dd4a64b` / figures `dfbe5f3663`）。

### 版本沿革（细节在 `references/changelog.md`）
| 版本 | 内容 |
|---|---|
| v4.0 | 翻成「方舟学习引擎」：A 翻译（原 8 步逐字不动）/ B 学习；四问锚点（本质 / 公式 / 现实承重+消失测试 / 拓展四层）；铁律 26→30 |
| v4.1 | 改名 `learn-translate`；铁律 21 去 Reasonix 时代化；`§A2` 补主力机路径；锚点卡落 `Desktop/课程文件/锚点卡/<课程>/`；description 468→342 |
| v4.2 | 学习科学证据分级 `learning-science.md`（九条学习法标 [MA]/[RCT]/[EXP]/[CS]/[OBS]/[D]） |
| v4.2.1 | 数字核到 DOI（Rowland g=0.50 [0.42,0.58] 等）；纠 0.73/0.39 误引 |
| v4.2.2 | 人-AI 讨论协议（默认角色「审稿人」） |
| **v4.3** | **讲解用图标准 `figures.md`（73 行）+ 铁律 31 + 契约 16** |

### v4.3 要点（用户要求「帮助理解的图像也有很高要求，参照社区经验」）
- 五条硬标准**全带可判定判据**：coherence（指着元素问"删掉失去什么"）/ signaling（**遮标题**看能否指出重点）/ contiguity（禁「编号+远处对照表」）/ 一图一主张 / caption 必须**可被反驳的主张句**
- 数学图专规：截断轴必标 break、多子图共享 min/max、离散量不画光滑曲线、误差/样本数必须画、对数轴、**黑白打印可读**（他会打印讲义）、色盲调色板给色值（Okabe-Ito / Paul Tol `#DDAA33 #BB5566 #004488` / CUDO `#FF4B00 #F6AA00 #03AF7A #005AFF #4DC4FF`）
- **源码必须入库** `assets/src/*.py|.html|.tex`，禁止只交裸 PNG
- 证据：多媒体原则 **[MA]**（Noetel et al.，中等平均改善、原则间差异大）、coherence **[EXP]**（Mayer et al. 2001，无关材料**降低**理解）、seductive details [EXP] 效应小；Tufte 与调色板属 [D]/[OBS] 但零代价
- 社区出处：learning-wiki 的 `claims/coherence-principle-irrelevant-material-hurts-learning.md`、`principles/contiguity.md`、`principles/signaling.md`、`claims/seductive-details-effect.md`；`sksat/bambu-rs` 的 `color-universal-design/SKILL.md`；osint-foresight 的 `DATA_VISUALIZATION_BEST_PRACTICES_MASTER.md`
- 路由拆分：`原书插图（保留/裁切）` → `image-pipeline.md` + 铁律 26；`帮助理解的图` → `figures.md` + 铁律 31（此前两类混在一起）

### 三端与生效
- dsh 读 `~/.dsh/skills` → junction → `C:/Users/27063/ai-skills`
- `.reasonix/skills/learn-translate` 与 ai-skills 那份 **inode 相同** ⇒ 真副本 2 个（ai-skills + `AppData/Roaming/reasonix/skills`）
- `skill_search` 实时扫目录，改完当场生效，**无需重启**

### 踩坑（复用）
- 单次 shell heredoc 写 >8 KB 中文会**截断**；python 三引号里含英文 `"` 会 SyntaxError ⇒ 分段写（≤3 KB）+ 用中文引号 + `wc -l`/`tail`/grep 验证
- 含反斜杠路径的 python 字符串用 `r"""..."""`（否则 `\U` 转义报错）
