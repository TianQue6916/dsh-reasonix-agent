---
id: mem-d2b890a1e438f01a6ccf54f4493906bc
revision: 1
created_at: "2026-09-26T16:31:09.000Z"
updated_at: "2026-09-26T16:31:09.000Z"
name: daily-kit-git-scratch-and-pushall-20260927
description: "daily-kit 工具集落地（2026-09-27）：D:\00-Inbox 流水区每天清零 + pushall 批量推现有 repo；最大坑是 remote.origin.fetch 不限定会让 gc 完全失效（实测 58MB 不降）"
metadata:
  type: user
  fact_type: project
  scope: global
---

# daily-kit：git 流水区 + 批量推送工具集（2026-09-27 落地）

## 是什么

`D:\daily-kit\` 六个文件，解决两件事：① 当天工作有个统一落脚点且每天清零；② 现有 repo 批量 commit+push。

| 文件 | 作用 |
|---|---|
| `daily.sh` | 流水区管理：`init` / `snap <reason>` / `close [--wipe]` / `status` |
| `config.sh` | 固化路径（daily.sh 启动时 source，用 `${VAR:-默认}` 形式，保证命令行/计划任务显式传值优先） |
| `pushall.sh` | 遍历 `roots.list` 里的根目录，逐个 repo commit+push；支持 `--dry-run` / `--reason` |
| `roots.list` | 根目录清单：`/d/gh-publish`、`/d/10-学习`、`/c/Users/27063/Desktop/工具箱` |
| `register-task.ps1` | 注册计划任务（PowerShell，见「为什么不用 schtasks」） |
| `setup-inbox.sh` | inbox repo 建好后首次 push |

## 结构

- 流水区（scratch）= `D:\00-Inbox\`（`DAILY_ROOT`）：`work/` 是 git 工作副本，`keep/` 存 ignored 大文件归档
- 流水 repo = `git@github.com:TianQue6916/inbox.git`（private，用户 2026-09-27 决定新建）
- 现有 repo **不由 daily.sh 管**，走 `pushall.sh`（不清零）

## 核心机制（为什么不是一个仓库）

**「每天清零」和「现有 repo」在 git 语义上冲突**：现有 repo 的本地目录必须是持久工作副本（要在里面写代码、开 .slnx），不能每天 reset 回骨架。所以必须分两层，不能统一到一个仓库。

每天一个 ref `days/YYYY-MM-DD`；`close` 时：push → 校验 sha → 转 tag（`--force`，因为同一天可能 close 多次，tag 要跟当天最终状态）→ 删远端 branch → 清本地 refs + `reflog expire --expire=now --all` + `gc --prune=now`。GitHub 上最终只剩 `main` + 按日期排序的 tag。

## 最大的坑（实测数据，别再踩）

**`remote.origin.fetch` 必须限定为 `+refs/heads/main:refs/remotes/origin/main`。**

默认的 `+refs/heads/*:refs/remotes/origin/*` 会让 push 出去的 `days/*` 自动生成 remote-tracking ref，**它和 branch 一样能保活 object**，gc 删不掉：

| 状态 | `.git` |
|---|---|
| commit 未 push | 39 MB |
| push 后（本地有 branch + remote-tracking ref） | 58 MB |
| 只删本地 branch + reflog expire + gc | **58 MB（一点没降）** |
| 再删 `refs/remotes/origin/days/*` 后 gc | 39 MB ✅ |

完整一天（12 MB 内容）：`.git` **11819KB → 88KB**，本地 `git cat-file` 报 `could not get object info`，远端 tag 完好。

## 安全设计（都是故意的，别改回去）

- push 失败或 sha 校验不一致 → **abort，绝不清零**（实测退出码 1，本地 commit 与文件全在）
- close 的一切 push/校验针对 `refs/heads/$br` 本身，**不看 HEAD**（早期版本用 HEAD，跨天未 close 时会把 day2 的 commit push 到 day1 的 tag 上，已修）
- 本地 `days/*` 分支只有「已在远端」才允许被清；未 push 的**保留 + 响亮警告**（不做 abort，否则「昨天忘了 close」会死锁）
- ignored 文件（`*.zip` / `*.safetensors` 等，push 保不了命）→ `mv` 到 `keep/YYYY-MM-DD/`，**绝不静默删除**
- 只跑 `close` 不预跑 `snap` 也能工作（会自举补一次 snapshot）
- 分支基于 `main` 的干净起点创建（`git switch -qC $br main`），避免把昨天内容带进今天

## commit message 可追溯（trailer）

```bash
git log --format='%h | %(trailers:key=Reason,valueonly)' days/2026-09-27
```

每条带 `Reason=` / `Trigger=manual|scheduler|pushall` / `Diffstat=`。

## 定时（用户授权助理自定）

| 时间 | 动作 |
|---|---|
| 09:30 / 19:00 | `daily.sh snap auto` |
| 23:45 | `daily.sh close` |
| 23:50 | `pushall.sh --reason 'auto: 每日批量'` |

顺序刻意：close 在前、pushall 在后，用户 23:45 前把当天产出 mv 到对应 repo，pushall 收尾。

## 为什么不用 schtasks

- Git Bash 里 `/Create` 会被 MSYS 路径转换吃掉（`Invalid argument/option - 'C:/Git/Create'`，需 `MSYS_NO_PATHCONV=1` 前缀）
- `/TR` 的引号转义能把字面 `\"` 塞进注册表 → `Last Result: -2147024894`（文件未找到）
- **用 PowerShell `Register-ScheduledTask`（参数是数组，零转义），实测 `Last Result: 0`**，脚本在调度器环境正常执行
- 设置带 `-StartWhenAvailable`（关机错过的点补跑一次）；Principal 用 `-LogonType Interactive`

## 前置环境（2026-09-27 实测，可复用于所有自动化任务）

- `~/.ssh/id_ed25519` **无 passphrase**（`ssh-keygen -y -P ""` 派生公钥与 `.pub` 逐字节一致）
- `~/.ssh/config` 里 `Host github.com` → `HostName ssh.github.com` + `Port 443`，绕开 22 端口封锁
- `ssh -o BatchMode=yes -T git@github.com` → `Hi TianQue6916!`；`git push --dry-run` → `Everything up-to-date`，退出码 0
- **结论：计划任务里的 push 不需要 gh、不需要 GCM、不会弹窗。**
- `winget search --id GitHub.cli` 报「搜索源时失败」→ 本机 winget 源不可达，gh 装不了；但如上，不需要
- 注意区分：`curl https://api.github.com` 失败（`schannel: CRYPT_E_NO_REVOCATION_CHECK`）**不代表网络不通**——SSH 不走 schannel 吊销检查，是通的
- 待办：`~/.ssh/config` 的 github Host 块建议加 `IdentitiesOnly yes`（将来多 key 时会踩 `Too many authentication failures`）；`~/.ssh/{github_key,known_hosts}.tmp` 是 0 字节残留可删
