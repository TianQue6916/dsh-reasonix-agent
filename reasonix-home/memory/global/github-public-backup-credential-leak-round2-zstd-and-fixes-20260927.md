---
id: mem-6c2a542cfc7bb1062e010dc2d27ae046
revision: 1
created_at: "2026-09-27T09:49:00.447Z"
updated_at: "2026-09-27T09:49:00.447Z"
name: github-public-backup-credential-leak-round2-zstd-and-fixes-20260927
description: "public 仓库 TianQue6916/reasonix 第二轮凭据泄露：.zstd 压缩绕过脱敏致真 sk-/user_ key 进历史；已阻断（2002 文件移出 + XF/gitignore 扩展 + 新增 reasonix-home target + 修元 bug），待用户改 private 与轮换 key"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 一、发现（2026-09-27，deja 触发）

用 `deja secrets` 扫本地会话记录，报出 **24 个凭据散在 16 个会话里**，进而查出：**public 仓库 `TianQue6916/reasonix` 里有真实 API key**。

**决定性证据**（解压 repo 内的会话归档后 grep）：
```bash
cd ~/Desktop/工具箱/reasonix-ops/repo
F="dsh/_backup-20260925-upgrade-017rc2/sessions/--C-Users-27063--/session-06bd5f22-5b52-482a-8bc6-6de5e0363b12/session.v3.jsonl.zstd"
git show "HEAD:$F" | /d/miniconda/Library/bin/zstd -dc | grep -oE "(sk-[a-zA-Z0-9_-]{6}|user_[A-Za-z0-9]{6})" | sort | uniq -c
# → 20 sk-backup / 9 sk-REDACT / 6 sk-4f68ae / 5 user_4iXnos / 7 user_REDACT
```
- **`sk-4f68ae…`** = `~/.reasonix/config.json` 里的 `apiKey`（DeepSeek 官方 key，明文 32 hex）
- **`user_4iXnos…`** = GOAT 账号 `163` 的 key（`user_4iX…`，93 字符）——**与 2026-09-23 那次泄露是同一把**

## 二、根因链（三层，缺一不可）

1. **脱敏只扫"文本文件"**。备份脚本日志明写「脱敏：扫描 N 个文本文件」→ **`.zstd` 压缩内容看不穿**，正则匹配不到 → 原样推送。
2. **`$Detect`/`$Scrub` 是显式白名单式列举**，漏掉多种真实凭据形态：`glpat-*`（GitLab）、`xoxc-`/`xoxd-`（Slack cookie token，规则只写了 `xox[baprs]-`）、`scheme://user:pass@host`、JWT（`eyJ…`）、`command-password`。deja 能识别它们，但备份脚本不认。
3. **`dsh` target 的 XF 未排除 `*.zstd`**，而 `~/.dsh/sessions/**` 里就有 2002 个 `.zstd` 会话归档。

## 三、2026-09-27 已做的阻断（全部已执行并验证）

| 动作 | 结果 |
|---|---|
| `git rm --cached dsh/local-search-token` | 65 字节纯随机串，**规则打不中**；`git log --all` 证明**历史从未提交 → 本次会首次泄露**，已阻断 |
| `git rm --cached reasonix/weixin/accounts/default.context-tokens.json` | 明文 wxid + 长 token，**已在 public HEAD** |
| `git rm --cached reasonix/desktop-shell/Network/Trust Tokens{, -journal}` | Chromium token 库 |
| **`git rm --cached` 全部 2002 个 `*.zstd`** | 含真 key 的会话归档，已不再跟踪 |
| `.gitignore` 补 11 条 | `dsh/local-search-token`、`dsh/.env`、`dsh/.credentials.yaml`、`**/keys.json`、`*.token`、`reasonix/weixin/accounts/`、`Trust Tokens*` 等 |
| `$Targets` 的 XF 扩展 | `reasonix` +`*.jsonl,*.zstd`；`dsh` +`*.zstd,*.jsonl` |
| **新增 `reasonix-home` target** | `Src="$User\.reasonix"`，XD 排除 `global-workspace,projects,sessions,archive,locks,.git`，XF 排除 `config.json,*.bak,*.conflict.*.bak,*.jsonl,*.zstd` → **活跃 memory(349)+skills(229)+mind-transcripts(45) 终于进入备份** |
| 修「元 bug」 | `dsh-headroom-ccr.json` 与 fact `github-public-备份泄露-goat-key-事件与根因修复-2026-09-23.md` 里都含 `-----BEGIN … PRIVATE KEY-----` 字面量 → 触发 `$Detect` → **「中止提交，不推送」**。那条 fact 在教"别写字面量"却自己引用了它。两处均改成 `-----BEGIN … PRIVATE KEY-----` |
| `-DryRun` 复验 | ✅ `字节级全扫通过` / `兜底校验通过：无残留密钥` / `将提交 2451 个文件`（2026-09-27 17:48） |

## 四、🔴 待用户动作（我无法代做）

1. **把 `TianQue6916/reasonix` 改为 private** —— 唯一可靠止血。移除 index 只阻止**未来**提交，**历史 commit 里仍含** `sk-4f68ae…` 与 `user_4iXnos…`（2002 个 `.zstd` 已进历史）。GitHub 可能已有缓存/fork。
2. **轮换两把 key**：
   - DeepSeek 官方 key（`sk-4f68ae…`，在 `~/.reasonix/config.json`）
   - GOAT 账号 `163` 的 key（`user_4iXnos…`，在 `~/.dsh/.env` / `goat-gateway/keys.json`）—— 这把**第二次**泄露了
3. 如需彻底洗历史：`git filter-repo --path '*.zstd' --invert-paths` + force push（高风险，会改所有 commit hash，需与备份链一起处理）。

## 五、复验命令

```bash
cd ~/Desktop/工具箱/reasonix-ops/repo
git ls-files "*.zstd" | wc -l                                  # 应为 0
git grep -lE "glpat-[A-Za-z0-9_-]{20,}|xox[cd]-[A-Za-z0-9-]{20,}" HEAD   # 应为空
git grep -ohE "sk-[a-f0-9]{20,}|user_[A-Za-z0-9]{20,}" HEAD | sort -u    # 应为空
D=~/.dsh/profiles/web/node_modules/@vshulcz/deja-vu-windows-amd64/bin/deja.exe
"$D" secrets --limit 30                                        # 本地会话仍携带的凭据清单
"$D" secrets --scrub --dry-run                                 # 看会改写哪些文件（不加 --dry-run 才真改）
```

## 六、教训

- **脱敏是白名单，压缩是它的盲区**；任何"只扫文本"的脱敏都不足以保护 public 仓库。
- **凭据形态永远比规则多**：本次新增的漏网类型全是没有固定前缀或用了未列举前缀的。
- **警示性文档本身会成为触发源**：讲"别写字面量"的文档写了字面量 → 自我触发。写这类说明时直接用省略号或转义。
