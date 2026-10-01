---
id: mem-bc54f7e5fb5eeca6c3df51dc1a12480b
revision: 1
created_at: "2026-09-27T09:15:50.300Z"
updated_at: "2026-09-27T09:15:50.300Z"
name: dual-machine-memory-sync-conflict-copies-and-restores-20260927
description: "双机 memory 同步「绝不覆盖」策略致 175 个 .conflict 副本、Linux 侧更新被降级到 .bak；已恢复 8 个 fact 并给出可靠判据"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 机制（2026-09-27 查明，Windows 侧实测）

同步器 = `~/.reasonix/global-workspace/sync/sync_reasonix.py`（571 行）+ `sync_cron.sh`（Linux cron 08:30/12:30/21:30 触发；会话 10 分钟内有写入则跳过）。
其文件头自述的冲突策略：

> 冲突（同名且内容不同）→ **双方保留，对方版本存为 `<name>.conflict.<host>.<ts>.bak`，绝不覆盖**

后果：**数据零丢失，但 Windows 侧主文件永远保留本机版**，Linux 侧更新只活在 `.bak` 里，无人裁决。
`.conflict.*` 副本的 mtime = `sftp.put` 落盘时刻，**不是内容时刻**，不能当新旧判据。

当前规模：`~/.reasonix/memory/global/` 下 **175 个冲突副本**（118 linux / 57 win），涉及 **44 个 fact**，其中 **20 个正文真冲突**、24 个仅 frontmatter 格式代差。
（`.conflict.*.bak` 后缀不匹配 `*.md`，**不会被 MEMORY.md 索引**，也不进 memory_search。）

## 两代 frontmatter 格式（关键）

- **旧（Windows 侧主文件常见）**：`name: 英文slug` + `type/scope/created`，**无 id / revision / updated_at**
- **新（Linux 侧）**：`id: legacy-<hex>` + `revision` + `created_at/updated_at` + `activation` + `metadata{type,fact_type,scope}`

→ **跨格式比较时 `revision` 单判据必然失效**。

## 可靠判据（唯一可信）

**剥掉 frontmatter，比正文；然后看 diff 里"主文件缺不缺具体信息"。**
- `linux 独有行 == 0` → 主文件已包含 → 无需动作
- `win 独有行 == 0` → 安全覆盖
- 双向独有 → 必须合并（看 diff 内容判断，不要看行数）

**不可靠的判据（实测全部会误导）**：`revision`、`updated_at`（内容追加了但时间戳不更新，实测 restore 的两条 updated_at 仍为 09-04/09-08 而内容含 09-10/09-11 补充）、`mtime`（同步落盘时间）、纯行数。

## 已恢复 / 已合并（2026-09-27，旧版均留 `.bak-prereversion-<stamp>`）

| fact | 动作 |
|---|---|
| `user-persona-cognitive-system-architect` | 合并 v3.0 量化版 + Linux 2026-09-23 重写版，94→**187 行**，`revision 1→3` |
| `reasonix-32-parallel-limit-and-translation-division` | 恢复 09-10 **模型铁律：全任务统一 v4.1 flash，pro 弃用** |
| `工具-dsh并发调度与命令铁律-20260904` | 恢复 09-11 铁律：**长任务一律 `--async`**（同步调用 164–181s 刚性 fail、0 字节输出）、禁止 `--no-notify`、`-e` 已修 |
| `api-调用默认-command-code-goat-套餐-key-而非-deepseek-官方` | 恢复 09-10 v4.1 全面升级（含 v4.1 视觉 6/6 实测） |
| `dsh-gate-双机路由铁律` | 恢复「2026-09-04 已被取代」废弃声明 |
| `元规则-03-技能路由` | 恢复「第零规则：搜索本能前置」 |
| `工具-离线维基百科` | 恢复「权威路径：ZIM 只在小电脑」 |
| `dsh-gate-dual-machine-setup` / `dsh-gate-双机配置档案` | 并入 09-04 废弃声明块 |
| `academic-level-and-teaching-style` / `subtitleedit-skill-created` / `offline-wiki-autosearch` | 恢复高 revision frontmatter |

无需动作（主文件已是超集）：`rule-star-open-source-usage`（rev3 已订正"bash 无需绕 PowerShell，用 `--noproxy`"）、`daily-kit-git-scratch-and-pushall`、`学习-CSAPP目录结构`、`学习-离散数学`/`学习-高等数学问答`（主文件 1336/938 行完整版 vs Linux 54/42 行蒸馏版）、`meta-20260816-optimization`、`github-public-备份泄露-goat-key`。

## 复验命令

```bash
# 冲突副本总数
ls -1 ~/.reasonix/memory/global | grep -c conflict
# 某 fact 的所有副本及元数据（mtime 是落盘时间，勿当新旧）
ls -lt ~/.reasonix/memory/global/<name>.md.conflict.*
# 该 fact 的 Linux 独有内容
diff ~/.reasonix/memory/global/<name>.md ~/.reasonix/memory/global/<name>.md.conflict.linux.*.bak | grep '^>'
# 全量重扫：剥 frontmatter 比正文 + 统计双向独有行数
```

## 待办

1. **改 `sync_reasonix.py` 的冲突策略**（在 Linux 侧改才有用）：冲突时按「正文包含关系」自动裁决，双向独有才留 `.bak`。
2. 175 个 `.conflict.*.bak` 的清理（先逐条确认无独有信息）。
3. 另发现：部分 fact 的默认输出路径是 **Linux 路径** `/home/tianque/桌面/输出文件/`，在 Windows 机上不可用（`default-output-directory` / `discussion-reply-in-marktext-md` / `share-file-with-user-via-wps`）。
