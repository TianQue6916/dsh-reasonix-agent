---
id: mem-a5e3e3a6b0ed01eb8d08ba902a49b546
revision: 1
created_at: "2026-09-27T17:09:14.666Z"
updated_at: "2026-09-27T17:09:14.666Z"
name: hindsight-project-memory-installed-20260928
description: "装 hindsight-coding-agents 0.7.0（项目级自动记忆，daemon 模式）并隔离验证通过；与 mnemon 互补（它 auto 注入项目上下文，mnemon 是 guided 通用记忆）；含 uv 必须用官方脚本装、uv 需进用户级 PATH 两个坑"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 一、装了什么

```bash
npx --yes @vectorize-io/hindsight-coding-agents@latest install dsh --server daemon
```

**`@vectorize-io/hindsight-coding-agents` 0.7.0** —— 来自 `vectorize-io/hindsight`（"Hindsight, agent memory that **learns**"）。

**与 mnemon 的定位区分（关键：互补，不冲突）**：
> 大多数真实修复可从代码推导，但**最后一公里**往往取决于**根本不在代码里的项目决策**（取整规则、重试白名单、tie-break 策略）。这些决策活在 **git history 和过去的对话**里。本包在 agent **开始工作时**把它们放在它面前，并维护一组策展的 **knowledge pages**（架构 / 约定 / 进行中的事项）。

- **hindsight = 项目级上下文**（repo-specific，**自动摄取** git history + conversations，**开始工作时自动注入**）
- **mnemon = 跨会话/跨 agent 的通用记忆**（four-graph + decay，按需 `mnemon_recall`）

→ 两者恰好补上彼此的短板：mnemon 是 `guided`（要我主动调），hindsight 是 **auto**。

## 二、安装产物（全部实测确认）

| 产物 | 路径 |
|---|---|
| runtime | `~/.hindsight/coding-agents/`（`dist/` + `hooks/` + `index.js` + `.install-origin.json`） |
| daemon 配置 | `~/.hindsight/coding-agent.json` → `{"serverMode": "daemon"}` |
| skill | `~/.agents/skills/hindsight-coding-agent/SKILL.md`（**75 KB**） |
| dsh 插件行 | **`~/.dsh/cordis.patch.yml`**（**全局，所有 profile 都会 compose**）：<br>`- id: hindsight` / `name: "file:///C:/Users/27063/.hindsight/coding-agents/dist/dsh.js"` |
| 日志 | `~/.hindsight/coding-agents-logs/{plugin.log, diag.jsonl}` |

**全局 patch 现已 20 行** = deja 的 3 条 + hindsight 的 1 条。备份：`~/.dsh/cordis.patch.yml.bak-<ts>-pre-hindsight`

**dsh 侧不需要 MCP**（README 原话："A Cordis plugin row … **native tools, no MCP needed**"）。

## 三、它已开始工作（日志实证）

```
WARN  [dsh] daemon mode needs `uv` on PATH — see https://docs.astral.sh/uv/
INFO  [auto-update] version check failed: spawn npm ENOENT (ENOENT)
INFO  [dsh] Hindsight is tracking the decisions, conventions and history of this repo
  ↳ memory bank "coding-agent::27063"
```

→ **已经建起了 memory bank**（`coding-agent::27063`），说明插件真的在跑。

## 四、两个坑

### 1. `uv` 用 pip 装不上，必须用官方脚本

```bash
# ❌ 退出码 0 但包根本没装上（下载完 wheel 就停住）
python -m pip install uv            # → pip show uv: "Package(s) not found"

# ✅ 官方脚本，一次成功
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://astral.sh/uv/install.ps1 | iex"
# → installing to C:\Users\27063\.local\bin  (uv.exe / uvx.exe / uvw.exe)
```

`uv 0.12.19 (x86_64-pc-windows-msvc)`

### 2. `uv` 装好了但 daemon 仍报 "needs uv on PATH"

因为 **dsh 进程继承的是系统/用户级 PATH，不是我 export 的 shell PATH**。而 `C:\Users\27063\.local\bin` **原本不在用户 PATH**。

```powershell
$cur = [Environment]::GetEnvironmentVariable('Path','User')
if ($cur -notlike '*.local\bin*') {
  [Environment]::SetEnvironmentVariable('Path', $cur.TrimEnd(';') + ';C:\Users\27063\.local\bin', 'User')
}
```
（注意：PowerShell 5.1 **没有 `Join-String`**，别在验证脚本里用它）

## 五、验证

- **隔离实例**：`dsh --profile web --port 3099 --no-open` 两次均正常启动（HTTP 401），验后杀实例，**3080 未受影响**
- 全局 patch 改动**可回滚**：`~/.dsh/cordis.patch.yml.bak-<ts>-pre-hindsight`，或 `dsh-profile-rollback.mjs`
- Node 要求 **22.15+**（读 dsh 的 zstd 会话日志）→ 本机 v24.15.0 ✅

## 六、待观察

daemon 首次真正跑起来后，要看它是否拉起了本地 hindsight daemon（`uv` 需要在**新起的 dsh 进程**里可见），以及 `npx @vectorize-io/hindsight-coding-agents stats` 能否报出各 agent 的使用频次。
