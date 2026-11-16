---
name: dsh-mode
description: DeepSeek Harness (dsh) 模式大全——headless/web profile、native/code/both 工具呈现、首轮锚定极简机制、anchored-standard 预设、插件管理、DSH↔Reasonix 双向集成。需要调 dsh、走 harness、开创造模式、装插件、查会话日志时触发。
version: 1.4.0
---

# dsh-mode — DeepSeek Harness 模式与集成手册

**用途**：dsh（DeepSeek Harness）的模式与集成查表——profile 形态、工具呈现、首轮锚定、preset、插件、模型与成本、会话日志。
**何时触发**：需要调 dsh、走 harness、开创造模式、装插件、查会话日志，或排查 dsh 升级/中断问题时。本技能与 `dsh-gate`（调用钩子）互补：dsh-gate 是「怎么调」，本技能是「有什么模式、什么原理、怎么配」。

> **状态（2026-09-04 用户拍板，以此为准）**：本机（小电脑）不跑 dsh，调用一律走 `dsh-remote`（本机 `~/.local/bin/dsh-remote`，转发主力机执行，pro+effort=max）。操作规范见记忆 `工具-dsh并发调度与命令铁律-20260904.md`。完整状态原文 → `references/status-and-scope.md`。

## 核心流程（最短可执行主路径）

1. **选 profile**：单发任务 → `dsh --profile headless "任务"`（轻量、无端口，dsh-gate 默认走它）；GUI 会话或需选 preset → `dsh web`。其余（tui / sdk / sdk-minimal / acp）见原文第一节。
2. **选工具呈现**：常规留 `native`；复杂编码/多步流水线 → `DSH_TOOLS_MODE=code dsh --profile headless "任务"`，或 `dsh-gate --mode code "任务"`。
3. **定模型与 effort**：简单任务 → `deepseek-v4.1-flash` + high；难任务/需 pro → `deepseek-v4-pro` + max（必须走 dsh-gate）。**调用方必须显式 `-pro` / `-m <model>` / `-e <effort>`**——2026-09-09 起禁止关键词自动判定，缺 model 即报错 exit 2。
4. **超时分流**：预计 **>90 秒**的任务一律 `--async`（同步 SSH 前台在 ~167s 丢结果，0 字节）。
5. **通知**：除非用户明确要求静默，**禁止 `--no-notify`**。
6. **收结果**：读 `status.note`（`rc / 耗时 / 输出字节`）与 `.diag.txt`。headless **不支持 resume**（`--resume` 是 tui/web 侧 app 插件的参数），中断后只能重跑或分块重发。输出落盘：本机 `/tmp/dsh-gate/`，主力机 `%TEMP%\dsh-gate\`。
7. **查/验会话**：`zstd -dc <session.v3.jsonl.zstd> > /tmp/x.jsonl`，再跑 `~/.reasonix/global-workspace/scripts/dsh-analysis/` 下的 `analyze-session.py` / `fingerprint2.py` / `dump-event.py` / `summary.py`。

## 按需读取（references/）

| 什么时候必须读 | 文件 |
|---|---|
| 要选 profile、开创造模式 code、配/验首轮锚定极简机制、装或调 anchored-standard preset | `references/profiles-and-tool-modes.md` |
| 要装/查插件、改 `settings.yaml`、调 maxTokens 输出上限、排查流式中断与 retry、做模型与成本选型 | `references/plugins-and-models.md` |
| 要配 DSH↔Reasonix 双向集成、查会话日志分析工具 | `references/integration-and-logs.md` |
| 遇到诡异现象（多帧 zstd 解压只剩 header、junction 被 CLI 改写、preset 挂载失败、插件默认挂载变化） | `references/pitfalls.md` |
| 要升级 dsh、做版本兼容性核查、回滚、跨机同步（0.1.1-rc.2 ↔ 0.1.5-rc.2） | `references/upgrade-0-1-5.md` |
| 要派发长任务、`-e` 不生效、通知丢失、失败可见化 | `references/async-and-effort-lessons.md` |
| 需要 2026-09-04 拍板的完整状态声明与「原理档案 / 操作指令」边界 | `references/status-and-scope.md` |

> 原文的章节编号在各 references 文件内原样保留：原文「第十一节」= `upgrade-0-1-5.md`，「第十二节」= `async-and-effort-lessons.md`，其余「第 N 节」按上表归入对应文件。

## 铁律（条文全文见对应 references）

- **本机不跑 dsh，一律走 `dsh-remote`**；主力机 dsh 机制仍适用（同机锁、settings 备份）→ `status-and-scope.md`
- **禁止关键词自动判定模型**：必须显式 `-pro` / `-m <model>` / `-e <effort>`，缺 model 即报错 exit 2 → `plugins-and-models.md` 第六节
- **预计 >90 秒的任务一律 `--async`** → `async-and-effort-lessons.md` 第十二节.1
- **除非用户明确要求静默，禁止 `--no-notify`** → `async-and-effort-lessons.md` 第十二节.5
- **判断 YAML 键存在性必须用 `-match`**，不能靠 `-replace` 前后差异（否则重复插入 → `DUPLICATE_KEY at line 7` → dsh 启动即失败）→ `async-and-effort-lessons.md` 第十二节.3
- **改 profile 的 cordis.patch.yml 前先备份**（`cp xxx xxx.bak-YYYYMMDD`）→ `plugins-and-models.md` 第五节
- **`maxTokens` 设大值前必须逐模型确认**（GLM ≤ 131072、Gemini ≤ 65536，否则该模型任务 400 失败）→ `plugins-and-models.md` 第六节
- **长任务必须分块**（与既有「单块 ≤18KB」规范一致）；瓶颈是流式传输时长/稳定性，不是 maxTokens 也不是重试次数 → `plugins-and-models.md` 第六节
- **锚定是否退化看首轮 tools 数：2 = 生效，26 = 已退化**；0.1.5 起 `str_replace_editor` 必须显式挂载 → `profiles-and-tool-modes.md` 第三节
- **web 侧「点了没反应」先抓浏览器 console**（preset 挂载错误只在 `console.warn`，服务端 stdout 不打印）→ `pitfalls.md` 第九节.8 / `upgrade-0-1-5.md`
- **preset 是 web 专属路径，headless 无法承载** → `upgrade-0-1-5.md`
- **做版本对照实验务必用独立 `DSH_HOME`**，不要只换 CLI 路径 → `pitfalls.md` 第九节.6
