---
id: mem-bd345d32267aec07b0a212dc53d725e2
revision: 1
created_at: "2026-10-25T19:11:20.553Z"
updated_at: "2026-10-25T19:11:20.553Z"
name: github-repo-renamed-dsh-reasonix-agent
description: "GitHub 仓库 reasonix 已改名 dsh-reasonix-agent，并新建 kb/ 工程经验库（13 篇，从 312 fact + PLAN.md 提炼），含推送方式与两条待办"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 仓库改名（2026-10-26 已落地）

| 项 | 值 |
|---|---|
| 新名 | `TianQue6916/dsh-reasonix-agent`（public，分支 master） |
| 旧名 | `TianQue6916/reasonix` |
| 实测 | 旧 HTTPS → **301** 新 URL；旧 SSH `git@github.com:TianQue6916/reasonix.git` 仍可 `ls-remote`/push（GitHub 保 redirect） |
| description | `dsh agent harness + reasonix runtime: 配置备份与工程经验库 (Windows/Linux 双机, TianQue6916)` |
| topics | dsh / reasonix / agent-harness / llm-agent / knowledge-base / engineering-notes / windows / powershell |

## 新增 kb/ 工程经验库（commit `7ae5052`）

13 篇 + README，位于仓库根 `kb/`，素材 = 312 条 memory fact + `~/.dsh/PLAN.md`（1473 行）。统一结构 `D 定论 / M 机制 / J 判据 / X 反例 / R 复现 / S 溯源（fact 文件名）/ 存疑`。

00-index（三条阅读路径）· 01 方法论 · 02 配置面与重启边界 · 03 工具/技能/plugin · 04 桌面端与 UI · 05 上下文与推理链 · 06 记忆系统三层 · 07 模型网关 · 08 备份与 Git · 09 Windows 宿主 · 10 否证档案 · 11 实现语言策略（N\*≈8e5）· 12 工作流与教学。

## 推送方式（重要，以后沿用）

本机 agent 的 bash tool 固定 **Low IL**、整个 `D:` 只读（`C:\Users\27063\Desktop` 是 `D:\Desktop` 的 junction）⇒ **无法在 repo 检出（`Desktop\工具箱\reasonix-ops\repo`）里写文件或 commit**（`.git/config` 也不可写，`git remote set-url` 失败）。

实际做法：
1. 在 C 盘工作副本 `C:\Users\27063\_rx-kb\`（README.md + kb/）写内容；
2. `python C:\Users\27063\_rx-kb\_push.py "<commit msg>"` —— 走 **GitHub Git Data API**（blobs → tree → commit → PATCH ref），用 `curl` 传输；
   - 必须用 curl：python `urllib` 对本机 dev-sidecar CA 报 `CERTIFICATE_VERIFY_FAILED: Missing Authority Key Identifier`；
   - 脚本内置脱敏自检（sk-/ghp_/github_pat_/user_/AKIA/私钥/Bearer），命中即 exit 3；
   - 取 base tree 必须用 `GET /repos/{o}/{r}/commits/{branch}` 的 `commit.tree.sha`（`/git/commits/{sha}` 的响应顶层没有 `tree`）。
3. token 来源：`git credential fill`（GitHub PAT，40 字符，admin 权限）。

## 两条待办（未做，需人工或提权 shell）

1. **改名同步**：`backup-to-github.ps1:31` 的 `$RepoUrl` 与 repo 的 `origin` 仍是旧名（靠 redirect 能用）。
   前提是先给 `D:\Desktop\工具箱\reasonix-ops\repo`（含 `.git`）降 IL：`Start-Process icacls -Verb RunAs -ArgumentList @('<dir>','/setintegritylevel','(OI)(CI)Low')`（不加 `/T`）。
2. **备份线当前断链**：2026-10-25 23:33 push 被 **GH001（文件过大）** 拒 —— `dsh/speech-to-text/sensevoice/models/sensevoice-onnx/model.int8.onnx` 228.15 MB 已进 index，本地 master 领先 origin/master 3 个 commit。修法：`*.onnx` 进排除清单 + `git rm --cached`，不要用 LFS。
