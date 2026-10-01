---
id: mem-c81f6b1895986ac02eaf64683b2d7dd3
revision: 1
created_at: "2026-09-28T11:11:00.189Z"
updated_at: "2026-09-28T11:11:00.189Z"
name: dsh-home-local-git-versioning-20260928
description: "~/.dsh 建成本地 git 版本控制：基线 commit 2e5b898 / 222 文件 / .gitignore 取舍 / dsh-autocommit.ps1 + DshConfigAutocommit 任务；含四条诊断（原本无版本控制、Reasonix autocommit 不覆盖 ~/.dsh、记忆与 session 都无 git 字段）与仍未做的会话注入+记忆锚点"
metadata:
  type: user
  fact_type: project
  scope: global
---

# ~/.dsh 已有本地 git 版本控制（2026-09-28 建立）

## 为什么建它
用户要的是「每次改动和上下文记忆能记得自己 git」—— **本地 git**，不是 GitHub 备份那条线。
诊断出的 4 条硬事实：

1. **`~/.dsh` 原本不是 git 仓库** —— 对 dsh 配置的每一次改动零版本控制。
2. **`ReasonixWorkspaceAutocommit`（每 2 分钟）只扫 `%APPDATA%\reasonix` 下含 `.git` 的直接子目录** + `reasonix-autocommit.ps1` 的 `global-workspace` ⇒ **完全不含 `~/.dsh`**。
3. **记忆 fact 的 frontmatter 只有** `id / revision / created_at / updated_at / name / description / metadata{type,fact_type,scope}`（少数带 `title/keywords`）⇒ **零 git 字段**，记忆与 git 完全脱钩。
4. **dsh session header 只有** `{type,version,id,createdAt,cwd,isSeeded,delegationDepth,agentPreset}` ⇒ **无 git 信息**。

## 已建成的东西

```
仓库      C:\Users\27063\.dsh\   （git init -b main）
基线      commit 2e5b898  "chore: 建立 ~/.dsh 本地版本控制基线"
规模      222 个 tracked 文件，.git 仅 838 KB
自动提交  ~/.dsh/storages/tools/dsh-autocommit.ps1
计划任务  DshConfigAutocommit   每 2 分钟 / IgnoreNew / 27063+Interactive+Limited
          （用 C:\Users\27063\reasonix-ops\run-hidden.vbs 隐藏窗口，与 Reasonix 系列同源）
日志      ~/.dsh/logs/dsh-autocommit.log
身份      git author = Dsh Autosave <autosave@dsh.local>
```

`.gitignore`（52 行）的取舍原则 —— **只跟踪手写的 source of truth**：
- **跟踪**：`.agent-presets/anchored-standard/**`、`profiles/*/{cordis.patch.yml,cordis.yml,package.json,pnpm-lock.yaml}`、`storages/tools/**`、`storages/community-readmes/**`、`launch-dsh.ps1`、`settings.yaml*`、`cordis.patch.yml`、`plugins/deja/**`
- **排除**（派生/运行期/凭据/大块头）：`sessions/` 294MB · `_backup*` 125MB · `**/node_modules/` 101MB · `gate/` 61MB · `tmp-probe/` 46MB · `cache/` `attachments/` `logs/` `scratch/` · `*.zstd *.log *.sqlite *.db *.lock` · `storages/session_projcache/` `storages/plugins.json` `storages/mnemon-draft.json` · **凭据：`.credentials.yaml` `.env` `remote/` `**/device.key` `local-search-token`** · `*.bak*` `*.conflict.*`
- 唯一嵌套 repo：`cache/skills/sxng-cli/.git`（已被 `cache/` 排除，不会变成 gitlink）

## 立刻能用的命令
```powershell
git -C $env:USERPROFILE\.dsh log --oneline -20
git -C $env:USERPROFILE\.dsh show --stat HEAD
git -C $env:USERPROFILE\.dsh diff HEAD~1
schtasks /Run /TN "DshConfigAutocommit"     # 立即快照一次
```

## 仍未做的两件（"记得自己 git" 的后半段）
- **会话级注入**：把当前 cwd 的 git 状态（branch / HEAD / dirty / 最近 commit）注入上下文。
  可行路径已确认：`~/.dsh/.agent-presets/anchored-standard/context-gate.mjs` 的注释明确说 DSH 有
  **`SystemPrompt.context()` 家族**（sandbox/approval policy snapshots、`dsh-agent-instructions`、
  "any third-party context provider" 都走它）⇒ 新增一个 preset 模块注册 context provider 即可。
- **记忆级锚点**：在 `~/.dsh/.agent-presets/anchored-standard/memory.mjs` 写 fact 时捕获
  repo/branch/HEAD/dirty 一起落盘，使每条记忆可回指代码状态。
  ⚠️ 注意该文件的 frontmatter 是「与 reasonix 自己的 remember 工具同一形状」，加自定义字段前要先确认
  reasonix 侧解析不会被打断；更安全的落点是独立旁路文件（如 `~/.dsh/storages/git-anchors.json`）。

## 撤销
`Remove-Item -Recurse C:\Users\27063\.dsh\.git` + `schtasks /Delete /TN "DshConfigAutocommit" /F`
