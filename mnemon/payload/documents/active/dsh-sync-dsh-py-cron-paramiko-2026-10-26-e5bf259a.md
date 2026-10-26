---
id: "e5bf259a-cb23-4a50-aa16-6cc6d202b4d6"
title: "dsh 双机同步（sync_dsh.py）运维定论：运行时状态排除、cron 频率真相、paramiko 静默失败与悬空软链（2026-10-26）"
description: "2026-10-26 处理 ~/.dsh 双机同步冲突时的定论与证据：5 个运行时累积状态文件的排除规则、cron 实为每天 3 次（非每小时）、apt autoremove 带走 paramiko 导致 cron 静默失败、悬空软链使 os.walk 崩溃，含备份与回滚路径。"
status: "active"
created_at: "2026-10-26T04:54:40.966Z"
updated_at: "2026-10-26T04:54:40.966Z"
content_hash: "e6f319ecb8b97ca0bb3a49c18b252ee84d4039a371bbf24c1031e129d11eaa8d"
source_paths:
  - ".dsh/storages/tools/sync_dsh.py"
  - ".dsh/storages/tools/sync_dsh_cron.sh"
  - ".dsh/profiles/web/cordis.patch.yml"
session_ids:
  - "78981d94-4018-40d1-ad78-9e838aa754c0"
memory_body_ids:
  []
---

# dsh 双机同步运维定论（2026-10-26）

**性质**：故障排查 + 修复落地记录（含复现证据与判据）。相关文档：
`b454a116-f699-471b-982b-c57f31704689`（GitHub insteadOf 根因与双机配置对齐清单）、
`a7db1165-9b9d-49e9-9935-d79b5654167f`（skills 三端分发，说明 sync_dsh.py 不含 reasonix/skills）。

拓扑：Linux `~/.dsh`（tianque`/usr/bin/python3`）↔ Windows `C:\Users\27063\.dsh`（paramiko/SSH）。
脚本：`~/.dsh/storages/tools/sync_dsh.py`（包装 `~/.reasonix/global-workspace/sync/sync_reasonix.py` 的 Syncer），
定时入口 `~/.dsh/storages/tools/sync_dsh_cron.sh`，日志 `~/.dsh/logs/sync_dsh.log`。

## D 定论

1. **冲突 ≠ 频率问题，是架构问题**：同一份「本机运行时累积状态」被两台机器同时写，跨机合并无意义。
   提频只会让同一种冲突发生得更勤。因此选择「排除」而不是「提高同步频率」。
2. **cron 不是每小时**：`30 8,12,21 * * *`，即每天 3 次（08:30 / 12:30 / 21:30）。用户记忆中的
   「每小时隐式同步」不成立，需以此为准。
3. **同步失败是静默的**：日志只有 `===== HH:MM:SS dsh 同步开始 =====` 而无 `✅ 同步完成`，
   即表示该次运行失败（退出码非 0）。判定单次同步是否成功，看「开始/结束」配对 + 退出码。
4. **`apt autoremove` 会带走 paramiko**，使 cron 静默全挂；系统 Python 装依赖必须走
   `pip install --user --break-system-packages`（不改系统包）。
5. **同步器对悬空软链零容错**：`os.walk` 阶段 `os.stat()` 直接 `FileNotFoundError` 终止整次同步，
   一个残留的 wrongtype 备份链就能让 cron 每晚失败。

## M 机制

**排除清单的三层结构**（`sync_dsh.py`，`R.EXCLUDE_FILES`）：

- 原有：运行期状态 `dsh-headroom-ccr.json` / `git-anchors.json` / `mnemon-draft.json` /
  `plugins.json` / `workspace.json` / `session_projcache.json` / `settings.new.yaml` / `pnpm-lock.yaml`；
  机器级 user patch 层 `cordis.patch.yml`（含绝对路径与平台专有二进制，跨机同步会把 A 机路径灌到 B 机；
  曾因两侧同 size 同内容被「size 相同即视为相同」规则判成一致，静默漏同步）。
- **2026-10-26 新增 5 项**（本次修复）：
  `thread-edges.json`、`thread-edges.dot`、`skill-usage.json`、
  `dsh-context-price-overlay.json`、`mnemon-sync-state.json`。
- 排除后缀：`.log .lock .zstd .sqlite .sqlite3 .db .pyc .ps1 .bak`；
  排除下划线开头目录（`_bak-*` / `_backup*` / `_tmp`）；`bak-*/old-*` 回滚快照两侧同时过滤
  （包装 `walk_local` / `walk_win`，两侧同滤，否则「只有一侧有」会被判成独有文件照样传输）；
  `ACTIVE_SKIP = 30` 秒内动过的文件视为正在写而跳过。

**冲突文件类型分布（修复前实测）**：`thread-edges.json` ×8、`thread-edges.dot` ×8、
`mnemon-sync-state.json` ×2、`skill-usage.json` ×1、`dsh-context-price-overlay.json` ×1，合计 20 个 / 1.5 MB，
冲突数递增：14 → 16 → 27。

**paramiko 失败链**：`sync_dsh.py` 第 43 行 `import sync_reasonix as R` → 其第 21 行 `import paramiko`
→ `ModuleNotFoundError`。Linux 为 Python 3.14.4（Ubuntu 26.04 自带），`/usr/bin/python3` 内无 paramiko；
`sudo apt install python3-paramiko` 因交互认证被拒。修复后 `paramiko 5.1.0`（连带 cffi / invoke /
pycparser / pynacl，脚本落 `~/.local/bin` 但 cron 脚本已显式 `export PATH=...:/home/tianque/.local/bin`）。

**悬空软链**：`~/.dsh/skills.wrongtype-bak-1792949267 -> /c/Users/27063/ai-skills`（Windows 盘符路径，
Linux 上不存在），`walk_local` 的 `os.stat()` 抛错。删除后 dry-run 通过。
正常目录保留：`skills/`、`skills.empty-bak-20261001/`、`skills.junctions-legacy-20261001/`。

## J 判据

- **该不该进 EXCLUDE_FILES**：问「这份文件跨机合并有没有意义」。本机运行轨迹（计数、边表、用量、
  价格 overlay、同步状态）→ 排除；每机各自的计划（`PLAN.md`）与产物（`out/*`）→ 也应排除；
  版本需一致的代码（`.agent-presets/*.mjs`、`profiles/*/compatibility.json`）→ **不进排除，应走 Git**。
- **改完怎么验**：`python3 sync_dsh.py --dry-run`（不写文件），检查被排除文件名在输出里出现次数应为 0。
- **验证 cron 环境**：用 cron 同等干净环境跑 `import paramiko`，而非登录 shell。
- **同步是否健康**：`--dry-run` 的 `上传/下载/冲突/相同` 四项 + 用时；冲突应趋近 0。
- **Windows 侧 bash 提速改动不跨平台**：`bak-20261026-pre-pty-win` 的 diff 只是新增 `pty-win` group
  （`disabled: !!js process.platform !== 'win32'`），让 `pwsh` 走 ConPTY 常驻并关掉冷启动版
  `dsh-tool-pwsh` 以避免同名工具在 tools registry 重复注册。Linux 侧 `persistent-shell`（bash PTY）
  本来就是启用状态（`disabled: ... === 'win32'`），无需移植，Linux 配置里 `pty-win` 出现 0 次。

## X 反例 / 坑

- 以为「每小时同步」——实际每天 3 次；不要凭感觉判断调度频率，直接读 crontab 原文。
- 只看日志文件存在就以为同步正常：失败时日志里也有「开始」行。
- `sudo apt install` 在无人值守环境会卡在交互认证；改 `pip --user --break-system-packages`。
- 一次「清系统包」的外围操作可以让几小时后的定时任务静默失效，事后需回查 cron 产物而非假定无恙。

## 操作与回滚

- 改动前备份：`sync_dsh.py.bak-20261026-124524-pre-runtime-exclude`（同目录）。
- 历史冲突副本**不删**，移到 `~/.dsh/storages/_conflict-archive-20261026/`（该目录以下划线开头，本身被同步排除）。
- 备份/恢复使用 `sync_dsh.py --dry-run | --sync | --verify` 三档，先 dry-run 再 sync。

## R 复现

```
30 8,12,21 * * * /home/tianque/.dsh/storages/tools/sync_dsh_cron.sh   # crontab -l 原文
grep -n "同步开始\|同步完成" ~/.dsh/logs/sync_dsh.log                  # 只有开始 = 该次失败
/usr/bin/python3 -c "import paramiko"                                 # 修复前 ModuleNotFoundError
/usr/bin/python3 ~/.dsh/storages/tools/sync_dsh.py --dry-run          # 期望 冲突≈0、无 FileNotFoundError
```

修复后 dry-run 结果：`上传 188 / 下载 0 / 冲突 20 / 相同 1996 / 25.3s`；
剩余 20 个冲突是另一类（`.agent-presets/anchored-standard/*.mjs` ×5、`profiles/*/compatibility.json` ×2、
`profiles/web/patches/*.patch` ×1、`PLAN.md`、`.gitignore`、`out/reply_letter.html`、`out/reply_letter.pdf`），
当时未处理——待定前提：`PLAN.md` 两台机器各写各的还是一致，若各写各的需一并排除。

## 存疑

- 真同步未执行（dry-run 显示需「上传 188」，会改 Windows 侧），待用户确认后由下次 cron 自动执行。
- 剩余 20 个冲突的处置策略（排除 / 改走 Git）尚未拍板。
- `.conflict.win.*.bak` / `.conflict.linux.*.bak` 的产生是否还需在脚本层加「冲突即归档并告警」仍未定。
