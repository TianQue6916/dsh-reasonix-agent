---
id: mem-ff23113e54fb161a8deb5c63c250d8dc
revision: 3
created_at: "2026-08-09T05:24:43.873413284Z"
updated_at: "2026-09-10T15:00:00.000000000Z"
name: reasonix-32-parallel-limit-and-translation-division
title: Reasonix 32 并行上限与翻译分工设计
description: Reasonix 单批最多 32 并行；模型铁律（2026-09-10 更新）：全任务统一 v4.1 flash，pro 弃用，难任务靠资料/prompt/多轮；全资源搜索（双盘区/主力机/网络/离线维基）
metadata:
  type: feedback
  scope: global
---

# Reasonix 并行上限与大规模分工设计（2026-08-09 拍板 → 2026-09-10 模型铁律更新：全任务统一 v4.1 flash）

**Why:** 用户确认 Reasonix 单批最多允许 **32 个并行子 agent**（fleet/任务调度上限）。**模型分配总纲（2026-09-10 用户拍板更新）：全任务统一 `deepseek-v4.1-flash`，pro 弃用**——用户实测 v4.1 flash 全面超越 pro；难任务不换模型，靠「多查资料 + 足量 prompt + 多轮优化」。

**How to apply:**
- 任何 `fleet`/`task` 并行派发，单批数量必须 ≤ 32；超过 32 分波次执行
- 大规模翻译（>50 页）分工：
  - 波 1：25 个翻译 worker（**v4.1 flash**，每个分 2 页，覆盖 50 页）
  - 波 2：10 审计（**v4.1 flash**）+ 3 写注（**v4.1 flash**）+ 2 交叉引用（**v4.1 flash**）= 15
  - 波 3：**2 个 v4.1 flash + `-e max` 超强审计**（通读全部翻译+注，输出修订后全文）
  - 波 4：1 个 **v4.1 flash** 格式审计（对照格式规定逐条核对）
- **🚨 模型铁律（2026-09-10）**：翻译 / 写注 / 页级审计 / 超强审计 / 交叉引用 / 格式审计 **一律 `deepseek-v4.1-flash`**，只用 `-e`（off/low/high/max）区分算力；**pro 不再使用**（`dsh-remote -pro` 语法保留但已等价 `-m deepseek-v4.1-flash -e max`）
- 双审计所有规模必做：v4.1 flash + max effort 超强审计（审计+修复一体）+ v4.1 flash 格式审计收尾
- 全资源搜索必做（翻译前/写注前/审计前）：本机 Linux 盘区 + /media/OS（Windows NTFS 双盘区）+ 主力机 SSH（D:\ 资料）+ 网络搜索 + 离线维基 ZIM
- Strang 50 页教训不删除，从"禁止子代理翻译"转为"翻译 worker prompt 避坑清单"
- 教训：难任务的质量来自**资料完整度 + prompt 细节 + 迭代轮数**，不是换更贵的模型档位
- **双机同步状态（2026-09-10）**：本文件已同步至主力机真实 home `C:\Users\27063\AppData\Roaming\reasonix\memory\global\`（注意：主力机另有已废弃的 `C:\Users\27063\.reasonix\` 残留目录，config.toml 不在其中，勿写入）
