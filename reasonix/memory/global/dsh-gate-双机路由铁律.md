---
id: merged-dshgate双机路由铁律.md
revision: 1
created_at: "2026-08-16T14:30:00.000000000Z"
updated_at: "2026-08-16T14:30:00.000000000Z"
name: dsh-gate-双机路由铁律.md
description: Pro 强制走 dsh + 双机分工铁律
metadata:
  type: user
  fact_type: reference
  scope: global
---

# dsh-gate-双机路由铁律.md

> ## ⚠️ 已被 2026-09-04 架构取代（以此为准）
> 本文件为 **2026-08-16 双机分工时代**的路由铁律（本机跑 dsh + 主力机 dsh-gate.ps1），**现已废弃**：
> - **本机不跑 dsh**（性能不足，用户 2026-09-04 拍板）——所有 pro/dsh 调用转发主力机
> - 现行命令：`dsh-remote -pro "任务"`（pro + effort=max）／`dsh-remote --async` 后台化
> - 完整现行规范见记忆 `工具-dsh并发调度与命令铁律-20260904.md` 与技能 `dsh-gate`（v2.0）
> 下方历史内容仅存档溯源，**不作为操作指令**。

> 2026-08-16 合并生成。来源原始件在 ~/.reasonix/memory-archive-20260816/（信息零丢失）。


## 来源：meta-pro-route-dual-machine.md

# Pro 强制路由 + 双机分工铁律（2026-08-16）

## 铁律一：凡是 Pro，必走 dsh

任何需要 `deepseek-v4-pro` 的场景（用户显式要求 pro、难任务自动判定命中、max thinking、深度推理/证明/审计/长文档），**Reasonix 必须先调用 dsh-gate 走 DSH headless**，不直接用 Reasonix 内置模型跑 pro。

```bash
dsh-gate --pro "任务"        # 强制 pro + max（本机 Linux）
ssh tqjq "powershell ... -File C:\Users\27063\.local\bin\dsh-gate.ps1 -Pro '任务'"  # 主力机
```

理由：DSH 已配首轮锚定极简模式（Minimal 工具对 bash+str_replace_editor + minimal persona），V4 Pro 在该条件下表现显著更稳（Project2 98/99 vs Standard 91）；Reasonix 内置 91 技能目录会让 pro 偏 spec 策略惯性。

## 铁律二：大型思考写入任务 → 调主力机分工

**大型思考写入**（长文档逐句翻译、全书审计、大规模转录/写入、>30 分钟或 >100K token 的任务）应当**调用 Windows 主力机「天阙九泉」**执行，本机 Reasonix 保持主流程与快速任务，两台机器分工协作：

| 任务类型 | 执行机 | 命令 |
|---|---|---|
| 日常/快速任务 | 本机 Linux 天阙 | `dsh-gate "..."` |
| 深度推理/证明/审计 | 本机（优先） | `dsh-gate --pro "..."` |
| 大型写入/长文档/批量 | 主力机 Windows | `ssh tqjq "powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\27063\.local\bin\dsh-gate.ps1 -Pro '任务'"` |
| Windows 专属（PowerShell/注册表/Windows 环境） | 主力机 | 同上 |
| 双独立大任务 | **两机并行**（各跑一个） | 本机 + 主力机同时发 |

主力机输出落盘 `%TEMP%\dsh-gate\`，用 `ssh tqjq "type %TEMP%\dsh-gate\*.txt"` 或 scp 取回。

## 触发检查（每次任务开始前）

1. 任务需要 pro 吗？→ 是 → 走 dsh-gate（本机或主力机）
2. 任务是大规模写入/长文档吗？→ 是 → 优先派主力机
3. 两个独立大任务？→ 并行分派两机
4. Reasonix 自身只在 flash 层做编排、整合、格式处理；pro 推理一律交给 DSH

## 配套资产

- 技能：`dsh-gate`（调用钩子）、`dsh-mode`（模式手册）、`control-main-machine`（主力机控制）
- 主力机信息：见 `windows-main-machine-full` 记忆（SSH tqjq / 192.168.1.16）
- ⚠️ dsh-gate 不可并发（settings.yaml 竞争，2026-08-16 实测 disposed）——同一台机串行，两机之间可并行

## 来源：v4pro-for-complex-reasoning.md

用户允许在复杂推理时使用更高性能的模型（如 v4pro）。当遇到需要深入分析、多步推理、大量知识检索或翻译长文档等场景时，可以切换到更强模型以获得更高质量的输出。
