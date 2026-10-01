---
name: pdf2zh-toolbox
description: 工具箱 D:\Toolbox\ 内含 PDFMathTranslate + Codex Desktop App 安装包及快捷方式
type: reference
scope: global
created: 2026-06-10
---
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
