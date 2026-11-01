---
id: "2b099eab-e563-4425-8e87-4d867fb32901"
title: "本机「每日日记 / 学习痕迹」采集设计调研：可采数据源实测、04:00 日界 rationale 与 foreground window sampler 缺口（2026-10-28）"
description: "2026-10-28 调研：为自动生成每日日记（学习/建造/查了）盘点本机可采集的痕迹源并实测数据量（dsh session 141 文件 63151 行 165 条真实指令、tool-calls 2555 条、Edge history 18 URL、git autocommit 每 20 min），给出结构性结论「现有日志答不了『打开某课程窗口多久』，唯一增量组件是 foreground window sampler」，以及 04:00 日界的 rationale、A/B/C 三档方案与推荐 B、验真（evidence 指针）设计与 5 项未决拍板。"
status: "active"
created_at: "2026-10-28T08:11:52.775Z"
updated_at: "2026-10-28T08:11:52.775Z"
content_hash: "bcd01a97a1a693abb8e8170ab4888131e196ebeb54daa3130afc3a8045c40579"
source_paths:
  - ".dsh/sessions"
  - ".dsh/logs/tool-calls.jsonl"
  - ".dsh/logs/dsh-autocommit.log"
  - ".dsh/PLAN.md"
session_ids:
  - "6de8ebe5-efd8-4af5-98f1-bf9828fff7a7"
memory_body_ids:
  []
---

# 本机「每日日记 / 学习痕迹」采集设计调研（2026-10-28）

## 目标与用户口径

用户要一份自动生成的**每日日记**，回答「今天干了什么」，分栏大致为：一句话总结 / 学习 / 建造 / 查了。

**「在学习」的判定口径由用户给定**：
> 比如 linux 那边打开了课程 001 的文档一段时间，那么说明我在学这个；本机打开某个课程视频，说明我在学习这节课这样。

关键推论：**判定依据是「机器上的真实学习痕迹」（打开的窗口 + 停留时长 + 打开的对象），不限于 agent 日志**。这直接决定了数据源清单的边界，也决定了本机现有日志体系存在一个结构性缺口。

## 一、可采集数据源清单（均为 2026-10-28 当日实测，非推测）

| 源 | 路径 | 当日实测 | 能回答 |
|---|---|---|---|
| dsh session 全文 | `~/.dsh/sessions/--C-Users-27063--/*/session.v4.jsonl.zstd` | 141 个文件、63151 行、**165 条真实 user 指令** | 用户**问了什么、要求了什么**（学习意图 / 任务） |
| tool call 流水 | `~/.dsh/logs/tool-calls.jsonl` | 2555 条（bash 1454 / write 571 / read 166 / read_image 133 / edit 88 / subagent 40） | 实际**动手做了什么** |
| git autocommit | `~/.dsh/logs/dsh-autocommit.log` | 每 20 min 一条，含改动文件名 | 产出了哪些**文件 / 产物** |
| Edge history | `Edge/User Data/Default/History` | 18 个 URL（域名 top：commandcode.ai 6、github.com 3、127.0.0.1:3080 2） | 查了什么资料 |
| 前台窗口 | **无（需新建 sampler）** | — | 「打开某课程文档 / 视频多久」——**正是用户口径里的核心信号** |
| Linux 侧痕迹 | 本机不可见 | 0 | 需在 Linux 装同款 sampler，写到 NTFS 共享目录 |

**结构性结论**：日志三件套（session / tool-calls / autocommit）只能还原「我让你做了什么」，**不能还原「我自己在学什么」**。用户口径里的信号，本机现有体系一条都没有。因此 **foreground window sampler 是唯一必须新增的组件**，且它有时间成本——今天不跑，明天照样没数据。

## 二、采样器可行性与成本（已实测）

- `GetForegroundWindow` 可用，`GetWindowThreadProcessId` → 进程名 可用：实测拿到 `DeepSeek Harness.exe`（pid 8980）、窗口标题「核心会话 — DeepSeek Harness」。
- 采样开销可忽略（1000 次 `GetForegroundWindow` 约 0.1 ms 量级；pid→进程名 单次 0.02 ms）。
- 建议节奏：10 s 一次 → 一天约 8640 行 / ~800 KB，体积不是约束。
- 采样范围取舍：建议**全前台窗口都采**，文档/视频类筛选交给 aggregator。理由：规则以后会改，但**历史没采就永远没有**。

## 三、日界（day boundary）——最重要的设计决策

现状默认按 23:59 硬切。但当日真实数据显示主战场在凌晨：

```
03:02 / 03:25 / 03:51 / 04:06 / 04:20 / 04:27 / 04:34 / 04:45
```

即用户当天的主要工作（MIT 6.006 Lecture Notes 与 Boyd EE364a 的 bilingual 翻译派发、skill 契约修订、单点诊断子 agent）全部落在 0–5 点。若按 23:59 切：凌晨 0–2 点的学习被记到「第二天」，而 23:59 那一刻写的日记也覆盖不到后面 4 小时。

**建议**：日界设 **04:00**；23:59 跑一次「预稿」，次日 04:05 定稿（与前一日 04:00 对齐）。触发方式用常驻 sampler 内部定时 + 唤醒后 catch-up，比 schtasks 少一个调度组件。

## 四、三档方案与推荐

| | A 台账版 | B 台账 + LLM 定稿（推荐） | C 终态 |
|---|---|---|---|
| 组成 | sampler + aggregator + 规则模板 | A + 一次 API 调用写叙事 | B + Linux 汇流 + 周报 + 反写 mnemon |
| 交付 | 时间轴清单，确定可复现 | 叙事 + 清单（附样例） | 全设备统一，日记反过来喂 memory |
| 成本 | 0 | ~¥0.01/天 | 同 B |
| 风险 | 无叙事感 | 多一个失败点 → fallback 回台账 | 一次做完易翻车 |
| 工期 | 当晚可跑 | 当晚可跑 | 需 Linux 侧配合 |

**推荐 B**，同时把 C 的接口预留（日界参数化、数据源插件化、Linux 写入路径先留空）。理由：sampler 不先跑起来，明天照样没数据；LLM 定稿是薄薄一层，接不上就自动降级成台账，不会断更。

**LLM 定稿的硬约束**：本机 ollama 只装了 `nomic-embed-text:latest`（纯 embedding，不能生成）。所以要么走 DeepSeek API（实测 981 ms 可用、一次约 ¥0.01，但**摘要含窗口标题与文件路径会出网**），要么纯规则不出网。这是一项需要用户明确授权的取舍。

## 五、验真设计（按用户「先证后信」口径）

日记里每条陈述必须挂 **evidence 指针**（session id / 文件路径 / 窗口时间区间），点开可核对。目的：防止叙事层编造。抽样样例里的 evidence 形如 `session-5975e549 / _task-教材翻译.md`、`autocommit 13:50 / 14:10 / 14:30`。

## 六、环境事实与踩坑（实测）

- `Get-ScheduledTask | Where-Object {...}` 在本机报 `HRESULT 0x80070003`（`The system cannot find the path specified.`）——**CIM 层计划任务不可用**；`schtasks` 可用，但当时 `schtasks` 列表里 dsh/diary/journal 相关任务为**(空)**。
- `.dsh/sessions/*/session.v4.jsonl.zstd` 可解压：`py zstandard 0.25.0` 与 `/d/miniconda/Library/bin/zstd` 均可用；单帧首行是 `{"type":"session","version":4,...}`，含 `cwd` / `agentPreset` / `delegationDepth`。
- 单个 session 文件的事件类型分布（11331 行示例）：`user/message` 4011、`step/start` 1267、`tool/call` 1223、`agent/inbox/spliced` 367、`turn/start` 120。注意 `user/message` 里**大量是注入体**（plan-anchor、thinking-language、MNEMON snapshot、git state），因此「真实 user prompt 数」必须过滤，实测过滤后 145–165 条。
- `~/.reasonix/sessions/*.jsonl` 与 `*.events.jsonl` 是另一套可解析源（`session.opened` / `model.turn.started` 带 `model`、`reasoningEffort`）；`~/.reasonix` config 里有 provider 配置（含 API key，**不入库**）。
- 播放器侧：PotPlayer 注册表播放历史为空；VLC `ml.xspf` 自 7-19 未更新；mpv 只有 cache。→ **播放器自带的最近播放不可作为数据源**，仍需 sampler 兜住「看视频」信号。
- `~/Recent` 12 项、`Recent/AutomaticDestinations` 7 个 `.automaticDestinations-ms`（10-25 ~ 10-27 活动）可作为补充痕迹，但 10-28 当日无记录，可靠性低于 sampler。

## 七、待用户拍板的 5 项（本文写作时仍未决）

1. 日界：23:59 硬切 还是 **04:00**（agent 推 04:00）。
2. sampler 采**全前台窗口** 还是只采文档/视频类（agent 推全采）。
3. 日记落点：`~/.dsh/journal/YYYY-MM-DD.md` 源 + `D:\10-学习\日记\` 发布副本**双写**，还是只要一处。
4. LLM 定稿：走 DeepSeek API（会出网）还是纯规则不出网。
5. Linux 侧现在能否装 `xdotool` / `wmctrl` + python3，写 NTFS 共享目录有无障碍。

## 关联资料（非本文范围，仅作上下文）

- 课程资产的跨机盘点与 bilingual 成品审计口径：见双语审计文档。
- 当日翻译流水线的任务规范落点是 `C:/Users/27063/.dsh/tools/reports/_task-教材翻译.md`（含「防覆盖」一节）。
