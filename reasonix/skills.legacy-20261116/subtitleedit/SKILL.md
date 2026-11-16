---
name: subtitleedit
description: 操控 SubtitleEdit（D:\20-工具\Subtitle Edit）自动翻译 srt 字幕：WMI 脱离启动防闪退、Ctrl+Shift+G 触发翻译、UIAutomation 操控 Avalonia 对话框、DeepSeek 引擎槽位（2026-09-20 起 URL/key 已改指 Command Code GOAT）批量翻译
---

# SubtitleEdit（SE）字幕自动翻译技能

> 应用名：Subtitle Edit v5.1.0-rc18（Avalonia UI，中文界面）｜位置：`D:\20-工具\Subtitle Edit\Subtitle Edit\SubtitleEdit.exe`（注意 `D:\Subtitle Edit\Subtitle Edit` 是一个 **junction** 指向该目录，两者等价）

## 用途
批量将英文 srt 字幕通过 SubtitleEdit 自动翻译为中文（引擎：DeepSeek deepseek-v4-flash）。**本技能只负责操控 SE 应用本身，不负责翻译质量**。

## 一、闪退根因与启动方式（最重要！）

**症状**：SE 窗口打开 5~60 秒后自己消失，error-log.txt 无新增，事件日志无崩溃记录。

**根因**：如果 SE 是在 shell 命令/后台任务的进程树里启动的（Start-Process 等），**该命令会话一结束，SE 就被进程组回收连带杀掉**。表现为"命令一结束 SE 就关"。

**唯一可靠启动方式**：用 WMI 完全脱离进程树：

```powershell
$ret = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = '"D:\20-工具\Subtitle Edit\Subtitle Edit\SubtitleEdit.exe" "D:\path\to.srt"' }
$pid = $ret.ProcessId
```

**注意**：
- 不要用 `Start-Process` 启动 SE（会挂到 Reasonix 命令进程树，命令结束即被杀）。
- 不要用后台任务（run_in_background）里启动 SE 并依赖它存活。
- `$pid` 是 PowerShell 保留变量，改名 `$procId`。
- 多实例并行时错开启动间隔（≥3 秒），避免并发写 Settings.json 触发 MoveFile 冲突崩溃。

**其他杂音**：error-log.txt 里的 `Access to the path is denied / Failed to save settings` 是多实例同时写 `Settings.json` 的偶发冲突，不是主因；单实例时正常。

## 二、窗口识别（Avalonia UI 的坑）

- `Get-Process.MainWindowTitle` / `MainWindowHandle` **不可靠**：可能返回"音频可视化"或"视频播放器"窗口（它们是 SE 的附属 dock 窗口，常处于最小化状态）。
- 主窗口 = 标题含 `Subtitle Edit` 的窗口（如 `Lecture 1- Overview, Interval Scheduling.srt - Subtitle Edit v5.1.0-rc18`）。
- 必须用 EnumWindows 枚举该进程全部顶层窗口，按标题过滤。复用 `se-windows.ps1` 逻辑（C# P/Invoke EnumWindows + GetWindowText）。

## 三、GUI 自动化（UIAutomation + 快捷键）

### 快捷键（SE4 起默认）
| 功能 | 快捷键 |
|------|--------|
| 自动翻译 | **Ctrl+Shift+G** |
| 批量转换 | Ctrl+B |
| 保存 | Ctrl+S |
| 另存为 | Ctrl+Shift+S |

### 自动翻译单文件流程
1. WMI 启动 SE 打开 srt（见上）。
2. EnumWindows 找到主窗口（标题含 `Subtitle Edit`），`ShowWindowAsync(hwnd, 9)` 恢复 + `SetForegroundWindow(hwnd)` 置前。
3. `(New-Object -ComObject WScript.Shell).SendKeys("^+g")` 打开自动翻译对话框（新窗口，标题"自动翻译"）。
4. 对话框预设会自动生效（引擎 DeepSeek、源 English、目标 Chinese (simplified)、API Key/URL/模型），**无需改**。验证方式：UIAutomation 枚举对话框，应有 `[Text] 'DeepSeek'`、`[Text] 'English'`、`[Text] 'Chinese (simplified)'`。
5. 用 UIAutomation `InvokePattern` 点击按钮 `翻译`。
6. 轮询对话框内 `ControlType.ProgressBar`：出现 = 翻译中；消失 = 完成（RangeValuePattern 可读进度）。
7. 点击按钮 `确定`（把译文应用回主窗口字幕网格）。
8. `SendKeys("^s")` 保存。

### UIAutomation 要点（Avalonia）
- 菜单是 `ControlType.Menu`（**不是** MenuBar）；顶层菜单项是 `MenuItem`，但 **不支持 ExpandCollapsePattern**——不要用 Expand 展开菜单，直接用快捷键。
- 对话框/主窗口用 `AutomationElement.FromHandle(hwnd)` 获取；`FromHandle` 抛 "Unrecognized error" = 句柄已失效（窗口已关，需重新枚举）。
- 找按钮：`AndCondition(ControlType=Button, Name=目标文本)` + `FindFirst(Descendants)` + `GetCurrentPattern(InvokePattern).Invoke()`。

## 四、翻译引擎配置（Settings.json）——2026-09-20 起已改指 Command Code GOAT

位置：`D:\20-工具\Subtitle Edit\Subtitle Edit\Settings.json` 的 `AutoTranslate` 块。**引擎名仍是 DeepSeek**（SE 只认这个槽位，但 URL 已指向 GOAT，故以下全部现有流程/脚本零改动）：

| 字段 | 当前值 |
|------|--------|
| `DeepSeekUrl` | `https://api.commandcode.ai/provider/v1/chat/completions` ← **必须是完整路径**；`/v1/chat/completions`、`/chat/completions` 都返回 404 |
| `DeepSeekModel` | `deepseek/deepseek-v4.1-flash`（GOAT 的模型 id 带 provider 前缀） |
| `DeepSeekApiKey` | GOAT 的 key（取自 `C:\Users\27063\.dsh\.env` 的 `COMMANDCODE_API_KEY`，长度 93、以 `user_` 开头） |
| `DeepSeekPrompt` | 用户定制中文 prompt（未改动） |
| `AutoTranslateLastName` / `LastSource` / `LastTarget` | `DeepSeek` / `English` / `Chinese (Simplified)`（未改动） |
| `EngineStrategies` | `DeepSeek=Default`（未改动） |

- **原配置备份**：`Settings.json.bak-20260920-goat`（含 DeepSeek 官方 key，需回退时拷贝回去即可）。
- **改法**（SE 必须关闭，否则退出时会写回覆盖）：用正则只替换那 3 个字段的字面值，**不要**用 `ConvertFrom-Json` → `ConvertTo-Json` 回写（106KB 嵌套配置会被 `-Depth` 截断/重排）。文件为 **UTF-8 无 BOM**，写回须用 `UTF8Encoding($false)`。
- 若翻译引擎漂移（如被改成 Ollama），在对话框"引擎"下拉里改回 DeepSeek。模型名可手输任意值（SE 官方确认 UI 支持自由输入），故不会有下拉限制。

### GOAT 引擎实测（2026-09-20）

| 项 | 数据 |
|---|---|
| 裸端点直调 | `POST /provider/v1/chat/completions` → 200，标准 OpenAI `chat.completion` 形状 ✓ |
| 端到端（真跑 SE） | 8 行英文字幕 → **30 秒**译完，`zh-CN saved verified (12 zh lines)`，exit 0，译文含 110 个中文字符 ✓ |
| 批量上限探测 | 50 行（5.8KB 请求体）一次请求 → `finish=stop`，50/50 行全译无截断，耗时 **48s** |
| token 结构 | 50 行请求：completion 11153，其中 **reasoning 9382（84%）** ← reasoning 模型，reasoning 占大头，直接影响速度与套餐额度 |
| 需要 max_tokens 吗 | **不需要**：SE 不发该字段时 GOAT 默认额度足够（对比：手动设 `max_tokens=2048` 时 reasoning 1977 挤爆 content → 译文截断，故**若将来加此字段必须给足 ≥8192**） |

⚠️ **产物文件名坑（2026-08-10 脚本 + 本次实测确认）**：`se-translate-one.ps1` 走"另存为"分支，译文保存为 **`<原名>.zh-CN.srt`**（如 `test-goat.zh-CN.srt`），**不是覆盖原文件**；原文件的 mtime 也会变但内容保持英文。验证译文必须读 `.zh-CN.srt`，否则会误判成"保存失败"。

⚠️ **中文验证的编码坑**：PowerShell 5.1 的 `Invoke-RestMethod` / `Invoke-WebRequest` 读 JSON 响应时按 ISO-8859-1 解码，中文会变 `æä»¥ä»å¤©` 这类 mojibake（**不是 API 的问题**）。必须用 `$r.RawContentStream.ToArray()` + `[System.Text.Encoding]::UTF8.GetString()` 显式解码。


## 五、诊断
- 错误日志：`D:\20-工具\Subtitle Edit\Subtitle Edit\error-log.txt`（记录托管异常，带时间戳；崩溃闪退一般**不**写这里）。
- 配置文件：`Settings.json`（含 RecentFiles、AutoTranslate、FfmpegPath/LibMpvPath 指向 junction 路径）。
- ffmpeg：`...\ffmpeg\ffmpeg.exe`（存在，v8.1）。

## 六、批量翻译策略（经验）
- 并发 3~4 个 SE 实例（每实例处理一批文件，串行处理自己那批），错开启动 ≥3 秒。
- 每个文件：WMI 启动 → 翻译 → 确定 → Ctrl+S 覆盖保存（**先备份全部原 srt 到独立目录**）→ WM_CLOSE 关闭 → 下一个。
- 实例崩溃兜底：worker 检测进程提前退出则重试该文件（最多 3 次）。
- 总耗时参考：1275 行字幕约 16 分钟/文件，4 实例并发处理 39 个文件 ≈ 2~2.5 小时。

## 七、2026-08-04 实战教训（批量翻译踩坑记录）

### 1. WMI 不能启动 powershell 做 worker（关键！）
`Invoke-CimMethod Win32_Process Create` 启动 `powershell -File xxx.ps1` 会报 **"Access is denied"** 并立即退出（WMI 进程缺 SESSIONNAME 等交互环境，PowerShell 5.1 初始化失败）。cmd 和 SE.exe 通过 WMI 启动正常，唯独 powershell 不行。

**正确的批量架构**：
- worker（se-batch-worker.ps1）直接用 Reasonix `bash(run_in_background=true)` 启动——后台任务里的 powershell 是正常的（已验证可跑 40+ 分钟）。
- worker 内部的 SE 仍用 WMI 启动（脱离进程树，后台任务结束也不被杀）。
- **不要**在 se-batch.ps1 里用 WMI 启动 worker powershell——必失败，日志全空。

### 2. 翻译完成后"确定"按钮 Invoke 不可靠
Avalonia 对话框的"确定"按钮 UIAutomation Invoke **有时生效（对话框关闭）有时无效**（竞态）。处理：重试 2 次 + 每 10 秒检查对话框是否关闭；仍没关则枚举按钮诊断 + Esc 兜底。

### 3. 保存会触发"另存为"对话框（必须确认）
翻译后保存（按钮或 Ctrl+S）**可能弹出"另存为/保存"对话框**，必须在该对话框里再点一次"确定/保存"才会真正写盘。**不确认 = 文件 mtime 不变、内容还是英文**。
保存后必须验证：LastWriteTimeUtc 是否变化（或文件含中文行数 > 0），没变 = 保存失败。

### 4. DeepSeek API 不稳定（503/404）
2026-08-04 实测：DeepSeek API 反复 503（Server Unavailable）/404，翻译中途失败或"没反应"。批量前必须探测 API（Invoke-RestMethod 最小请求），503 时等待重试（每 30 秒，恢复后自动启动）。SE 报错 `DeepSeekTranslate.Translate -> 404` 即 API 故障，非脚本问题。

### 5. PowerShell `$var:` 解析坑
`"worker $WorkerId: ..."` 会被解析成驱动器变量报错。**所有 `$变量:` 必须写 `${变量}:`**。写脚本后务必 `Select-String -Pattern '\$[A-Za-z_][A-Za-z0-9_]*:'` 扫描（排除 `${`）。

### 6. 恢复点（晚上继续翻译用）
- 备份：`D:\b站视频\解析视频\算法进阶\视频\Subtitles_原版备份_20260804\`（39 个英文原版）
- 分组列表：`C:\Users\27063\AppData\Roaming\reasonix\global-workspace\batch_tmp\group0-3.txt`（10/10/10/9）
- 脚本：`se-translate-one.ps1`（单文件）、`se-batch-worker.ps1`（组循环）、`se-wait-api-and-batch.ps1`（等 API + 启动）
- **恢复步骤**：① 测 API；② 通后起 4 个后台任务跑 `se-batch-worker.ps1 -WorkerId N -ListFile groupN.txt -LogFile wN.log -WorkerScript se-translate-one.ps1`；③ 每个文件完成后验证 srt 含中文。

---

## DSH 钩子（DeepSeek Harness 集成 — 2026-09-04 更新）

本技能处理长文档/教材翻译（≥50 页或需逐句精译）时，**难翻译任务一律走主力机 dsh 最高能力**（v4.1 flash + effort=max；2026-09-10 起 pro 弃用），Reasonix 只整合结果不重复翻译：

- 调用：`dsh-remote -m deepseek-v4.1-flash -e max "任务"`（v4.1 flash + max thinking）；任务描述显式写「发挥你最高能力 / max thinking / 逐句详尽翻译」
- 后台化：`dsh-remote --async -m deepseek-v4.1-flash -e max "任务"` → id；查进度：`dsh-remote --status`
- **本机不跑 dsh**（性能不足，用户 2026-09-04 拍板）——绝不用本机 `dsh-gate`
- 完整档案：`~/.reasonix/memory/global/工具-dsh并发调度与命令铁律-20260904.md`
