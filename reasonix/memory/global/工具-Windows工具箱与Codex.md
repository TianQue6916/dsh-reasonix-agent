---
id: merged-工具Windows工具箱与Codex.md
revision: 1
created_at: "2026-08-16T14:30:00.000000000Z"
updated_at: "2026-08-16T14:30:00.000000000Z"
name: 工具-Windows工具箱与Codex.md
description: D:\Toolbox、Codex、OCR、PPT 工具信息
metadata:
  type: user
  fact_type: reference
  scope: global
---

# 工具-Windows工具箱与Codex.md

> 2026-08-16 合并生成。来源原始件在 ~/.reasonix/memory-archive-20260816/（信息零丢失）。


## 来源：工具-工具箱文件夹路径.md

D:\Toolbox\ 内新增了"工具箱.lnk"快捷方式，双击打开 D:\Toolbox\ 文件夹本身。

快捷方式列表：
- `D:\Toolbox\工具箱.lnk` → D:\Toolbox\（文件夹自身快捷方式）
- `D:\Toolbox\Codex.lnk` → OpenAI Codex Desktop App
- `D:\Toolbox\PDFMathTranslate\` → PDFMathTranslate 便携版

## 来源：工具-桌面工具箱快捷方式.md

桌面快捷方式（2026-06 创建）：
- `C:\Users\27063\Desktop\工具箱.lnk` → `D:\Toolbox\`（打开工具箱文件夹）

## 来源：工具-PDF翻译Codex工具箱.md

## PDFMathTranslate 工具箱（便携版）

**位置：** `D:\Toolbox\PDFMathTranslate\`

- `translate_deepseek.bat` — 拖拽 PDF 文件到图标上，自动用 DeepSeek API 翻译
- `gui.bat` — 启动图形界面（浏览器访问 http://localhost:7860）
- `venv\` — 自包含 Python 环境，不依赖系统 Python

**DeepSeek API 已配置：** 使用 `deepseek-chat` 模型，base_url = `https://api.deepseek.com/v1`
**API Key 安全性：** 密钥写在 bat 文件里，注意不要外传

**使用方式：** 把要翻译的 PDF 拖到 `translate_deepseek.bat` 上，同目录下生成 `xxx-zh.pdf`（中文版）和 `xxx-dual.pdf`（中英对照版）

---

### D:\Toolbox\ 完整结构（更新于 2026-06-15）
- `Codex.lnk` — OpenAI Codex Desktop App v26.609.4994.0 快捷方式
- `Codex\Codex.Msix` — Codex 离线安装包存档（526MB）
- `PDFMathTranslate\` — PDFMathTranslate 便携版

## 来源：工具-Codex桌面版安装.md

# Codex Desktop App 安装与配置（2026-06-15）

## 安装
- **版本**：OpenAI Codex v26.609.4994.0 (x64)
- **安装方式**：从 codexapp.agentsmirror.com/latest/win 下载 MSIX，`Add-AppxPackage` 安装
- **安装包存档**：`D:\Toolbox\Codex\Codex.Msix`（526MB）
- **快捷方式**：`D:\Toolbox\Codex.lnk`（指向 `shell:AppsFolder\OpenAI.Codex_2p2nqsd0c76g0!App`）

## DeepSeek API 配置
- **API Key**：`<见环境变量>`（已设用户环境变量）
- **config.toml**：`~/.codex/config.toml`
  - model = "deepseek-v4-pro", provider = "deepseek"
  - base_url = "https://api.deepseek.com", env_key = "DEEPSEEK_API_KEY"
- ⚠️ Codex 用 Responses API，DeepSeek 用 Chat Completions API，可能有协议不匹配，需要 CC Switch 或 OpenRouter 桥接

## 技能同步（50个 Reasonix → 54个 Codex skills）
- 40 个目录型技能 → 复制到 `~/.codex/skills/<name>/SKILL.md`
- 10 个文件型技能 → 转为目录+SKILL.md
- 新增 4 个：`offline-wiki`, `aigc-deguessing`, `toolbox-locations`, `learning-profile`

## 记忆同步
- `~/.codex/AGENTS.md` — 用户身份、方舟计划、学习体系、通用规则
- 路由规则已编入技能 descriptions
- AIGC 降率经验、离线维基搜索代码、工具箱路径已转为技能 references

## 来源：工具-推荐OCR工具.md

用户提到昨日我（Reasonix）推荐了一个OCR工具，"最好的"，约3GB，用于文字识别。未在系统任何位置找到该工具的安装痕迹（无surya/paddleocr/easyocr/tesseract）。可能：1) 之前对话中提到但未安装；2) 下载未完成。

可能的候选工具（~3GB档次）：
- **Surya OCR** (VikParuchuri) — 最先进的OCR，模型约2-3GB，支持100+语言，对扫描PDF效果极好
- **PaddleOCR** — 百度开源，模型较大
- **Tesseract 5 + 全部语言包** — ~1-2GB

## 来源：工具-PPT-Word自动生成.md

# PPT与Word文档生成

> 来源：LobeHub 导出 | 12 条用户消息，82 条助手消息

## 用户提问 1

全自动

## 用户提问 2

下载不了就算了，我能在沙箱里面看到，你也可以给我下载链接都可以，重要的是格式，一定要按照那个模板来

## 用户提问 3

请确认

## 用户提问 4

为什么你写入文件一直失败

## 用户提问 5

检查一下正确性，你确定能成功吗，我看你写入文件一分钟多了？？

## 用户提问 7

你仔细看看格式对吗？？？？一定要按照标准格式

## 用户提问 8

你有没有看到很多部分都有相对一应的表格？？注意格式！

## 用户提问 9

把那个有信息文档的信息填入第一个信息空白的文档，注意格式，不要改内容，照搬就行，一定要注意格式的专业性，结果保存到本地文件夹

## 用户提问 10

一次性完成

## 用户提问 11

全自动开始

## 用户提问 12

继续

## 助手回复（关键总结）

全自动模式启动，同步检查两端环境。
