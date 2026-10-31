# PLAN

> 本文件 = 铁律 + relay 状态 + 当前目标 + 分卷索引 + 已知未决。具体任务线在 `PLAN.d/`。
> **不参与自动注入**：plan-anchor 已改为注入 `plans/<session-id>.md`（per-session），本文件只在会话内按需 read。

## ⚠️ 铁律（2026-10-06 用户明确要求，最高优先级）

**每条 shell 命令都必须设时限，超时就自己停。** 原话：「以后每次都给命令设下时限,超过就自己ting」。

- 所有命令前置 `timeout <秒>`：默认 **30–60s**，重活最多 **120s**
- **禁止**无上限的长任务：大文件 robocopy、全盘扫描、大目录递归、无界轮询
- 长任务必须拆片 / 后台化 / 先估算规模再决定
- 触发事件：robocopy 搬 6.9 GB 桌面跑了 **410 秒**不返回，用户两次批评「你又卡死了」

---

<!-- RELAY:BEGIN —— 由 Linux 侧自动维护（`relay plansync`），手改会被覆盖 -->
## relay 待办 · `C:\relay`（每 turn 必查）

- 未读 **1** 条，在 `C:\relay\lin2win\0-inbox\`
  - `20261031T153859Z-0001-lin-verify-four-items`
- 流程：读 → `1-wip\` → 完成 `2-done\`（放弃 `3-dead\` + 理由）
- 协议 `C:\relay\README.md`｜状态板 `C:\relay\STATE.md`（只改 `## WIN` 段）
- 回话：写 `C:\relay\win2lin\0-inbox\<UTC时间>-0001-<slug>.md`，UTF-8 **无 BOM**、LF（R1：`lin2win\` 只有 Linux 写）
<!-- RELAY:END -->

## 当前目标

把 dsh 打磨成能长期跑的主力 harness：目标每步可见 + 思考链中文 + 工具/技能集干净可审计。


## 任务目录索引

> **一个任务一个目录**：`PLAN.d/<task>/PLAN.md` = 计划列表，`PLAN.d/<task>/archive.md` = 原始档案（verbatim）。
> plan-anchor 已改为注入 `plans/<session-id>.md`（per-session），本文件不再自动注入。

| 任务目录 | 状态 | 目标 | 档案 |
|---|---|---|---|
| [`translate/`](translate/PLAN.md) | **在跑** | **翻译工程** — OCW 四本教材（Boyd 凸优化 / Boyd 答案手册 / MacKay 信息论 / 6042J 离散数学）译中文 + KaTeX 真渲染校验 + 批量派发 | 87,074 B |
| [`rules-tools/`](rules-tools/PLAN.md) | 长期有效 | **长期规则与工具经验** — 实现语言策略方案 A、compress 用法、技能 v4.3、goat-gateway、cache hit 退化、并发上限、用量视图 | 45,798 B |
| [`machine-env/`](machine-env/PLAN.md) | 已落地 | **机器与环境** — 备份线 / BIOS 冷启动 / pwsh 终端 / GitHub 改名 / D 盘 IL / 双机资产审计 | 27,488 B |
| [`dsh-client-icon/`](dsh-client-icon/PLAN.md) | 已修 | **desktop 客户端问题** — 白纸图标 4 段演进 + 「对话」白屏 + renderer 崩溃 | 29,214 B |
| [`dsh-file-write/`](dsh-file-write/PLAN.md) | 已修 | **dsh 工具写盘排查** — D 盘写入被拒的完整排查记录（留作方法论） | 100,641 B |
| [`dsh-remote/`](dsh-remote/PLAN.md) | 已落地 | **Linux→Windows 远程化** — 双系统 dsh 远程化与隧道验证 | 3,014 B |
| [`dsh-roadmap/`](dsh-roadmap/PLAN.md) | 待办 | **dsh 升级路线图** — Windows 升级路线图 / headroom / thinking-guard / 三项定论 / 待办总账 | 28,182 B |

## 已知未决
- **Linux 侧 `~/goat-gateway/gateway.mjs` 未打 reasoning-echo-filter 补丁**（它还是 1642 行的另一个版本，tail 补丁已单独打在其行 1101）：
  Linux 的 dsh 出口同样走本机 `127.0.0.1:8788/v1` ⇒ 在打上之前，Linux 上的 dsh 会话仍会被 reasoning 回灌锁住语言。
  补法：`python ~/.dsh/storages/tools/patch-gateway-reasoning-filter.py --file ~/goat-gateway/gateway.mjs`（锚点是 `function forward(` 与 `// bodylog-end`，
  **Linux 版没有 bodylog 补丁，所以要改锚点** —— 需先跑 `--check` 确认），再 `systemctl --user restart goat-gateway`。
- **web 进程重启后仍要核对「思考链是否翻中文」**：gateway 补丁只切断了回灌链条，剩下的先验（tools 26 个、英文注入累积）
  仍可能让个别 step 落到英文；若翻不过来，下一步是闭环重抽样（`dsh-thinking-guard` v1.0.2 的 abort + autoContinue 骨架可复用）。

- **web 侧仍跑着 12:48:18 启动的旧进程**（`node ... dsh\lib\bin.js --profile web --port 3080`）：它是部分 session 仍然全英文的源头。要彻底一致，得把这个进程也重启一次。
- 35 处 `reasoningEfforts: false` 与实测矛盾（web 17 + desktop 18）：`zai-org/GLM-5.3`、`MiniMaxAI/MiniMax-M3` 在五档全返回 thinking
- desktop 有 24 个死 model（86 entries vs web 61 vs allowlist 62）—— `rewrite-model-list.py` 只 hardcode 了 `profiles/web/cordis.patch.yml`
- `dsh-deja` v0.21.3 仍躺在 `profiles/{web,desktop}/node_modules/`（client=False，有 `dsh.bundle` 字段）—— 靠 bundles 列表移除来停用，但 auto-discovery 是否会把它拉回来**未验证**
- `@local/dsh-thinking-language` 源码在 `D:/Toolbox/dsh-thinking-language`（在 `~/.dsh` 之外，不随同步走）
- `@local/dsh-thinking-language` 两 profile 都用 `file:` 声明：web 里被物化成**真实目录**（Oct 1 14:26），
  desktop 里却是 **Junction** —— 行为不一致，且 web 那份改了源目录也不生效（当前内容恰好 SAME 所以没爆）。
  同一个 `file:` vs `link:` 根因，建议同样改 `link:` + `pnpm install`；**但它承载 thinking-language directive 注入**，
  改坏会丢中文思考链注入 ⇒ 单独一次做、留回滚点、跟一次重启一起验。
- Linux 连不上 `github.com`（`curl` → 000），任何 `github:` 依赖在那边装不了
- Linux profile bundle 只有 5 个，Windows 11 个
- **一次 App / desktop 重启可一并生效的 5 项**（10-03 13:47 汇总）：① dsh-context 价目 overlay（patch-dsh-context-pricing.mjs）；
  ② mnemon `idleReview.maxTokens: 32768`；③ maxtokens notice 抑制（patch-maxtokens-notice.py）；④ goat-panel `file:`→`link:`（web+desktop）；
  ⑤ web 侧 thinking-guard 复活（要重启的是 web 进程 pid 28480）。`dsh-plugin-message-edit` PR#7 已在 10-02 16:17 冷启动验证通过。


---

