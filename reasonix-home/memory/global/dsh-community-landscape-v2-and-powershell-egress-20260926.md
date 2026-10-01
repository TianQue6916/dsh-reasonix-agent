---
id: mem-dc44a6ef3639bd591908b929777044ed
revision: 1
created_at: "2026-09-26T15:47:59.182Z"
updated_at: "2026-09-26T15:47:59.182Z"
name: dsh-community-landscape-v2-and-powershell-egress-20260926
description: "PowerShell 能出网（bash 被禁）这一能力突破 + 社区实况实时数据（topic:dsh-plugin 16,218 个；更正 dsh-desktop 存在、记忆插件 star 量级）+ headroom/deja-vu 等对应方案"
metadata:
  type: user
  fact_type: reference
  scope: global
---

# dsh 社区实况（2026-09-26 用 GitHub API 实时查）+ PowerShell 出网能力

## 一、能力突破：PowerShell 能出网，bash 不能
- bash 工具：`curl` 到 api.github.com / registry.npmjs.org 一律 **000**（沙箱禁网）
- PowerShell：`Invoke-WebRequest https://api.github.com/rate_limit` → **HTTP 200**；github.com → 200
→ 这意味着**任何需要网络的活都可以走 PowerShell**（GitHub API、npm、下载），bash 只做本地文件操作。
→ 另一个开关：`web_search` 工具在 2026-09-26 也已恢复（endpoint 由用户修好）。

## 二、社区规模（实时数据，比之前的快照准）
`topic:dsh-plugin` 共 **16,218 个仓库**（此前快照只有 476 个去噪条目）。

### Star Top（2026-09-26）
| 仓库 | ★ | 说明 |
|---|---|---|
| deepseek-ai/deepseek-harness | 236,686 | dsh 本体 |
| nexu-io/open-design | 98,163 | Design 插件 |
| ruvnet/ruflo | 73,317 | agent harness / swarm |
| tt-a1i/archify | 72,097 | 架构图 skill |
| volcengine/OpenViking | 38,719 | Self-evolving Context Database：统一 Agent Memory/Knowledge |
| esengine/DeepSeek-Reasonix | 35,716 | **reasonix 本体**（用户在用） |
| anywhere-labs/dsh-desktop | 29,064 | **DSH 桌面版**（Electron 生态方案）|
| titanwings/distilly | 25,045 | 把思维蒸馏成可复用 skill |
| awesome-dsh-plugin/awesome-dsh-plugin | 16,968 | 插件精选列表 |

### ⚠️ 更正我之前的两个错误结论
1. **"desktop 端拿不到"是错的** —— `anywhere-labs/dsh-desktop`（29,064★）是社区做的 DSH 桌面端，明确"桌面本身也是插件"。官方无分发 ≠ 社区没有。
2. 记忆插件的 star 量级此前低估（快照写 OpenViking "未核实"，实际 38,719★）。

### 与我缺口的对应（实时搜索）
| 缺口 | 社区方案 | ★ |
|---|---|---|
| token 预算 / 上下文压缩 | `giter00/dsh-headroom`(13)、`wjxn13/dsh-headroom`(5)、`Zenjibad/headroom-stats-plugin`(2)、`WanYanTianDe/dsh-headroom`(1) —— **全部是 Headroom 这个外部压缩 proxy 的接入件**（Headroom 本体：Netflix 工程师做的本地上下文压缩层，号称降 60-95% token） | 低 |
| skill 使用记分 | `EIGHTfs/dsh-skill-scoreboard`（真实机制：**监听 `tools/result`，按会话去重自动累计 skill 加载次数**） | 0 |
| 目标看板 | `miuzel/dsh-graph`（目标/判据/上下文卡片/执行 attempt 二维组织）、`sorsama/deepseek-harness-mobile`(98) | 低 |
| 会话/记忆 | `vshulcz/deja-vu`(1,037)（**跨 Claude Code/Codex/Cursor/Copilot/OpenClaw 共享一份记忆**）、`adoresever/graph-memory`(627)、`mnemon-dev/mnemon`(596)、`liangmianya/dsh-synapse`(429)（可视化非线性会话工作区） | 高 |

**结论**：记忆与上下文压缩两条线社区都很活跃（且有 1000★ 级的跨 agent 记忆方案 deja-vu）；而"token 预算闸门"这个具体形态**没有热门现成件**（headroom 系都是外部 proxy 接入，星数个位数）—— 说明我写的 token-budget 至少不是重复发明热门轮子，但也说明这个形态社区不认。

## 三、待办
- 读这几份 README 再决定取舍：`vshulcz/deja-vu`、`anywhere-labs/dsh-desktop`、`EIGHTfs/dsh-skill-scoreboard`、`dsh-skill-manager-ytxue`
- 用 PowerShell 出网这个能力，可以顺手把 `dsh-market`（可视化插件市场）查清楚
