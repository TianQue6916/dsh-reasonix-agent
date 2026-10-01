---
id: mem-cc9cc0e010700a5162ece1eaecb6cc3c
revision: 3
created_at: "2026-09-27T02:25:30.000Z"
updated_at: "2026-09-27T09:22:05.422Z"
name: reasonix-autocommit-and-github-backup-restored-20260927
description: "reasonix/dsh 自动 commit + GitHub 备份三件套的机制、junction 修复、断档时间线；并记 2026-09-27 发现的 public 仓库凭据泄露（local-search-token 已阻断 / weixin context-tokens 已在库）"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 一、三件套机制（2026-09-21 ~ 09-23 部署）

| 计划任务 | 脚本 | 触发 | 作用 |
|---|---|---|---|
| `\ReasonixWorkspaceAutocommit` | `reasonix-autocommit.ps1` | **每 2 分钟** | Reasonix home 下所有含 `.git` 的直接子目录 + `global-workspace`，`git add -A` + commit |
| `\ReasonixMergeContext` | `reasonix-merge-context.ps1` | 每 2 分钟 | merge context 处理 |
| `\ReasonixGitHubBackup` | `backup-to-github.ps1`（11854 B, v2） | **每天 23:30** | robocopy 同步 + 脱敏 + commit + push 到 `git@github.com:TianQue6916/reasonix.git`(master) |

正本目录 `C:\Users\27063\Desktop\工具箱\reasonix-ops\`；wrapper `C:\Users\27063\reasonix-ops\run-hidden.vbs`。
覆盖范围：`reasonix/ dsh/ goat-gateway/ zcode-appdata/ zcode-home/ trae-cn/ trae-solo/`。

## 二、失效根因与修复（2026-09-27）

`Desktop\reasonix-ops\` 被移进 `Desktop\工具箱\reasonix-ops\`，三个任务 `Task To Run` 仍指旧路径 → 每次执行即失败（`Last Result: 3`），`autocommit.log` 最后一条停在 `2026-09-24 21:36:02`。
修复 = junction（不改任务定义，完全可逆）：
```powershell
New-Item -ItemType Junction -Path 'C:\Users\27063\Desktop\reasonix-ops' -Target 'C:\Users\27063\Desktop\工具箱\reasonix-ops'
```
**已复核生效**：`Get-Item` 返回 `LinkType: Junction`；`ReasonixWorkspaceAutocommit` / `ReasonixMergeContext` 均 `Last Result: 0`。

## 三、2026-09-27 复核结果

- **备份实际断档**：`github-backup.log` 最后一条**成功推送**是 `2026-09-25 20:02:19`；之后只有 `09-27 10:25` 一次 `-DryRun`（`未提交、未推送`）。`repo` 本地 HEAD = 远端 HEAD = `784f6ec`（`2026-09-25 20:02`）。
- `09-26 23:30` 那次 `LastTaskResult = 4294770688 (0xFFFD0000)`，日志里**连首行 `=== backup-to-github 开始 ===` 都没有** → 脚本在写日志前即失败（修复前的必然结果）。
- 目前 repo 有 **1939 个已 staged 文件**（DryRun 脱敏后的产物），等 `09-27 23:30` 真正 push。
- **`robocopy rc=3` / `rc=1` 是正常的**，不是错误：脚本第 146 行 `if($rc -ge 8){ 才判失败 }`，robocopy 0–7 均为成功级（3 = 复制了文件 + 存在额外文件）。真正的 `exit 3`（密钥检测）在 203/223 行，日志明写「兜底校验通过：无残留密钥」→ 未触发。
- `GoatTitle` 计划任务长期 `Running` 是**设计**（`goat-title.ps1` = `while($true){...; Start-Sleep 20}`），非卡死。
- 脚本副本已归一并字节相同：`Desktop\工具箱\reasonix-ops\backup-to-github.ps1` 与 `Desktop\工具箱\学科总结文档生成\reasonix-ops\backup-to-github.ps1` 均 11854 B / md5 `5df33a5a`（原隐患 2 已消除）。

## 四、🔴 P0：public 仓库凭据泄露（2026-09-27 新发现）

`TianQue6916/reasonix.git` 是 **public**，而脱敏 `$Detect` 只覆盖显式列举的格式（`sk-*`/`sk-ant-*`/`ghp_`/`github_pat_`/`gho_`/`AKIA`/`xox*`/私钥块/`Bearer`/`wpa_passphrase`/`user_[A-Za-z0-9]{20,}`）。**任何不匹配这些形态的随机串都会原样上传。**

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

## 五、复验命令

```bash
cd ~/Desktop/工具箱/reasonix-ops/repo
git log -1 --format='%h %ci %s'                    # 本地 HEAD
git ls-remote origin HEAD                          # 远端 HEAD（应与本地一致）
git diff --cached --name-only | wc -l              # 待推文件数
tail -20 "$APPDATA/reasonix/github-backup.log"     # 备份日志
# 仓库内是否混入凭据类文件
git grep -lE "sk-[A-Za-z0-9]{10,}|user_[A-Za-z0-9]{20,}|ghp_|BEGIN [A-Z ]*PRIVATE" HEAD | head
```
