---
id: mem-04ee32903ed67614fa8e89f0e5091193
revision: 3
created_at: "2026-08-04T03:22:57.5698076Z"
updated_at: "2026-08-05T02:18:54.8257928Z"
name: subtitleedit-skill-created
description: SubtitleEdit 批量翻译 2026-08-05：核心流程已验证（zh-CN 文档+另存为 Enter），因系统锁屏中断（2/39），含恢复步骤
metadata:
  type: user
  fact_type: reference
  scope: global
---

# SubtitleEdit 批量翻译 — 2026-08-05 凌晨进展与恢复点

**技能**：`subtitleedit`（global）已有完整方法论。以下是 08-05 凌晨实战的增量发现。

## ✅ 已跑通的核心流程（验证过，可靠）
1. 翻译：SE 自动翻译对话框（DeepSeek deepseek-v4-flash）**译文质量正常**（术语保留英文+中文解释）
2. **点"确定"后 SE 自动创建 `原文件名.zh-CN.srt` 翻译文档**（主窗口标题变 `*xxx.zh-CN.srt + *xxx.srt`），**原文件保持英文**——验证产物要看 zh-CN 文件，不是原文件！
3. 保存：点保存按钮 → 弹"翻译另存为"标准文件对话框（默认文件名 xxx.zh-CN.srt）→ **按 Enter 确认** → 生成 zh-CN 文件
4. 端到端验证通过：`Co-Teaching the Course.zh-CN.srt`（84 行中文）、`Engaging Learners.zh-CN.srt`（32 行中文）✅

## ⚠️ 关键坑
1. **Windows 锁屏（LockApp）会拦截一切 GUI 自动化**：SetForegroundWindow/SendKeys/鼠标点击全部无效（前台被 LockApp 占死，ForceForeground 返回 False，对话框永远打不开）。**锁屏时无法翻译，必须用户解锁屏幕**。
2. 并行 GUI 自动化竞争：4 实例并行时 ForceForeground 频繁失败（SendKeys 发错窗口）；**2 实例并行 + 每次 ForceForeground 重试 3 次**较稳。
3. PowerShell `-Filter *.srt` 会匹配 `*.zh-CN.srt`（Windows 通配符），统计待翻译时须 `-notmatch '\.zh-CN\.srt$'`。
4. SE 大文件（100KB+/1000 行）翻译约 16~45 分钟/个。

## 📌 恢复点（用户解锁屏幕后）
- 分组列表：`C:\Users\27063\AppData\Roaming\reasonix\global-workspace\batch_tmp\groupA.txt`（19 个）、`groupB.txt`（18 个）——**已排除已翻译的 2 个**（zh-CN 已生成会自动跳过，断点续传）
- 启动（2 并发）：`powershell -File se-batch-worker.ps1 -WorkerId 4 -ListFile groupA.txt -LogFile w4.log -WorkerScript se-translate-one.ps1` 和 `-WorkerId 5 ... groupB.txt ... w5.log`，用 bash(run_in_background=true)
- 完成后验证：Subtitles 目录 `*.zh-CN.srt` 数量=39（原文件保持英文，zh-CN 是译文产物）

**Why:** 08-05 凌晨批量因系统锁屏中断（已翻译 2/39），脚本与分组已全部就绪，解锁后 2 分钟可重启。
**How to apply:** 用户说"继续/解锁了"→ 先查 LockApp 是否消失 → 重启 2 个 worker → 每 10 分钟查日志/zh-CN 计数。
