---
id: mem-e954998367d6edddf253a6d3c844e5a2
revision: 1
created_at: "2026-09-23T15:53:48.08747Z"
updated_at: "2026-09-23T15:53:48.08747Z"
name: github-public-备份泄露-goat-key-事件与根因修复-2026-09-23
description: user_ 前缀的 Command Code GOAT key 曾明文躺在 public 仓库约 3 个月：两个根因（脱敏正则不覆盖 user_ 前缀 + scrub 只扫变更文件）、已完成的修复与历史清理、以及待轮换 key
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 事件（2026-09-23 在排查「能否读 GOAT 额度」时意外发现）

public 仓库 `git@github.com:TianQue6916/reasonix.git` 中，两个 GOAT 账号的 API key 曾以明文形式被推送，最早可追到 2026-06-15 的 initial commit。泄露文件：`reasonix/.env`、`dsh/.env`、`dsh/.env.bak-goat-qq-20260907-232526`（3 个位置、2 个唯一 key，均 `user_` 前缀 93 字符）。

## 两个根因（缺一不可）
1. **脱敏正则不覆盖服务商自有前缀**：`$Scrub`/`$Detect` 只覆盖 `sk-*`、`sk-ant-`、`ghp_`、`github_pat_`、`gho_`、`AKIA`、`xox*`、私钥块、`Bearer <tok>`、`wpa_passphrase`。Command Code 的 key 形如 `user_<93 字符>`，不在任何规则里 → 原样上传。（`keys.json` 本身在 goat-gateway 的 XF 排除里，所以网关目录没漏；漏的是 .env）
2. **scrub 只扫「本次有变更」的文件**：第 3 步用 `git diff --cached --name-only` 取清单 → 内容不再变化的文件（如 `dsh/.env` 与源完全一致、robocopy 判定跳过）**永远不进入扫描**，历史明文长期留在远端。

## 修复（已落地）
- `$Scrub` 加 `@{ rx='user_[A-Za-z0-9]{20,}'; to='user_REDACTED' }`；`$Detect` 加 `'user_[A-Za-z0-9]{20,}'`
- 新增步骤 **3b**：把 `git ls-files` 并入待扫描清单 → 每次全量扫描已跟踪文件（710 → 2144，扫 1365 文本，改写 46）
- 误报修复：`memory/global/tool-github-daily-backup-*.md` 里写了 `-----BEGIN … PRIVATE KEY-----` 字面量 → 触发 `$Detect` 导致 exit 3 备份停摆（**已停摆过**）；示例改成 `-----BEGIN … PRIVATE KEY-----`（省略号打断 `[A-Z ]*`）
- 止血：真实运行一次备份，提交 672 文件并推送 → 远端最新树 `reasonix/.env`、`dsh/.env` 已变 `user_REDACTED`

## 历史清理（用户选择：轮换 key + 清历史 + force push）
- `pip install git-filter-repo` → `git bundle create` 备份（119.8MB，`%TEMP%\cc-hist\`）→ `python -m git_filter_repo --replace-text <表达式文件> --force`（表达式含 3 条：2 个历史明文 + 当前 .env/keys.json 中的 key）
- 重写后本地历史明文 0 命中、4 个 commit 保留；filter-repo 会**移除 origin**，需 `git remote add origin git@github.com:TianQue6916/reasonix.git` 后 `git push --force origin master`（成功，forced update）

## 遗留待办
- **必须到 Command Code 后台轮换两个账号的 key**（旧明文已在 public 仓库曝光约 3 个月；GitHub 可能仍保留旧对象引用直到 GC）
- 其他克隆位置（若有）需重新 clone（历史已被重写）
- 会话侧教训：本次排查第一轮我用 `-replace 'sk-...'` 脱敏 keys.json 失败（key 是 `user_` 前缀）→ key 明文进了对话历史。**脱敏正则必须按实际前缀写，先看清格式再打印**（同 [[meta-secret-redaction-select-string-pitfall]]）

## 通用教训
脱敏规则必须覆盖「所有用过的凭证格式」，新增任何服务商 key 时同步补规则；敏感扫描要全量，不能只扫变更文件。
