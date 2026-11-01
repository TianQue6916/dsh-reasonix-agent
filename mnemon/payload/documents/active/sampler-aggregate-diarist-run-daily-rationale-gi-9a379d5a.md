---
id: "9a379d5a-e0a5-47b5-926f-f876f7a1b3e6"
title: "每日日记流水线落地实现：sampler/aggregate/diarist/run_daily 四件套、三条判据 rationale 与 GitHub diary 仓库自动 push（2026-10-28）"
description: "2026-10-28 实现记录：~/.dsh/storages/tools/journal 的采样-归并-生成-落盘流水线（sampler 边沿触发、session mtime 上下界放宽、单段窗口封顶、kind=user 不等于真人指令三条判据），23:59 定稿 + catchup 补跑调度，以及公开仓库 TianQue6916/diary 的自动 commit+push 与 raw/activity 不公开边界。"
status: "active"
created_at: "2026-10-28T09:26:59.658Z"
updated_at: "2026-10-28T09:26:59.658Z"
content_hash: "263c74a8c8e6e08e5360ba5cc2909507475f25a2d49abc4d492a6b98f3abf78e"
source_paths:
  - ".dsh/storages/tools/journal/sampler.pyw"
  - ".dsh/storages/tools/journal/aggregate.py"
  - ".dsh/storages/tools/journal/diarist.py"
  - ".dsh/storages/tools/journal/run_daily.py"
  - ".dsh/storages/tools/journal/sync_git.py"
  - ".dsh/storages/tools/journal/README.md"
  - ".dsh/journal/README.md"
  - ".dsh/journal/.gitignore"
session_ids:
  - "20dfab92-a79c-4fe5-8145-0867c611ce29"
memory_body_ids:
  []
---

# 每日日记流水线落地实现（2026-10-28）

**性质**：实现交接 + 运维 procedure，含踩坑后定下的判定标准 rationale。
前置调研（可采集源实测、04:00 日界 A/B/C 方案）见 `2b099eab-e563-4425-8e87-4d867fb32901`；本文只记「调研之后真正建成的东西」。

## 1. 组件清单

代码根：`C:\Users\27063\.dsh\storages\tools\journal\`

| 文件 | 职责 |
|---|---|
| `sampler.pyw` | 常驻进程，每 10 s 采前台窗口。**边沿触发**（仅在窗口切换时写）+ 5 min 心跳 + idle 感知，避免 8640 行/天 |
| `aggregate.py` | 归并 5 类源：session 全文 / `tool-calls` / autocommit 日志 / Edge history / 窗口 activity |
| `diarist.py` | 调本地 gateway `127.0.0.1:8788`（commandcode gateway，非官方 API）；失败 3 次退避 → 换模型 → 再失败降级为规则台账（保证永远有产出） |
| `run_daily.py` | 编排 + 落盘 + 索引 + 发布，带 lock 防重入 |
| `sync_git.py` | commit + push 到 GitHub，被 `run_daily.py` 末尾调用 |
| `install-journal-tasks.ps1` / `一键安装-日记.cmd` | 计划任务安装（需管理员） |
| `README.md` | 用户可读说明 |

产物落点：`~/.dsh/journal/days/YYYY-MM-DD.md`，另抄一份到 `~/Documents/日记/`，索引 `index.md`，全量素材 `raw/YYYY-MM-DD.json`（每条陈述可回溯，用于验真）。

## 2. 三条判据是踩坑才定下来的（rationale 必须保留）

**① `kind=user` ≠ 真人指令。**
实测一天 194 条 `kind=user` 中 139 条没有 `rpcId`，全是 subagent 派发与 `[dsh-mnemon:...]` 注入。只按 `kind` 统计会把「派给 worker 的任务说明」误算成用户当天说的话。判据：kind + `rpcId` 存在。

**② session 文件 mtime 上下界都要放宽 2 天。**
跨天会话的 mtime 是「最后一次写」。10-27 原本显示 0 条指令，因为当天的主会话是 10-28 才关闭的。放宽后恢复为 26 条。只放宽一边会漏另一种跨天形态（这就是当时「widened both bounds」那次修正）。

**③ 单段窗口时长封顶 20 min。**
否则挂着不管的窗口会被累计成学习时长，`active_min` 失真。

**④ 定稿判据用 `days/<date>.md` 的 mtime 是否过 23:50。**
白天生成的半截日记会在 23:59 被覆盖重跑。mock 验过 4 个 case：23:59+白天生成→spawn、23:59+已定稿→不 spawn、23:30→不 spawn、幂等→spawn 1 次。

## 3. 调度与断电容错

- sampler 内置调度：**23:59 自动触发**当日定稿。
- 关机错过 → 下次开机 sampler 启动 60 s 后执行 `--catchup 3`，把早产日记重跑成全天版。
- 计划任务三件套（可选取安装）：23:59 定时任务、登录后 3 min 补跑、sampler 静默自启。

**环境约束（已知硬限制）**：当前 shell 处于 **Low Mandatory Level**，`schtasks`、`reg`、写 Startup 全 `Access denied`，agent 无法自提权。因此开机自启必须由用户手动「右键 `一键安装-日记.cmd` → 以管理员身份运行」，日志写 `~/.dsh/logs/journal-install.log`。不装也能用，只是每次开机要手动拉一次 sampler。

## 4. GitHub 自动上传（public「日记」仓库）

用户诉求：同步到 GitHub、公开仓库、名字就叫「日记」、每天自动上传；随后澄清名字取英文 → **`diary`**。

- 仓库：`https://github.com/TianQue6916/diary`（public），description 用中文「日记 —— 每天 23:59 自动从本机日志与前台窗口采样生成」。
- 本地 git 仓库根：`C:\Users\27063\.dsh\journal\`（注意：`.dsh` 本身不是 git 仓库；`run_daily.py` 里 JROOT 必须指到 `journal` 而非 `storages/tools/journal`，否则 `git sync ok=False no .git`）。
- remote 走 SSH `~/.ssh/id_ed25519`（`ssh.github.com:443`），实测免交互 push 返回 0。历史 commit：`7894acd` 首次同步、`b7ca393 diary: 2026-10-28`。
- 离线不丢：commit 留本地，下次运行自动补推 —— 最多晚一天，不会缺一天；push 失败只写 `run.log`，不影响日记本身。

**踩坑：GitHub repo name 只接受 ASCII。**
用 `name=日记` 调 `POST /user/repos` 时 API 把中文规范化成 `-`，建出 `TianQue6916/-`；随后 `DELETE` 返回 403（无 admin，且该账号对误建仓库无删除权），`PATCH name` 报 `Validation Failed: name same name`。最终用 `PATCH` 把 `-` 改名 `riji`（HTTP 200），再改名 `diary`。旧 `riji` 地址 301 重定向到新仓库，不断链。**以后建仓库一律先定 ASCII 名**，中文只放 description。

**一处主动划的公开边界**：`.gitignore` 永久排除 `activity/`（10 s 级前台窗口原始记录）与 `raw/`（含完整 prompt 原文的结构化素材），只公开 `days/`、`index.md`、`README.md`。核对过远端文件树无泄露。理由：`raw/` 比提炼后的日记正文敏感得多。

**已声明风险**：公开日记正文含本机路径（`C:\Users\27063\...`）、窗口标题、浏览器站点标题、用户指令原话；生成时不做脱敏，因为脱敏会破坏「每条陈述可回溯到 evidence」这一验收前提。转私有：`PATCH /repos/TianQue6916/diary -d '{"private":true}'`。

## 5. 已知缺口

- **学习时长栏目前为空**：sampler 于 10-28 16:16 才上线，历史窗口无法回补，前四天 `active_min` 均为 0。课程痕迹（EE364a、信息论、6.006 等）单列进「课程线索」段，并明确要求 LLM 不得折算成学时。
- **Linux 侧未接入**：Windows 侧看不到 TianQue 的 ext4；需在 Linux 装同款 sampler（`xdotool getactivewindow getwindowname` 或读 `_NET_ACTIVE_WINDOW`），写 NTFS 共享路径后汇流。

## 6. 环境侧踩坑（可复用）

- CPython 3.13 `urllib` 直连 `api.github.com` 报 `SSLCertVerificationError: Missing Authority Key Identifier` / `unable to get local issuer certificate`（系统与 certifi store 都失败）→ 该机器上 GitHub API 一律走 `curl`，不要用 `urllib`。
- Git Bash 下 `/tmp/repo.json` 被解析成 `\\tmp\\repo.json` 导致 `PermissionError` → 临时文件用 `$TEMP` 的 Windows 绝对路径（如 `C:\Users\27063\AppData\Local\Temp\repo.json`）。
