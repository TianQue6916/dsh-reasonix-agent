# 一次性验证脚本归档（2026-09-28）

归档前已确认：**没有任何计划任务、profile patch、preset 或 hook 引用这些文件**
（`Get-ScheduledTask` 全量 action 检查 + `grep` 遍历 `profiles/`、`.agent-presets/`、`cordis.patch.yml`）。

保留在上一级目录的是**长期工具**：
`agent-jobs.mjs`（#4，CSV in/out + output_schema + `--self-test`）、
`thread-edges.mjs`（#5，parentSession 父子边 + 每日 `ThreadEdgesRefresh`）、
`memory-to-mnemon.py`（记忆→mnemon 同步 + `--only` 实时通路）、
`memory-index-heal.mjs`（每日 `MemoryIndexHeal`）、
`patch-replay-thinking.mjs`、`probe-mcp-tools.mjs`、`dsh-profile-rollback.mjs`、
`weixin-bot-switch.ps1`，以及 `agent-jobs.example.*`。

## 归档内容

| 文件 | 用途 |
|---|---|
| `fact1-network-egress.mjs` … `fact12.mjs` | 2026-09-27 的一轮"事实核查"探针（出网、批量、star 规则等） |
| `_add-agents-target.py` | 一次性给 `backup-to-github.ps1` 加 `agents` target |
| `_tighten-dsh-scope.py` | 一次性收紧 backup 的 dsh scope（XD/XF 排除规则） |
| `memory-write-helper.mjs` | `memory_remember` 上线前的写入助手 |
| `probe-re.mjs` | 正则探测 |
| `skill-weight-test.mjs` | skill 用量加权机制的测试 |
| `test-dev-tool-search-*.mjs` | `dev_tool_search` 的解锁测试 |
| `test-schema.json`、`test-validate.mjs` | `agent-jobs` 的早期 schema 测试 |
| `verify-4-fixes.sh` | 4 项修复的验证脚本 |
| `verify-overlay-headless.yml`、`verify-unlock-evidence.txt` | headless overlay 与工具解锁的证据 |

回滚：`mv _archive-20260928/*.mjs .` 即可（README 除外）。
