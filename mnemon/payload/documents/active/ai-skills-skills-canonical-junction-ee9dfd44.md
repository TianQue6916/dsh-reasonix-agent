---
id: "ee9dfd44-3279-416c-8eb5-096b9b4c1f33"
title: "技能真源独立化:~/ai-skills 架构、skills-canonical 维护流程与 junction 递归删除事故"
description: "2026-10-01 用户拍板把技能真源独立为 ~/ai-skills(不复用任何 harness 目录),三处消费入口用 junction/symlink 指向它,Roaming 仅作单向镜像;含 skills-canonical.py 的 mirror/push/pull/prune-linux 流程、验收口径、rmtree 穿透 junction 删数据的根因与铁律、回滚点与仍被外部写入的遗留风险。"
status: "active"
created_at: "2026-10-01T06:34:10.702Z"
updated_at: "2026-10-01T06:34:10.702Z"
content_hash: "b57975a71ce5be14398267e47d36fcf503e57d3a1274eabcfedfd235beccf5e1"
source_paths:
  - ".dsh/storages/tools/skills-canonical.py"
  - ".dsh/storages/tools/skill-root-consolidate.py"
  - ".dsh/storages/tools/sync_dsh.py"
  - ".reasonix/global-workspace/sync/sync_reasonix.py"
session_ids:
  - "e0e53523-529f-4aa0-828c-385aece4d42b"
memory_body_ids:
  []
---

# 技能真源独立化:~/ai-skills(2026-10-01)

状态:Windows + Linux 双侧结构已落定并验收通过;Roaming 侧仍被未知进程写入(已隔离,不污染真源)。

相关文档:技能内容层的收敛过程见 `a7db1165-9b9d-49e9-9935-d79b5654167f`(bilingual-ocw-translator v3.7 三端收敛与同步根因)。本文只记录**结构层**的决策与操作流程。

## 1. 用户拍板的决策(直接改变方案)

原方案是复用现成目录当真源(先 Roaming,后 `.reasonix/skills`)。用户在关键时刻给出指令:

> 「你完全可以新建一个源，而不是复用，复用可能会被影响」

随后只读探测证实了这个判断:

| 候选真源 | 探测结果 |
|---|---|
| `AppData\Roaming\reasonix\skills` | **不能改名**(`Access to the path ... is denied`,被进程占用);探针期间顶层项 98 → 100,`skill-creator/SKILL.md` 被外部改写 |
| `.reasonix\skills` | 另一个会话的 `skill-root-consolidate.py` 把它当 canonical 做**反向**镜像(方向与本方案相反) |
| `.dsh\skills` | 被 dsh 的 skill watcher 读取,属于写入/消费路径 |

结论:**三者都不适合当真源**,新建独立目录,使它不在任何 harness 的写入路径上。

## 2. 最终结构

| 角色 | Windows | Linux | 形态 |
|---|---|---|---|
| **真源(唯一可写)** | `C:\Users\27063\ai-skills` | `/home/tianque/ai-skills` | 真实目录,97 顶层项 / 172 文件 / 78 SKILL.md / 零噪声 |
| 入口(dsh 读) | `.dsh\skills` → Junction | `~/.dsh/skills` → symlink | 指向真源 |
| 入口(Reasonix CLI/legacy 读) | `.reasonix\skills` → Junction | `~/.reasonix/skills` → symlink | 指向真源 |
| 镜像(Desktop 占用) | `AppData\Roaming\reasonix\skills` | — | 真实目录,由 `--mirror` **单向**跟随(只覆盖/新增,不删) |

要点:入口是链接而非复制,dsh 读的 `.dsh/skills` 与 Desktop 读的 Roaming 不再可能各自分叉;真源独立后,上述进程怎么动都影响不到它。

## 3. 维护工具与流程

`~/.dsh/storages/tools/skills-canonical.py`(在 Windows 侧执行):

```bash
python ~/.dsh/storages/tools/skills-canonical.py --verify        # 只读验收
python ~/.dsh/storages/tools/skills-canonical.py --mirror        # 真源 → Roaming(只覆盖/新增,不删)
python ~/.dsh/storages/tools/skills-canonical.py --push          # 真源 → Linux 真源
python ~/.dsh/storages/tools/skills-canonical.py --pull          # Linux 真源 → 真源
python ~/.dsh/storages/tools/skills-canonical.py --prune-linux   # Linux 多余项移出(移动不删)
```

改技能的规矩:**只改 `~/ai-skills`**,然后 `--push` + `--mirror`,最后 `--verify` 看到「三方全部一致」。

验收输出(健康态):

```
真源 C:\Users\27063\ai-skills : 172 文件, 97 顶层项
完整性: ✅ 每个技能目录都有可用 SKILL.md
真源(172)  .dsh\skills(172)          ✅ 一致
真源(172)  .reasonix\skills(172)     ✅ 一致
真源(172)  Linux 真源(172)            ✅ 一致
真源       Roaming(304)              ✅ 已镜像
✅ 三方全部一致
```

脚本实现的坑:`--push` 只覆盖不新增删除,所以 Linux 侧残留需要 `--prune-linux`(移出到 `~/ai-skills-pruned-<ts>`,不删);完整性判定要排除已停用/无 SKILL.md 的库目录(如 `bilingual-translator`、`ocw-lecture-translator` 为停用项),否则 `--verify` 会常报警告。另外写脚本时 docstring 里的 Windows 路径反斜杠会被 heredoc 吃成转义序列(`SyntaxError: truncated \UXXXXXXXX escape`),需加 `r` 前缀(raw string)。

## 4. 事故与铁律:rmtree 穿透 junction

**根因链**:本方案最初把 `.reasonix/skills` 改成指向 Roaming 的 junction → 另一个会话正在跑它的 `skill-root-consolidate.py`(方向相反),按「真实目录」处理该路径并执行 `shutil.rmtree(~/.reasonix/skills)` → Windows 下 **rmtree 穿透 junction,删的是目标目录的内容**。

关键细节:**报错信息是 `Cannot call rmtree on a symbolic link`,但文件已经删完了才抛**。实际后果:80 个技能目录变空、`SKILL.md` 归零;因为该脚本先跑过 copytree 备份,内容已逐字节恢复,三端 78/78 SKILL.md hash 一致,零内容损失。

铁律(已入 memory):
- **绝不对可能是 junction/symlink 的路径做递归删除**;动手前先看 `Get-Item -Force` 的 `LinkType`。
- **删链接只用 `cmd /c rmdir <path>`**(只删链接,不穿透),删完立刻验证目标目录内容完好。

那个会话留下的 `skill-root-consolidate.py` 采用「不做 rmtree、逐文件复制覆盖」的镜像策略,理由正是上述事故——但它与独立真源方案仍然方向相反,故不再参与 skills 结构。

## 5. 防污染链路(已修)

- `sync_reasonix.py` 移除 `('skills','skills')` 同步对(Windows 改后同步到 Linux 脚本,两侧语法 OK),避免把 Roaming 噪声灌进真源。
- `sync_dsh.py` 早先已排除 `skills`。
- `.trace-archive` 等噪声(`.bak` / `.conflict.*`,110 个文件)由另一会话**移动**归档,不进真源。
- `ai-vibe-writing-skills` 判定为空壳(只有 `.git`、无工作区文件、无 remote、无 SKILL.md),**移动**(非删除)到 `~/skill-shells-backup/`。

## 6. 回滚点

`~/sync-backup-20261001-1407|1422|1429|1430/`(含 Roaming 与 `.reasonix` 的 tar;Linux `~/sync-backup-linux-20261001-1422.tar.gz`)、`~/skill-shells-backup/`、`~/ai-skills-pruned-20261001-1431/`、`.reasonix/skills.legacy-20261001`、`.reasonix/skills.mirror-legacy-20261001-1430`、`.dsh/skills.roaming-junction-legacy-20261001-1430`、Linux `~/.reasonix/skills.mirror-legacy-20261001-1431`。

## 7. 遗留风险(未根治)

Roaming 仍被未知进程写(8 分钟内 +2 顶层项、改过 `skill-creator/SKILL.md`)。真源已隔离不受影响,但若该进程改写 `Roaming\<skill>\SKILL.md`,Desktop 会短暂读到被改版本;跑一次 `--verify` + `--mirror` 即可覆盖回来。根治需定位该进程(疑似另一会话或自动化任务),让它停手或改成读真源。同样地,**同一批目录同时存在多个 actor、方向相反**是这次事故的元凶:结构变更应收口到单一 actor。
