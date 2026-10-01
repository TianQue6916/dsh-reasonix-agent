---
id: mem-0e253252b5dfefe924ef26b0ee1317e0
revision: 1
created_at: "2026-09-30T14:01:13.296Z"
updated_at: "2026-09-30T14:01:13.296Z"
name: dsh-dual-machine-sync-migration-20260930
description: "双机同步从 reasonix 迁到 dsh：sync_dsh.py + cron，机器本地清单与已知局限"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 迁移（2026-09-30 用户拍板）
双机同步的根目录从 `~/.reasonix` 换成 `~/.dsh`。reasonix 那套没删，只是停用。

## 现状
| 项 | 状态 |
|---|---|
| reasonix 同步 cron | **已停用**（Linux crontab 里注释掉，备份 `~/.dsh/storages/tools/crontab.bak-20260930-2150-pre-reasonix-sync-off`）|
| dsh 同步脚本 | `~/.dsh/storages/tools/sync_dsh.py`（Linux 侧执行）|
| dsh 同步 cron | `30 8,12,21 * * * ~/.dsh/storages/tools/sync_dsh_cron.sh` |
| 首轮同步 | 上传 5 / 下载 93 / 冲突 9 / 相同 16，17.6s，0 失败 |

## 设计
`sync_dsh.py` **复用** `~/.reasonix/global-workspace/sync/sync_reasonix.py` 的 `Syncer`
（paramiko、传输与冲突逻辑一字不改、连 SSH 凭据也不复制），只换根目录与文件集：

- `LOCAL_ROOT = ~/.dsh`，`WIN_ROOT = C:\Users\27063\.dsh`
- 冲突 → **两边都保留**，对方版本存 `<name>.conflict.<host>.<hash>.bak`，且不参与后续同步
- 排除：sessions / node_modules / 凭据 / 日志 / 缓存 / `.dsh-market` / `.plugin-manager` /
  `wechat-bridge`（含 context-token）/ 下划线开头的目录 / `.bak*` 与 `.old-*` 回滚快照
- **机器本地（按路径排除）**：根 `cordis.patch.yml`（绝对路径 + win-amd64 的 deja.exe）、
  `profiles/<p>/package.json`、`profiles/<p>/pnpm-workspace.yaml`、`pnpm-lock.yaml`
  —— 这些是结构性差异，同步只会每轮产固定几个 conflict 副本
- 用 monkeypatch 包 `Syncer.walk_local / walk_win` 实现路径级过滤；
  只在一侧过滤会让「另一侧独有」被误判成需要传输

## 已知局限（务必记得）
1. **`size 相同即视为相同`**：改动前后字节数完全一致的编辑**不会传播**。
   已真实踩到：两台机器的根 `cordis.patch.yml` 都是 522 B 且内容相同 →
   既没同步也没报冲突，Linux 上因此长期带着一条 Windows 的 `deja.exe` 路径。
   要传等长改动，先把文件大小改到不同。
2. 冲突判定用 `size` 不用内容哈希（原版的取舍，避免 >5MB 文件无限套娃）。
3. `.conflict.*.bak` 会累积；用户认可「定期调用模型自己清理归一」。

## 下次要做的
- Linux 侧 `profiles/*/node_modules` 是**不参与同步**的（平台相关 + 巨大），
  要在 Linux 上真跑 profile 得各自 `pnpm install`。
- `@local/dsh-thinking-language` 的源码在 Windows 的 `D:/Toolbox/dsh-thinking-language`
  （**在 `~/.dsh` 之外**），所以它不会随同步过去；Linux 要有思考语言开关需另行放置。
