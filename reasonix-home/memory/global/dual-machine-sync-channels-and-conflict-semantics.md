---
id: mem-fdeea51baf47f6a8f9ff012a78d148c6
revision: 3
created_at: "2026-09-30T13:53:52.749Z"
updated_at: "2026-10-01T06:22:24.726Z"
name: dual-machine-sync-channels-and-conflict-semantics
description: "双机同步通道 + skills 结构治本（含两个并发 actor 的事故与教训：rmtree 会穿透 junction 删除目标内容）"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 通道分工（2026-10-01 更新）

| 根目录 | 同步器 | 现状 |
|---|---|---|
| `~/.reasonix`（memory / projects / archive / sessions / global-workspace / mind-transcripts / skills） | `~/.reasonix/global-workspace/sync/sync_reasonix.py`（Linux 侧 paramiko 连 Windows `100.84.67.49`） | ⚠️ **cron 已停用**（2026-09-30），只有手动 `--sync` 才跑 |
| `~/.dsh` | `~/.dsh/storages/tools/sync_dsh.py` | 新主力通道；**已排除 `skills`**（2026-10-01），避免与 skills 专线重叠 |

## 🚨 事故教训：`shutil.rmtree` 会**穿透 junction 删除目标目录内容**

2026-10-01 实测（Windows）：把 `~/.reasonix/skills` 变成指向 `AppData\Roaming\reasonix\skills` 的 junction 后，另一个会话的脚本按「真实目录」处理该路径，执行 `shutil.rmtree(~/.reasonix/skills)`：
- 抛 `OSError: Cannot call rmtree on a symbolic link`（**在删完之后才抛**）
- 实际后果：**junction 目标（Roaming）里的文件被删光**——80 个技能目录变空、`SKILL.md` 归零
- 靠 copytree 预备份逐字节恢复；事后完整性检查确认无空壳、无过小文件

**规则**：
1. **Windows 下不要对可能是 junction/symlink 的路径做递归删除**（rmtree / `rm -rf` / `Remove-Item -Recurse`）。先 `Get-Item -Force` 看 `LinkType`；是链接就只删链接本身。
2. **同一批目录上不要跑两个 actor**。本次两个会话分别把「真源」定在两端（我把 `.dsh/skills` 指向 Roaming；另一会话把 `.dsh/skills` 当 canonical 并镜像到 `.reasonix/skills`），互不知情 → 差点数据丢失。
3. 结构改动前**先做整目录备份**，并在改动后立刻跑一次「每个技能目录是否有 SKILL.md、大小是否 >50B」的完整性检查。

## skills 结构现状（2026-10-01 14:22，混合了两个 actor 的结果）

| 位置 | 形态 | 说明 |
|---|---|---|
| Windows `AppData\Roaming\reasonix\skills` | **真实目录（实质真源）** | 98 顶层项 / 78 SKILL.md |
| Windows `C:\Users\27063\.dsh\skills` | **Junction → Roaming** | 原 79 个 junction 存于 `skills.junctions-legacy-20261001` |
| Windows `C:\Users\27063\.reasonix\skills` | **真实目录**（被另一会话还原；内容 = Roaming 的镜像） | 我建的 junction 被该会话删除；原目录存于 `skills.legacy-20261001` |
| Linux `~/.reasonix/skills` | **真源** | 78 SKILL.md |
| Linux `~/.dsh/skills` | **symlink → `~/.reasonix/skills`** | 原来是空真实目录（Linux dsh 因此看不到技能） |

- 噪声归档：`.trace-archive/`（110 文件）已建于 Roaming 与 `.reasonix/skills`，**移动而非删除**（由另一会话的 `~/.dsh/storages/tools/skill-root-consolidate.py` 完成；该脚本还负责 triage）。
- ⏳ **待用户拍板**：真源定 Roaming 还是 `.reasonix/skills`，然后**只让一个 actor** 收口（把另一处改成 junction 指过去）。

## 冲突语义（两个同步脚本一字相同）
- 同名且 **size 不同** → 双方主文件都不动，各存对方版本为 `<name>.conflict.<对方host>.<md5前10>.bak`。
- 同名且 **size 相同** → 判 same（**不比内容**）⇒ **等长改动不传播**。
- 仅一方有 → 向另一方补齐 ⇒ **删除/停用/改名必须两端同时做**，否则被补齐退回。
- 判新旧**只能**「剥 frontmatter 比正文」；`mtime`（=同步落盘时间）/`revision`/行数全不可靠。

## 手工对齐流程
```bash
ssh tianque 'cd ~/.reasonix/skills && find . -name SKILL.md | sort | while read f; do printf "%s  %s\n" "$(sha256sum "$f" | cut -c1-16)" "${f#./}"; done' > lin.lst
( cd "C:/Users/27063/AppData/Roaming/reasonix/skills" && find . -name SKILL.md | sort | while read f; do printf "%s  %s\n" "$(sha256sum "$f" | cut -c1-16)" "${f#./}"; done ) > win.lst
# 用 python 比对（清单放 ~/skilldiff/：bash 的 /tmp 与 Windows python 的 /tmp 解析不同）
# 纯「多一行 disable-model-invocation」差异可直接推；其它须人工裁决
```
- Windows 侧 key 免密：`ssh tianque`（`192.168.1.13` / Tailscale `100.79.96.82`）。
- 备份位置：`~/sync-backup-20261001-1407/`、`~/sync-backup-20261001-1422/`、Linux `~/sync-backup-linux-20261001-1422.tar.gz`。

## 2026-10-01 内容成果（verified 三端 78/78 SKILL.md hash 一致）
- `bilingual-ocw-translator` **v3.7**：v3.6 底座 + progressive disclosure（主文档 697 行 + `references/` 8 文件），铁律 26 条全在。
- **13 个技能文件两侧分叉已合并**：`dsh-gate`（→v2.5.0，合并 -AlwaysRetry + --async/--no-notify 铁律）、`dsh-mode`（→v1.4.0，合并 0.1.5 档案 + 09-11 实测节）、`subtitleedit`（取 GOAT 版 + 补 DSH 钩子节）；`aigc-master`/`course-summarizer`/`docx`/`pdf`/`skill-creator` 取 Linux 超集；`control-main-machine`/`learning-method`/`reasonix-power-user`/`tool-offline-wiki`/`tool-pocketwiki` 以 Linux 为骨架合并。
- 🔐 `control-main-machine` 的 Windows 版含 **3 处明文密码**（SSH + RustDesk），已采用脱敏版（凭据指向全局记忆 `windows-main-machine-full`），残留 = 0。
- 🔧 5 个技能里的 `dsh-remote -pro` 旧口径订正为 `-m deepseek-v4.1-flash -e max`（pro 2026-09-10 已弃用）。
- 📌 技能 **triage 是单侧动作**：14:13 有 46 个技能被加 `disable-model-invocation: true`（当时只在 Windows 侧），已把 44 个纯差异文件同步到 Linux。**以后每次 triage 后都要再对齐一次。**
