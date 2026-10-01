---
id: mem-db44baef13efa81541a00c6f6216a285
revision: 1
created_at: "2026-09-28T07:44:00.567Z"
updated_at: "2026-09-28T07:44:00.567Z"
name: dsh-tools-dir-archived-20260928
description: "工具目录归档：24 个一次性脚本移入 _archive-20260928（含引用安全检查与回滚）"
metadata:
  type: user
  fact_type: reference
  scope: global
---

**操作**：把 24 个一次性验证/探针脚本从 `~/.dsh/storages/tools/` 移入 `~/.dsh/storages/tools/_archive-20260928/`（只移不删），并写了该目录的 README 记录每个文件的用途。

**安全性检查（执行前）**：
1. `Get-ScheduledTask` 全量 action 遍历 → 只有 `memory-index-heal.mjs`、`memory-to-mnemon.py`、`thread-edges.mjs` 被计划任务引用（均保留在上一级）。
2. `grep` 遍历 `~/.dsh/profiles/`、`~/.dsh/.agent-presets/`、`~/.dsh/cordis.patch.yml` → 对归档清单**零引用**。
3. `dsh --profile web --dump-config` rc=0 复核。

**归档清单**：`fact1-network-egress.mjs` … `fact12.mjs`、`_add-agents-target.py`、`_tighten-dsh-scope.py`、`memory-write-helper.mjs`、`probe-re.mjs`、`skill-weight-test.mjs`、`test-dev-tool-search-1/2.mjs`、`test-schema.json`、`test-validate.mjs`、`verify-4-fixes.sh`、`verify-overlay-headless.yml`、`verify-unlock-evidence.txt`。

**长期保留**：`agent-jobs.mjs` + `agent-jobs.example.*`、`thread-edges.mjs`、`memory-to-mnemon.py`、`memory-index-heal.mjs`、`patch-replay-thinking.mjs`、`probe-mcp-tools.mjs`、`dsh-profile-rollback.mjs`、`weixin-bot-switch.ps1`、`codex-bench/`、以及各自的 `.bak-*`。

**注意**：目录名用 `_archive-20260928` 而**不是** `_archived-*` —— 后者的前缀命中 `backup-to-github.ps1` 的 XD 排除规则，会导致这些脚本不再被备份（跨机同步依赖它们留在备份里）。

**回滚**：`mv _archive-20260928/*.mjs .`（README 除外）。
