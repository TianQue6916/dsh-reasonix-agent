---
id: merged-bilingualocwtranslator版本与铁律索引.md
revision: 1
created_at: "2026-08-16T14:30:00.000000000Z"
updated_at: "2026-08-16T14:30:00.000000000Z"
name: bilingual-ocw-translator-版本与铁律索引.md
description: bilingual 技能版本/铁律/教训索引（技能本体为准，此处留溯源与文件路径）
metadata:
  type: user
  fact_type: reference
  scope: global
---

# bilingual-ocw-translator-版本与铁律索引.md

> 2026-08-16 合并生成。来源原始件在 ~/.reasonix/memory-archive-20260816/（信息零丢失）。


## 来源：bilingual-ocw-translator-refactored-v2.md

# bilingual-ocw-translator 重构完成（v2.0，2026-08-09）

**Why:** 用户根据网页版（DeepSeek）诊断 + 本机实测（双机冲突 .bak），决定按使用场景重构技能为 11 章单文件。

**How to apply:**
- 新版结构：⚡快速上手路由表 → 第一章🚨铁律（18条）→ 第二章标准翻译流程（含全资源搜索+双审计）→ 第三章大规模策略（8a-8j 波次分工）→ 第四章译者注指南 → 第五章配色标签速查（唯一权威）→ 第六章工具参考 → 第七章子代理Prompt模板 → 第八章历史错误记忆 → 附录
- 内容零删除：Strang/prob7sol/PS01/lec16 教训、Part C/D 来源表、8h 对比审计、Reader Testing 等全部保留（见技能第八章 8.2 错误清单表）
- **双机同步铁律：以 Linux 版 SKILL.md 为准**。win 端旧版（含被否决的"50 worker 子代理翻译"8b）必须被覆盖；已清理本机 2 个 .bak 冲突文件（8月4日 linux 版 + 8月8日 win 版）
- 旧 8b"主代理亲自翻译"铁律（2026-08-04）已被 2026-08-09 新分工替代：25×2 子代理翻译 + 32 上限波次（见 [[reasonix-32-parallel-limit-and-translation-division]]）
- 新技能文件：`/home/tianque/.reasonix/skills/bilingual-ocw-translator/SKILL.md`（1356行/78KB）

## 来源：bilingual-ocw-translator-v21-backup-iron-rule.md

# bilingual-ocw-translator 技能新增铁律 19（备份）

**变更**：2026-08-09 用户要求「每一步都必须不断备份」，已在技能第一章新增**流程类铁律 19**（第一章现有四类铁律：格式 1-10 / 分工 11-13 / 来源 14-18 / 流程 19），版本沿革记为 v2.1。

**Why:** 多波次 + 多子代理 + 多轮审计修复，合并与批量修复是破坏性操作；无备份则整波重跑（每波 ≤32 子代理）成本极高。

**How to apply:** 翻译流水线 5 个必做备份点——①开工前（源 PDF/原文/术语表）②波 1 worker 落盘后（打包 `pages/`）③每次执行审计修改意见前（8c/8i/8j）④8e 合并前（全部波次产物）⑤交付前。快照存 `.reasonix/attachments/backup/<时间戳>-<阶段名>/`，保留 ≥3 份，交付确认前不删。文件：`/home/tianque/.reasonix/skills/bilingual-ocw-translator/SKILL.md`（global）

## 来源：bilingual-translator-实战铁律5条.md

在翻译《Elementary Real Analysis》50页实战中，bilingual-translator 技能补充了5条铁律（2025.07）：

1. **英文句子开头（铁律）**：每句话第一个字必须是中文，不能以英文单词开句。❌ `A sequence（序列）就是...` → ✅ `一个 sequence（序列）就是...`
2. **引导箭头式英中对照（铁律）**：禁止"英文原句 → 中文翻译"模式，也禁止先写英文再写中文。必须纯中文主体 + 英文术语嵌入。
3. **同一术语反复加括号（建议）**：同一段落中术语首次出现时加 `English term（中文翻译）`，后续出现时省略括号。❌ `用 real numbers（实数）来研究 real numbers（实数）` → ✅ `用 real numbers（实数）来研究实数的性质`
4. **多句合并式压缩（铁律）**：原文每一句都对应至少一句中文翻译，不得将3-5句压缩为1句。逐句阅读→逐句翻译→逐句输出。
5. **LaTeX 环境内不翻译（铁律）**：`$...$`、`$$...$$`、`\begin{}...\end{}` 环境内的任何文本（包括 `\text{}` 内的内容）保持英文原样，不做翻译。

**Why:** 这5条是在逐句翻译50页教材的实战中反复犯错后总结的。前两条是格式硬伤，第3条是冗余，第4条导致内容不全被用户批评，第5条是数学写作规范。

**How to apply:** 每次调用 bilingual-translator 时，先默念这5条铁律。以第4条为最耗时的约束——逐句翻译比概括式翻译慢3-5倍，但用户要求的就是逐句。

## 来源：bilingual-translator-no-en-zh-blocks.md

## 经验教训：英中分段对照 ≠ 行内双语

**错误做法：** 第一次翻译 prob7sol.pdf 时，输出了「完整英文段落 + 完整中文段落」的英中对照格式。这不符合 bilingual-translator 技能的核心要求。

**正确的格式：** 中文为主体句子，英文术语以 `English term（中文翻译）` 格式行内嵌入，**没有完整的英文原句**。

```
✅ 在带权有向图 G = (V, E) 中，vertex（顶点）u ∈ V 的 weighted eccentricity（带权离心率）...
❌ In a weighted directed graph G = (V, E)...（英文段）
   在带权有向图 G = (V, E) 中...（中文段）
```

**如何自检：** 如果输出中有任何一行以英文单词开头且长度超过 10 个词，后面紧跟着一行中文翻译，那就是错的。

**Why:** 技能名为「双语翻译」而非「双语对照」——目的是让中文读者在读中文时自然接触到英文术语，而不是提供逐段对照。

## 来源：bilingual-translator-output-path.md

## 双语翻译默认输出路径

**路径：** `/home/tianque/桌面/课程文件/`

**何时使用：** 每次调用 bilingual-translator 技能翻译文件时，应将翻译后的 `.bilingual.md` 文件输出到此目录。

**文件名规则：** `<源文件名>.bilingual.md`

**沙箱限制：** 如果在 Reasonix 工作区内无法直接写入该路径，先将文件写入 `.reasonix/attachments/`，然后提供 `cp` 命令供用户自行复制：

```bash
cp /home/tianque/.reasonix/global-workspace/.reasonix/attachments/<file>.bilingual.md /home/tianque/桌面/课程文件/<file>.bilingual.md
```

**来源：** 用户在处理 prob7sol.pdf 翻译时明确要求将此路径计入技能。

## 来源：strang-part002-translation-complete.md

# Strang LaLFD part002 双语翻译完成（p051-100，书页 46-95）

**Why:** 用户 2026-08-09 要求续译《Linear Algebra and Learning From Data》第 51-100 页。按 bilingual-ocw-translator v2.0 大规模流程（25×2 子代理翻译 + 双审计）执行，用户中途指示"注意多阅读技能要求，成本过高"→ 波 3 超强审计从 2×v4pro+max 减为 1×。

**How to apply:**
- **成果文件**：`/home/tianque/桌面/课程文件/data lerning/Strang_LaLFD_part002_p051-100.bilingual.md`（3232 行/219KB）
- **覆盖范围**：书页 46-95 = §I.7 尾（能量定义/检验/Cholesky/最小值问题）→ PS 1.7 → §I.8 SVD（含极分解）→ PS 1.8 → §I.9 PCA/Eckart-Young → PS 1.9 → §I.10 瑞利商/GSVD/LDA → PS 1.10 → §I.11 范数/核范数。习题页保留英文原题
- **术语**：`part001 提取 313 术语 + part002 新增 SVD/PCA/范数术语` 存于 `.reasonix/attachments/strang_p002/glossary.md`
- **流程资产**（下次 part003 可复用）：OCR 文本 `strang_ocr_text_p002.txt`；页面文件 `.reasonix/attachments/strang_p002/pages/`；审计报告 `audit/`、`audit_final.md`、`format_audit.md`；注 `notes/`；xref `notes/xref_1/2.md`
- **OCR 工具链**：主力机 Python313（C:\Users\27063\AppData\Local\Programs\Python\Python313\python.exe）有 winrt+fitz+PIL；渲染+OCR 脚本 `ocr_part002.py` 已部署，schtasks 方式运行（SSH 断开会杀进程，须用计划任务）
- **书页号 = PDF 页 - 5**（part002 PDF p51 = 书页 46）
- **已知待办**：part001 的 §I.7 是"总览式"翻译（检验编号 Test 1-5 与原文不符、Examples 编号错位），如需精确需对照 part002 p51-53 修正
- **教训已记**：`.reasonix/attachments/translation_error_memory.md`（合并脚本注解析 bug、A_c 公式方向、英文开句正文遗漏、孤立 ** 残留）
- **主力机遗留**：`C:\Users\27063\strang_ocr_pages_p002\`（50 PNG）、`ocr_results_p002.json`、`ocr_part002.py`、`run_ocr_task.ps1`、计划任务 ocr_p002——part003 直接复用

**成本经验**：25 翻译 worker（flash）+ 15 波 2（含 3 v4pro 写注）+ 1 修复（flash）+ 1 v4pro+max 超强审计 + 1 flash 格式审计 ≈ 本次总成本。用户要求成本敏感：翻译/审计用 flash，写注 3 个 v4pro 可减为 2 个，超强审计 1 个即可。

## 来源：strang-translation-lessons.md

在翻译《Linear Algebra and Learning From Data》（Gilbert Strang）Part I 前50页的过程中，发现了以下子 agent 常见陷阱：

1. **"English sentence（中文）"单行对照** — 子 agent 写的内容以完整英文句子开头（如"This is how we compute..."），然后跟中文翻译在括号中。这是铁律①和②的复合违反。**英文只能以术语片段形式出现。**

2. **伪逐句翻译** — 子 agent 声称"700行逐句翻译"，但实际中文字符数只有7248，平均每行5.4个字，说明在概括而非逐句翻译。**真正的逐句翻译每页应有30-40行，平均每行6-7个中文字。**

3. **OCR 预处理缺失** — 子 agent 直接翻译OCR乱码（Aæ、鬱等）而不修正。

4. **章节密度差异** — 同一文件中 §I.2 密度38行/页而 §I.5 仅6行/页，用户明显看出不协调。

**解决方案：** 对于高质量逐句翻译，我亲自逐页对照OCR文本逐句翻译，不使用子 agent。子 agent 只适合初步处理后的格式修正。

**Why:** 这次翻译了50页（1184行/63KB），子 agent 的前两版均被用户拒绝（格式错误+密度不足），最后我亲自逐句翻译才通过。

**How to apply:** 下次需要逐句翻译教材时，直接使用"逐句对照OCR文本→中文写作→英文术语嵌入"的流程，不给子 agent 做核心翻译工作。

## 来源：subtitleedit-skill-created.md

# SubtitleEdit 自动翻译技能已创建（global）— 2026-08-04 批量执行状态

**技能**：`subtitleedit`（install_skill 已装，global scope）——操控 SubtitleEdit v5.1.0-rc18（Avalonia）自动翻译 srt：WMI 脱离启动防闪退、Ctrl+Shift+G 触发自动翻译、UIAutomation 操控 Avalonia 对话框、DeepSeek（deepseek-v4-flash）引擎批量翻译。

**Why:** 2026-08-04 批量翻译 MIT 6.046 算法进阶 39 个 srt 时踩坑总结（完整教训已写入 SKILL.md 第七章）：
1. **WMI 启动 powershell 失败**（"Access is denied"，缺 SESSIONNAME）——worker 必须用 Reasonix 后台任务直跑，SE 才用 WMI 启动
2. **翻译后"确定"按钮 Invoke 不可靠**——需重试 + 对话框关闭检查
3. **保存会弹"另存为"对话框**——必须再点一次确定，且保存后用 mtime/中文行数验证
4. **DeepSeek API 反复 503/404**——批量前必须探测 API，恢复后自动启动
5. **PowerShell `$var:` 解析坑**——一律写 `${var}:`

**当前状态（2026-08-04 下午）**：39 个 srt **0 个翻译成功**（全部仍英文），API 不稳定，用户决定晚上继续。

**How to apply（晚上恢复步骤）**：
- 备份已存在：`D:\b站视频\解析视频\算法进阶\视频\Subtitles_原版备份_20260804\`（39 个英文原版）
- 分组列表已生成：`C:\Users\27063\AppData\Roaming\reasonix\global-workspace\batch_tmp\group0-3.txt`（10/10/10/9）
- ① 测 DeepSeek API（`https://api.deepseek.com/chat/completions`，key 在 Settings.json）；② 通后起 4 个后台任务跑 `se-batch-worker.ps1 -WorkerId N -ListFile batch_tmp\groupN.txt -LogFile batch_tmp\wN.log -WorkerScript se-translate-one.ps1`；③ 完成后检查 srt 是否含中文

**相关**：[[mit-6046j-镜像整理]]（算法进阶 39 个 srt 目标目录 D:\b站视频\解析视频\算法进阶\视频\Subtitles）
