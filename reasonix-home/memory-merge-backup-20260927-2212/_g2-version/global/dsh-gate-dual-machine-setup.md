---
id: dsh-gate-dual-machine-setup
revision: 1
created_at: "2026-08-15T22:00:00.000000000Z"
updated_at: "2026-08-15T22:00:00.000000000Z"
name: dsh-gate-dual-machine-setup
description: DeepSeek Harness (dsh) 双机配置 + dsh-gate 决策钩子完整档案
metadata:
  type: user
  fact_type: reference
  scope: global
---

# DeepSeek Harness 双机配置 + dsh-gate 钩子（2026-08-15）

## 核心结论
双机已装 DSH（`@deepseek-ai/dsh` 0.1.0-rc.6）+ `dsh-gate` 决策钩子：**难问题/需 pro 自动走 DSH headless（pro+max），简单问题走 flash；DSH 会话自动注入 Reasonix 记忆/技能/画像目录供按需读取**。已验证端到端工作。

## 双机安装位置

| 项 | 本机（Linux 天阙） | 主力机（Windows 天阙九泉） |
|---|---|---|
| node | v22.17.0 在 `~/.local/node22`（系统 node 18 未动） | v24.15.0（系统自带） |
| dsh | `~/.local/node22/bin/dsh` | 全局 npm（`C:\Users\27063\AppData\Roaming\npm`） |
| pnpm | 11.21.0 | 11.21.0 |
| npm registry | npmmirror（官方源慢 20 倍） | npmmirror |
| dsh-gate | `~/.local/bin/dsh-gate`（bash） | `C:\Users\27063\.local\bin\dsh-gate.ps1` |
| settings.yaml | `~/.dsh/settings.yaml`（flash+high） | 同左（已建） |
| API key | `~/.dsh/.env`（600，sk-4e6b...）优先，回退 `~/.reasonix/.env`；`.profile` 同样逻辑 | 用户级环境变量 `DEEPSEEK_API_KEY`（sk-a46e...，35 字符） |

> ⚠️ key 明文不写入记忆/仓库：本机在 `~/.dsh/.env`（chmod 600），主力机在 Windows 用户环境变量。双机各自独立 key（2026-08-15 用户指定）。

## dsh-gate 用法
```bash
# 本机
dsh-gate "任务"                    # 自动判定：难→pro+max，简单→flash
dsh-gate --pro "需 pro 的任务"     # 强制 pro+max
# 主力机（SSH）
ssh tqjq "powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\27063\.local\bin\dsh-gate.ps1 -Pro '任务'"
```

## 自动判定关键词（命中即 pro+max）
证明/推导/证明题/formal proof/prove/derive/优化/复杂/深度/困难/难题/高难度/审计/审查全部/全面审计/audit/长文档/逐句翻译/全书/代码审查/security review/架构设计/max thinking/max 思考/深度思考/数学/实分析/拓扑/概率论/凸优化

## 注入上下文（DSH 自动获得）
- 记忆库 `~/.reasonix/memory`（global/ + project/）
- 技能库 `~/.reasonix/skills`
- 用户画像 `memory/global/user-persona-cognitive-system-architect.md`
- 要点：构建主义/验证驱动/双语规范/第一性原理教学

## 关键坑（避免重踩）
1. **dev-sidecar 死代理**：主力机 dev-sidecar `setEnv:true` 注入 HTTP_PROXY=127.0.0.1:31180/31181 但端口无监听 → npm 全挂。已清用户级代理变量；dev-sidecar `overwall` 已改 true 并重启（本机+主力机）
2. **bashrc 交互检查**：`case $- in *i*) ;; *) return;; esac` 导致非交互 shell 读不到 export → key 放 `.profile`（登录 shell 加载）
3. **pkill 自伤**：`pkill -f 'dev-sidecar'` 匹配自身命令行 → 用字符类 `'[@]docmirrordev-sidecar-gui'`
4. **Windows cmd 不认 `tail`**：SSH 远程命令用 PowerShell + `Select-Object`
5. **沙箱写入限制**：`~/.dsh`、`~/.local/bin` 不在 Reasonix 可写根 → 先在 workspace 写再 cp
6. **模型切换验证**：改 settings.yaml 后查 `~/.dsh/sessions/*/session.jsonl.zstd`（zstd -dc | rg "deepseek-v4-(pro|flash)"）
7. **ssh 中文参数转义**：Windows 版用 `-Pro '任务'` 命名参数最稳，位置参数多层转义不可靠

## 验证命令
```bash
PATH="$HOME/.local/node22/bin:$PATH" dsh-gate "1+1等于几？"      # → flash
PATH="$HOME/.local/node22/bin:$PATH" dsh-gate "证明质数无穷多"    # → pro+max
dsh-gate "读取用户画像，回答 P0 课程"   # → 应答 6.431 概率论+CS144
```

## 技能
Reasonix 技能 `dsh-gate` 已装（`~/.reasonix/skills/dsh-gate/SKILL.md`），描述触发条件与整合要求：Reasonix 只整合结果，不重复推理。

## 自我优化与演进（2026-08-15 扩展）
- `dsh-gate --self-optimize`：分析最近会话判定数据 → DSH(pro) 审视关键词表 → JSON 建议 → 校验合并（备份+diff）
- `dsh-gate --evolve`：通读全部资产（73 记忆 + 105 wiki 页 + 91 技能 + 会话 + 插件现状）→ 输出演进计划 JSON
- `dsh-gate --evolve --apply --plan <file>`：复用已有 plan 应用（关键词增删 + 插件安装 + 自定义插件草稿）
- 演进输出目录：`~/.dsh/evolve/plan-*.json` + `custom-plugins/*.md`
- 已装插件（web profile）：dsh-hooks + dsh-llm-fallbacks + dsh-model-router（装插件需先修 `pnpm-workspace.yaml` 的 allowBuilds）
- 首次演进成果：关键词 +8-3（移除"优化/数学/深度"误报，新增信息论/测度/反例/证伪/数学分析/code review/Lab/形式化）
- 会话采集 bug 已修：会话记录是 `agent/inbox/spliced`，content 在 `data.inserted`（list 结构），需递归提取 text

## 待办/后续
- DSH web UI（`dsh web` → http://127.0.0.1:3080）未启动，如需 GUI 再开
- 版本为 0.1.0-rc.6（预发布），升级注意 profile 兼容
- dsh-hooks 插件（turn/end 通知等）未装，需要时 `dsh plugin --profile web add github:PeterBon/dsh-hooks`
