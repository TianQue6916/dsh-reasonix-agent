---
id: mem-99de717da512f973561760752ef052c8
revision: 1
created_at: "2026-08-01T12:52:04.421454901Z"
updated_at: "2026-08-01T12:52:04.421454901Z"
name: tianque-vscode-semester-setup
title: TianQue VS Code 学期化插件配置
description: TianQue Linux 机 VS Code 33 扩展配置 + Python 数学库 + shellcheck 安装记录（2026-07-31 学期化）
metadata:
  type: user
  fact_type: reference
  scope: global
---

# TianQue Linux 机 VS Code 插件配置（2026-07-31 学期化配置）

**场景依据**：方舟计划自学主线（100B 实分析、6.006/6.046 算法、18.065、6.431 概率论、CS144、凸优化、信息论）+ 学校课表（数据结构、计组、信号与系统、概率论、Web开发基础、Python、Linux系统管理，来源 `~/.reasonix/global-workspace/pages/DS_课表周次整理.md`）

**最终 33 个扩展**（16 原有 + 13 新增 + 依赖）：

新增核心：
- `james-yu.latex-workshop` — LaTeX 编译预览（texlive 本机完整，pdflatex/xelatex/latexmk 可用）
- `ms-toolsai.jupyter` — Jupyter（数学实验）
- `eamodio.gitlens`、`usernamehw.errorlens`、`aaron-bond.better-comments`、`gruntfuggly.todo-tree`、`christian-kohler.path-intellisense`
- `ms-vscode-remote.remote-ssh` — 连 Windows 主力机「天阙九泉」
- 学校课表：`ritwickdey.liveserver` + `dbaeumer.vscode-eslint` + `esbenp.prettier-vscode`（Web开发基础）、`timonwong.shellcheck` + `foxundermoon.shell-format`（Linux系统管理）

**已卸载**：`ms-vscode-remote.remote-containers` + `ms-azuretools.vscode-containers`（容器开发，学习场景冗余）

**Python 数学环境**：`pip install --user --break-system-packages numpy scipy matplotlib sympy jupyter`（Ubuntu 24.04 PEP 668 需要 `--break-system-packages`），版本 numpy 2.5.1 / scipy 1.18.0 / matplotlib 3.11.1 / sympy 1.14.0

**系统包**：`sudo apt-get install -y shellcheck`（0.9.0，ShellCheck 插件依赖）

**Why:** 用户的 VS Code 插件配置随学期课程变化，需要记录配置依据与安装命令供复用。
**How to apply:** 新学期加课先对照课表查 `code --list-extensions`，缺语言/工具链再补；卸载前确认不是 Jupyter/Remote-SSH 等扩展的必要依赖。
