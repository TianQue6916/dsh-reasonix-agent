---
id: "8a3b2174-3c30-4f0b-813a-10982866cba4"
title: "弱网下按需拉取 GitHub 大仓库：SSH 长流断点、partial clone + sparse-checkout 逐目录实测可行路径（2026-10-26）"
description: "在既有代理头根因之上再进一步：SSH 握手/小包全通但 ~100 MB 连续流必断，git fetch <blobsha> 在 partial clone 下被服务端拒绝，可行方案是 --filter=blob:none + sparse-checkout add 逐目录累加；含三条路径对照表、可复现命令与两个操作坑（set 是替换、timeout 杀 checkout 留 index.lock）。"
status: "active"
created_at: "2026-10-26T15:23:37.161Z"
updated_at: "2026-10-26T15:23:37.161Z"
content_hash: "74863e83a5f41e836dc4a75abe929e435d25dc7cb180d1d43af188b0727e48db"
source_paths:
  - ".dsh/PLAN.md"
session_ids:
  - "d1ab4d48-c826-4981-b883-3f4c22e1e5cb"
memory_body_ids:
  []
---

# 弱网按需拉取 GitHub 大仓库（2026-10-26 实测）

**性质**：故障分层定位（含对照组实验）+ 已验证的操作路径 + 已证伪的社区方案。
前置文档：`d2e14e8f-541d-4806-ae16-199a5560110c`（DevSidecar 注入 `DS-Proxy-Request` 头破坏 pack 流 → `invalid index-pack output`，以及 `insteadOf` 劫持到限流镜像的问题）。
本文接续它：把代理层排除后，**SSH 路径在长流传输上仍然断**，并给出当前唯一可用的按需拉取流程。

## 三条路径的分层结论

| 路径 | 现象 | 根因 |
|---|---|---|
| HTTPS + DevSidecar（默认配置） | `invalid index-pack output` | 代理追加的 `DS-Proxy-Request` 头破坏 upload-pack 的 pack 流 |
| HTTPS 直连（`-c http.proxy=`） | `Connection was reset` | 本机直连 GitHub 被干扰 |
| SSH（`insteadOf` 改写为 `git@github.com:`） | 握手与小包全通，**blob 阶段卡住** | **长流传输中途断**，与认证无关 |

## SSH 层四个对照实验（证明是「大流量」而非「仓库/认证」问题）

```
握手 10 次       10/10 成功
ls-remote        ✅ 拿到 HEAD + 2 个分支
小仓库 clone     ✅ octocat/Hello-World 完整
本仓库 tree      ✅ --filter=blob:none → 373 对象 / ~99.85 KiB
本仓库 blob      ❌ 卡住，30s timeout 只输出 78 行即终止
```

约 100 MB 的连续数据流（`reasonix` 50 M + `dsh` 19 M + `goat-gateway` 19 M + `reasonix-home` 8.7 M）在这条链路上撑不住。
判据：**短交互通、长流断**；对象数量与仓库完整性均可排除。

## 已验证可用：partial clone + sparse-checkout 逐目录累加

```bash
timeout 90 git clone --depth 1 --filter=blob:none --sparse git@github.com:<owner>/<repo> <dir>
timeout 90 git -C <dir> sparse-checkout add kb        # 注意是 add，不是 set
timeout 90 git -C <dir> sparse-checkout add agents
timeout 90 git -C <dir> checkout                      # 强制工作区与 sparse 模式同步
```

实测累积文件数与 `.git` 体积：`kb` 15 → `agents` 213 → `trae-cn` 227 → `trae-solo` 245 → `zcode-home` 262 文件，
`.git` 仅 4.3–4.9 M。小目录（`kb` 184 KB、`agents` 1.7 MB）稳定成功；单个几十 MB 的目录（`dsh`、`reasonix`）每次 checkout 仍需一次大 blob 拉取，会失败。

## 已证伪：`git fetch <blobsha>` 分批回填

社区流传的方案（`--filter=blob:none --depth=1` 拉 tree → `rev-list --objects --missing=print` 算缺失集合 → 每批 500 个 blob 回填）在本场景**走不通**：

```
timeout 100 git fetch origin $(head -200 /tmp/batch1.txt)
fatal: bad revision '<sha>'
error: <remote> did not send all necessary objects
剩余缺失 blob: 1574 → 1574（零回填，耗时 7s）
```

原因：partial clone 中服务端拒绝按 blob sha 单独发对象。该方案只在**非 filter 的普通 clone** 上成立，而那等于 blob 已经拉全，回到原点。
（社区来源对照：浅克隆/无内容克隆是第一有效手段；gentoo-scm 邮件列表指出单 pack 过大是致命点——按对象续传在「一次传一个巨型 pack」时没有可续的中间态。）

## 两个操作坑（这次踩到的，写进流程以免重犯）

1. **`git sparse-checkout set` 是替换不是累加**。用 for 循环对多个目录逐个 `set`，每次都清掉前一个，最后只剩最后 2 个文件，白拉三轮；累加必须用 `sparse-checkout add`。
2. **`timeout` 杀掉 `git checkout` 会留下 stale lock** `.git/index.lock`，后续每条 `add` 都报
   `Another git process seems to be running in this repository, or the lock file may be stale`。
   处理：确认无 git 进程后删除 `.git/index.lock`，并在多次 `add` 之间留 1–2s 让锁释放。

## 可选收尾方案（未执行，按代价排序）

- **缩小仓库**（优先）：`reasonix/`(50 M) 与 `reasonix-home/`(8.7 M) 属历史会话/缓存，本不该进 git；剔除后仓库 <20 MB，全量 clone 大概率可过，且这部分内容另有 `~/.dsh` 的 auto commit 备份。
- **换网络拉一次**：手机热点，或让 Linux 侧拉完后同步（Linux 到 GitHub 的 SSH 认证已通）。
- **接受按需拉**：需要哪个目录就 `sparse-checkout add` 哪个，小目录可靠，大目录看运气。

## 存疑

- 未验证 Linux 侧能否完整拉取大 blob（当时只确认 SSH 认证通过）。
- 单次大目录 checkout 的失败阈值（多少 MB 必断）未量化，只有「kb/agents 成、dsh/reasonix 败」两档观测。
