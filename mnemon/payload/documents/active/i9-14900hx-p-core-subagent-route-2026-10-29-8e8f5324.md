---
id: "8e8f5324-d034-44d8-b8f5-b14eeb5e7272"
title: "i9-14900HX 异构核并发实测、P-core 绑核与 subagent route 继承（2026-10-29）"
description: "2026-10-29 在本机 dsh 环境完成的并发实测与配置定案：subagent 只读并发 6 路验证、CPU 密集 4 路拐点与 E-core 溢出机制（含 makespan 模型与 P-core 绑核 -24% 实测）、subagent 墙钟 24.1% 本机/75.9% API 的瓶颈分解、社区并发插件只能限流不能加速、subagent agentOptions 逐字段继承/覆盖源码事实、persona 与 pre-step 注入的 prefix cache 权衡、Low IL 写权限与生效边界判据。"
status: "active"
created_at: "2026-10-28T17:57:36.945Z"
updated_at: "2026-10-28T17:57:36.945Z"
content_hash: "b5988290554ada05551ac0f8cd071534736974fea089809bad1df1adaf3f1c66"
source_paths:
  - ".dsh/profiles/web/cordis.patch.yml"
  - ".dsh/profiles/desktop/cordis.patch.yml"
  - ".dsh/tools/pin-pcore.ps1"
  - ".dsh/.agent-presets/anchored-standard/concurrency-discipline.mjs"
  - ".dsh/profiles/node_modules/@deepseek-ai/dsh-subagent/lib/index.js"
session_ids:
  - "19324eb5-0452-4a3f-9eb2-2bc4ffcb73f3"
memory_body_ids:
  []
---

# i9-14900HX 异构核并发实测、P-core 绑核与 subagent route 继承

2026-10-29 在一台 i9-14900HX（24 核 / 32 线程）的 Windows 机器上做的一轮实测与配置定案。
结论直接写进了 `profiles/{web,desktop}/cordis.patch.yml` 的 persona 第 9、10 条，以及 `concurrency-discipline.mjs`。
相关旧文档：`b4a7aa94-d8f4-4494-817e-407d1112e249`（concurrency-discipline 的 waterfall veto 注入链修复）、`fa611c46-9dc6-42aa-93a8-1002be2468bd`（mnemon subagent catalog/persona 修复）。

## 1. subagent 只读并发：6 路已验证，瓶颈不在本机

6 个同构只读 subagent 同时派发，全部返回正确结果，整体墙钟跨度 **12.7s**，tool-calls 时间戳严重重叠（B/C/E 在 53–54.6s 几乎同时启动，A/F 在 57–58s）——串行至少要 30–60s，证明 `maxActiveSubagents`（当时配 32）真实生效。

关键分解：**16 次工具调用、本机执行时间合计 3056ms，占 12.7s 墙钟的 24.1%；其余 75.9% 是 LLM API 往返 / 排队 / 首 token 延迟。** 而这 3056ms 里单次 bash 270–330ms，绝大部分还是进程冷启动，不是计算。

⇒ 推论：CPU 再快 10 倍，这个场景最多从 12.7s 压到 ~3s。**加速 subagent 的正确方向是减小每个子任务的上下文（prefill 正比于 prompt 长度）或换更快的 route，不是调 CPU / 加并发。**

## 2. CPU 密集任务的拐点是 4 路（本机实测）

单任务净计算 410ms，同一负载改变并发数：

| 并发 | 墙钟 | 相对 |
|---|---|---|
| 1 | 410 ms | 基准 |
| 4 | 462 ms | +13% |
| 8 | 684 ms | +67% |
| 16 | 1126 ms | +175% |

机制（不是玄学）：8 P-core × HT = 16 个逻辑线程，单线程 205ms；16 E-core 无 HT = 16 个逻辑线程，单线程 **570ms（慢 2.8×）**。
makespan = max(T_i)，T_i 落在 E-core 就是 410×2.8 ≈ 1150ms —— **16 路实测 1126ms vs 理论 1150ms，误差 2%，模型吻合**。
N=8 就已 +67% 说明 Windows 调度器在 8 路时就开始把线程往 E-core 挪，早于「16 线程用满才溢出」的朴素预期。

跨学科对照：这是 Amdahl 定律的异构版本（CSAPP ch.5）——限制加速比的不是串行部分，而是**最慢那批核**；CLRS 的 batch scheduling makespan 同一形式，取决于最慢机器的负载而非平均负载。
直觉类比：8 个熟练工 + 16 个只有 36% 产能的新手，交期由新手手里那件活决定，再多招新手也不会提前。

## 3. 绑 P-core 是真收益，已实测

| 配置 | 墙钟 | 收益 |
|---|---|---|
| 8 路 · 默认（全 32 线程） | 1150 ms | — |
| **8 路 · 绑 P-core(0-15)** | **878 ms** | **−24%** |
| 16 路 · 默认 | 1401 ms | — |
| 16 路 · 绑 P-core(0-15) | 1259 ms | −10% |

脚本：`~/.dsh/tools/pin-pcore.ps1`，用法 `.\pin-pcore.ps1 pnpm install` / `npx vitest run` / `npm run build`。
三个设计取舍（都是踩过坑才定的）：

1. **只绑该命令派生的进程树**（沿 parent 链 / 每 250ms 扫子孙），不绑 dsh 自己的 Electron 进程——全绑会把 16 个 P-core 线程挤爆，反而更慢。
2. **每 250ms 轮扫子孙**：覆盖 `pnpm → node → esbuild` 这类多级派生，子进程不漏。
3. **启动后立刻绑 root**：第一版没有这一步，跑 `node --version` 时输出 `bound 0 process(es)`——短命令在第一次循环扫描前就退出了。修掉后 2 秒命令 `bound 1`。

社区手段（按侵入性）：Process Lasso（社区首推，付费/免费版够用）> 电源选项隐藏项「异类线程调度策略」设「优先使用性能核心」> E-core parking（Intel 论坛实测在 Core Ultra 9 275HX 上解除 40W 功率上限）> `bcdedit /set numproc N`（Windows 大版本更新会重置）> BIOS 关 E-core（损失 L3）。
社区警告：**别在代码里写死 `SetThreadAffinityMask` 的核编号**——锁的编号在别人机器上未必是 P 核。

## 4. 社区 subagent 并发插件：只能限流，不能加速

翻过 5 个（`dsh-concurrency-guard`、`dsh-llm-concurrency`、`dsh-llm-rate-limit`、`@why-daydream/dsh-tool-bulkhead`、`dsh-subagent-role-router`），机制都在 `llm/stream` 层做限流 / FIFO 排队 / 429 自适应冷却。

它们的价值是「别撞 429、别被封号」，**本质是主动变慢**。结合第 1 节数据：76% 时间在 API 往返，本地调度器碰不到。
真正能提速的只有：减小 subagent 上下文、换更快 provider（`dsh-subagent-role-router` 的多模型轮换可利用不同 provider 延迟差异）。

## 5. subagent 的模型选择：dsh 原生支持「继承 / 覆盖」，无需插件

源码事实（`profiles/node_modules/@deepseek-ai/dsh-subagent/lib/index.js`）：

- `resolveChildAgentOptions(parent, requested, childDepth)`（约 315–331 行）：先铺父的 `provider / model / reasoningEffort / maxTokens`，再 `...requested` —— **显式传入的字段逐字段覆盖父 route**。
- 同函数末尾：`if ((resolved.provider !== parentProvider || resolved.model !== parentModel) && requested?.reasoningEffort === void 0) delete resolved.reasoningEffort;` —— **换 model 但没显式给 effort 时，自动丢弃父的 reasoningEffort**，避免给新模型传不匹配档位。
- `static Config` 只有 `maxDepth` / `maxActiveSubagents`（约 2978–2981 行），**没有默认模型字段**。所以「默认走某个 model」只能靠 persona / instruction 约束父 agent，不是配置项。
- `subagent` 工具入参的 `agentOptions` 里 grep 到 `provider` / `model` / `agentOptions` / `providers` / `route` 字段，确认可覆盖。

用户定案（已写入 persona 第 10 条，两 profile）：默认 route = provider `commandcode-goat` + model `deepseek/deepseek-v4.1-flash`；`agentOptions` 可显式覆盖；不传就继承父 route。**三种都合法，不要硬编码**——保留父 agent 自行抉择的空间。

## 6. 判据放 persona，事实放记忆（prefix cache 权衡）

「每轮都要记住的判据」写进 persona（system prompt 前缀），「周期性提醒」才用 pre-step 注入。
理由是可量化的：persona 每轮**逐字节相同** → prefix cache 命中；pre-step 注入追加在 transcript 尾部，**每步都变 → 从注入点往后全部 cache 失效**。这正是 `concurrency-discipline` 设计成每 40 步才注入一次的原因。

明确**不**进 persona 的两类：一次性系统状态（某目录已打过 Low label，换机失效）、跨机端口事实（排障才需要）。它们放记忆，不进每轮前缀。

## 7. 同轮一并固化的环境判据（persona 第 9 条）

- **Windows 写权限**：dsh 的 shell 跑在 **Low IL**（`whoami //groups` 看 Mandatory Label）。workspace 之外写不了**不是 ACL 问题**——ACL 给了 Modify 也没用，no-write-up 优先于 DACL。
  解法：`icacls '<目录>' /setintegritylevel "(OI)(CI)Low" /T`，**括号必须加引号**（不加会静默不执行、无报错）。`/grant "*S-1-16-4096:..."` 改的是 DACL，对这一层无效。验证标志是 icacls 输出出现 `Mandatory Label\Low Mandatory Level:(OI)(CI)(NW)`。
- **生效边界**：`.mjs`（preset，如 `concurrency-discipline.mjs`、`tool-bootstrap.mjs`）不参与 HMR，**必须重启进程**；`cordis.patch.yml` 是 live patch，**开新会话生效**；**preset row 在会话创建后不会追补**（新加的工具要新会话才可见）；`--dump-config` 证明不了运行态。

## 8. 踩坑记录

- 改 `concurrency-discipline.mjs` 文本后，当前会话看到的注入仍是旧文本（`.mjs` 不参与 HMR），容易误以为没生效。
- `pin-pcore.ps1` 第一版对短命令 `bound 0`（root 未被绑）——必须启动即绑 root。
- PowerShell 调脚本时参数名歧义（`-ErrorAction` 类）会以 `AmbiguousParameter` 失败，测脚本要用无参数冲突的命令。
- `/compress` 不是 dsh 命令（dsh 是 `/compact`）；发错时会被当作普通文本继续转发。
