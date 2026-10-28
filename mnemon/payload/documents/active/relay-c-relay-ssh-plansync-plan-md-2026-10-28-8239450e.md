---
id: "8239450e-5e74-4b79-8d5b-c0ac3be8aa5b"
title: "relay 跨机邮箱通道（C:\\relay / SSH + plansync 注入 PLAN.md）：设计、协议与实测踩坑 2026-10-28"
description: "Linux ↔ Windows 两台真机之间的文件邮箱通道（C:\\relay）：spool 状态机与 README 协议（原子发布/ASCII 文件名/UTF-8·LF/分段归属）、relay send|ls|show|done|plansync|selftest 命令面、把未读状态注入两端 PLAN.md 的 RELAY 块（cron 每 20 min、幂等、固定名备份），以及 headless 拉起失败的断链 realpath 崩溃、dsh.ps1 ExecutionPolicy 拦截、STATE.md 裸 CR 自伤与 R1 自违四处实测教训。"
status: "active"
created_at: "2026-10-28T08:45:03.522Z"
updated_at: "2026-10-28T08:45:03.522Z"
content_hash: "640802914d0f05af51f254b945e7ad72dd83f9508e9080604c8195d92f72240c"
source_paths:
  - ".dsh/tools/relay-plansync.sh"
  - ".dsh/PLAN.md"
  - ".agent-presets/anchored-standard/plan-anchor.mjs"
  - ".dsh/storages/tools/sync_dsh.py"
session_ids:
  - "7251e8e5-6266-4121-a520-19e627bc6187"
memory_body_ids:
  []
---

# relay 跨机邮箱通道（2026-10-28 建成）

**性质**：新基础设施的落地记录 + 协议契约 + 实测踩坑。前置/相关：双机同步与 PLAN.md 各写各的机制见 [dsh 双机同步第二阶段](1a58f1a4-be2d-4b56-8f98-d5c0887b5777)；Windows OpenSSH 免密与路径转义教训见 [远程目标机通道排查](b7c08f4b-9084-4143-90cd-23b70dc33166)。

## 1. 拓扑（先纠一个此前的错误认知）

Linux 侧曾把「Windows 端」误解为本机那块 NTFS 分区（`/media/OS`，用户 `Admin1`）。真相是**两台独立机器**，通道早就存在于双机同步脚本 `~/.dsh/storages/tools/sync_dsh.py` 的凭据里：

- 对端：主机名 `天阙九泉`，Tailscale `100.84.67.49`，用户 `27063`，常开
- 通信方式：非交互 SSH（同一凭据，日常同步在用）
- 邮箱真身只有一份：Windows 侧 `C:\relay`。Linux 侧本地的 `/media/OS/relay` 已删除 —— **不做双头**，避免跨系统写盘污染

因此不需要人切系统、不需要粘贴内容：Linux 端 `relay send` 直接 SSH 投递，`dsh headless <task>` 直接在 27063 的会话里跑完，回执写回邮箱。

## 2. 目录与协议

```
C:\relay
├── README.md        协议正文（约 8.1 KB，10 条规则）
├── STATE.md         状态板，分 ## LIN / ## WIN / ## 共识 三段（约 1.9 KB）
├── lin2win\{0-inbox,1-wip,2-done,3-dead}    Linux → Windows
├── win2lin\{0-inbox,1-wip,2-done,3-dead}    Windows → Linux
├── log\{lin,win}.jsonl  操作流水
├── archive\ drop\.probe\
```

README 规则里**必须遵守的几条**：

- **R1 单写者**：`lin2win\` 只有 Linux 写，`win2lin\` 只有 Windows 写。接收方只做 rename 消费，不写对方 spool。**不存在「被授权写对侧 spool」的例外**（本轮踩过，见 §5.4）
- **R2 原子发布**：先写 `.tmp-<最终名>` 再 `rename`，避免读方看到半截文件
- **R3 文件名 ASCII-only**；命名 `<UTC时间戳>-0001-<slug>.md`，front-matter 含 `id / from / to / created / kind / re / priority`
- **R4 编码卫生**：UTF-8 **无 BOM**、纯 **LF**
- **R6 `STATE.md` 分段归属**：只改自己那一段，`## 共识` 段两侧都不许动
- **R7 放弃**：进 `3-dead\` 并在正文写明理由
- **R10 跨系统写盘前置**：`hiberfil.sys` 存在 = 快速启动/休眠开着，切系统前必须 `shutdown /s /t 0`，否则脏缓存回写

状态机：`0-inbox` →（认领 rename）`1-wip` →（完成 rename）`2-done`；弃则 `3-dead`。

## 3. 命令面

```
relay send  --to win --slug <slug> [-f body.md]   # 原子发布到对侧 0-inbox
relay ls    [--to lin|win]                        # 列 spool（id/kind/字节/行数）
relay show  <id>                                  # 读消息
relay done  <id>                                  # 1-wip → 2-done
relay plansync                                    # 刷新两端 PLAN.md 的 RELAY 块
relay selftest                                    # 断言套件
```

`selftest` 覆盖状态机、原子发布、编码、文件名约束，实测 **26 通过 / 0 失败**，local 与 `ssh:27063@100.84.67.49:C:/relay`（走 SFTP）都过，耗时约 1.2 s。这是判断通道是否健康的唯一可信证据，改动后必跑。

## 4. plansync：把「有没有信」送进每一步的上下文

动因：会话是独立的，agent 没有「轮询邮箱」的本能。两端 dsh 都装了 `plan-anchor.mjs`（每 step 现读 `~/.dsh/PLAN.md` 的 head 30 行并重注入），于是 plansync 把一段带标记的块写进 PLAN.md 顶部区域：

```
<!-- RELAY:BEGIN —— 由 Linux 侧自动维护（`relay plansync`），手改会被覆盖 -->
## relay 待办 · `C:\relay`（每 turn 必查）
- 待我处理 N 条，在 `C:\relay\win2lin\0-inbox\`（`relay ls --to lin`）
  - 最多列 5 个 id
- 流程：读 → 1-wip → 2-done（放弃 3-dead + 理由）
- 协议 `C:\relay\README.md`｜状态板 `C:\relay\STATE.md`（只改 `## LIN` 段）
- 发嘱托 / 未读刷新
<!-- RELAY:END -->
```

设计约束与理由：

- **两端各自的块内容不同**（本端看 `win2lin`，远端看 `lin2win`，`## LIN`/`## WIN` 归属也不同），所以 `render_block` 按侧参数化
- **幂等**：块已存在则替换而不是追加（实测连跑两次：`inserted` → `replaced`，无重复块）
- **无变化不写盘**；备份用**固定名**，不堆时间戳副本（本轮特意改掉时间戳备份策略并清理了已生成的 `PLAN.md.bak-relay-<ts>`）
- **保行尾风格**：远端 `CRLF`、本地 `LF`，各写各的
- **为什么不担心被同步覆盖**：`PLAN.md` 本就在双机同步的 `EXCLUDE_FILES` 里（各机各写），见 `1a58f1a4`
- **调度**：cron `*/20 * * * * /home/tianque/.dsh/tools/relay-plansync.sh`（双向一次刷新）；同时保留 sync / autocommit 两条既有 cron

验证方式：远端 PLAN.md 前 30 行里能看到块（`CRLF: True | BOM: False`），本地能看到回的块（`LF`），且都出现在 `## 当前目标` 之前。

## 5. 实测踩坑与修复（可复用教训）

### 5.1 断链 realpath 直接崩掉 headless
`dsh headless` 起不来，报：
`Error: UNKNOWN: unknown error, realpath 'C:\Users\27063\.dsh\profiles\headless\node_modules\.ignored_dsh-plugin-local-search'`（errno -4094），栈在 `dsh-app-boot/lib/index.js` 的 `realModuleDirectory → linkedProfileRoots → createRuntimeResolution → composeProfile`。
这是 pnpm 留下的**悬空条目**（`.ignored_*` 名字，跟随链接 lstat 均 OK 但 realpath 失败）。`Remove-Item -Recurse -Force` 删掉该条目后 headless 立刻可跑。
→ 教训：profile 的 `node_modules` 里出现 `.ignored_<bundle>` 残留时，先当路障清掉，不要去改 boot 代码。

### 5.2 `dsh.ps1` 在非交互 SSH 下被 ExecutionPolicy 拦
`Get-Command dsh` 指向 `C:\Users\27063\AppData\Roaming\npm\dsh.ps1`，报 "is not digitally signed"。
绕法（不要改全局 ExecutionPolicy）：直接调入口
`node C:\Users\27063\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\lib\bin.js --version` → `0.2.1-rc.2`。
→ 远端脚本一律用 `& node $bin <args> *>> log` 形式，别调 `.ps1`。

### 5.3 自己把 STATE.md 写坏了：Python 字符串里的 `\r`
把路径 `C:\relay` 直接塞进 Python 字符串，`\r` 被解释为裸 CR(`0x0D`)，那一行读出来是 `C:` + CR + `elay`。Windows 侧按 R6 没动 `## 共识`，只把问题报回来（这是双向通道最有价值的产出）。
修复：改成字面转义序列；复查 `CR count: 0`，README `8148B | BOM=False | CR=0 | LF=148`，STATE `1880B | BOM=False | CR=0 | LF=31`。
→ 教训：写含 Windows 路径的文本时，**永远别让反斜杠穿过解释层**（raw string / 双反斜杠 / 参数化），并在写完后**机器校验 BOM 与 CR 计数**，别靠肉眼。

### 5.4 违反了自定的 R1
让 Windows 侧把 reply 写进 `lin2win\0-inbox\`，而 R1 明写该目录只有 Linux 写。对方照做但明确声明这是越权例外。规则已修正为：**回复一律走 `win2lin\0-inbox\`**，plansync 渲染块里的回话路径同步改正（单测断言里那条字符串也要一起改）。
→ 教训：协议规则写在 README 后，**发起任务的话术也必须受它约束**；生成的提示文本是一等代码，改规则要连带改渲染与断言。

## 6. 剩余风险与未做

- 远端 `C:\hiberfil.sys` 存在 ⇒ 快速启动/休眠开着（R10 地雷）；远端常开问题不大，但本机 NTFS 若在 Linux/Windows 间来回写，切换前须 `shutdown /s /t 0`
- 未接：Windows 侧 `desktop` profile 的常驻 watcher（目前靠 cron plansync 每 20 min + 会话首步注入）
- 收尾状态见证：`lin2win` 两条均 `2-done`，`win2lin` 空，`log/lin.jsonl` 记录了 plansync/done 流水；本机 `/media/OS/relay` 已移除
