---
id: "1a58f1a4-be2d-4b56-8f98-d5c0887b5777"
title: "dsh 双机同步（sync_dsh.py）第二阶段：PLAN.md 各写各的 + peers 只读镜像 + 冲突副本归档与本机覆盖（2026-10-26）"
description: "2026-10-26 第二次改造定论：PLAN.md/out//compatibility.json 的排除理由、PEER_MIRRORS 单向镜像机制、Windows 侧 118 个冲突副本移出 ~/.dsh 的教训、以及 7 条待修项（Windows 无调度、镜像单向、共享排除规则违反 .stignore 本机原则、paramiko --user 脆弱、无失败告警、日志无轮转、presets 该走 Git）与社区对照。"
status: "active"
created_at: "2026-10-26T05:34:14.688Z"
updated_at: "2026-10-26T05:34:14.688Z"
content_hash: "ecb5a652b653456a2f1e30a6b3eed57d19c9fc92135a60443f93afb272c27049"
source_paths:
  - ".dsh/storages/tools/sync_dsh.py"
  - ".dsh/storages/tools/sync_dsh_cron.sh"
  - ".dsh/PLAN.md"
  - ".agent-presets/anchored-standard/plan-anchor.mjs"
session_ids:
  - "c836fe5c-3a80-4756-87c7-6a4084737a45"
memory_body_ids:
  []
---

# dsh 双机同步第二阶段（2026-10-26 13:26）

**性质**：设计决策 + 落地记录 + 挑刺清单。前置故障排查与运行时状态排除见
`e5bf259a-cb23-4a50-aa16-6cc6d202b4d6`（cron 频率、paramiko 缺失、悬空软链）；Git 侧
机器特定路径与 insteadOf 问题见 `b454a116-f699-471b-982b-c57f31704689`。

## 用户决策（本次新定）

> 「两台机子可以各写各的，同时也应该有对方的目录，这样才能最为全面」

即：`PLAN.md` **各机自治、不双向合并**，但每台机器要能看到对端的完整 PLAN。方案选择上用户
采纳了「方案 1」（排除 + 只读镜像），并要求顺带处理其余冲突项、再做一次社区视角的挑刺。

## 落地改动（`sync_dsh.py`，备份 `sync_dsh.py.bak-20261026-124524-pre-runtime-exclude`）

1. **EXCLUDE_FILES** 追加 `PLAN.md`、`compatibility.json`（此前已有 5 个运行态 JSON：
   `thread-edges.json/.dot`、`skill-usage.json`、`dsh-context-price-overlay.json`、`mnemon-sync-state.json`）
2. **EXCLUDE_DIRS** 追加 `out`、`peers`（`out/` 是产物如 `reply_letter.html/.pdf`；`peers/` 是镜像输出，不能回流）
3. **PEER_MIRRORS**（新机制，定义在文件头约 L69，`main()` 内约 L220 挂载）：同步结束后按
   `(peer, remote_path, local_path)` 单向 sftp 拉取，不参与双向比对 → 永不冲突

```python
PEER_MIRRORS = [
    ('win', 'C:/Users/27063/.dsh/PLAN.md',
     os.path.expanduser('~/.dsh/peers/win/PLAN.md')),
]
```

dry-run 验证：日志出现 `[dry] peer-mirror win/PLAN.md`，冲突 **20 → 16**，上传 185 / 相同 1983 / 20.9s。
`PLAN.md` 路径未变，因此 `plan-anchor.mjs` 无需改动（这是选方案 1 而非方案 2「按机器改名」的核心理由）。

## 冲突副本归档的正确做法（踩过的坑）

- Linux 侧 20 个 `.conflict.*` → `~/.dsh/storages/_conflict-archive-20261026/`；`_` 前缀目录被
  `_excluded_dir()`（`name.startswith('_')`）自动排除。
- Windows 侧 118 个（1.77 MB，最早 09-25）→ **第一版放进 `~/.dsh/storages/` 下，`-Recurse` 重数仍是 118，
  等于原地打转**；正确答案是移出 `~/.dsh` 树：`C:\Users\27063\dsh-conflict-archive-win-20261026`。
- 判据：凡是「归档/备份」目录，一律不能落在同步根内，除非名字命中 `_` 前缀排除。

## 社区对照（为什么这么选）

- **Syncthing**：`.stignore` 是**本机文件、永不参与同步**；`receiveOnly` 模式专治「完整端 ↔ 残缺端」，
  防止残缺端把缺失当删除成批反推。
- **`@wangmingfa/syncx`**：冲突副本「硬忽略、不参与同步、只留生成它的机器」，否则副本套副本自繁殖。
- **chezmoi / branch-per-host**：机器差异靠模板或分支隔离，代价是双份维护。
- **NixOS syncthing 模块注释的坑**：*「a machine that auto-created an empty copy would be offering a
  competing version of a synced file, and a fresh empty one can win the conflict and wipe the other」*
  —— 正是本次「一台缺文件 → 被当成要创建 → 空版本可能赢」现象的注解。

## 本次挑刺出的 7 条待修项（用户尚未选修复顺序）

| # | 问题 | 证据 / 判据 | 建议 |
|---|---|---|---|
| ① | 同步只有 Linux 侧发起 | Windows `schtasks /query` 无任何 sync 任务 | 加 Windows 侧调度，否则 Linux 关机期改动永不上推 |
| ② | peers 镜像单向 | `PEER_MIRRORS` 只在 Linux 脚本里 | Windows 加对偶，否则「互看 PLAN」只实现一半 |
| ③ | 16 个内容冲突排除不掉 | `.agent-presets/*.mjs` ×5、`storages/tools/*` ×4、`global/*.md` ×3、patch/references 等 | 不该排除（排除=永久隐藏差异）；presets 走 Git 统一 |
| ④ | 排除规则共享 | 规则写在 `sync_dsh.py` 内，而脚本本身在被同步范围 → 改一台等于改两台 | 加 `sync_dsh.local.py`（进 EXCLUDE_FILES，各机自维护），主脚本末尾 `try: import` 覆盖 |
| ⑤ | paramiko 是 `pip --user` 装的 | Python 3.14 → 3.15 升级后 `~/.local/lib/python3.14/site-packages` 失效 | 同步会**再次静默死掉**，需提防或改系统层安装 |
| ⑥ | 失败无告警 | 今天 08:30 与 12:30 日志只有「同步开始」没有「完成」 | cron 加 `|| notify` 或走 dsh-remote 推消息 |
| ⑦ | `sync_dsh.log` 无轮转 | 每行一文件操作，2000+ 文件 × 每天 3 次 | 加 logrotate 或按天切片 |

历史遗留两条：`*.wrongtype-bak-*` 悬空软链**产生机制未查**（本次只删了那一个实例）；
`.agent-presets/*.mjs` 两边不一致应走 Git（`dsh/.agent-presets` 已有内容但比本地旧）。

**优先级建议（未执行）**：⑥ > ② > ④ —— ⑥ 是「坏了也不知道」，② 是功能只做一半，④ 是迟早咬人；①③⑦ 可缓。

## 复用要点

- 判断「某文件该不该参与双向同步」：**本机运行态 / 产物 / 各机自治内容 → 排除**；
  **想互看但不想互改 → 单向镜像到 `peers/<host>/`**；**该统一的东西 → 走 Git，不要靠同步掩盖差异**。
- 改同步脚本前后必做 `--dry-run` 并核对「排除项出现次数 = 0」，再比冲突数变化。
- 本次**未跑真同步**（dry-run 显示 185 上传，会改 Windows 侧），等用户确认；下次 cron 21:30 自动执行。
