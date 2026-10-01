---
id: mem-663839f1a094a76fabbc1f7b4e1fbf61
revision: 1
created_at: "2026-10-01T12:43:32.731Z"
updated_at: "2026-10-01T12:43:32.731Z"
name: dsh-agents-skills-second-root-and-catalog-cache-20261001
description: "~/.agents/skills 是第二个 skill 根（之前 triage 漏掉）+ skill catalog 是进程级缓存，改 disable 必须重启"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 两个 skill 根（rank 不同）
- rank 400：`<dshHome>/skills`，Windows 上经 junction → `%APPDATA%\reasonix\skills`（78 个，2026-10-01 已 triage）
- rank 500：`<agentsHome>/skills` = `C:\Users\27063\.agents\skills` —— **2026-10-01 才发现，之前那次 skill 归一漏掉了这个根**
  当时只有 4 个：`deja-history`、`deja-search`、`hindsight-coding-agent`、`microsoft-foundry`
  来源不是 dsh，是 `npx skills`（git 式安装），锁文件 `C:\Users\27063\.agents\.skill-lock.json`（version 3，字段 source/sourceType/sourceUrl/skillPath/skillFolderHash/installedAt/updatedAt）
- `~/.agents/skills` **不在双机同步清单里**（`sync_dsh.py` 的 EXTRA_PAIRS 只有 `~/.dsh/skills` 和 `~/.reasonix/memory`）

## skill catalog 是进程级缓存（实测）
改 SKILL.md 的 `disable-model-invocation` 后，**同一个 dsh 进程内调 `skill_search` 仍会返回该 skill**（2026-10-01 对 4 个孤儿 skill 实测 4/4 命中）。必须重启 dsh 才反映。
`dsh --profile web --dump-config` 是**新进程**、读**文件**，所以它能验证 bundle / cordis.patch.yml 层的改动（如 deja 是否已消失），但看不到 skill 扫描结果。

## 4 个孤儿 skill 的判定依据（全部实测）
- `deja-history` / `deja-search`：deja 2026-10-01 停用（bundles 移除 + root cordis.patch.yml 注释）
- `hindsight-coding-agent`（SKILL.md 75,112 B）：hindsight 插件 2026-09-28 已卸，只剩 `cordis.patch.yml.hindsight-backup`、`.bak-20260928-0047-pre-hindsight`、`.bak-20260928-0133-broken-hindsight`；它的 description 还宣称「the plugin behind the 🧠 banner」→ 留着会让模型胡说
- `microsoft-foundry`（SKILL.md 27,222 B，目录 1630 KB）：2026-04-07 从 `https://github.com/microsoft/azure-skills.git` 装的，与本机用途无关
处置：frontmatter 第一行后插 `disable-model-invocation: true`（不移动不删除）；备份 `SKILL.md.bak-20261001-2045-pre-disable`；清单 `~/.dsh/storages/agents-skills-triage.json`；脚本 `~/.dsh/tmp-probe/disable-agents-skills.py`。**重启后生效**。

## 验证 skill 是否真在 catalog 里
直接调 `skill_search`（工具），它返回的就是该进程的 catalog。比读文件可靠。
