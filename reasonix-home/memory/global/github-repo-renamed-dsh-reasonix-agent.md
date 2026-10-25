---
id: mem-bd345d32267aec07b0a212dc53d725e2
revision: 2
created_at: "2026-10-25T19:11:20.553Z"
updated_at: "2026-10-25T19:31:52.841Z"
name: github-repo-renamed-dsh-reasonix-agent
description: "仓库已改名 dsh-reasonix-agent；D 盘 repo 已降 IL 可直连维护；kb/ 13 篇已上线；GH001 断链已修；含 git add -A 误删的硬教训"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 仓库改名（2026-10-26 已落地并验收）

| 项 | 值 |
|---|---|
| 新名 | `TianQue6916/dsh-reasonix-agent`（public，master） |
| 旧名 | `TianQue6916/reasonix`（旧 HTTPS 301、旧 SSH 仍 redirect） |
| 本地检出 | `D:\Desktop\工具箱\reasonix-ops\repo`（origin 已改新名） |
| HEAD | `007b388`（远端一致） |

## 关键前提：D 盘 repo 已降 integrity level（2026-10-26）

用户授权 UAC 后执行 `icacls <repo> /setintegritylevel (OI)(CI)Low /T /C /Q` —— **13992 对象 / 12.8 s / rc=0**。
之后 agent 的 bash tool（固定 Low IL）可**直接**在该 repo 里 `git remote set-url` / `commit` / `push`（此前 `.git/config` 恒定 Permission denied）。
- 弹 UAC 的姿势：从 **pwsh 7** 跑 `Start-Process -FilePath pwsh.exe -Verb RunAs -Wait -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File','<脚本>')`；提权进程 stdout 拿不到，脚本必须自己写日志到 C 盘。
- 脚本：`C:\Users\27063\_rx-kb\relabel.ps1`（日志同名 .log）。
- 副作用：该目录对任何低完整性进程可写。

## kb/ 经验库（13 篇，仓库根 `kb/`）

素材 = 312 条 memory fact + `~/.dsh/PLAN.md`（1473 行）；统一结构 `D 定论 / M 机制 / J 判据 / X 反例 / R 复现 / S 溯源(fact 文件名) / 存疑`。
00 索引（三条阅读路径）·01 方法论 ·02 配置面与重启边界 ·03 工具技能 plugin ·04 桌面端 UI ·05 上下文推理链 ·06 记忆系统三层 ·07 模型网关 ·08 备份与 Git ·09 Windows 宿主 ·10 否证档案 ·11 实现语言策略(N*≈8e5) ·12 工作流与教学。

**以后要改 kb/**：直接在 repo 里改 + commit + push（不再需要 API 直推）。C 盘 `_rx-kb` 只是当时的临时工作副本，已废弃。

## 已修：备份线 GH001 断链（10-23~26）

`f3fe6ba` 把 `dsh/speech-to-text/sensevoice/models/sensevoice-onnx/model.int8.onnx`（228.2 MB）纳入跟踪 ⇒ 后 3 个 commit 全被 GH001 拒，静默断 3 天。修法：`git reset --mixed origin/master` 压平 3 个未推 commit（等价内容、剔除大文件）→ `*.onnx` / `*.tar.zst` / `*.safetensors` / `*.gguf` / `*.zst` 双写 `.gitignore` 与脚本 `$XF` → 移出 50.9 MB `dsh/.backup/*.tar.zst`。回滚点 tag `bak-pre-gh001-fix`(`ece7a51`)。脚本已 `-DryRun` 验收通过。

## ★ 新判据（本轮血教训，已写进 kb/08 X-new）

**`git add -A` 的语义是「让 index 等于工作树」** —— 工作树不完整时（API 直推 / 稀疏检出 / 外部改动）它同时是一条**删除指令**。本轮实测代价：`0550a7e` 把 API 直推的 `kb/` 与 README 记成删除，远端归零，靠 C 盘副本恢复（`007b388`）。
⇒ 两条硬规则：① 工作树可能不完整时只用精确路径 `git add <path>`，且 commit 前做**存在性断言**；② **「push 成功」≠「内容还在」**，校验必须查 tree（`git ls-tree -r --name-only origin/master`）而不是命令退出码。
