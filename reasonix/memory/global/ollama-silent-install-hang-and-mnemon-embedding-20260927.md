---
id: mem-1141fb90a51d54a77ca4df05a817bc27
revision: 3
created_at: "2026-09-27T15:58:30.574Z"
updated_at: "2026-09-27T16:12:36.235Z"
name: ollama-silent-install-hang-and-mnemon-embedding-20260927
description: "Ollama 便携版绕过 UAC（0.34.4 / RTX 5070 / nomic-embed-text）、开机自启改走启动文件夹 vbs（AtLogOn 触发器报 Access denied）、mnemon embedding 达 100%（需跑 --all 两轮）；并实测出 mnemon 的 intent 只认问句线索、中文陈述式查询会退化成 GENERAL"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 一、✅ 便携版路线成功（绕过 UAC）

**结论：Ollama 的 Windows installer 在本机装不上（静默卡 UAC），但便携版完全可行。**

| 步骤 | 命令 / 结果 |
|---|---|
| 下载 | `https://gh-proxy.com/https://github.com/ollama/ollama/releases/latest/download/ollama-windows-amd64.zip` → **1393.5 MB** |
| 解压 | `Expand-Archive -Path ollama-win.zip -DestinationPath C:\Users\27063\.local\ollama -Force` → `ollama.exe` + `lib/`，**1.8 GB** |
| 启动 | `cd C:\Users\27063\.local\ollama && ./ollama.exe serve` → `{"version":"0.34.4"}`（**必须在解压目录里跑**，否则找不到 `lib/` 里的 DLL） |
| GPU | 自动识别 **`NVIDIA GeForce RTX 5070 Laptop GPU`**（CUDA 13.3，8.0 GiB / 可用 6.8 GiB）；集显 `Intel RaptorLake-S` 被自动跳过（`dropping integrated GPU`） |
| 模型 | `ollama pull nomic-embed-text` → **261.6 MB**，`nomic-embed-text:latest` |

**对比失败的 installer 路线**（已放弃）：`OllamaSetup.exe`（1498.3 MB）用 `/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP-` 会**永久挂起** ——
判据是 CPU 时间仅 0.2s（不是在解压）+ 目标目录始终不出现 + 无任何窗口 = 在等被抑制掉的 UAC 提权。
installer 仍留在 `C:\Users\27063\Downloads\OllamaSetup.exe`。

**可复用的失败判据**：判断 Windows 安装器是"卡住"还是"在干活"，**三样一起看** ——
**CPU 时间 + 目标目录是否出现 + 是否有可见窗口**。只看"进程存在"会误判。
（另：1.5 GB 是正常的，安装包含 CUDA 运行库；别拿体积当失败信号，`curl -I` 的 `Content-Length` 才是真值。）

## 二、✅ 开机自启：走**启动文件夹**（不是计划任务）

**失败方案**：`Register-ScheduledTask` 注册 `AtLogOn` 触发器 → **`Access is denied`**。
原因：**LogonTrigger 需要管理员权限**，而当前进程是 Limited（这也解释了 `dsh-web-3080` 的 LogonTrigger 是当初用管理员建的）。
注意 `-Daily` 触发器的任务（如 `MemoryToMnemon`）**是可以由 Limited 进程注册的** —— 差别只在触发器类型。

**可行方案**：启动文件夹放一个 vbs
```
C:\Users\27063\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\ollama-serve.vbs
```
内容（隐藏窗口 + 指定工作目录）：
```vbs
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "C:\Users\27063\.local\ollama"
sh.Run """C:\Users\27063\.local\ollama\ollama.exe"" serve", 0, False
```
**实测验证**：`Stop-Process ollama*`（清到 0）→ `cscript //nologo <那个 vbs>` → `{"version":"0.34.4"}` 重新起来 ✅

**踩坑**：用 Python 写含 `C:\Users` 的字符串会撞 `unicodeescape`（`\U`）→ 用 `chr(92)` 拼反斜杠，别写字面量。

## 三、✅ mnemon embedding 已 100% 覆盖

```bash
mnemon embed --all        # ← 注意：是**分批**的，每批约 99 条，要跑到 coverage 100%
mnemon embed --status
```
| 轮次 | succeeded | failed |
|---|---|---|
| 第 1 轮 | 99 | 1 |
| 第 2 轮 | 94 | 0 |
| 最终 | **`coverage: 100%` / `embedded: 193` / `total: 193`** | |

`embedding_available: true` / `ollama_available: true` / `model: nomic-embed-text` / `protocol: ollama`。

## 四、⚠️ mnemon 的 intent 机制（重要限制，别高估）

`mnemon recall --help` 原文：
> Automatic intent uses **a limited set of question cues** in English, Mandarin Chinese, Hindi, Spanish, Arabic, French, Bengali, Portuguese, Indonesian, Russian, German.
> **It does not infer meaning or recognize every phrasing or transliteration.**
> **Unrecognized cues fall back to GENERAL.**

**实测后果**：中文**陈述式短语**查询（如「脱敏规则漏项」）→ 一律落入 `GENERAL`，
`matched_via` 只出现 `entity` / `temporal`，**语义（embedding）路径基本不参与排序**。

| 查询 | Top-1 | 判定 |
|---|---|---|
| 「dsh 模型铁律」 | `dual-machine-memory-sync…` 0.750，Top-2 是模型铁律原文（`via=temporal`） | ✅ |
| 「leases 不 GC」 | `reasonix-workspace-write-lease-mechanism` **0.773** | ✅ 完美 |
| 「脱敏规则漏项」 | `github-public-备份泄露-goat-key…` 0.589 | ⚠️ 尚可 |
| 「脱敏正则漏了什么凭据类型」 | `元规则-02-自动记忆规则.md` 0.496 | ❌ **不相关** |

**显式 `--intent WHY` 反而更差**（返回「自动记忆规则」）—— 该策略找"原因"，而语料里是"修复记录"。
`--verbose` 在本版**没有输出 `meta.intent` / `meta.intent_source`**（与 help 描述不符）。
`--basic` = 纯 SQL LIKE；`mnemon search` = 纯 token 匹配 —— 精确查找时与 `recall` 互补。

**实用建议**：**用问句形式提问**（含疑问线索词）优于陈述式短语；`--intent` 谨慎用。

## 五、待办

- `ollama-win.zip`（1393 MB）与 `OllamaSetup.exe`（1498 MB）仍在 `C:\Users\27063\Downloads`，确认无必要后可删（约 2.9 GB）
