---
id: mem-cc9cc0e010700a5162ece1eaecb6cc3c
revision: 4
created_at: "2026-09-27T02:25:30.000Z"
updated_at: "2026-10-01T06:24:26.000Z"
name: reasonix-autocommit-and-github-backup-restored-20260927
description: "reasonix/dsh 自动 commit 与 GitHub 每日备份三件套（autocommit / merge-context / backup-to-github）因 Desktop/reasonix-ops 被移进 工具箱/ 而失效 3 天，2026-09-27 用 junction 修复并实测恢复；含机制、断档时间线与遗留隐患；并记 2026-09-27 发现的 public 仓库凭据泄露（local-search-token 已阻断 / weixin context-tokens 已在库）；附 dsh / reasonix hook 能力修正与教训"
metadata:
  type: user
  fact_type: project
  scope: global
---

# reasonix/dsh 自动 commit + GitHub 备份三件套：失效、修复与 hook 能力（2026-09-27）

## 一、三件套机制（2026-09-21 ~ 09-23 部署）

| 计划任务 | 脚本 | 触发 | 作用 |
|---|---|---|---|
| `\ReasonixWorkspaceAutocommit` | `reasonix-autocommit.ps1`（3266 B） | **每 2 分钟** | 自动发现 Reasonix home 下所有含 `.git` 的直接子目录 + `global-workspace`，`git add -A` + commit（作者 `Reasonix Autosave`），日志 `%APPDATA%\reasonix\autocommit.log` |
| `\ReasonixMergeContext` | `reasonix-merge-context.ps1`（18332 B） | 每 2 分钟 | merge context 处理 |
| `\ReasonixGitHubBackup` | `backup-to-github.ps1`（11854 B, v2） | **每天 23:30** | robocopy 同步 + 脱敏 + commit + push 到 `git@github.com:TianQue6916/reasonix.git`（branch `master`） |

脚本目录（**正本**）：`C:\Users\27063\Desktop\工具箱\reasonix-ops\`；
wrapper：`C:\Users\27063\reasonix-ops\run-hidden.vbs`（981 B，路径一直有效）。

`backup-to-github.ps1` 覆盖范围：`reasonix/ dsh/ goat-gateway/ zcode-appdata/ zcode-home/ trae-cn/ trae-solo/`

## 二、失效根因（2026-09-27）

`Desktop\reasonix-ops\` 被移到了 `Desktop\工具箱\reasonix-ops\`（2026-09-23 整理桌面），**三个任务的 `Task To Run` 仍指向旧路径** → 每次执行即失败（`Last Result: 3`），`autocommit.log` 最后一条停在 `2026-09-24 21:36:02`。

关键鉴别证据：任务**一直在跑**（`Last Run Time` 是当下），但 `Last Result: 3`，而且 `autocommit.log` 最后一条停在 `2026-09-24 21:36:02`。→ 不是「没装」也不是「被禁用」，是**每次执行都失败**。

## 三、修复方式：junction（不动任务定义）

```powershell
New-Item -ItemType Junction -Path 'C:\Users\27063\Desktop\reasonix-ops' -Target 'C:\Users\27063\Desktop\工具箱\reasonix-ops'
```

选 junction 而不是改任务路径，理由：零风险、完全可逆（删 junction 不碰目标）、三个任务同时恢复。

## 四、修复后实测与 2026-09-27 复核

修复后实测（2026-09-27 10:24）：

- `\ReasonixWorkspaceAutocommit` → `Last Result: 0`，日志新增
  `2026-09-27 10:24:02  committed 1 files  [C:\Users\27063\AppData\Roaming\reasonix\global-workspace]`（停摆 3 天后的第一条）
- `\ReasonixMergeContext` → `Last Result: 0`
- 已复核生效：`Get-Item` 返回 `LinkType: Junction`；`ReasonixWorkspaceAutocommit` / `ReasonixMergeContext` 均 `Last Result: 0`。
- `backup-to-github.ps1 -DryRun` 全流程通过：目标同步 rc 均正常（robocopy 约定 <8 即成功）→ 待处理 1986 文件 → 并入已跟踪共 5192 个待扫描 → **脱敏扫描 2902 个文本文件，改写 49 个** → 字节级全扫通过 → 兜底校验通过无残留密钥 → 将提交 1939 个文件

复核结论：

- **备份实际断档**：`github-backup.log` 最后一条**成功推送**是 `2026-09-25 20:02:19`；之后只有 `09-27 10:25` 一次 `-DryRun`（`未提交、未推送`）。`repo` 本地 HEAD = 远端 HEAD = `784f6ec`（`2026-09-25 20:02`）。
- `09-26 23:30` 那次 `LastTaskResult = 4294770688 (0xFFFD0000)`，日志里**连首行 `=== backup-to-github 开始 ===` 都没有** → 脚本在写日志前即失败（修复前的必然结果）。
- 目前 repo 有 **1939 个已 staged 文件**（DryRun 脱敏后的产物），等 `09-27 23:30` 真正 push。
- **`robocopy rc=3` / `rc=1` 是正常的**，不是错误：脚本第 146 行 `if($rc -ge 8){ 才判失败 }`，robocopy 0–7 均为成功级（3 = 复制了文件 + 存在额外文件）。真正的 `exit 3`（密钥检测）在 203/223 行，日志明写「兜底校验通过：无残留密钥」→ 未触发。
- `GoatTitle` 计划任务长期 `Running` 是**设计**（`goat-title.ps1` = `while($true){...; Start-Sleep 20}`），非卡死。
- 脚本副本已归一并字节相同：`Desktop\工具箱\reasonix-ops\backup-to-github.ps1` 与 `Desktop\工具箱\学科总结文档生成\reasonix-ops\backup-to-github.ps1` 均 11854 B / md5 `5df33a5a`（原隐患 2 已消除）。

## 五、🔴 P0：public 仓库凭据泄露（2026-09-27 新发现）

`TianQue6916/reasonix.git` 是 **public**（脚本注释里写明「public → 强制脱敏」，脱敏只是纵深防御，不是隔离），而脱敏 `$Detect` 只覆盖显式列举的格式（`sk-*`/`sk-ant-*`/`ghp_`/`github_pat_`/`gho_`/`AKIA`/`xox*`/私钥块/`Bearer`/`wpa_passphrase`/`user_[A-Za-z0-9]{20,}`）。**任何不匹配这些形态的随机串都会原样上传。**

1. **`dsh/local-search-token`**（65 字节纯字母数字随机串，规则打不中）——曾被 git 跟踪，`git log --all -- dsh/local-search-token` 无输出 → **历史上从未提交，但 2026-09-27 23:30 那次会首次泄露**。**已阻断**：`git rm --cached` + 写入 `.gitignore`。
2. **`reasonix/weixin/accounts/default.context-tokens.json`** ——内容为**明文** `"o9cq802gbUa4ccZXIxmu2hVNkvYc@im.wechat": "AARzJWAFAAAB…"`（wxid + 长 token），**已在 public 仓库的 HEAD 里**。已从 index 移除，但**历史仍含**。
3. **`reasonix/desktop-shell/Network/Trust Tokens` / `-journal`** ——同上，已移除。

已写入 `.gitignore` 的凭据类模式：
```
dsh/local-search-token
dsh/.env
dsh/.credentials.yaml
dsh/.credentials.yml
**/keys.json
*.token
reasonix/weixin/accounts/
reasonix/desktop-shell/Network/Trust Tokens*
```
已抽查 HEAD 中 `dsh/.env`（现为 `COMMANDCODE_API_KEY=user_REDACTED`）、`dsh/.credentials.yaml`、`reasonix/.env`、`dsh/.env.bak-goat-qq-*`、`zcode-home/v2/credentials.json` → **密钥命中数均为 0**，脱敏对显式格式有效。
`goat-gateway/keys.json`（含 2 个真 GOAT key）**未进仓库** ✅。

**结论：只靠脱敏规则不可持续（漏网的全是"无前缀随机串"）。根治 = 把 `TianQue6916/reasonix` 改为 private（用户待办）。**

## 六、遗留隐患（未处理）

> **本节与 Linux 侧原始记录的对应关系（2026-10-01 双机归一）**
> Linux 版当时列的是「**四个**遗留隐患」，归一后只剩两条，另两条的归宿如下，免得日后看不出分类被改过：
> - 原隐患 1（`TianQue6916/reasonix.git` 是 public）→ **已升格为独立的 `## 五、🔴 P0：public 仓库凭据泄露`**，信息未丢，只是提升为 P0。
> - 原隐患 2（**旧副本**：`Desktop\工具箱\学科总结文档生成\reasonix-ops\backup-to-github.ps1`（**10802 B**，比正本 **11857 B** 旧）→ 版本混乱，跑错会按旧脱敏规则推送）→ **本节下面补回**（见「原隐患 2」）。
> - 原隐患 3、4 → 就是下面的第 1、2 条，逐字保留。
>
> ⚠️ **一处未解的数字冲突，留档不掩盖**：正本 `backup-to-github.ps1` 的大小，**Linux 侧记 `11857 B`，Windows 侧记 `11854 B`**，归一取了 Windows 侧的 `11854 B`（它来自更新的 revision）。差 3 B 的原因未查明，两侧记录都没有更早的版本可比。后续若要复现，请以实际 `Get-Item ... .Length` 为准，不要引用本条里的任一数字。

**原隐患 2（Linux 侧记录，2026-09-26 原文保留）**：`Desktop\工具箱\学科总结文档生成\reasonix-ops\backup-to-github.ps1` 是**旧副本**（`10802 B`，比正本旧）→ 版本混乱，跑错会按旧脱敏规则推送。
**2026-09-27 结案**：该副本问题的结论记录在 `## 四、修复后实测与 2026-09-27 复核` 末段（正本与副本均为 `11854 B` / md5 `5df33a5a`，已一致）。也就是说这条隐患的**问题描述**已被**已解决**的结论取代——上面保留原文是为了可追溯。

1. **Linux 端完全没有** autocommit / GitHub backup，只有 `sync_cron.sh`（08:30/12:30/21:30）。链路依赖：Linux 改动 → sync 到 Windows → Windows 23:30 备份。顺序上能覆盖，但多一跳。
2. 备份的目标目录里含 `goat-gateway`（rc=1），需要确认是否真该进 public 备份。

## 七、复验命令

```bash
cd ~/Desktop/工具箱/reasonix-ops/repo
git log -1 --format='%h %ci %s'                    # 本地 HEAD
git ls-remote origin HEAD                          # 远端 HEAD（应与本地一致）
git diff --cached --name-only | wc -l              # 待推文件数
tail -20 "$APPDATA/reasonix/github-backup.log"     # 备份日志
# 仓库内是否混入凭据类文件
git grep -lE "sk-[A-Za-z0-9]{10,}|user_[A-Za-z0-9]{20,}|ghp_|BEGIN [A-Z ]*PRIVATE" HEAD | head
```

## 八、教训：改计划任务参数的正确姿势

**我犯的错**：用 `$a.Arguments = $a.Arguments.Replace($old,$new)` + `Set-ScheduledTask -Action $a`，结果 `Arguments` 被**整个覆盖成新路径**，丢掉了 wrapper 和脚本名。

**正确做法**：
- 改之前先 `Export-ScheduledTask -TaskName X | Out-File X.xml`（这次正是靠它恢复的）
- 恢复用 `Register-ScheduledTask -Xml (Get-Content X.xml -Raw) -Force`
- 能用 junction / 改文件位置解决的，就不要去动任务定义
- 在 Git Bash 里给 `powershell -File` 传路径要用正斜杠（`C:/tmp/x.ps1`），反斜杠会被 bash 当转义吃掉

## 九、dsh 与 reasonix 的 hook 能力（2026-09-27 修正，上一版此节结论是错的）

**上一版错误结论**：说「reasonix 不支持 hooks」。**错的**。错在查法：只 grep 关键词 + 查了 `~/AppData/Roaming/npm/node_modules/reasonix/` 下的 JS——那只是 **709 B 的 launcher**，真身是 `@reasonix/cli-win32-x64/bin/reasonix.exe`（72 MB native binary）。

### reasonix：原生支持完整 Claude Code hook 事件集

对 `reasonix.exe` 做 `grep -a -o` 计数得到的实证：

| 事件 | 出现次数 |
|---|---|
| `SessionStart` | 29 / 8 |
| `SessionEnd` | 9 / 1 |
| `PreToolUse` | 32 / 6 |
| `PostToolUse` | 14 / 1 |
| `UserPromptSubmit` | 15 / 2 |
| `PreCompact` | 2 |
| `Notification` | 1 |
| `Stop` | 5 |
| `SubagentStop` | 8 / 1 |
| `hooks.json` | 6 |

→ 配置文件就是 **`hooks.json`**（同 Claude Code）。reasonix 是 `@reasonix/cli-<platform>-<arch>` + 原生 binary 的 npm 分发结构（源码 `github.com/esengine/DeepSeek-Reasonix`，npm 包 `reasonix@1.19.4`）。

### dsh：hook 是插件，不是配置项

`dsh` = `@deepseek-ai/dsh`（v0.1.7-rc.2），入口 `lib/bin.js`，基于 **Cordis 插件框架**。`~/.dsh/profiles/<name>/cordis.yml` 是空入口（`[]`），真正的树由 **bundle + `cordis.patch.yml` + `--patch` 覆盖**按序组合。**入口 schema 只支持 Cordis 标准字段**（`id` / `name` / `config` / `group` / `disabled` / `inject`）——**没有 `hook` 字段**，所以 hook 必须靠插件挂载。

`~/.dsh/profiles/node_modules/@deepseek-ai/` 下有 **234 个插件**，其中与自动化直接相关的：

| 插件 | 作用 |
|---|---|
| `dsh-hook-protocol` | Claude Code / Codex 两个桥共用的 hook 语义（block with exit 2 / ask approval / attach context / exit≠2 非阻塞） |
| **`dsh-hooks-claude-code`** | **Claude Code hook 兼容层**。支持 `SessionStart` / `UserPromptSubmit` / `PreToolUse` / `PostToolUse` / **`Stop`**（"when the run is about to stop"，能 **force another step with a reason**）/ `SubagentStart` / `SubagentStop` |
| `dsh-hooks-codex` | Codex hook 兼容层 |
| **`dsh-schedule`** | **原生定时任务**：`after_seconds` / `at` / `every_seconds` / `daily` / `weekly` / **`cron`**（五字段 Vixie + IANA 时区），交付为原 Session 的 follow-up message，Host 重启后仍在 |
| `dsh-session-checkpoint-policy` | 语义级 checkpoint，crash 不丢；**已在 web/headless 两个 profile 里跑着** |
| `dsh-webhook` / `dsh-webhook-github` | webhook 出口 |

**已挂载状态**：`web` profile 有 `session-checkpoint-policy` + `schedule` + `ui-schedule`；**没有挂 `dsh-hooks-claude-code`**；`headless` 只有 `checkpoint-policy`（无 schedule）。

### 挂载方式

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml
- insert:
    - id: hooks-claude-code
      name: '@deepseek-ai/dsh-hooks-claude-code'
      config:
        configPath: /d/daily-kit/hooks/hooks.json
        # pluginRoot / projectDir / defaultTimeoutMs(600000) / stderrSummaryMaxChars(500) 可选
```

### 四条限制（实测/README 确认）

1. **只有 command hooks 会执行**；`http` / `mcp_tool` / `prompt` / `agent` 类型的 handler 被跳过并 warning
2. **`configPath` 在进程启动时读一次** → 改 `hooks.json` 必须重启 dsh
3. **hook 在 project directory（session workspace）运行**，不是 dsh 启动目录 → 脚本内必须用绝对路径
4. **`dsh-schedule` 不能在 headless / SDK-only 组合挂载**（delivery 要等 Session ack `session/flush`）

### 已产出（2026-09-27）

- `/d/daily-kit/hooks/dsh-stop.sh`（1298 B，冒烟 exit 0）：Stop 时给流水区做 snapshot，并对当前 workspace 做 `git add -A` + commit（带 `Trigger=dsh-stop-hook` trailer），永不阻塞
- `/d/daily-kit/hooks/hooks.json`：`Stop` → 上面那个脚本

### 需求映射（用户主战场是 dsh）

| 用户需求 | dsh 原生机制 |
|---|---|
| 对话**将近结束**自动整理 + git | `dsh-hooks-claude-code` 的 **`Stop`** hook（精确信号，不是轮询；且能 force 一步） |
| 到规定时间自动提交 | **`dsh-schedule`** 的 `cron` selector（已挂载） |
| 崩溃不丢 | `dsh-session-checkpoint-policy`（已在跑） |

→ 结论：**不需要外挂轮询**。此前给 reasonix 的「每 2 分钟轮询」是次优解，dsh 有原生 hook + 原生 cron。

## 十、教训（两次同类错误）

**错误模式**：查「某工具支持什么」时，只 grep 关键词 + 看最浅的那层（配置文件的顶层键 / 入口 JS），没找到就下结论说「不支持」。

**正确做法**：
1. 用 `--help` 自证（`dsh --help` 直接暴露了 profile/plugin/patch 架构，我一开始没跑）
2. 找**真实实现体**（native binary 用 `grep -a -o` 数事件名；npm 包先看 `bin` 字段指向哪，别停在 launcher）
3. 插件化系统里，「不支持」和「没挂载」是两件事——先查**插件清单**（`ls .../@deepseek-ai/` 234 个包里有 `dsh-hooks-claude-code` 就是铁证）
4. 有 `--dump-config` / `--dump-config-schema` 这类自省命令时，优先跑它
