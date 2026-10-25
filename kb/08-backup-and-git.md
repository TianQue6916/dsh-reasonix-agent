# 08 · 备份链路与 Git 运维

> 每日 23:30 的 `robocopy → 脱敏 → commit → push` 是一条**无反馈的定时链**：
> 它能连坏 20 天而不出声，也能把凭据推上 public 仓库而每行日志都写着"通过"。
> 所以本章不写"怎么装"，只写**怎么在它坏掉的第一天就知道**。

## D 定论

链路全貌（2026-10-26 实测核对）：
| 件 | 值 |
|---|---|
| 脚本 | `C:\Users\27063\Desktop\工具箱\reasonix-ops\backup-to-github.ps1`（12617 B，UTF-8 **带** BOM） |
| 计划任务 | `\ReasonixGitHubBackup`：每日 23:30 + BootTrigger(+10 min)，`StartWhenAvailable`，`ExecutionTimeLimit=PT30M`，电池不限 |
| 看门狗 | `C:\Users\27063\reasonix-ops\backup-watchdog.ps1` + `\ReasonixBackupWatchdog`（每日 23:45 + 开机 5 min）；**真实目录，不经 junction**，与故障点解耦 |
| 日志 | `%APPDATA%\reasonix\github-backup.log`；另 `backup-watchdog.log` + `backup-alert.json`（仅 ALERT 时写） |
| 检出 | `Desktop\工具箱\reasonix-ops\repo\`，branch `master` |
| 退出码 | `2` 克隆失败 / `3` 残留密钥（中止，不推送）/ `4` commit 失败 / `5` push 失败 |
- **D1 robocopy `rc < 8` 即成功**。`1`/`3` 是常态（3 = 既复制了文件、目标又多出文件），只有 `rc ≥ 8` 才算失败；脚本第 148 行 `if($rc -ge 8){ Log "robocopy 失败 rc=..." }`。
- **D2 健康判据不是退出码，是"三重一致"**：本地 `rev-parse HEAD` == `git ls-remote origin refs/heads/master` == 提交 hash，且 `origin/master..master` = 0、工作树 0 脏。
- **D3 静默断链的唯一可靠信号是日志末行时间**。任务可以"一直在运行、Last Result 也说得过去"，而脚本根本没被执行。
- **D4 文件清单必须取自 index**：`git add -A` → `git diff --cached --name-only`。`git status --porcelain` 对未跟踪目录**折叠成一行** `?? reasonix/`，会让脱敏与兜底校验一起"扫描 0 个 → 通过"。
- **D5 脱敏是白名单，不是保险**。public 仓库的纵深防御只能靠**两道独立校验 + 字节层全扫**；任何"只扫文本扩展名"的脱敏都不足以保护 public。
- **D6 只备份 source of truth**（文本、可 grep、可 diff、可脱敏），不备份派生数据（SQLite / onnx 模型 / 索引 / 缓存）。派生数据能重建，且绕过脱敏 = 失控面。
- **D7 脱敏标记必须短于自己的规则**：写 `sk-REDACTED`（10 字符），不能写 `sk-REDACTED-BY-…`（它自己满足 `sk-[A-Za-z0-9_\-]{16,}`，兜底校验会把已脱敏文件报成 42 个残留）。
- **D8 检测必须在"提交前中止"**，不是提交后报告。`exit 3` 发生在 `git commit` 之前 ⇒ 一次命中 = 这次什么都没推出去。
- **D9 计划任务路径必须真实可达**。`Desktop` 是 junction → `D:\Desktop`，`Desktop\reasonix-ops` 是再一层 junction；修法是**重建 junction**，不是改任务定义。
- **D10 改名后 redirect 不是契约**。GitHub 对旧仓名保留 301 / SSH redirect，但旧名被人占用即失效、部分工具不跟随 SSH redirect ⇒ 必须主动同步 `$RepoUrl` 与 `git remote set-url`。
- **D11 单文件 100 MB 是 GitHub 硬限**，`git push` 会被 pre-receive hook 以 `GH001` 拒绝（提示里的 lfs 链接不是叫你上 LFS，是叫你**别备份那个文件**）。
- **D12 计划任务里的 push 不需要 `gh`、不需要 GCM、不会弹窗**：`~/.ssh/id_ed25519` 无 passphrase + `Host github.com → ssh.github.com:443`，`BatchMode=yes` 下 `ssh -T git@github.com` 返回 `Hi TianQue6916!`。

## M 机制

**一、为什么这条链会静默：差集语义 × 调度语义 × 日志语义三重叠加**

1. **robocopy 是差集驱动**：`/E`（含空目录，**不删目标多余文件**）在源与目标 `mtime+size` 一致时**跳过该文件**，且不报"跳过"。
2. **脱敏是变更驱动**：老版本只用 `git diff --cached --name-only` 取清单 ⇒ 内容不再变化的文件（`.env` 与源一致 → robocopy 跳过 → 不进 diff）**永远不进入扫描**。这就是 `dsh/.env` 明文在远端躺约 3 个月的机制：不是规则漏了形态，是**它从来没被扫描**。修法 = 新增步骤 3b，把 `git ls-files` 并入待扫描清单（扫 1365 → 2144 文件，改写 46）。
3. **调度器不看你脚本内部的成败**：任务只在"能否启动进程"这一层报错。Action 指向不存在路径时，PowerShell 进程起来又立刻死 → `Last Result: 3`（或 `-196608` = `0xFFFD0000`），而脚本第一行 `Log '=== backup-to-github 开始 ==='` 都没执行 ⇒ **日志一行没有**。
4. **`StartWhenAvailable` 只补"错过的时间点"**，它不修路径、不重试逻辑错误。所以断链那 20 天里它每天都"补跑"，每天都静默失败。
5. **日志"干净"不等于链路健康**——它可能只是**没被写过**。脚本自己写日志、`>1MB` 截断保留末 800 行，所以"文件小 + 内容旧"是断链指纹。

**二、为什么压缩与二进制是脱敏的盲区**

脱敏是 `[regex]::Replace` 作用于**读进来的文本**。`.zstd` / `.vscdb` / `.sqlite` / `.onnx` 是字节流，正则看不见里面的明文：

- 第一轮（09-23）：`state.vscdb.backup` 扩展名不在 `$TextExt` 白名单 → 跳脱 → GitHub **Push Protection (GH013)** 兜住了，密钥没进公开仓库。
- 第二轮（09-27）：2002 个 `.zstd` 会话归档里是真 key（解压后 `zstd -dc | grep -oE "(sk-|user_)[A-Za-z0-9]{6}"` 数得出 20/9/6/5/7 的分布），`dsh` target 的 `XF` 没排除 `*.zstd` → 进了历史。
- 于是补了 **`$Detect` 字节层全扫**：对**所有** staged 文件（不限扩展名，Latin1 / codepage 28591 读字节）跑同一组正则，命中即 `exit 3`。

**三、为什么两道校验的判据故意不一样**

- `$Scrub`（改写）用**完整块**：`(?s)-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----`
- `$Detect`（检测）用**BEGIN + 真实密钥体**：`(?s)-----BEGIN [A-Z ]*PRIVATE KEY-----[\r\n]{1,2}[A-Za-z0-9+/=]{40,}`

差别不是笔误。第一版 `$Detect` 用裸串 `-----BEGIN [A-Z ]*PRIVATE KEY-----`，于是**只提及、不含完整块的文本**（讲"我怎么修私钥泄漏"的 fact、以及它喂给 mnemon 的派生副本）被判泄漏 → 中止推送；而 `$Scrub` 什么都不改（没有 END 可配对）→ **永远修不好**。这是**自指陷阱**：每写一条"我修好了泄漏"的记忆，就再生一个触发源。09-26 → 09-28 推送成功次数 = **0**，日志全是 `!! 中止，不推送`。
**四、为什么 `-DryRun` 报告"通过"仍可能推送失败**：`-DryRun` 在 `if($DryRun){ Log '-DryRun：未提交、未推送'; exit 0 }` 处返回，**它不执行 push** ⇒ 一切远端侧拒绝（GH001 大文件、GH013 Push Protection、非 fast-forward）都看不见。**本地侧通过 ≠ 远端接受**，这是 D2 存在的原因。
**五、为什么 junction 比改任务定义安全**

`New-Item -ItemType Junction` 只动文件系统，**零字节触碰任务 XML**；删 junction 不碰目标，完全可逆，且一键修好三个共用旧路径的任务。反观 `Set-ScheduledTask` 有实测事故：它把 `Arguments` 整体覆盖（09-27），之后每次重跑都要重新 diff 全字段。改 Settings 的正确姿势是 `Export-ScheduledTask` 存 XML → 改 `$t.Settings.*` → `Register-ScheduledTask -InputObject -Force` → **从不碰 `Actions`**。
**六、为什么凭据进了 public 历史后"删文件"没用**

git 对象图按内容寻址。`git rm --cached` 只改 index 与树指针，**旧 blob 仍被旧 commit 引用**，`clone` 下来照样 `git show` 得出来。真正的清除只有三条：`git filter-repo` 重写全部 commit hash + `push --force`、删仓重建、或**轮换凭据**（让泄露值失效）。所以处置顺序恒为：**先阻断 HEAD 止血 → 再轮换 key → 视情况重写历史**。09-23 那次就是 `pip install git-filter-repo` → `git bundle create`（119.8MB 备份）→ `--replace-text` → 重写后 4 个 commit 保留、本地明文 0 命中 → 重新 `remote add` → `push --force`（forced update 成功）。
**七、`vscdb` / `mnemon.db` / `onnx` 的共同点**：不是"太大"或"格式怪"，而是三性质同时成立——① 派生/可重建；② 不可 grep、不可 diff；③ 含凭据或是二进制大块。任一条成立就该排除。mnemon 那次是判断失误：SQLite 里 195 条 insight 含 key 相关内容，而脱敏只处理文本 → `SUSPECT-BIN` 中止；修法两步——从 `$Targets` 移除 `mnemon`，**并且** `git rm -r --cached mnemon && rm -rf mnemon`（只改 target 不够，repo 里的历史副本还在）。

## J 判据
**J1 三重一致 —— 最常用的 30 秒体检**

```bash
cd "/c/Users/27063/Desktop/工具箱/reasonix-ops/repo"
timeout 30 git rev-parse HEAD
timeout 30 git ls-remote origin refs/heads/master
timeout 30 git rev-list --count origin/master..master     # 必须 0
timeout 30 git status --porcelain | wc -l                 # 必须 0
```

三个 hash 不全等 ⇒ 断链。脚本可能 `exit 0` 但走了 `-NoPush` 分支，所以只看退出码会漏。
**J2 日志末行时间**

```bash
timeout 20 tail -3 "$APPDATA/reasonix/github-backup.log"
timeout 20 ls -l --time-style=long-iso "$APPDATA/reasonix/github-backup.log"
```

末行不是今天的 23:3x ⇒ 断链。**"最后一行是 `=== 开始 ===`"与"一行都没有"是两种病**：前者脚本跑到一半死，后者进程根本没进脚本（路径不存在 / 解释器缺失）。
**J3 计划任务状态（Git Bash 必须先禁路径转换）**

```bash
export MSYS_NO_PATHCONV=1
timeout 30 schtasks /query /tn "ReasonixGitHubBackup" /fo LIST /v \
  | grep -iE "Last Run Time|Last Result|Task To Run|Next Run Time"
```

- `Last Result = 0`：只代表进程退出码 0，**不代表 push 成功**。
- `Last Result = 3` / `-196608`（`0xFFFD0000`）：进程启动即失败 ⇒ 先查 `Task To Run` 的路径可达性。
- `Next Run Time = N/A`：正常，说明只有 AtLogOn/AtStartup 触发器。

**J4 两条线必须分开判**

- 本地 autocommit（`\DshConfigAutocommit`，20 分钟一次）**无 remote、永不 push**，与 GitHub 无关：`Last Result 0` + 日志有新增 = 健康。
- 每日 GitHub 备份要四件套：`repo` HEAD 的日期、日志末行时间、`Last Result`、`Task To Run` 可达性。2026-10-22 那次的真实形态是"autocommit 活着、备份死了 20 天"——只看"任务存在且未被禁用"会得出完全相反的结论。
**J5 假阳性识别（安全机制正常工作 vs 规则太粗）**

```bash
cd "/c/Users/27063/Desktop/工具箱/reasonix-ops/repo"
timeout 30 git log --all --diff-filter=A -- 'goat-gateway/.tmpdiag/*'   # 空 = 这批文件从未 commit
timeout 30 git ls-files -i -c --exclude-standard                        # 已跟踪但被忽略 = 清理闸门
timeout 30 git check-ignore -v <path>                                   # 权威判断是否被忽略
```

2026-10-22 的 `exit 3` 就是假阳性：抓下来的 Claude Code 文档页 HTML 里有 `sk-command-code-…` 这类 class 名，命中 `sk-[A-Za-z0-9_\-]{16,}`；`--diff-filter=A` 为空 ⇒ 这 5 个文件**从未入库**。处置是给 target 加 `XD '.tmpdiag'` + `git rm -r --cached`，不是放宽规则。

**J6 push 被远端拒绝（本地全绿也要看）**

```bash
timeout 20 tail -1 "$APPDATA/reasonix/github-backup.log"
```

- `GH001: Large files detected` / `... 228.15 MB; this exceeds GitHub's file size limit of 100.00 MB` ⇒ 有 >100MB 文件进了 index，**每次 push 都会失败**，直到从 index（必要时连历史）移除。
- `GH013` ⇒ Push Protection 拦下形似凭据。
- `[remote rejected] (pre-receive hook declined)` ⇒ 服务端拒绝，与网络无关，别去查代理。
**J7 统计口径（避免"判据假象"）**

```bash
timeout 30 git -c core.quotepath=false ls-files 'reasonix/memory/global/*.md'
```

`core.quotepath` 默认把中文名转义成 `"reasonix/...\344\270\255.md"`（**行首是引号**）⇒ 撞不上 `^` 锚点、`grep -cE '\.md$'` 也失配；且 git pathspec 的 `*` **跨 `/`**，会把 `.archive/` 算进来。同一时刻用 `grep '^reasonix/memory/global/'` / `git ls-files` / `ls` 能数出 122 / 195 / 171 三个值——**全是判据假象**。数文件就 `ls | wc -l`。

**J8 脱敏的两道卡各自会报什么**

| 卡 | 触发条件 | 日志形态 | 退出码 |
|---|---|---|---|
| 文本层（步骤 5） | staged 且 `Test-IsTextFile` 为真（扩展名白名单 + 无 NUL + ≤40MB） | `!! N 个文件仍含疑似密钥 → 中止提交，不推送` + `SUSPECT:` | 3 |
| 字节层（步骤 5b） | staged 且 ≤40MB（**不限扩展名**，Latin1 读） | `!! 字节级全扫发现 N 个文件含密钥（白名单外类型）→ 中止` + `SUSPECT-BIN:` | 3 |

看到 `SUSPECT` 先查是不是 `.html`/文档里的形似串；看到 `SUSPECT-BIN` 先问"这是不是派生二进制"（mnemon.db 那次就是）。

## X 反例

逐条都是付过代价的：

1. **不要用 `git status --porcelain` 取待扫描清单** —— 未跟踪目录折叠成一行，`-PathType Leaf` 全跳过 → "扫描 0 个" + "兜底校验通过"双假通过。
2. **不要用裸字符串做私钥判据** —— 任何"讲这件事"的文本都被判泄漏并中止推送，而 scrub 改不掉它（自指陷阱，3 天零推送）。
3. **不要在"警示性文档"里写完整字面量** —— 一次触发 5 个文件（含 3 个派生副本：mnemon-draft.json / headroom-ccr.json / memory-merge-backup 副本）；改源后**派生件也要重新生成或回改**。
4. **不要把脱敏标记写长** —— `sk-REDACTED-BY-…` 满足 `sk-{16,}`，兜底校验把 42 个已脱敏文件误报为残留。
5. **不要只扫"变更文件"** —— 差集语义下不变的文件永不进扫描，`.env` 明文因此在 public 远端住了约 3 个月。
6. **不要给 `[switch]` 参数起同名局部变量** —— PowerShell 变量名大小写不敏感，`param([switch]$Full)` + `$full = "C:\..."` 报 `Cannot convert System.String to SwitchParameter`，且行号指向下一行的 `[IO.Path]::Combine`（把人带偏）。改名 `$fullPath`。
7. **不要在 Git Bash 里写 `schtasks //query`** —— MSYS 转成 `C:/Git/query`；加 `MSYS_NO_PATHCONV=1` 却仍用双斜杠也报 `'//query'`。正解 = 禁路径转换 + 单斜杠（J3）。它只回 2 行错误，`| grep 任务名` 匹配空 ⇒ 看起来像"任务不存在"。
8. **不要用 `wc -m` 数中文字符** —— 本机 Git Bash 下它等于 bytes（`orig_SKILL.md`：`wc -m` 58016 vs `python len()` 30568）。用 `python -c "print(len(open(f,encoding='utf-8').read()))"`。
9. **不要手改 `~/.gitconfig` 的 `[http] proxy`** —— dev-sidecar 每次启动重写它（以及 `sslVerify=false`、`~/.npmrc`），手改必被覆盖。要定制就走 URL 级（优先级高于全局，边车不碰）：`git config --global 'http.https://gh-proxy.com/.proxy' ''`、`.../.sslVerify' 'true'`、`url.https://gh-proxy.com/https://github.com/.insteadOf`。
10. **不要整包写回计划任务** —— `Set-ScheduledTask` 实测把 `Arguments` 整体覆盖。改 Settings 只走 `Register-ScheduledTask -InputObject -Force` + 前后快照 diff。
11. **不要以为 `robocopy /E` 会同步删除** —— 只增不删。repo 跟踪 3143 个文件里 **83 个源端已不存在**（旧技能 42 / 一次性脚本 29 / `scratch/` 8 / `_bak-*` 4）；改 `XD`/`XF` 只防未来，历史入库必须 `git rm`（连工作树删，否则下次 `git add -A` 复活）。
12. **不要以为写了 `.gitignore` 就安全** —— `.credentials.yaml` / `.env` 规则早就在，但文件**早已被跟踪**，规则形同虚设。判据：`git ls-files -i -c --exclude-standard` 非空就是没清干净。
13. **不要拿 `sk-` 正则去脱敏"以为是 sk-" 的值** —— 实际是 `user_` 前缀 93 字符，替换不中，明文进了会话记录（并被 backup 的 `user_[A-Za-z0-9]{20,}` 规则兜住）。**打印前先看清前缀形态**。
14. **不要用 `Select-String` 校验含 secret 的文件** —— 它返回**整行** `$_.Line`；`-Pattern '"Key": "[^"]{0,10}'` 看似只匹配 10 字符，实际输出 93 字符全文。用 `[regex]::Match()` + 显式截断，或只做布尔判定。
15. **不要在同一行混用 `${VAR:+...}` 与 `${VAR:-...}`** —— `:-` 分支在 VAR 非空时展开为值本体，两次事故都由此而来。只打 `echo "len=${#VAR}"`。
16. **不要把 mnemon 的 SQLite 库、`.onnx` 模型纳入备份 target** —— 二进制无法脱敏，脚本标 `SUSPECT-BIN` 直接中止；给 228 MB 模型配 LFS 是错误方向（D6/D11）。
17. **不要对 `D:\Desktop` 下的备份 repo 用 python 文件 API** —— `open(...,'wb')` / `os.remove` 报 `PermissionError 13 / WinError 5`，`git -C 'C:\...\Desktop\...\repo' rm` 报 `fatal: Unable to create '.git/index.lock': Permission denied`；换 `git -C 'D:\Desktop\...\repo'` 或 MSYS `rm`/`touch`/`sed -i` 全部正常。**写这个 repo：走 D 真实路径 + bash/git。**
## R 复现

**R1 手动跑一次（先 `-DryRun`）**

```bash
timeout 120 powershell -NoProfile -ExecutionPolicy Bypass -File \
  "C:\Users\27063\Desktop\工具箱\reasonix-ops\backup-to-github.ps1" -DryRun
# 正式：去掉 -DryRun；-NoPush 提交不推送；-Full 全量重扫
```

健康输出必须是这条完整信号链，缺一行就不算通过：

```
同步 <target> (rc=1|3)        ← rc<8 都正常
脱敏：扫描 N 个文本文件，改写 M 个
字节级全扫通过
兜底校验通过：无残留密钥
将提交 N 个文件
已推送到 GitHub === 完成 ===
```

**R2 只读验证（零副作用）**

```bash
timeout 30 powershell -NoProfile -Command '
  $e=$null
  [void][System.Management.Automation.Parser]::ParseFile(
    "C:\Users\27063\Desktop\工具箱\reasonix-ops\backup-to-github.ps1",[ref]$null,[ref]$e)
  if($e.Count -eq 0){"syntax ok"}else{$e|Select-Object -First 5|Format-List}'

# 排除验证：robocopy /L = 只列不复制
timeout 60 powershell -NoProfile -Command '
  $o=@(& robocopy "C:\Users\27063\.dsh" "$env:TEMP\_rc-probe" /E /L /NJH /NJS /NDL `
        /XD "remote" "sessions" "cache" 2>&1)
  "remote=" + @($o|Select-String "\.dsh\remote\\" -SimpleMatch).Count
  "logs="   + @($o|Select-String "\.dsh\logs\\"   -SimpleMatch).Count'
# 期望 remote=0（被排除）、logs>0（对照组）
```

**R3 复现并修复"任务路径失效"（junction 法，零风险）**

```bash
timeout 30 powershell -NoProfile -Command '
  $p="C:\Users\27063\Desktop\reasonix-ops"
  if(-not (Test-Path $p)) {
    New-Item -ItemType Junction -Path $p -Target "C:\Users\27063\Desktop\工具箱\reasonix-ops" | Out-Null }
  (Get-Item $p).Attributes
  Test-Path (Join-Path $p "backup-to-github.ps1")
  (Get-Item "C:\Users\27063\reasonix-ops").Attributes'
# 期望：attrs 含 ReparsePoint / Test-Path=True / 对照目录无 ReparsePoint
```

**R4 清历史（不可逆，先 bundle）**

```bash
cd "/c/Users/27063/Desktop/工具箱/reasonix-ops/repo"
timeout 60 git bundle create "$TEMP/cc-hist/$(date +%Y%m%d-%H%M).bundle" --all
timeout 120 python -m git_filter_repo --replace-text <(printf '%s\n' 'OLD_VALUE==>REDACTED') --force
timeout 30 git remote add origin git@github.com:TianQue6916/dsh-reasonix-agent.git   # filter-repo 会移除 origin
timeout 120 git push --force origin master
# 重写后 commit hash 全变 ⇒ 其他克隆点必须重新 clone
```

**R5 找并去掉超大文件（当前活故障的修法）**

```bash
cd "/c/Users/27063/Desktop/工具箱/reasonix-ops/repo"
timeout 30 git ls-files | xargs -r -n 50 du -k 2>/dev/null | awk '$1>102400{print $1" KB  "$2}'
# 实测命中 …/sensevoice-onnx/model.int8.onnx（228.15 MB）
# 修：① XF 加 '*.onnx' '*.bin'  ② git rm --cached <path>  ③ 回收体积再 filter-repo
```

**R6 改名后的同步清单**

```bash
timeout 20 grep -n 'RepoUrl' "/c/Users/27063/Desktop/工具箱/reasonix-ops/backup-to-github.ps1"   # 第 31 行 + 第 4 行注释
timeout 30 git -C "/c/Users/27063/Desktop/工具箱/reasonix-ops/repo" remote -v
# 改：git remote set-url origin git@github.com:TianQue6916/dsh-reasonix-agent.git；旧 URL 在 fact 里是历史，保留
```

**R7 看门狗三判据手动验（不注册任务也能跑）**

```bash
W="C:\Users\27063\reasonix-ops\backup-watchdog.ps1"
timeout 60 powershell -NoProfile -ExecutionPolicy Bypass -File "$W"                # 期望 exit 0 + 日志 OK head-fresh callpath=ok
timeout 60 powershell -NoProfile -ExecutionPolicy Bypass -File "$W" -MaxAgeHours 0  # 期望 ALERT STALE-HEAD
```

## S 溯源

- `tool-github-daily-backup-reasonix-dsh-zcode-trae.md` · `reasonix-autocommit-and-github-backup-restored-20260927.md` · `backup-to-github-copies-and-excludes.md` · `backup-pipeline-selfreference-and-scope-fix.md` · `backup-pipeline-two-fixes-privkey-and-mnemon-db-20260928.md`
- `github-public-备份泄露-goat-key-事件与根因修复-2026-09-23.md` · `github-public-backup-credential-leak-round2-zstd-and-fixes-20260927.md` · `github-repo-hygiene-audit-20260927.md` · `github-加速体系与镜像自动选优-20260927.md` · `network-egress-git-ghproxy-mirrors-20260927.md` · `dev-sidecar-覆盖-gitconfig-与-npmrc-URL级配置绕过-20260927.md`
- `gitbash-schtasks-arg-conversion.md` · `gitbash-wc-m-is-bytes.md` · `meta-secret-redaction-select-string-pitfall.md` · `incident-credential-echo-leak.md` · `daily-kit-git-scratch-and-pushall-20260927.md`
- `dsh-home-local-git-versioning-20260928.md` · `dsh-git-context-and-memory-anchors-20260928.md` · `dsh-profile-backup-inventory-and-rollback-tool-20260928.md` · `dual-reasonix-home-memory-fork-and-junction-unification-20260927.md` · `reasonix-global-workspace-index-cleanup-20260921.md` · `dsh-local-search-插件已迁到C盘-junction法.md` · `扫描件整理方法论-按章合并成册-带书签-dhash-去重-ocr-页码不可用于排序-名字与内容不符需抽查.md`
PLAN 段：`C:\Users\27063\.dsh\PLAN.md` 第 139–158 行（备份三项加固 A/B/C；静默断链 20 天的根因、修复、看门狗三分支实测）。

## 存疑

1. **仓库改名（`reasonix` → `dsh-reasonix-agent`）在 312 条 fact 里零命中**，只有仓库根 `README.md` 的「改名记录（2026-10-26）」表（旧 HTTPS 301、旧 SSH redirect 仍可用）。D10 依据是那份 README，未经 fact 交叉验证。
2. **`safe.directory`（dubious ownership）与 `git-lfs` 在 fact 语料里零命中**，本章不写结论；`GH001` 提示里的 lfs 链接是 GitHub 通用文案，本仓库不用 LFS（见 X16）。
3. **改名同步未完成（2026-10-26 实测）**：脚本第 31 行 `$RepoUrl` 与 `repo` 的 `origin` 仍是旧名 `git@github.com:TianQue6916/reasonix.git`，与 README 表的"⚠️ 待改：D 盘对本机 agent 只读"一致。
4. **新的活故障（fact 未记录，本章据日志实测）**：2026-10-25 23:33 `push 失败: ... GH001 ... model.int8.onnx is 228.15 MB`；本地 `master` 领先 `origin/master` **3 个 commit**，该文件已在 index（`git ls-files -s` 有记录，239233841 B）。修法见 R5。
5. **字节层全扫有 40 MB 跳过上限**（`if(-not $fi2 -or $fi2.Length -gt 40MB){ continue }`），超限文件既不扫描也不告警 —— 与 GH001 同类盲区。**看门狗的 `UNPUSHED` 判据也只说"领先 origin"，不解释为什么推不上去**（领先 3 个 commit 会持续 ALERT 而无诊断）。两处是否都该补"末行日志含 error"未定。
