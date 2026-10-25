---
id: "37e02e35-130b-4cd7-8fd2-9aec17f1f11e"
title: "GitHub 每日备份静默断链 20 天：junction 断链根因、watchdog 设计与 ~/.dsh 仓库体检清单（2026-10-22）"
description: "2026-10-22 调查：~/.dsh 本地 autocommit 健康而每日 GitHub 备份静默死了 20 天，根因是 Desktop 侧 junction 被删导致任务进程未进入脚本；含修复验收步骤、外部产物 watchdog 三分支判据与实测、以及随后体检出的 5 项可改进（commit 噪音、备份 repo 幽灵文件、任务覆盖率漏洞、.git 167MB 死重量、robocopy 静默失败）。"
status: "active"
created_at: "2026-10-22T14:46:56.436Z"
updated_at: "2026-10-22T14:46:56.436Z"
content_hash: "2f5eb6debdf49dcaeecf95cbab73a189df2482da84a8318816fe6bb56ac55e67"
source_paths:
  - "PLAN.md"
  - "storages/tools/_register-backup-watchdog.ps1"
  - "storages/tools/dsh-autocommit.ps1"
session_ids:
  - "32d3f508-db6a-43dc-b337-54e8816516ea"
memory_body_ids:
  []
---

# GitHub 每日备份静默断链 20 天 — 根因 / 修复 / watchdog / 后续体检（2026-10-22）

## 0. 先分清的两条线（判断「自动程序还活着吗」必须先拆）

| 线 | 计划任务 | 结论 | 判据 |
|---|---|---|---|
| 本地 autocommit | `\DshConfigAutocommit`（One Time + 每 20 分钟） | **健康** | Last Result 0；手动 `/Run` → `b8a794a`（48 files），22:30:01 自跑 → `e345f7d`；532 commits 中 529 条 `auto:` 格式 |
| 每日 GitHub 备份 | `\ReasonixGitHubBackup`（Daily 23:30） | **死了 20 天** | 远端 + 本地备份 repo 都停在 `aaee3bf backup: 2026-10-02 23:31`；`%APPDATA%\reasonix\github-backup.log` mtime = Oct 2 23:31；任务 Last Run 2026/10/20 23:30、**Last Result -196608 (0xFFFD0000)** |

关键前提：`~/.dsh` 这个 repo **无 remote，脚本明令永不 push**，与 GitHub 完全无关 —— 两条线互相独立，不能因为 autocommit 在跳就判定备份健康。

## 1. 根因：任务指向的 junction 又没了（09-27 修过的同一条）

- 任务 `Task To Run` = `powershell.exe -NoProfile … -File "C:\Users\27063\Desktop\reasonix-ops\backup-to-github.ps1"`，而 `C:\Users\27063\Desktop\reasonix-ops` **是 MISSING 的 junction**（09-27 曾修好，后被删）。
- ⇒ 进程根本没进入脚本 ⇒ 脚本第一行 `Log '=== backup-to-github 开始 ==='` 都没执行 ⇒ **20 天零日志、零告警**。
- 机制解释（为什么另一条活）：`C:\Users\27063\reasonix-ops` 是**真实目录**（`Get-Item` Target 为空、Attributes 无 `ReparsePoint`），所以调它的 `\DshConfigAutocommit` 毫发无伤。一条走 junction（死），一条走真实目录（活）。

> 教训 A：**脚本自己挂掉时，「读自己日志」的自检会一起失声**。这类断链只能用「外部产物是否新鲜」来发现。

## 2. 修复 A：重建 junction，任务定义一字未改

`New-Item -ItemType Junction -Path Desktop\reasonix-ops -Target Desktop\工具箱\reasonix-ops`，验证 `attrs=Directory, ReparsePoint` 且 `backup-to-github.ps1` 可达。

刻意**不动任务定义** —— 09-27 记过 `Set-ScheduledTask` 会把整个 `Arguments` 覆盖掉的坑。

## 3. 第二道坎：密钥扫描的假阳性（安全机制正常工作）

首次重跑 `exit 3`：`!! 字节级全扫发现 5 个文件含密钥（白名单外类型）→ 中止，不推送`，命中 `goat-gateway/.tmpdiag/*.html`（10-03 抓的 Claude Code 文档页）。

判定假阳性两条证据：① 命中的是 `sk-command-code-recommended` 这类 **HTML class 名**，匹配了 `sk-[A-Za-z0-9_-]{16,}`；② `git log --all --diff-filter=A -- 'goat-gateway/.tmpdiag/*'` 为空 ⇒ 这 5 个文件**从未 commit**，public 远端没被污染。

处置：`backup-to-github.ps1` 的 goat-gateway `XD` 加 `'.tmpdiag'`（备份 `.bak-20261022-pre-tmpdiag-exclude`）+ `git rm -r --cached goat-gateway/.tmpdiag` + 删 repo 内副本。

## 4. 验收（三重一致性，不是「跑完没报错」）

```
rev-parse HEAD == ls-remote origin refs/heads/master == 696143b3faef82e2fad6d26ed7a974deeb8a278b
origin/master..master == 0 ；工作树 0 脏
```
重跑日志：脱敏扫描 2860 个文本文件改 23 个 → 字节级全扫 + 兜底校验通过 → 提交 356 files（`696143b backup: 2026-10-22 22:37`）→ 推送完成。20 天空窗补上。

## 5. 修复 C：watchdog（判外部产物，且与故障点路径解耦）

- 脚本 `C:\Users\27063\reasonix-ops\backup-watchdog.ps1`（**真实目录，不经 junction**）
- 任务 `\ReasonixBackupWatchdog`：每日 **23:45**（备份后 10 分钟）+ 开机后 5 分钟；`wscript.exe run-hidden.vbs` 隐藏窗口；`StartWhenAvailable`、允许电池
- 三条判据：`CALL-PATH-MISSING`（任务实际调用的路径不可达 = 本次事故形态）/ `STALE-HEAD`（repo HEAD > 30h）/ `UNPUSHED`（master 领先 origin）
- 产物：`%APPDATA%\reasonix\backup-watchdog.log` + `backup-alert.json`（仅 ALERT 时写、OK 时自删）
- 三分支实测：`OK head-fresh callpath=ok`(exit 0) / `ALERT STALE-HEAD: 0.0h old`（`-MaxAgeHours 0` 自测）/ 经计划任务 `/Run` 回 OK 且 alert.json 被删

> 教训 B：**watchdog 必须与故障点路径解耦** —— 不能共用 junction、不能同一条被保护链路。

## 6. 随后体检出的 5 项（实测证据，A/B/C 待用户点头执行）

- **P0-A commit 噪音**：近 300 条 commit 频次 —— `storages/dsh-headroom-ccr.json` 156 次(52%)、`wechat-bridge/daemon.pid` 41、`daemon-port.json` 39、`storages/git-anchors.json` 34、`workspace.json` 28、`thread-edges.{json,dot}` 35；对照有意义的是 `PLAN.md` 43、`profiles/*/cordis.patch.yml` 43。全是运行期派生状态。`.gitignore` 现为纯黑名单（61 行、0 条 `!`）。修法：加 6 行 + `git rm --cached`，备份脚本 `dsh` target 的 `XF` 同步加。（待确认 `storages/workspace.json` 是否也剔）
- **P0-B 备份 repo 幽灵文件**：repo 跟踪 3143 个文件，其中 **83 个源端已不存在**（`dsh/settings.yaml`、`dsh/scratch/*`、`dsh/skills/bilingual-translator|ocw-lecture-translator/SKILL.md`、`dsh/skills.junctions-legacy-20261001/**`、`dsh/profiles/desktop/_bak-pre-fullport-20260930-*/`）。根因：`robocopy /E` 只增不删。修法：加 prune（`git ls-files` 中源不存在的 → `git rm`），先 dry-run。
- **P0-C 定时任务覆盖率漏洞**：`\ReasonixGitHubBackup` 无 `StartWhenAvailable`、无开机补跑（23:30 关机就整夜缺失）；`\DshConfigAutocommit` 带 **`Stop On Battery Mode, No Start On Batteries`**（电池下彻底不跑）。修法：加 `AllowStartIfOnBatteries`+`DontStopIfGoingOnBatteries`、备份任务加 `StartWhenAvailable`+开机后 10 分钟补跑、统一换 `wscript run-hidden.vbs`。需 UAC，且先 `Export-ScheduledTask` 存 XML 备份再逐字段 diff。
- **P1-D `.git` 167MB 死重量**（需用户拍板，未执行）：`pack-0aa7afe7….pack` 133MB；历史最大 blob = 121MB `storages/tools/_asar-work.asar`、53MB `.backup/dsh-0.1.0-rc.6.tar.zst`、13MB + 8MB×2 `storages/tools/edge-lite/prof-c/**`。真实跟踪的手写文本只有几百 KB。修法 `git filter-repo` + `gc`（预计 → 10MB 内），代价是**所有 commit hash 变化**（PLAN.md 里引用的 `b8a794a`/`e345f7d` 会失效；该 repo 无 remote、无 clone）。
- **P2 先记账**：robocopy `/L` 复现出 `Dirs 872 total / 871 skipped / FAILED 1`、`Files FAILED 0`、`rc=11`，但**一行 ERROR 都不打**（文件级零漏，目录级 1/872）；Linux 端仍无 autocommit / GitHub 备份；`~/.dsh` 工作树 2.1GB（profiles 567M、sessions 537M、storages 344M、tmp-probe 205M、`_backup-20260925-*` 125M）。

## 7. 用户决定

`TianQue6916/reasonix.git` 仍为 **public**（09-27 即列为隐患 1）—— 用户明确 **「无需处理」**，放手不改。

## 8. 本轮新记的三条操作教训

1. **Git Bash 里给 `git -C` 传 `/c/Users/...` 中文路径时不要加 `MSYS_NO_PATHCONV=1`** —— 加了报 `fatal: cannot change to '/c/...': No such file or directory`，不加就成功（同路径同 shell 实测两次）。该变量只用于 `schtasks` 这类收 `/参数` 的 Windows 原生程序。
2. 在 `Desktop\工具箱\reasonix-ops` 下用 **python 覆写已存在的 `.ps1` → PermissionError 13**，但 `sed -i` 可以；而 `sed -i` 会把 CRLF 全转 LF（实测 243→0），必须 `sed -i 's/\r*$/\r/'` 复原，再用 `[Parser]::ParseFile` 验 `parse errors: 0` 才敢跑。
3. 注册根任务 `\` 下的计划任务需管理员权限（`Register-ScheduledTask` → `Access is denied` / `HRESULT 0x80070005`），须提权执行并落独立日志。

## 相关文件

- `C:\Users\27063\.dsh\PLAN.md`（本条目原文，含 20 天断链完整时间线）
- `C:\Users\27063\.dsh\storages\tools\_register-backup-watchdog.ps1`（注册 watchdog 的提权脚本）
- `C:\Users\27063\reasonix-ops\backup-watchdog.ps1`、`run-hidden.vbs`（真实目录，不经 junction）
- `C:\Users\27063\Desktop\工具箱\reasonix-ops\backup-to-github.ps1`（备份脚本，XD 排除见 §3）
- `storages/tools/dsh-autocommit.ps1`（autocommit 脚本，健康那条线）
