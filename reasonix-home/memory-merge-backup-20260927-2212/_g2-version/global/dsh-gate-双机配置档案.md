---
id: merged-dshgate双机配置档案.md
revision: 1
created_at: "2026-08-16T14:30:00.000000000Z"
updated_at: "2026-08-16T14:30:00.000000000Z"
name: dsh-gate-双机配置档案.md
description: DSH 双机安装/演进/增强档案
metadata:
  type: user
  fact_type: reference
  scope: global
---

# dsh-gate-双机配置档案.md

> 2026-08-16 合并生成。来源原始件在 ~/.reasonix/memory-archive-20260816/（信息零丢失）。


## 来源：dsh-gate-dual-machine-setup.md

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

## 2026-08-16 增强（锚定极简 + 创造模式 + 并发禁令）

### 1. headless 首轮锚定已启用
`~/.dsh/profiles/headless/cordis.patch.yml` 已打锚定 patch（引用 `~/.dsh/.agent-presets/anchored-standard/tool-bootstrap.mjs`）：
- 首轮工具目录 = 仅 `bash` + `str_replace_editor`（Minimal 工具对，已验证首请求 tools=2）
- persona = `You are a helpful software engineer assistant.`（与官方 Minimal 逐字节一致）
- 首次持久晋升信号（tool/call 或 assistant/message）后开放全量工具
- 首轮剥离 skill-catalog / agent-instructions 自动注入
- 原 patch 备份：`cordis.patch.yml.bak-20260816`

### 2. anchored-standard 预设已装（web 用）
`~/.dsh/.agent-presets/anchored-standard/`（从 xiaobright/dsh-anchored-standard 复制，无需编译；dsh 主包内置全部 @deepseek-ai/dsh-* 依赖）。`dsh web` 启动后新建会话可选 "Anchored Standard (experimental)"。

### 3. 创造模式（Code Mode）
`DSH_TOOLS_MODE=code`（native|code|both）→ headless 首轮工具目录只剩 `run_code`（已验证 tools=1），模型写 TypeScript/Python SDK 程序驱动所有工具。dsh-gate 新增 `--mode code` 参数。

### 4. ⚠️ 并发禁令（2026-08-16 实测）
dsh-gate 临时改写 `~/.dsh/settings.yaml`（trap 恢复）。**同一台机并发调用会互相覆盖 → 会话 disposed（turn/end aborted）**。大决策第一次失败即此因。需要并行时用双机各跑一个（两机 settings 独立）。

### 5. 新技能与记忆
- 技能 `dsh-mode`（模式手册：profile/工具呈现/锚定/插件/集成/日志分析）
- 技能 `dsh-gate` v1.2.0（--mode code、双机分工、并发禁令）
- 记忆 `meta-pro-route-dual-machine`（Pro 必走 dsh + 双机分工铁律）
- 会话日志分析工具：`~/.reasonix/global-workspace/scripts/dsh-analysis/`（analyze-session / fingerprint2 / dump-event / summary）

## 来源：deepseek-v4-flash-ga-0731.md

# DeepSeek V4 Flash 正式版上线（同名原地升级）

## 关键事实（2026-07-31 官方更新日志）
- **DeepSeek-V4-Flash 正式版（版本号 `DeepSeek-V4-Flash-0731`）API 上线公测**
- **切换机制 = 同名原地升级**：模型 id 不变（仍是 `deepseek-v4-flash`），服务端直接替换该 id 指向的权重，客户端（Reasonix 等）零改动自动生效
- 0731 与 Preview 模型结构、尺寸完全一致，仅重新做了后训练（post-training）
- Agent 能力大幅增强，官方基准远超 V4-Pro-Preview：Terminal Bench 2.1: 82.7、NL2Repo: 54.2、Cybergym: 76.7、DeepSWE: 54.4、Toolathlon verified: 70.3、DSBench-Hard: 59.6
- 价格不变：输入 ¥1/百万 tokens（缓存命中 ¥0.02）、输出 ¥2/百万 tokens，并发 2500
- 正式版原生支持 Responses API 格式并针对性适配 Codex
- **DeepSeek-V4-Pro 正式版尚未发布**，Pro API 未改动；官方称"尽快发布"（2026-08 初 Pro 将支持 Responses API）

## Reasonix 侧状态
- `~/.reasonix/config.toml` 无需修改：`default_model = "deepseek/deepseek-v4-flash"` 已正确，2026-07-31 起所有 flash 调用自动为正式版
- 实测验证：`GET /models` 返回 `deepseek-v4-flash`、`deepseek-v4-pro` 两个 id；chat/completions 调用正常

**How to apply:** 未来若 DeepSeek 再升级模型版本，先查 https://api-docs.deepseek.com/zh-cn/updates 更新日志确认是"同名原地升级"还是"新 id"——前者无需动配置，后者才需要改 `config.toml` 中三处模型名。
