---
id: legacy-7f6b1c1c26ec9ab16fcbc86e
revision: 1
created_at: "2026-08-15T14:22:34.420326246Z"
updated_at: "2026-08-15T14:22:34.420326246Z"
name: workspace-write-lag-fix
description: ""
metadata:
  type: user
  fact_type: project
  scope: global
---

# 工作区写入卡顿改善档案（2026-08-15）

## 问题
多开任务时「当前工作区正在被写入」卡顿。根因三叠加：
1. auto-rename-daemon 每 20s 轮询，对活跃会话（正在写的 .jsonl）执行重命名 → 与桌面端写锁竞争
2. 工作区 35,220 文件，93% 是 ccgp-download(27,466)/deepseek_data(5,444)/cleanup_backup(37) → watcher 事件风暴
3. 双机同步 cron 09/14/21 点全量 walk 3.5 万文件

## 改动
- `scripts/system/auto-rename-daemon.py`：新增 ACTIVE_SKIP=300 活跃会话保护（.jsonl mtime<300s 跳过重命名），systemd 服务已重启
- 大目录移至 `~/data/`（ccgp-download/deepseek_data/cleanup_backup），原路径留 symlink（不跟随，watcher 不穿透）
- `sync/sync_reasonix.py` EXCLUDE_DIRS += ccgp-download/deepseek_data/cleanup_backup/strang_ocr_pages
- `sync/sync_cron.sh`：cron 前先查 sessions 10 分钟内是否有写入，有则跳过本次同步；cron 改 08:30/12:30/21:30
- 40 个 60 天前旧会话归档至 `~/.reasonix/archive/sessions-20260815/`

## 实测效果
- inotify watch：2,725 → 178（-93.5%）
- 同步 walk：35,220 → 1,595（-95.5%）
- 活跃会话不再被 daemon 改标题

## 注意事项
- daemon 设计策略：标题 >6 字会被重命名（is_good_title 对 6 字以上兜底返回 False）；恢复标题需用 ≤6 字
- deepseek 系列脚本写死绝对路径 ~/.reasonix/global-workspace/deepseek_data，symlink 透明兼容
- 桌面端 watcher 不跟随 symlink 是 Linux inotify 默认行为
