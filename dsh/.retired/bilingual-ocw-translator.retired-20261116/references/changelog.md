# 版本沿革 v3.1–v3.6（按需加载）

> **版本沿革 v3.1–v3.6**（从主文档移出，内容一字未改）。本技能全流程唯一模型：v4.1 flash = `deepseek-v4.1-flash`。

---

> v3.2（2026-09-10）：**模型全面统一为 v4.1 flash（用户拍板）**——v4.1 flash 已全面超越 pro，**pro 彻底弃用**：超强审计改用 `dsh-remote -m deepseek-v4.1-flash -e max`（难任务靠**多查资料 + 足量 prompt + 多轮优化**补足，而非换大模型）；`dsh-remote -m deepseek-v4.1-flash -e max` 语法保留但等价于 `-m deepseek-v4.1-flash -e max`。凡本技能出现「pro / v4.1 flash / deepseek-v4-pro」处，一律按 `deepseek-v4.1-flash` 执行（铁律 12/21/22 已同步）。
>
> v3.4（2026-09-23）：新增**第 9 章 视觉核对流水线**（用户拍板「以后可以多侧重视觉」）——🚨 **扫描版教材翻译必做**：用 `deepseek/deepseek-v4.1-flash` 的**图像输入**逐页转写原书作为**权威原文**，再与译文比对、派终校任务订正。含两个坑（必须带浏览器 UA 否则 Cloudflare 403；`vision-exp` 模型名在该端点不被支持）、可靠比对信号、以及**订正会删注**等副作用检查清单。实测把公式编号缺失页从 8 页降到 1 页，并纠正 5 处 OCR 文本层面查不出的实质错误。**原有章节未改动，仅追加。**
>
> v3.5（2026-09-23）：新增**铁律 25**（替换式改稿必须覆盖到公式边界 + 交付前必跑「公式体检」）与 **§8.9 PDF 渲染与交付四道坑** —— 均由 part005（Strang LaLFD 书页 198–248）实战踩出：视觉终校的「前半段替换 + `（续）`接续」补丁把 **7 处公式撕成两半**，其中 4 处落在 ```math 围栏内，`$` 配对检查查不出来、KaTeX 报错后以**裸 LaTeX 文本**印进成品 PDF（白跑两轮渲染才发现）；另有 ① `os.tmpdir()` 被 Reasonix 会话重定向，渲染脚本的依赖目录必须硬编码；② 纸张方向参数化（part005 横版 41 页 / 竖版 35 页，公式 3,660 个）；③ 渲染后必做**泄漏扫描**（`\tag{`/`\begin{` 等只该出现在公式里的命令，交付目标 0）；④ WPS 打开必须用 `ksolaunch.exe`，`office6\wps.exe` 只会拉起 `MainWindowHandle=0` 的无窗口常驻进程。**原有章节未改动，仅追加。**
>
> v3.6（2026-09-23）：新增**铁律 26**（原书插图是内容，不得静默丢弃）+ **第 10 章 图像流水线**：**保留原书插图**（视觉模型给百分比 bbox → PyMuPDF 高 dpi `clip` 裁切 → `assets/` + Markdown 引用 + 图注双语）与 **自创图**（难问题必须画：matplotlib/mathtext、HTML+SVG+Mermaid → Edge headless 截图、graphviz；含视觉模型"生成→复核→纠错"闭环）。§9.8 补图像层核对（图丢失 / 图注 / 图内文字 / 图表读数）。**四条实测事实**：① `deepseek/deepseek-v4.1-flash` 能定位插图并给出可用 bbox（实测 PDF p.208 图 IV.1 → `10,32,90,50`，与已译稿图注逐字对上）；② 🚨 图像任务 `max_tokens=4096` 会被 reasoning 吃满、`content` 为空（`finish_reason=length`），**必须 ≥16384**；③ 扫描版教材用 `pdfimages` 只能抽出整页 JPEG（每页仅 1 张嵌入图），**必须走渲染 + `clip` 裁切**；④ `msedge --headless --screenshot` 与 matplotlib（`Microsoft YaHei`/`SimHei` + mathtext）在本机均实测可用。**原有章节未改动，仅追加。**
>
> v3.3（2026-09-21）：新增**第 8 章 实战档案：Problem Set「解题 + 详解」双语流水线**（18.065 第二/三/四课实战，3 份文件已交付）——含题目详解场景的文档骨架、**每题一个 dsh 任务**、**按「课程头 + 每题」拆分终审**、**按 TaskId 从 `.diag.txt` 取结果**（结果文件同秒会互相覆盖）、注按主题拆分为 800-1200 字、终审内部说明的交付前清理清单，以及 Windows 主力机直调 `dsh-gate-conc.ps1` 的环境差异。**原有章节未改动，仅追加。**
>
> v3.1（历史版本，2026-09-08，模型口径已被 v3.2 取代）：**模型/通道大改版（用户拍板）**——① 写注从 pro 降级为 **dsh flash**（能力差不多，不烧 pro）；② **pro 只保留给超强审计**一个角色；③ **Reasonix 不派任何子代理，一切子代理活全部转 dsh**；④ 新增**铁律 23：任何 dsh 任务必须先查小电脑 wiki**（PocketWiki + 离线维基 ZIM，派发前注入 prompt）。历史/来源/错误详表移入同目录 `HISTORY.md`（规则零删除）。版本沿革见 HISTORY.md 8.8。


---

## 同步纪律（2026-09-30 补）

双机同步器 `~/.reasonix/global-workspace/sync/sync_reasonix.py` 的规则是：**同名不同内容 → 双方都保留（各自主文件不动），对方版本另存 `.conflict.<host>.<hash>.bak`**；**仅一方有 → 向另一方补齐**。后果：

1. **冲突永远不会自动收敛**——两端会长期各留一份主文件（本技能在 Windows `.reasonix` 侧曾冻结在 2026-09-10 的 v3.2，而 Linux / Windows Roaming 侧已到 v3.6，差 937 行）。
2. 🚨 **删除/停用必须在三端同时做**：若只在 Windows 删掉 `SKILL.md`，而 Linux 仍留着，下一次 cron 会「仅一方有 → 补齐」把文件补回来，停用失效。
3. 判断谁新谁旧**不能**看 `revision` / `updated_at` / `mtime`（mtime 是同步落盘时间）；**唯一可靠判据是剥掉 frontmatter 比正文**。
4. 正确做法：**先让三端字节一致**（size 相同即被判定 same，冲突不再产生），再做任何增删。
