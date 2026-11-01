---
id: "ad6df72a-866f-4126-83f0-47947d005b98"
title: "教材 bilingual 补图流水线：PyMuPDF 锚定法、裁剪判据与 Windows 远端派发踩坑（2026-11-01）"
description: "MacKay/Boyd 等教材 bilingual 产物「占位图→真图裁剪嵌入」的可复跑流程：get_text('blocks') 图注 bbox 锚定 + get_drawings() 并集定位、每张必须 read_image 目视核边、占位描述不可信的实证清单、Python raw string 静默损坏与 read_image 二次降采样等实测陷阱，以及 Windows 上跨 session 派发 worker 的 Scheduled Task 配置。"
status: "active"
created_at: "2026-10-31T17:33:55.853Z"
updated_at: "2026-10-31T17:33:55.853Z"
content_hash: "9333bf0fac12c6d8a7b04bddcf4af38504876a1bfa4075862dece8af0410f3db"
source_paths:
  - ".dsh/plans/session-5975e549-c31a-4745-835c-37a38a64b0cf.md"
  - ".dsh/contrib/star-audit.py"
session_ids:
  - "87b54857-a812-4c9b-9b6d-44c96a84f585"
memory_body_ids:
  []
---

# 教材 bilingual 补图流水线（2026-11-01 交接版提炼）

来源：MacKay《Information Theory》补图工程的跨会话交接文件
`.dsh/plans/session-5975e549-c31a-4745-835c-37a38a64b0cf.md`（13 章 / 381 行，commit `3e93f40`）。该文件本身是逐块进度表，本文件只固化其中**可复用的方法与判据**。

## 1. 定位法（替换掉旧的「截图目测 + 百分比换算」）

旧法会偏移约 200 px，原因是 `read_image` 预览会二次降采样（实测 3306×4678 → 1721×2435 → 1131×1600）。正解：

1. `page.get_text('blocks')` 取图注（Figure N.M）文本 block 的 **pt bbox** 作为锚点；
2. `page.get_drawings()` 求矢量对象的并集得到图形实际范围，与图注 bbox 取并集；
3. 再按 `zoom` 换算成像素坐标后 clip 渲染。

两个例外/常量：
- **右栏常量 412pt**：双栏排版右栏图从 x≈412pt 起，靠 drawings 求并集时若 drawings 为空需用该常量兜底。
- **纯位图图 `drawings=0`**：整页扫描式插图没有矢量对象，此时只能退回「图注 bbox + 版面常量」估算，并必须目视复核。

## 2. 验收判据（硬性，不是建议）

- **每一张裁完都必须 `read_image` 目视核边**。「按 bbox 裁一次就成」是错觉：p181-200 一块 12 张图有 **8 张返工**（漏行、切底、丢右轴标签、丢最右图元、顶部混入正文两行）。
- 判据用占位符计数对账：`grep -c '\[Figure'`（占位）vs `grep -c '!\['`（已嵌）。注意**占位数 ≠ 唯一图数**，图注文字里也会出现 `Figure` 字样。
- 备份目录不要放在被 `glob('*.bilingual.md')` 扫到的路径下（`_backup_pagemark/` 曾被扫到导致重复计数）。

## 3. 「占位描述不可信」——已积累的实证

占位/图注阶段的文字描述是**上一阶段（译注）带下来的**，反复被证伪，必须回原 PDF 核：

| 实例 | 占位怎么说 | 真图 |
|---|---|---|
| Figure 13.17 | Petersen 图，每节点度 3、15 条边 | **Tanner 图**（10 个三角 check 节点 + 15 个圆圈 bit 节点）—— 数学内容错误 |
| Figure 11.5 | 曲线从 (0,1.44) 起、趋于渐近线 1，图上标了渐近线 | 从原点 (0,0) 陡升至约 1.32，**图上没有渐近线/没有 e、log e、1.44 标注** |
| 13.6 | 有坐标轴 | 根本无坐标轴 |
| 13.7 | 矩阵无法复原 | 矩阵完全可读 |
| 13.8 | 峰在 w≈360 | 峰在 w≈270 |
| 另有 | 占位称有 $g_0$、$d$ 标注 | 图上压根没有（同类错误第三次） |

结论：**图注阶段产出的图面描述不能替代图本身**，补图 worker 的 prompt 必须要求「以 clip 出的图为准，发现占位说谎就在回报里列出」。

## 4. 替换脚本必须用 Python raw string（静默毁数据）

把 `\approx`/`\binom`/`\times`/`\frac` 写进普通字符串会被当转义：`\a`→`\x07`、`\b`→`\x08`、`\t`→`\x09`、`\f`→`\x0c`。Python **不报错**，文件写完，等 KaTeX 报一堆莫名错误才暴露。

坑中坑：`\l \m \g \c` 只报 `SyntaxWarning` 但原文保留 ⇒ **「没报警」不代表没坏，「报警了」也不代表坏的就是它**。落盘后统一扫控制字符（`[\x00-\x08\x0b\x0c\x0e-\x1f]`）确认 0 处。

## 5. 环境与工具踩坑（Windows / 本机实测）

- `read_image` 预览再降采样一层，不能拿预览尺寸当原始像素。
- bash 里 `timeout N for x in ...` 语法错（`for` 不能跟在 `timeout` 后）⇒ 循环用 Python。
- Windows 路径：`r'...'` 里 `\U` 会被当 unicode escape ⇒ 用 `os.path.join` 或 `chr(92)` 拼。
- `cat <<'MDEOF'` 写 >8~12 KB 长文件在本机会被**静默截断**（结束符识别失败，只报 warning）⇒ 长文件改用编辑器 create 或分块追加。
- Electron GUI 自动化已放弃但坑值得记：DPI 1.75 下截图坐标须 ×1.75 才对应 `SetCursorPos`；UIA 树需 `--force-renderer-accessibility` 才有控件；窗口缩托盘后 `MainWindowHandle=0`；`SetForegroundWindow` 失败时点击会落到桌面。
- **跨 session 派发**：SSH 落在 Session 0 而 GUI 在 Session 2 ⇒ 用
  `Register-ScheduledTask -Principal (New-ScheduledTaskPrincipal -UserId <用户> -LogonType Interactive -RunLevel Limited)`（任务名 `wbgo`），`schtasks /run /tn wbgo` 触发。任务必须带
  `New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries`，否则笔记本用电池时任务不跑、`/run` 报「任务已禁用」。

## 6. worker 派发契约

派发 prompt 必须显式禁止：① 不准调 `subagent`/`subagent_fork`/`workflow`；② 不准加载 skill；③ 只准调用指定工具、只返回指定格式。产出为「三件套」缺一不可（正文替换 / 图文件 / 回报表）。

## 7. 遗留欠账

`.dsh/contrib/star-audit.py`（「用了谁的开源」账本审计，探 npm 依赖、cordis.patch.yml 插件声明、本地 clone 的 remote）**不覆盖 Python 包**，也不接受 `owner/repo` 参数：实测 `本地用到 88 个仓库 | 已 star 47 | 未 star 72 | direct 0`，PyMuPDF 与 Pillow 的 star 欠账需手工补（token 存于 `~/.dsh/.credentials.yaml`，勿复制其内容）。
