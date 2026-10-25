---
id: "fd45c9c9-17af-4373-8995-56698ec8abda"
title: "dsh/reasonix 知识库 dsh-reasonix-agent：仓库改名、kb 13 篇产物与两条未修断链（2026-10-26）"
description: "2026-10-26 工程记录：把 312 条 memory fact + 1473 行 PLAN.md 提炼成 13 篇 kb 并发布到改名后的 dsh-reasonix-agent 仓库；含 Git Data API 发布通道（curl，urllib 被本机 CA 链挡住）、改名同步清单，以及两条未修活故障（onnx 228MB 触发 GH001 使备份线断链、$RepoUrl/origin 仍旧名因 D: 对 Low IL 只读）。"
status: "active"
created_at: "2026-10-25T19:12:49.849Z"
updated_at: "2026-10-25T19:12:49.849Z"
content_hash: "f6d82d9da5feb77def26689bb9a0c09550a3a52d6df15fd71d9cd47659305386"
source_paths:
  - "_rx-kb/README.md"
  - "_rx-kb/_push.py"
  - "Desktop/工具箱/reasonix-ops/backup-to-github.ps1"
  - ".dsh/PLAN.md"
session_ids:
  - "58dc3755-d030-4aff-9aec-bdf0d5ad0113"
memory_body_ids:
  []
---

# dsh/reasonix 知识库发布与仓库改名（2026-10-26）

**性质**：一次性产出的工程知识库 + 发布通道落地 + 两条遗留故障的现场记录（含证据与修法）。相关既有文档：`37e02e35-130b-4cd7-8fd2-9aec17f1f11e`（GitHub 备份静默断链/junction/watchdog 体检）、`b454a116-f699-471b-982b-c57f31704689`（gitconfig insteadOf 劫持到限流镜像）。本文是不同事件，不重复它们的结论。

## 一、产物：kb/ 13 篇（远程已推送）

- 仓库：`TianQue6916/dsh-reasonix-agent`（public，`master`），本次提交 `7ae505275566`（短 `7ae5052`）；description + 8 个 topics 已写。
- 旧名 `TianQue6916/reasonix`：旧 HTTPS 实测 301 到新 URL，旧 SSH 仍可 `ls-remote` / push（GitHub 保留 redirect）。**redirect 不是契约**，旧名被他人注册即失效，且部分工具不跟随 SSH redirect。
- 素材来源：**312 条 memory fact + 1473 行 `PLAN.md`**（2026-06 → 10-26），不是回忆。9 篇由 8 个 subagent 并行提炼，各自做现场只读核对，暴露 40+ 条跨 fact 矛盾，全部落在各篇 `存疑` 段而不是被抹平。

篇目：`00-index`（三条阅读路径：新 agent 上岗 / 出故障 / 要动手改）、`01 方法论`、`02 配置面`、`03 工具技能`、`04 桌面端`、`05 上下文`、`06 记忆`、`07 网关`、`08 备份`、`09 Windows`、`10 否证档案`、`11 语言策略`、`12 工作流`。

统一结构（校验器按此判缺）：`## D 定论 → ## M 机制 → ## J 判据 → ## X 反例 → ## R 复现 → ## S 溯源`（S 段写 fact 文件名），篇末带 `存疑`。纪律：**不许把「最强嫌疑」写成结论**。

## 二、发布通道（可复用，因为常规通道被卡）

- 本地工作副本：`_rx-kb/`（`README.md` + `kb/` + `_push.py`），推完保留，便于按主题增量扩写。
- 推送方式：**GitHub Git Data API**（blobs → tree → commit → PATCH ref），用 `curl` 发请求。
- 为什么不用 python：本机 `urllib` 被 dev-sidecar 的 CA 链挡死 —— `CERTIFICATE_VERIFY_FAILED: certificate verify failed: Missing Authority Key Identifier`。
- `_push.py` 两处早期踩坑，均因 `GET /git/ref/heads/<branch>` 响应只有 `object:{sha,type,url}`：直接读 `base_commit["commit"]` / `base_commit["tree"]` 报 `KeyError`。修法是拿到 sha 后再 `GET /git/commits/<sha>` 取 `commit` 与 `tree`。
- 本地脱敏自检内建在脚本里：命中即 `exit 3`；本次 14 文件 0 命中。

## 三、改名后必须同步的位置（漏一处 = 下次静默断链）

| # | 位置 | 本次状态 |
|---|---|---|
| 1 | `backup-to-github.ps1` 的 `$RepoUrl`（第 31 行）与头部注释（第 4 行） | 未改：D 盘对本机 agent 只读（Low IL），需人工或提权 shell |
| 2 | 本地检出 `repo/` 的 `git remote set-url origin` | 同上（`.git/config` 不可写） |
| 3 | `reasonix/memory/global/*.md` 中提到旧 URL 的 fact | 保留原样（当时的事实） |

解除阻塞的一条 UAC（作为待用户拍板的选项，副作用是把该目录对低完整性进程也变可写）：
`icacls D:\Desktop\工具箱\reasonix-ops\repo /setintegritylevel (OI)(CI)Low`。

## 四、两条未修活故障（都不是本次改动造成，但都必须记账）

**1. 备份线当前是断的（GH001 文件过大）**
- `2026-10-25 23:33` 的 push 被 GitHub 以 **GH001** 拒绝：`dsh/speech-to-text/sensevoice/models/sensevoice-onnx/model.int8.onnx`（**228.15 MB**）已进入 index；本地 `master` 因此**领先 `origin/master` 3 个 commit**。
- 修法（**不要用 LFS**）：把 `*.onnx` 加进排除清单（`$XF` / `.gitignore`），`git rm --cached` 该文件，再 push。
- 同类盲区：字节层全扫有 **40 MB 跳过上限**，看门狗只报 `UNPUSHED` 不报原因 ⇒ 只看状态字会误判「备份正常」。

**2. 改名同步未完成**（见第三节表格 1、2 行；根因是本机 bash tool 固定 Low IL，而 `C:\Users\27063\Desktop` 是 `D:\Desktop` 的 junction，整个 D: 只读）。

## 五、已知缺口与校验噪音

- `~/.dsh/sessions/**`（291 MB / 1448 个 zstd）**未纳入**知识库，仅在 `00-index` 明确记账，留作按主题扩写时的增量素材。
- 结构校验器报：`README.md` 缺六段标题（README 非 kb 篇，属规则外）；`kb/12-workflow-and-teaching.md` 代码围栏数为奇数（已修 1 处，剩余 2，属 ``` 与 ```bash 混排的计数口径问题，不影响渲染）。
- 每篇体量与总账：14 文件 / 184.6 KB；`kb/` 13 篇最大为 `07-model-gateway.md`（43.7 KB）、`03-tools-and-skills.md`（33.4 KB）、`12`（30.4 KB）。

## 六、沿用判据

- 判断「发布成功」：远端 `git ls-remote` HEAD == 本地新 commit sha，且 GitHub API `refs/heads/master` 的 object sha 一致（本次 `7ae5052…`，本地与远端双证）。
- 判断「备份还活着」：不能只看服务状态或 `UNPUSHED` 字样，要区分「任务跑了」与「push 被服务端拒了」；拒因必须从 GitHub 响应码取（GH001 = 单文件超限）。
