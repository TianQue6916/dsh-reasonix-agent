> **按需加载章节**（主文档 `SKILL.md` 的 progressive disclosure 拆分件）。本技能全流程唯一模型：v4.1 flash = `deepseek-v4.1-flash`；契约与铁律见主文档「🎯 核心契约」与第 1 章。

---

# 第 8 章 实战档案：Problem Set「解题 + 详解」双语流水线（18.065，2026-09-21）

> 本章为**追加**章节（既有章节内容零改动）。适用场景：**题目详解**（Problem Set / 讲题 / 习题课），即「翻译 + 解题」双动作——比纯翻译多一步"先把题做对，再双语写出来"。实战对象：MIT 18.065（Strang）Lecture 2/3/4 的 Problem Set I.2 / I.5 / I.6，3 份文件已交付。

## 8.1 交付形态（用户 2026-09-21 明确要求）

- **每课一个文件，不合并**：`18.065_PS_I.2_Lecture2_双语详解.md`、`18.065_PS_I.5_Lecture3_双语详解.md`、`18.065_PS_I.6_Lecture4_双语详解.md`
- 输出目录：Windows 主力机 `C:\Users\27063\Desktop\课程文件\data lerning\`（= 小电脑 `~/桌面/课程文件/<课程文件夹>/`）
- PDF 由用户自己用 Edge 打印生成（实测 PDF 元数据 `Producer: Skia/PDF`），**不要求我方产出 PDF**

## 8.2 文档骨架（沿用 Lecture 1 成品，可复用）

```
# 课程全称（#c0392b）
> 灰来源行：原文来源（ocw problem sets 文件 + 页码）· 教材出处（§节号 + 页码）· 答案核验（官方 Instructor's Manual）
## 第 N 课 · Problems for Lecture N（第 N 讲讲题）（#c0392b）
（引言 3 段：把本讲读成一个设计问题 → 分三层/四层；说明每题压住哪一层）
### 术语口径（本讲五个词，后文严格按此使用）（#00838f）
（5 个术语，每个 1-2 句 + 公式；末尾 🚨 必须挡住的两/三处混淆）
---
### [problem] Problem N（问题 N）            ← 蓝标签 + 题号深红，标题标记在行首
> 灰引用行：教材 §I.x, p.yy | Manual, Problem Set I.x 题 N
（中文题目：行内双语）
<span style="color:#7f8c8d;">**Original（英文原题）：** …</span>
---
> [solution] 一、结论 → 二/三/四、方法一/二/三（每种方法说明"看到了什么别的视角看不到的""适用条件""劣势"）
>             → 常见错误判定（逐条 ❌ + 错在哪一步；❌ 真的错 / ⚠ 不算错但前提被缩小）
>             → Manual 标准答案的独立验证（逐句核，指出不严谨处）
>             → 自检（代入验算 / 维数记账 / trace-det 校验 / 范数校验）
>             → 一句话：这道题真正训练什么
> [note] 译者注（按主题拆成多条，每条 800-1200 字）
> **十、这道题的设计意图（把各小问折叠成一个设计问题）**
---
## 附：N 题合观——把 N 道题折叠成一个设计问题（#c0392b）
```

## 8.3 流水线（本轮实测，8 题 → 3 文件 → 11 个终审任务）

| 波 | 动作 | 通道 |
|----|------|------|
| 0 | 素材：`pdftotext -layout` 提题目原文（课号→Problem Set→题号）；官方 Instructor's Manual 答案逐条摘录；教材章节要点（可从**已译双语稿**摘——本机 319 MB 教材 PDF 是扫描版，pdftotext 提取为空） | 主代理 |
| 1 | **每题一个 dsh 任务**（`-e max`）：读者画像 + 知识库先行声明 + 题目原文 + Manual 答案 + 教材要点 + 硬性要求（≥2-3 种方法 / 常见错误判定 / 自检 / 不确定明说）+ 输出格式模板 + **上一课成品片段作格式样板** | dsh（8 个） |
| 2 | 组装：主代理写课程头（含术语口径）与末尾合观节，拼成每课一份草稿 | 主代理 |
| 3 | **终审按「课程头 + 每题」拆分**（审计+修复一体，`-e max`）：11 个任务 | dsh（11 个） |
| 4 | 回填 → 机械清理 → 格式自检 → 交付（每课一文件） | 主代理 |

## 8.4 本轮教训（全部实测，违反必返工）

1. **🚨 dsh 结果文件会互相覆盖**：`dsh-gate-conc.ps1` 的结果文件名精度只到"秒"，同秒完成的两个并发任务写同一路径 → **必须按 TaskId 读 `%TEMP%\dsh-gate\<TaskId>-<model>.diag.txt`**（diag 名含 TaskId，唯一）。
2. **diag 里 reasoning 与答案混排**：前 30-3200 行是英文思考流，答案起点 = **最后一个** `### <span ...**[problem]**`（题块任务）或 `# <span ...18.065`（课程头任务）。dsh 偶发**重复输出整题**（前一遍带 reasoning 碎片）→ 取最后一处起点即得干净全文。
3. **超长输出会触发流式中断**（TRANSPORT / `rc=-1`）：单任务要求"输出 30000 字"实测失败（114s/279s 中断）→ **按题拆分**（每题输出 ≤20K 字符）后 11 个终审任务 100% 成功（34-185s）。
4. **dsh 会丢 span 引号**：输出写成 `<span style=color:#xxxxxx;>` → 回填时机械修复为 `<span style="color:#xxxxxx;">`（并统一 `[solution]` 用 `#1e8449`、h2 用 `#c0392b`）。
5. **注普遍超长**：每题一个任务时 dsh 倾向把一切塞进注（实测单条 2000-8000 字）。终审 prompt 必须显式写「按主题拆分为多条 800-1200 字注，🚫 不得为压字数删数学内容/例子/跨课程连接」——实测可拆为（其一）…（其六），拆分后正文汉字 500-1000（公式/引文不计）。
6. **终审会把"给主代理的说明"写进正文**，交付前必须清理：`<small>审稿附注：…</small>`、`**两点必须交代的编辑说明**`、`**⚠ 待核项汇总**`、把 `⚠ 待核：…` 插在 `[solution]` 首行。**判据**：凡"本会话/本次待审/补发后我按…/详见文末待核清单"一类话术即删；信息若已在来源行标注，正文里的待核标记一并删除。
7. **重复合观节**：终审可能在最后一题里重写草稿末尾的"合观"节 → 拼装正则要放宽到 `## <span ...color:#任意6位;?>附：`，只保留一份。
8. **重复分隔线**：题干块尾的 `---` 与拼装分隔符叠加出 `---\n\n---` → 交付前折叠。
9. **术语口径节措辞**会被终审改写（"本讲的五个词"），拼装后统一。
10. **格式自检照旧是全绿门槛**：`$$`=0、`<div>`=0、Unicode 上下标=0、英文行首（>10 词）=0、math 围栏配对、标题标记行首、行内 `$` 配对（见 §8.6 脚本）。

## 8.5 环境差异：Windows 主力机直调 dsh（非 dsh-remote）

- 调用：`powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\27063\.local\bin\dsh-gate-conc.ps1 -Model deepseek-v4.1-flash -Effort max -TaskFile <绝对路径> -Async`
- 查状态：同脚本 `-Status`（`✅done / ▶running / ❌failed` + result/diag 路径）；结果落 `%TEMP%\dsh-gate\`
- 长任务一律 `-Async`（同步通路 ~160 s 上限）；并发实测单批 4-6 个稳定（11 个分两批全成）
- ⚠ 本机（Windows）无 PocketWiki、无 ZIM（`localhost:8808` 超时、无 `wiki-data`），铁律 23 的 wiki 先行改用**替代权威源**并在 prompt 中声明：官方 Instructor's Manual + 教材（含本机已译双语稿）+ 网络检索兜底

## 8.6 可复用脚本（本轮产物，路径：`<workspace>/.reasonix/attachments/p18_065_ps/`）

| 脚本 | 作用 |
|------|------|
| `make_tasks2.py` | 生成"每题一个"解题任务（共享 spec 块 + 格式样板） |
| `make_audit2.py` | 按「课程头 + 每题」拆分生成终审任务 |
| `rebase.py` | 按 TaskId 从 `.diag.txt` 提取修订后全文（自动跳过 reasoning） |
| `final_assemble.py` | 用修订稿拼装每课一份最终文件（修 span 引号、去重合观、拆 tail） |
| `clean_final.py` | 交付前清理（内部说明、待核标记、标签配色统一） |
| `check_format.py` | 格式自检（`$$` / `<div>` / Unicode 上下标 / 英文行首 / math 围栏 / 标题行首 / 行内 `$` 配对） |
| `notes_count`（见 verify_notes2.py） | 注字数统计（**汉字口径**、公式不计，判断是否落在 800-1200） |

## 8.7 交付前备份点（呼应铁律 19）

本轮实际执行：① 开工前（源 PDF + 第一课成品 + 脚本）；② 组装草稿后、派终审前（`backup/<stamp>-before-clean`，含 `rev/` + `draft_*`）；③ 交付前（`backup/<stamp>-final`，含 `final_*` + `rev/`）。三次全部用 `backup/<时间戳>-<阶段名>/`，不删历史。

## 8.8 二次实战补遗（2026-09-21，注归一化 + 横版 PDF + WPS 交付）

1. 🚨 **dsh 的"长文本重写"会剥离 `$` 与反斜杠**（本轮最大坑）：把"注字数归一化"整课交给一个 dsh 任务后，输出里 `$A$`→`A`、`$\mathbb{R}^2$`→`R^2`、`$\lambda$`→`lambda`，**三份文件的注区公式全部文本化**（diag 原文即如此，非本地管道问题）。短任务（逐字复述、单点补写）实测**不受影响**。
   **对策三条同时上**：① **颗粒度**：一次只处理 1–2 条注，不要把整课注块交给一个任务；② **prompt 红线**：写明「所有 `$...$`、```math 围栏、反斜杠命令必须一字不改原样保留，严禁把 `$\lambda$` 写成 `lambda`，违反即整份作废」；③ **回填前硬校验**：统计新块与原块的 `$` 数量、`\[a-zA-Z]+` 命令数量，**任一减少即拒绝回填并重跑**（脚本 `apply_notefix2.py` 已实现）。
2. **注字数统计必须扣掉「设计意图」小节**：注块边界应为「下一条 `[note]` / `^> \*\*[一二三四五六七八九十]+、.*设计意图` / 首个非 blockquote 行」。若只按「下一条 `[note]`」截取，末尾设计意图（600+ 字）会被算进最后一条注，误判成 1600–2000 汉字（本轮因此差点白跑一轮）。
3. 🚨 **主代理不亲自做内容生成**（用户 2026-09-21 明确拍板「主代理以后不要亲自干活」）：主代理只做**切分、组装 prompt、派发、回填、机械清理、校验、审查**；合并/补足/精简/改写等内容动作**一律派 dsh**。机械替换（span 引号、重复分隔线、标签配色、字数统计）不属于"干活"，主代理直改。
4. **本机即有 18.065 官方视频字幕**（`D:\b站视频\解析视频\麻省理工学院—线性代数课（完整版72讲）…`）：第 38/39/40 号视频 = Lecture 2/3/4，各含 `*transcribed*.srt`（**英文原句**）+ `*transcribed*.zho-hans.srt`（**官方中文字幕**，时间轴对齐）→ 🎥 引文的一手来源（含英文原文 + 中文翻译，天然满足铁律 10）。抽取脚本：`make_subs_excerpt.py`（按关键词抽 cue + 对齐中文）。
5. **横版 PDF 流水线（本机 Windows 可用）**：`build_pdf.cjs` = marked 解析 + KaTeX 服务端渲染（公式先抽成占位符、渲染后回填）+ Edge headless 打印。
   `msedge.exe --headless=new --no-pdf-header-footer --virtual-time-budget=30000 --user-data-dir=<独立目录> --print-to-pdf=<绝对路径> file:///<html>`
   —— **`--user-data-dir` 必需**（否则命令被转发到已在运行的 Edge 会话、不产出文件）；**输出路径必须绝对**（相对路径报"系统找不到指定的路径"）；横版由 CSS `@page { size: A4 landscape; margin: 13mm 15mm }` 决定（实测 842×595 pt，与用户 Edge 打印的第一课 PDF 完全一致）。
   依赖：`npm i katex marked`（装到工作区外如 `%TEMP%\pdfbuild`），脚本用绝对路径 require。⚠️ **本机 `%TEMP%` 会被 Reasonix 会话重定向**，脚本里的依赖目录**必须硬编码**——见 §8.9。
6. **WPS 打开（自动云同步）**：用户要求**渲染成 PDF 后直接用 WPS 打开即可**（WPS 自动云同步到手机，不需要上传云盘或起 HTTP 服务）。⚠️ **打开入口必须是 `ksolaunch.exe`**——见 §8.9 第 4 条（用 `office6\wps.exe` 只会拉起无窗口常驻进程）。

## 8.9 PDF 渲染与交付：四道实测坑（2026-09-23 part005 全流程验证）

> 交付物：`part005.bilingual.md`（314,967 bytes / 2,474 非空行 / 49,330 汉字）→ 横版 41 页 + 竖版 35 页 PDF，公式 3,660 个，泄漏点 **0**。

1. 🚨 **`os.tmpdir()` 会被 Reasonix 会话重定向**：本会话 `os.tmpdir()` = `...\Temp\reasonix-session-tmp-<pid>`，而依赖装在 `...\Temp\pdfbuild\node_modules` → 沿用旧脚本的 `path.join(os.tmpdir(), "pdfbuild", "node_modules")` 必然 `MODULE_NOT_FOUND`。
   **对策**：脚本里**硬编码**依赖目录，并统一用**正斜杠**（`C:/Users/…/Temp/pdfbuild/node_modules`）——用反斜杠时 PowerShell here-string → Python → JS 的三重转义极易写成 4 个反斜杠（`\\\\` 在 JS 里解析为两个字面反斜杠，路径失效）。
2. **纸张方向参数化**（本次新增）：`@page { size: A4 ${ORIENT} }` + 命令行第 4 参数 `landscape|portrait`。竖版字号 `11pt` / 行高 `1.85`，横版 `10.5pt` / `1.78`。实测：**横版 41 页（842×595 pt）/ 竖版 35 页（595×842 pt）**，PDF ~2.9 MB。
   —— 教材**正文**建议出竖版（行宽更接近纸张比例、可读性好）；但**「像之前一样」= 横版**，用户明确这么说时以横版为交付主件、竖版作附赠（两版成本仅 ~30 秒）。
3. 🚨 **渲染后必做「泄漏扫描」**（`scan_pdf_leaks.py`）：PyMuPDF 逐页 `get_text()`，grep `\tag{`、`\begin{`、`\end{`、`\frac{`、`\mathrm{` 等**只该出现在公式里的命令**；命中 = KaTeX 渲染失败、公式以裸文本入 PDF。**交付目标值 0**。（配套的 md 侧体检见铁律 25。）
4. 🚨 **WPS 打开必须用 `ksolaunch.exe`，不是 `office6\wps.exe`**（2026-09-23 实测，`.md`/`.pdf` 都一样）：
   ```powershell
   $wpsExe  = (Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\wps.exe").'(default)'
   $launcher = Join-Path (Split-Path $wpsExe) "ksolaunch.exe"     # 版本号会变，不要硬编码
   Start-Process $launcher -ArgumentList "`"<绝对路径>`""
   # 验证：Get-Process | ? { $_.MainWindowHandle -ne 0 } | Select ProcessName,MainWindowTitle
   #      看到 "<文件名> - WPS Office" 才算真打开
   ```
   三种写法实测：`Start-Process ...\office6\wps.exe <file>` ❌（`MainWindowHandle=0`，无窗口）、`Invoke-Item <file>` ❌、`Start-Process ...\ksolaunch.exe <file>` ✅。
   **失败的启动会留下多个 `MainWindowHandle=0` 的 wps 僵尸进程**，会让「看进程数判断是否打开」误导——判据永远用**窗口标题**。
5. **本机 WPS 主程序在 `D:\wps\WPS Office\<version>\office6\`**（注册表 `HKCU\Software\Classes\KWPS.PDF.9\shell\open\command` 可查；`C:\Program Files (x86)\Kingsoft` 下只剩云同步组件）。可执行文件里只有 `ksolaunch.exe` 是**文件打开入口**（`et.exe`=表格 / `wpp.exe`=演示 / `wpspdf.exe` / `wpscloudsvr.exe` 各司其职）。

---

