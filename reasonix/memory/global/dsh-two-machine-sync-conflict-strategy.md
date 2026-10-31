---
id: mem-6449758138a6066b4666fc2b13eb6b5b
revision: 1
created_at: "2026-10-26T05:28:21.904Z"
updated_at: "2026-10-26T05:28:21.904Z"
name: dsh-two-machine-sync-conflict-strategy
description: "dsh 双机同步的冲突根因与排除策略（PLAN.md 走 peers 镜像）；连带 paramiko 静默失败链"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 结局（2026-10-26 已落地）
`sync_dsh.py` 的排除策略从「只排运行态 JSON」升级为三层：

1. **EXCLUDE_FILES**（basename 匹配）新增：`thread-edges.json` / `thread-edges.dot` / `skill-usage.json` / `dsh-context-price-overlay.json` / `mnemon-sync-state.json` / **`PLAN.md`** / **`compatibility.json`**
2. **EXCLUDE_DIRS** 新增：`out`、`peers`
3. **PEER_MIRRORS**（新机制）：对端 `PLAN.md` 单向拉到 `~/.dsh/peers/<host>/PLAN.md`，不进双向比对 ⇒ 永不冲突。

## 为什么 PLAN.md 走镜像而不是双向同步
两台机器各写各的计划（用户 2026-10-26 拍板），双向必然互相覆盖。社区同类问题主流解法：Syncthing 的 `receiveOnly` + `.stignore` 本机化。镜像产物落在 `peers/`，而 `peers` 已进 EXCLUDE_DIRS ⇒ 不会被下一轮扫回去，天然无递归。

## 现场清理
- Linux：20 个 `.conflict.*` → `~/.dsh/storages/_conflict-archive-20261026/`（`_` 前缀被 `_excluded_dir` 自动排除）
- Windows：**118 个** `.conflict.*`（1.77 MB，最早 09-25）→ `C:\Users\27063\dsh-conflict-archive-win-20261026\`（**必须移出 `~/.dsh`**，否则被递归扫回）

## 静默失败链（本次最大教训）
同步从 2026-10-25 22:36 之后一直失败，连续两次 cron（08:30 / 12:30）**只留「同步开始」没有「完成」**，日志里是 `ModuleNotFoundError: No module named 'paramiko'`。根因是清 Linux 包时 `apt autoremove` 带走了 paramiko。
修复：`/usr/bin/python3 -m pip install --user --break-system-packages paramiko` → 5.1.0（不动系统包）。已验证 cron 的干净环境 `env -i` 下能 import。

紧接着撞到第二个坑：`~/.dsh/skills.wrongtype-bak-1792949267` 是悬空软链（指向 `/c/Users/27063/ai-skills`，Linux 上不存在），`os.walk` 扫到就 `FileNotFoundError` 崩。已删。

## 未解决的（挑刺结果）
1. **同步只有 Linux 侧发起**：Windows 侧 `schtasks` 无任何 sync 任务，Linux 关机则 Windows 变更永不外发
2. **peers 镜像单向**：只在 Linux 脚本里加了，Windows 看不到 Linux 的 PLAN
3. **16 个内容冲突仍在**：`.agent-presets/*.mjs`（5）、`storages/tools/*`（3）、`global/*.md`（3+）等，内容真的不同，排除解决不了
4. **EXCLUDE_FILES 随脚本同步，等于强制两边规则一致** —— 与社区「.stignore 本机化」的最佳实践相反
5. **paramiko 是 `--user` 装的**：Python 3.14 升级会失效
6. **同步失败无告警**：今天两次失败，无任何通知
7. **`sync_dsh.log` 无轮转**
