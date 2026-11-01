---
id: "9b946245-989a-40ea-ad41-9fc6aa953d0c"
title: "删除文件不减 Git 历史 pack：cb70ace 瘦身实测与「为何放弃 filter-repo」判据（2026-10-26）"
description: "dsh-reasonix-agent 仓库瘦身的实测记录：git rm --cached 剔除 1450 个文件（3178→1728，commit cb70ace，push 成功）但全量 clone 依旧 0 文件，根因是历史 blob 仍在且 --depth 1 只限 commit 数；含「必须 filter-repo + GitHub Support 做远端 GC 才可能真变小」的社区证据链、放弃重写历史转用 partial clone 的判据、以及可复现命令与存疑项。"
status: "active"
created_at: "2026-10-26T15:48:24.399Z"
updated_at: "2026-10-26T15:48:24.399Z"
content_hash: "280d70b9e7ab3a9d1661f3f93ddfdd77bf58811138e4ae6655e7e6b8a20d3927"
source_paths:
  - ".dsh/PLAN.md"
  - "_sp"
session_ids:
  - "19d8cd3c-e4af-4ed4-b9c6-8cde101d6a2f"
memory_body_ids:
  []
---

# Git 仓库瘦身实测：删文件不减小 pack，以及为什么没走 filter-repo

> 关联文档：`8a3b2174-3c30-4f0b-813a-10982866cba4`（弱网下按需拉取 GitHub 大仓库：partial clone + sparse-checkout 逐目录实测可行路径）——本文只补「删文件为何无效 / 要不要重写历史」这一层，按需读仓库的具体操作以那篇为准。
> 关联文档：`37e02e35-130b-4cd7-8fd2-9aec17f1f11e`（GitHub 每日备份静默断链）——其体检结论里同样记有 ~/.dsh 的 `.git` 死重量问题。

## D 定论

1. **`git rm` / `git rm --cached` 只让「未来的 tree」变小，不影响既有历史 blob**。仓库可 clone 的体积由历史全部对象决定，所以剔除文件后 `du -sh .git` 与全量 clone 成功率都可能毫无变化。
2. **`--depth 1` 限制的是 commit 数，不是 blob 数**。浅克隆仍要一次性传完最新 tree 指向的全部文件内容，因此「仓库大」这一维度上浅克隆不解决问题。
3. **本地 filter-repo/BFG + force push 只改 ref 指向**；GitHub 存储层里的旧对象需 GitHub Support 做 prune/GC 才释放。这就是「rewrite 了历史但 GitHub 上仓库大小没变」这类抱怨的成因。
4. **是否「能 clone 成功」是传输时长与链路稳定性的函数，不是仓库大小的固定阈值**。社区有 12 MB 仓库在慢链路上因默认 60s timeout 失败的案例。
5. **本次决策：不做 filter-repo**。理由是第 3 条——即使重写成功 + force push，远端不 GC 则等于白干，还要赔上历史 hash 全改、可能损坏仓库、其他 clone 冲突的代价。替代方案是继续用 partial clone 按需读。

## M 机制（为什么删了还在）

Git 不是存差异，而是每个 commit 指向一整棵文件树快照；blob 被历史中任一 tree 引用即保留在 pack 里。删除操作产生的是「新快照里没有它」，旧快照仍引用它。

## J 判据

- 判断「删文件有没有用」：看重新全量 clone 的文件数 / `.git` 体积，而不是看 `git status` 里少了多少文件。
- 判断「要不要重写历史」：先确认能否接受 (a) 全部 commit hash 变化、(b) `git push --force`、(c) 其他已有 clone 冲突、(d) 远端仍需 Support GC。任一条不可接受即放弃，改走 partial clone。
- 判断「按需读够不够」：若真实需求只是「未来的模型能读到 kb/ 与经验库」，`--filter=blob:none` + `sparse-checkout add <dir>` 已够用，无需动历史。

## R 复现（本次实际执行）

```bash
# 1) 逐条剔除（--cached 保留本地工作区不动）
git rm --cached -r <dir> ...
# 待删 1450 个 / 总文件 3178 → 保留 1728

# 2) 提交并推送（小对象，能过）
git commit -m "chore: 剔除 1450 个重复/运行期文件"
git push origin master          # ba8d1ff..cb70ace  ✅ 退出码 0

# 3) 验证——这一步才是真相
git clone --depth 1 git@github.com:TianQue6916/dsh-reasonix-agent _verify
# 文件数: 0  ← 仍然失败
```

剔除依据是 tree 路径比对得出的硬数字，不是目测：`reasonix-home/memory` 与 `reasonix/memory` 369 个路径 100% 相同；`reasonix-home/skills` 与 `reasonix/skills` 201/204 相同；三份遗留备份（`memory-merge-backup-*` / `skills.mirror-legacy-*` / `skills.legacy-*`）497 文件；运行期目录（`sessions` 53 MB / `desktop-shell` / `desktop` / `stats`）382 文件。

**注意**：1978 行 PLAN 之外的坑——`git rm --cached` 在 sparse 模式下会提示 `hint: * Use the --sparse option`，第一次执行报「暂存区: 0 个待删」看似无效，实际需配合 `--sparse` 或先 `git sparse-checkout disable`。

## X 反例

- ❌「删掉大文件再 commit 一次，仓库就小了」——`du -sh .git` 数字不动。
- ❌「`--depth 1` 能绕过大 pack」——限制的是 commit 深度。
- ❌「本地 rewrite + force push 后 GitHub 上就变小了」——远端对象仍在，需 Support GC。
- ❌ 把「本机 SSH 认证成功（`Hi <user>!`）」当成「传输路径更稳」的证据：本次就因此误判过一次（同一出口的两台机器网络路径无本质差别），已收回该结论。

## 存疑

- 剩余 1728 个文件里究竟是哪个/哪些对象撑爆传输，未逐 blob 定位（只有「clone 文件数 0」这一观测）。
- GitHub 端 prune 的实际触发条件、是否对普通用户开放工单，未实测。
- 单次传输失败阈值（多少 MB 必断）仍未量化，仅有「kb/agents 成、dsh/reasonix 败」两档观测（与 8a3b2174 一致）。

## S 溯源

- 社区证据：[华为云博客：Git 里删了大文件，仓库还是那么大](https://bbs.huaweicloud.com/blogs/500974)、[KodeKloud：Purge Data from Source Control](https://notes.kodekloud.com/docs/AZ-400-Designing-and-Implementing-Microsoft-DevOps-Solutions/Configuring-and-Managing-Repositories/Purge-Data-from-Source-Control/page)、[falkcorp 仓库体积重写计划](https://github.com/falkcorp/audiobook-organizer/blob/c7e2068cd66994e422f22c48a26a1f2c11734d2d/docs/plans/2026-07-10-repo-size-history-rewrite-plan.md)（明确写出 prune 是 "a GitHub Support operation"）、[nvim-lua/plenary.nvim#160](https://github.com/nvim-lua/plenary.nvim/issues/160)（12 MB 也可能超时）。
- 实测环境：`C:\Users\27063`，远端 `github.com:TianQue6916/dsh-reasonix-agent`，partial clone 工作副本 `C:\Users\27063\_sp`（262 文件 / `.git` 4.9 MB）。
