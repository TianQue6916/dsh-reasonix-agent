---
id: "85170571-414b-4b3c-bc68-f2be7ff00363"
title: "备份 repo「push 每天失败」根因：robocopy 源端污染闭环 + 228MB ONNX 双仓库污染（2026-11-01 修复）"
description: "dsh-reasonix-agent 备份仓库自 2026-10-26 起每天 non-fast-forward 的完整根因与修复：robocopy /MIR 忠实镜像源端运行期文件（plans/tmp*/journal/skills/memory）导致本地永远比远端多几千文件；修法是改 backup-to-github.ps1 的源端排除规则而非 robocopy 开关。含排除项清单与计数依据、bundle 安全网 + reflog expire/gc（762→537MB）、228MB sensevoice ONNX 同时污染 ~/.dsh 自身 .git 并已 gitignore + rm --cached、剩余 filter-repo 瘦身决策、未查清的 rc=11。关联 9b946245（cb70ace 瘦身与放弃 filter-repo 判据）。"
status: "active"
created_at: "2026-10-31T16:49:03.317Z"
updated_at: "2026-10-31T16:49:03.317Z"
content_hash: "be392fcd20f10badf289c7a0806e2c61da09517ad01625111fd71ac6f6253d94"
source_paths:
  - ".dsh/PLAN.md"
  - ".dsh/PLAN.d/machine-env/backup-repo-20261101.md"
  - ".dsh/.gitignore"
  - ".dsh/plans/session-3315a426-b9aa-40c1-827c-817e18914498.md"
session_ids:
  - "96ab9180-98e4-4c89-a0a1-a868204ad6c0"
memory_body_ids:
  []
---

# 备份 repo「push 每天失败」根因与修复（2026-11-01）

> 关联文档：`9b946245-989a-40ea-ad41-9fc6aa953d0c`（2026-10-26 cb70ace 瘦身实测 + 当时「为何放弃 filter-repo」的判据）。
> 本文与那篇的关系：那篇的结论是「删文件不减 pack，重写历史才可能真变小，故当时不走 filter-repo」；
> 本次把 **push 失败** 这个更靠前的问题单独解决了，并把 filter-repo 重新变回一个待拍板的选项。

## 症状

`dsh-reasonix-agent` 备份仓库从 2026-10-26 起 **每天 push 都 non-fast-forward 失败**，但前端日志只报一句笼统错误；
本地工作区文件数（3662）远多于远端（1728）。

## 根因（关键，容易误判）

**不是 robocopy 的问题，是源端本来就有运行期文件。**

- `backup-to-github.ps1` 用 `robocopy /MIR` 把 `~/.dsh`、`~/.reasonix` 等镜像进备份仓库。
- `/MIR` 会忠实复制并**删除**目标端独有文件 —— 行为正确，问题在输入。
- cb70ace（10-26）已把 `plans/` `tmp*/` `journal/` `memory/` `skills/` 等从远端删除，
  但源端 `~/.dsh` 里这些文件仍每天被会话生成 ⇒ **robocopy 每天把它们搬回来** ⇒ 本地比远端多 1934 个文件 ⇒ push 必然失败。

社区经验里常被推荐的两条**都不解决本例**：
- `robocopy` 的 `/XX`（exclude extra）只影响「是否删目标端独有文件」，本例是 **源端**多余，无关。
- 单改 robocopy 参数无效，**必须改脚本里的源端排除规则**。

## 修法：改 `backup-to-github.ps1` 的 `XD` / `XF` 列表

脚本位置：`D:\Desktop\工具箱\reasonix-ops\backup-to-github.ps1`（注意路径含中文与反斜杠，**在 Python heredoc 里要按 raw string 处理**，
否则 `\D`、`\b` 被当转义序列 —— 本次就因此把 `D:\...\backup\pre-*.bundle` 写成了 `D:\...\easonix-opsackup`）。

| target | 新增排除项 |
|---|---|
| `dsh` | `tmp` `tmp_cover` `tmp_mackay` `plans` `PLAN.d` `journal` `speech-to-text` `.backup` `scratch` |
| `reasonix-home` | `memory` `skills` `skills.mirror-legacy-*` `skills.legacy-*` `memory-merge-backup-*` |

`reasonix-home` 那 5 项不是猜的，是**对着 cb70ace 实际删除清单反推**：`memory` 248 + `skills` 198 + 两份 legacy mirror 各 145 + 一份 merge-backup 94 = **830 个文件**，
正好是 robocopy 每天搬回来的那批。canonical 副本分别在 `~/.mnemon` 和 `~/.dsh/skills`，备份里再存一份纯属重复。

改完还需两步收尾：
1. `git reset --hard origin/master`，让本地工作区与远端对齐（3662 → 1728 文件）。
2. 逐次跑备份脚本验证：`兜底校验通过：无残留密钥` → `已提交` → `已推送到 GitHub`。

## 顺手堵的第二个洞：228 MB ONNX 同时污染两个仓库

历史最大 blob：

```
228.2 MB  dsh/speech-to-text/sensevoice/models/sensevoice-onnx/model.int8.onnx
 50.9 MB  dsh/.backup/dsh-0.1.0-rc.6.tar.zst
 16.2 MB  mnemon/payload/data/default/mnemon.db（另有 5 个 11.9 MB 旧版本）
  9.7 MB  dsh/scratch/me.jsonl
  5.5 MB  dsh/tools/f_win2.json
  5.2 MB  dsh/tools/formulas-win.json
```

那个 ONNX 权重（228 MB）**同时进了备份仓库和 `~/.dsh` 自己的 `.git`**（后者 346 MB，其中 228 MB 就是它）。
处置：`~/.dsh/.gitignore` 加 `speech-to-text/`，再 `git rm -r --cached`（**工作区文件保留，只是不再跟踪**）。
判据：ONNX 权重是二进制资产不是配置，不该进任何 git。

## 体积与安全网

- `git bundle create` 打快照：`backup/pre-cleanup-20261101-0035.bundle`，537 MB，`git bundle verify` 报 `records a complete history`，
  含全部 ref（`backup-master-pre-rebase`、`master`、`origin/*`、`tags/bak-pre-gh001-fix`）。
- `reflog expire --expire=now --all` + `git gc --prune=now`：`.git` **762 MB → 537 MB**，reflog 归零，`size-pack: 535.82 MiB`。
- 删本地备份分支前先确认 bundle 已含该 ref，再 `branch -D`。

## 仍待决策

- 537 MB 里 228 MB 是**历史里**的 ONNX，本次只做到「不再加新的」。要压到几十 MB 只剩
  `git filter-repo --strip-blobs-bigger-than 10M` + force push（重写全部 commit hash，`origin/mnemon-sync` 也要一并处理）。
  已知风险：之后任何指向旧 hash 的引用失效；本机单机 + bundle 在，风险可控。
- GitHub 推荐 <1 GB、硬限 5 GB，537 MB 可用但 clone 慢。
- **未查清**：备份日志有 `robocopy 失败 rc=11: dsh`。`rc=11` = 位标志 `1+2+8`（复制成功 + 有额外文件 + **有一个失败项**）。
  后续 commit/push 均成功故不致命，但失败项本身没定位，猜测是 `~/.dsh` 内有文件正被运行中的会话写入。

## 教训

1. 排除规则的**依据要来自实际删除清单的计数**（830 个），不要凭「看起来像运行期文件」拍脑袋 —— 否则既漏又滥。
2. 磁盘上的「体检报告」比日志更可信：`git count-objects -vH`、`reflog expire` 前后对比、`git verify-pack` 排最大 blob，
   比读脚本的 if/else 快且不会骗人。
3. 同一份大二进制常被**多处**引用（示例里一次就横跨两个仓库），修一处不代表修完。
