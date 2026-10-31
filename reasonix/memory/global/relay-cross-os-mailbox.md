---
id: mem-6d0044f5603b4bc939ab57a48a2e0772
revision: 5
created_at: "2026-10-28T08:24:55.330Z"
updated_at: "2026-10-28T09:25:28.680Z"
name: relay-cross-os-mailbox
description: "两端 dsh agent 嘱托通道 C:\\relay 的完整实现：真身拓扑、两侧 CLI（Linux relay.py / Windows relay.ps1）、dispatch 远程拉 headless、plansync 自动注入、以及 7 条踩坑记录"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 拓扑（2026-10-28 实测）

- **两台机器**：Linux `TianQue6916`（`100.79.96.82`，常驻不切系统）；Windows「天阙九泉」（用户 `27063`，`100.84.67.49`，常开）。
- 本机 Linux 硬盘上那块 NTFS（`/media/OS`，用户 `Admin1`）是**第三个静态系统**，与通道无关。
- SSH 凭据：`~/.reasonix/global-workspace/sync/sync_reasonix.py`（HOST/USER/PASS，paramiko）。

## relay 通道（真身 `C:\relay`，无副本）

**Linux 侧**：`~/.local/bin/relay` → `~/.dsh/tools/relay.py`（标准库 + paramiko，全走 SFTP）
```
ls / send / dispatch / claim / done / dead / reopen / show / state / log / plansync / selftest
```
`RELAY_ROOT=<posix绝对路径>` 切 LocalBackend；`RELAY_PLAN_ROOT` 指定注入的 PLAN.md。

**Windows 侧**（2026-10-28 补齐，真机 selftest 20/20）：
`C:\relay\relay.cmd`（垫片）→ `C:\relay\relay.ps1`（纯 ASCII，IO 钉死 UTF8 无 BOM）
```
ls / show / claim / done / dead / send / state / selftest
```

协议：`0-inbox → 1-wip → 2-done / 3-dead`，纯 rename；`lin2win` 只有 Linux 写，`win2lin` 只有 Windows 写，
**回复一律走 `win2lin`**（R1，无例外）。

## dispatch（C 策略：投递 + 立刻在对端拉 headless）

`relay dispatch --slug X -f body.md` = `send` + SFTP 写 `.probe/task.txt` + 远端跑 `.probe/run-headless.ps1`
+ 读 `.probe/headless.log`。`--no-run` 只投递不派发。
远端必须用 `node C:\Users\27063\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\lib\bin.js headless <task>`
—— `dsh.ps1` 在非交互 SSH 下被 ExecutionPolicy 拦。
profiles 目录里 `headless\node_modules\.ignored_dsh-plugin-local-search` 曾是断链导致 `realpath UNKNOWN(-4094)`
启动即崩，已删。

## plansync（A 兜底：不用人传话）

两端 dsh 都跑 `plan-anchor.mjs`（每 step 现读 PLAN.md head 30 行），`relay plansync` 写入带标记块，
role 按 `PLAN_ROOT` 自动区分（posix 绝对路径 ⇒ Linux 自己看，报 `win2lin` 未读；否则 ⇒ Windows，报 `lin2win`）。
幂等、无变化不写盘、备份固定名 `PLAN.md.bak-relay`。cron `*/20 * * * * ~/.dsh/tools/relay-plansync.sh` 双向刷新。
`PLAN.md` 在 `sync_dsh.py` 的 `EXCLUDE_FILES`（各机各写），注入不会被覆盖。

## 踩过的坑（全部已修）

1. Python `move()` 把状态目录插成第三层（应 `parts[:-2]`）；LocalBackend 自动 mkdir 会掩盖该 bug，已禁止。
2. selftest 必须幂等：固定 ts 的 probe，开跑前清残留，收尾真删除。
3. **Windows 路径里的 `\r`**：把 `C:\relay` 写进普通 python 字符串会生成裸 CR（STATE.md 曾被切成 `C:` + CR + `elay`）。
4. **PowerShell 的 `-match` / `-notmatch` 大小写不敏感** ⇒ slug 校验必须用 `-cmatch` / `-cnotmatch`，否则 `Bad` 能通过。
5. PS 里 `$m.State` 存的是**目录名**（`1-wip`）不是状态 key（`wip`），`done` 的白名单写成 `@('0-inbox','1-wip')`。
6. relay.ps1 必须是**纯 ASCII**（PS 5.1 会用 ANSI 解码无 BOM 的 UTF-8 脚本）；提示语用英文。
7. 远端 `PLAN.md` 是 **CRLF、315 KB**，写回必须保留 CRLF。

## 防过度设计

`archive/`、`reopen`、`.probe/` 是可选便利，不是协议必需。真极简只需 `ls/send/claim/done`。
B 方案（Windows 侧计划任务常驻 watcher）**已被否决**：2026-10-28 用户拍板「C 默认 + A 兜底」，
B 是被排除的备选，**不是待办、不是欠账**。不要再把它列进待办清单，也不要再问要不要装。
