---
id: mem-79c7cae28ad522c804f4195d0e313232
revision: 1
created_at: "2026-09-28T04:45:26.356Z"
updated_at: "2026-09-28T04:45:26.356Z"
name: backup-pipeline-selfreference-and-scope-fix
description: "backup-to-github 的两个根本问题：自指陷阱（修私钥泄漏的 fact 自己成源）+ 同步范围失控（291MB 会话进 public repo）"
metadata:
  type: user
  fact_type: reference
  scope: global
---

# backup-to-github 的两个根本问题（2026-09-28 修）

## 问题 1：自指陷阱 —— 「修私钥泄漏」的 fact 自己成为泄漏源

`$Detect`（提交前二次全量扫描）用的是**裸字符串**判据：
`'-----BEGIN [A-Z ]*PRIVATE KEY-----'`
而 `$Scrub`（脱敏）用的是**完整块**判据：
`(?s)-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----`

→ **只提及、不含完整块的文本**（讲"怎么修私钥泄漏"的 fact、被 feed 进 mnemon 的副本）会被 `$Detect`
判为泄漏并**中止推送**，而 `$Scrub` 根本不匹配它们（没有 END）→ 永远改不掉。

**这是自指陷阱**：每写一条"我修好了 PRIVATE KEY 泄漏"的 fact，就再生一个触发源。
实证：那条 fact 正文 `BEGIN=2 / END=0 / 长 base64 行=0`（纯属提及）。
后果：**2026-09-26~09-28 推送成功次数 = 0**，日志全是 `!! 中止，不推送`。

**修法**：`$Detect` 的私钥判据改成「BEGIN + 真实密钥体」，要求后续跟 ≥40 字符 base64：
`'(?s)-----BEGIN [A-Z ]*PRIVATE KEY-----[\r\n]{1,2}[A-Za-z0-9+/=]{40,}'`
这样才区分得了"提及"与"真密钥"，也不再与 `$Scrub` 语义打架。

## 问题 2：同步范围失控 —— 291MB 会话记录进了 public repo

`dsh` target 的 XD/XF 漏了 `sessions` / `cache` / `attachments` / `_backup*` / `_archived*` / `_dropped*`，
且 XF 没有 `*.bak` / `*.bak-*` / `*.conflict.*.bak`。repo 里因此跟踪了 4416 个文件，含：
- **1424 个 `dsh/sessions`**（源目录 291MB / 1448 个 `.zstd`，**含完整对话内容**）
- 619 个 `dsh/_backup*`、556 个 `*.bak*`、377 个 `*.conflict.*.bak`、108 个 `dsh/cache`
- **`dsh/.credentials.yaml` 和 `dsh/.env`** —— `.gitignore` 早就有这两条规则，但**文件早已被跟踪**，规则形同虚设

⚠️ robocopy 用 `/E`（**不删目标多余文件**）⇒ 光改 XD/XF 只防未来，历史入库的必须另行清。

清理（`.gitignore` 补规则后）：
```bash
git ls-files -z -i -c --exclude-standard | xargs -0 -r -n 100 git rm --cached --quiet
```
4416 → 1707（移除 2709）。执行前用 `grep -Fx` 逐个确认 10 个关键文件（MEMORY.md / 两个 package.json /
cordis.patch.yml / launch-dsh.ps1 / skill-usage.json / 两个 preset .mjs / SKILL.md）「安全」才动手。

## 新增 target：agents

`@{ Name='agents'; Src="$User\.agents" }` → `~/.agents`（1.7MB，dsh/reasonix 共享的 agent 标准技能目录：
deja-history / deja-search / hindsight-coding-agent / microsoft-foundry）。
原先 8 个 target 没有一个覆盖它 → **技能本体在双机间根本不同步**。

## 验证坑（"判据写错会伪装成产品缺陷"的又一实例）

统计 repo 里的 fact 数得到三个互相矛盾的值：`grep '^reasonix/memory/global/'`=122、
`git ls-files 'reasonix/memory/global/*.md'`=195、实际=171。**全是判据假象**：
- `core.quotepath` 默认把中文名转义成 `"reasonix/...\344\270\255.md"`（**行首是引号**）→ 撞不上 `^` 锚点，漏计 73 个
- 同一转义使文件名以 `"` 结尾 → `grep -cE '\.md$'` 也失配
- git pathspec 的 `*` **跨 `/`** → `reasonix/memory/global/*.md` 把 `.archive/` 子目录也算进来了

**正确判据**：`git -c core.quotepath=false ls-files`，或直接用 `ls` 数 worktree。

## 可复用命令

```bash
git ls-files -i -c --exclude-standard          # 列出「已跟踪但被 .gitignore 忽略」的文件（清理前闸门）
git ls-files -i -c --exclude-standard | grep -Fx "<path>"   # 删除前逐个确认关键文件不在名单（期望无输出）
git check-ignore -v <path>                     # 权威判断某路径是否被忽略（比翻 .gitignore 可靠）
```

## 仍未解决

public repo 的**历史**里仍有 `dsh/sessions`、`dsh/.credentials.yaml`、以及早先的 `sk-4f68ae…` / `user_4iXnos…`。
清 HEAD 不等于清历史，需要 `git filter-repo` / BFG 重写，或直接轮换凭据。
