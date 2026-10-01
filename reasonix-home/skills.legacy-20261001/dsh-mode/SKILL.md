---
name: dsh-mode
description: DeepSeek Harness (dsh) 模式大全——headless/web profile、native/code/both 工具呈现、首轮锚定极简机制、anchored-standard 预设、插件管理、DSH↔Reasonix 双向集成。需要调 dsh、走 harness、开创造模式、装插件、查会话日志时触发。
version: 1.4.0
---

# dsh-mode — DeepSeek Harness 模式与集成手册

> ## ⚠️ 当前状态（2026-09-04 用户拍板，以此为准）
> **本机（小电脑）不跑 dsh**（性能不足）——调用 dsh 一律走 `dsh-remote`（本机 `~/.local/bin/dsh-remote`，转发到主力机执行，pro+effort=max）。
> 本文件下述「本机 dsh / ~/.dsh / 本机 8 个 live 会话」等内容均为 **2026-08-16 之前本机实跑时期的原理档案**，仅存档参考，不再作为操作指令。主力机 dsh 机制仍适用（同机锁、settings 备份等）。
> 操作规范见记忆 `工具-dsh并发调度与命令铁律-20260904.md`。
>
> 本技能与 `dsh-gate`（调用钩子）互补：dsh-gate 是「怎么调」，本技能是「有什么模式、什么原理、怎么配」。
>
> **2026-09-20：dsh 已升级 0.1.1-rc.2 → 0.1.5-rc.2**（Windows 主力机实测）。**CLI 调用方式未变**——`--profile` / `--patch` / `web` / 位置任务文本全部兼容，`dsh-gate-conc.ps1` 无需改动（已端到端复测通过）。变化集中在：插件默认挂载（`str_replace_editor` 不再默认）、会话日志文件名（`session.v3.jsonl.zstd`）、session 对象 API（`session.events` 移除）。详见 **第十一节**。

## 一、Profile 模式（三种启动形态）

| Profile | 命令 | 用途 | 会话形态 |
|---|---|---|---|
| headless | `dsh --profile headless "任务"` | 单发任务，打印结果退出 | 一次性，无端口 |
| web | `dsh web`（或 `--profile web`） | 浏览器 UI + Web API（http://127.0.0.1:3080） | 常驻服务，可建多会话 |
| tui | `dsh --profile tui` | 终端 UI（本机未装） | — |
| sdk | `dsh --profile sdk` | JSON-RPC stdio，供 SDK client 用（0.1.5 新增） | 常驻进程 |
| sdk-minimal | `dsh --profile sdk-minimal` | 独立极简配置树的 SDK（0.1.5 新增） | 常驻进程 |
| acp | `dsh --profile acp` | ACP stdio，供自动化 client 用（0.1.5 新增） | 常驻进程 |

**dsh-gate 默认走 headless**（轻量、无端口、适合 Reasonix 调用）。web 模式用于 GUI 会话或需要选 preset 的场景。

## 二、工具呈现模式（Tool Presentation Mode）

`DSH_TOOLS_MODE` 环境变量（headless/web profile 的 `tools` 行均读取）：

| 值 | 含义 | 适用 |
|---|---|---|
| native（默认） | 工具以 function calling 呈现，模型直接调用 | 常规 |
| **code** | **创造模式**：只暴露 `run_code` 传输 + 生成 TypeScript/Python SDK，模型写程序驱动所有工具（SDK 绑定精确类型），只有 run_code 可直接调用 | 复杂编码/多步流水线任务，强制收敛到「执行者」路径 |
| both | 两种形式都有，native 调用也可执行 | 混合 |

启用方式：
```bash
# 命令行
DSH_TOOLS_MODE=code dsh --profile headless "任务"
# 或通过 dsh-gate
dsh-gate --mode code "任务"
dsh-gate --mode code --pro "创造模式深度任务"
```

## 三、首轮锚定极简机制（2026-08-16 启用；2026-09-20 适配 0.1.5）

headless profile 已打锚定 patch（`~/.dsh/profiles/headless/cordis.patch.yml`）：

- **首轮**只暴露 Minimal 工具对，persona = `You are a helpful software engineer assistant.`（与官方 Minimal 逐字节一致）
  - Windows（主力机 headless patch）：`pwsh` + `str_replace_editor`
  - Linux / web preset（anchored-standard）：`bash` + `str_replace_editor`（Windows 上该 `bash` 由 `custom-bash.mjs` 以 Git Bash 承载）
- 会话出现首次持久晋升信号（tool/call 或 assistant/message，先到者）后按 **resident set** 收敛：bootstrap 对 + 3 个发现工具（dev_tool_search / skill_search / skill_load）+ 模型显式解锁的工具。headless profile 未挂发现工具，故晋升后仍是 bootstrap 对（实测：首轮 2 → 晋升后 2；web preset 为 2 → 5）
- 首轮自动剥离技能目录提醒 + 工作区指令摘要（True Minimal 不挂载）
- 原理：V4 Pro 对首轮 API 可见工具目录强条件化——Minimal schema 5/5 锚定 "We need" 轨迹（let me≈0），Standard 25 工具 schema 11/11 落入 standard-like（"Let me" 漫游）。来源：xiaobright/dsh-anchored-standard（Project2 实测 98/99 vs Standard 91）

> ⚠️ **0.1.5 起必须显式挂载 `str_replace_editor`**：官方把默认文件工具换成 `read`/`write`/`edit`，`dsh-base` 不再挂载 `@deepseek-ai/dsh-tool-str-replace-editor`。若锚定首轮的工具名缺失，`tool-bootstrap.mjs` 会 `warnOnce` 后**降级为全量工具目录**（锚定静默失效）。headless patch 已补挂载；preset 的 `agent.cordis.yml` 本来就有该行。
> ⚠️ **0.1.5 的另一个必改点（更严重）**：preset 里 `@deepseek-ai/dsh-persona` 的 config 字段由 `text` 改名为 **`prefix`（必填）**。写旧名会让**整个 preset 挂载失败**，web 侧选该 preset 直接 `SessionCreateError`（会话建不出来）。已修，详见第十一节。
> 判定是否退化：跑一次 headless，解压会话看首个 `request/header` 的 tools 数——**2 = 锚定生效，26 = 已退化**。

**验证锚定是否生效**：
```bash
# 0.1.5 起会话文件为 session.v3.jsonl.zstd（旧版为 session.jsonl.zstd，两者并存）
zstd -dc ~/.dsh/sessions/*/session-*/session.v3.jsonl.zstd | python3 ~/.reasonix/global-workspace/scripts/dsh-analysis/analyze-session.py -
# 首个 request/header 的 tools 应为 ['pwsh', 'str_replace_editor']（Linux/preset 为 bash）
```

## 四、anchored-standard 预设（web 用）

已安装到 `~/.dsh/.agent-presets/anchored-standard`（目录复制，无编译）。
用法：`dsh web` 启动 → 新建会话 → 选择 **Anchored Standard (experimental)**。
特性：首轮 Minimal 工具对 + minimal persona；晋升后 resident 集 = bootstrap 对 + 3 个发现工具（dev_tool_search / skill_search / skill_load），重型工具按需解锁；压缩后回到受控阶段。

## 五、插件管理

```bash
dsh plugin --profile web add <包名|目录>   # 装插件（转发给 profile 目录内的 pnpm）
dsh plugin --profile web list             # 列出该 profile 的插件依赖
```
- 插件装在 `~/.dsh/profiles/<profile>/package.json` 的 `dependencies` + `dsh.profile.bundles`
- **0.1.5 实测现状（2026-09-20）**：两个 profile 的 `dependencies` 均为**空** → 无树外插件，`dsh plugin ... list` 因此无输出（rc=0）。bundles 只有内置项：web = `['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']`，headless = `['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless']`
- ⚠️ **订正（本节旧说法与第十节第 3 条一并作废）**：早期的「dsh-hooks / dsh-llm-fallbacks / dsh-model-router 三插件」**已不在 profile 依赖中**。当前：LLM 降级由 `settings.yaml` 的 `fallbacks:` 节承担（见第六节，实测生效）；hook 能力由 0.1.5 随包内置的 `dsh-hooks-claude-code` / `dsh-hooks-codex` 提供，**默认不挂载**，要用需显式挂载
- 0.1.5 随包新增、**默认不挂载**的可选插件（按需 `dsh plugin add` 或写进 patch）：`dsh-hooks-claude-code`、`dsh-hooks-codex`、`dsh-webhook`、`dsh-webhook-github`、`dsh-http-proxy`、`dsh-acp-app`、`dsh-sdk-app`、`dsh-sdk-minimal`、`dsh-tool-present`、`dsh-session-log-export`
- 官方包解析自 dsh 主包 node_modules（0.1.5 内置 240 个 `@deepseek-ai/*` 包）
- ⚠️ 改 profile 的 cordis.patch.yml 前先备份（`cp xxx xxx.bak-YYYYMMDD`）

## 六、模型与成本铁律（与 Reasonix 全局一致）

- 简单任务 → `deepseek-v4.1-flash` + high（省钱）
- 难任务/需 pro → `deepseek-v4-pro` + max（必须走 dsh-gate，不直接用 Reasonix 内置）
- ⚠️ **2026-09-09 起禁止关键词自动判定**（用户拍板）：dsh-gate/dsh-gate-conc 已删除 HARD_PATTERNS——调用方必须显式 `-pro` / `-m <model>` / `-e <effort>`，缺 model 即报错 exit 2。选型由 Reasonix agent 按真实难度判断，不靠任务文本关键词猜。
- ⚠️ **dsh-gate 并发说明（2026-09-04 新架构）**：旧版临时改写 `~/.dsh/settings.yaml`（trap 恢复）不可并发；现行 conc 版用独立 settings 副本可并发（见 dsh-gate 技能）

### 输出上限（maxTokens）—— 2026-09-20 按用户要求放开

**默认值来源**：`dsh-llm-pi-ai` 的 adapter 内置 `DEFAULT_MAX_TOKENS = 32768`。模型条目不写 `maxTokens` 就全部走它 —— 即每个请求的输出上限 32768 tokens（约 2.2 万汉字）。

**当前配置**（`~/.dsh/settings.yaml`，备份 `settings.yaml.bak-20260920-maxTokens`）：
- provider 级 **`defaultMaxTokens: 65536`**（全局兜底，GLM / Gemini 这类窄上限模型也能接受）
- 逐条 **`maxTokens: 262144`**：`deepseek/deepseek-v4-pro`、`deepseek/deepseek-v4.1-flash`、`moonshotai/Kimi-K3`、`gpt-5.6-sol`

**GOAT 实测接受度**（2026-09-20 直连 `/provider/v1/chat/completions` 探测，非推断）：

| 模型 | 32768 | 65536 | 131072 | 262144 | 393216 |
|---|---|---|---|---|---|
| deepseek-v4.1-flash / v4-pro | ✓ | ✓ | ✓ | ✓ | ✓ |
| moonshotai/Kimi-K3、gpt-5.6-sol | — | — | — | ✓ | — |
| zai-org/GLM-5.3 | ✓ | ✓ | ✓ | ✗ | ✗ |
| google/gemini-3.8-flash | ✓ | ✓ | ✗ | ✗ | — |
| claude-*（8 个条目） | 走 `/provider/v1/messages`（Anthropic 形状）；在 chat/completions 下直接报形状错误 |

- **结论**：不同模型真实上限不同（GLM ≤ 131072、Gemini ≤ 65536），**设大值前必须逐模型确认**，否则该模型的任务会以 400 失败。
- **验证配置是否生效**：跑一次 dsh-gate 调用 → 解压最新会话看 `request/header` 的 `data.header.config`，应出现 `"maxTokens":262144`（未配置时该字段不出现）。
- **gate 独立副本自动继承**：`dsh-gate-conc.ps1` 的 `settings-<id>.yaml` 是对全局 settings 全文做 model/effort 替换生成的，故 provider 级与模型级 `maxTokens` 一并带入（已实测副本内出现 1 处 `defaultMaxTokens` + 4 处 `maxTokens: 262144`）。
- 探测命令模板：`Invoke-RestMethod https://api.commandcode.ai/provider/v1/chat/completions -Method Post -Headers @{Authorization="Bearer <key>";'Content-Type'='application/json'} -Body (@{model='<id>';messages=@(@{role='user';content='hi'});max_tokens=<N>;stream=$false}|ConvertTo-Json -Depth 5 -Compress)` —— 看是否 400 以及错误里的上限提示。

**放开后的实测行为（2026-09-20 同日，均在改配置之后）**：

| 任务 | 要求 | 结果 |
|---|---|---|
| 四个基本子空间说明 | 5000 汉字 | ✅ 完整，结果文件 22.7KB / 6173 汉字 |
| 四个基本子空间与秩 | 8000 汉字 | ✅ 完整，结果文件 45.7KB / **10287 汉字**，自然收束无截断 |
| 矩阵分解全景 | **30000 汉字**（≈ 40K tokens） | ❌ 流式中途失败：事件 `llm/retry` → `{"message":"Stream ended without finish_reason","code":"TRANSPORT"}`，随后 `llm/retry-started`（策略 maxRetries=5、退避 500ms→10s、抖动 0.1，覆盖 EMPTY_RESPONSE/RATE_LIMIT/SERVER/TIMEOUT/TRANSPORT）；该会话 15 分钟无新事件、无任何 assistant 内容落盘 → 手动停掉进程（status 转 failed） |

- **结论（关键区分）**：`maxTokens` 放开解决的是「被上限截断」；**一次生成几万字的瓶颈是流式传输时长/稳定性，与 maxTokens 无关**。长任务仍应分块 —— 与 `bilingual-ocw-translator` 既有的「单块 ≤18KB」规范一致。
- **卡住时怎么收**：`dsh-gate-conc.ps1` **没有 kill 参数**；按进程命令行匹配 TaskId 定位后停进程：
  `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'dsh' }` → 找到对应的 `dsh-gate-runner.ps1 <TaskId>` 与 `node ... bin.js --profile headless --patch ...` 两个 PID，`Stop-Process -Force`（注意别误伤同时在跑的其它任务）。
- **诊断入口**：会话事件里的 `llm/retry` / `llm/retry-started` / `assistant/attempt`。

### 流式中断与重试（2026-09-20 上游调查 + 两档并存落地）

**触发器**：长输出时流式连接中途断，事件 `llm/retry`，`failure.code=TRANSPORT`、`message="Stream ended without finish_reason"`。

**重试机制**（`@deepseek-ai/dsh-llm-retry` 执行，策略归 provider 的 `retryPolicy` 所有）：
- `mode: normal`（默认）：可重试码 `EMPTY_RESPONSE` / `RATE_LIMIT` / `SERVER` / `TIMEOUT` / **`TRANSPORT`**；默认 `maxRetries=5`（实测 policyKey `["normal",5,[...],500,10000,0.1]` 与文档一致）；退避 500ms→10s、+10% 抖动。
- `mode: always`：**无尝试上限**，重试到成功/取消/插件卸载；对**确定性错误也重试**。
- **不可重试**：`CONTEXT_WINDOW_EXCEEDED` / `QUOTA` / `INVALID_CREDENTIAL` / `MISSING_CREDENTIAL` / `NO_ADAPTER` / `DUPLICATE_ADAPTER` / `INVALID_MODEL_INFO`。
- 关键语义（官方文档）：重试**重建同一个显式请求、在同一份持久历史里重跑失败步骤**，且"失败的部分 chunk 永不进入派生消息"。
- 我们的配置（`settings.yaml` → `commandcode-goat`）：normal + `maxRetries: 8` + 退避 1s→30s + 抖动 0.2（备份 `settings.yaml.bak-20260920-retry`）。旧式扁平字段 `maxRetries` / `maxRetryDelayMs` 写在 provider 顶层会被 pi-ai **拒绝启动**，必须嵌在 `retryPolicy:` 下。
- **两套并存**：`dsh-gate-conc.ps1 -AlwaysRetry` 在生成独立 settings 副本时把该段 `mode` 改成 `always`（详见 `dsh-gate` 技能同名小节）。

**上游相关 issue（GitHub: deepseek-ai/deepseek-harness，均为 discussions）**：

| 编号 | 现象 | 与我们的关系 |
|---|---|---|
| #1263 / #2143 | max-tokens 截断 + **tool call 在飞行中** → `assistant/message` 与 pi-ai replayState 块数不一致 → 下一轮 `INVALID_REPLAY_STATE`，**会话永久不可继续**（官方 UI 提示的"Send 'continue'"反而直接失败） | 已由 **commit `7e95a00`** 修复 |
| #373 | 流干净 EOF 但无 terminal finish → 被当成功提交，**绕过重试**、污染历史 | 同类缺陷的另一分支（修复方向：fail closed 并交给 retry） |
| #978 | tool call 成功后的那一轮 LLM 请求必然 TRANSPORT（headless 5/5 失败，web 1/1 成功） | 同为 TRANSPORT，触发条件不同 |
| #4341 | pi-ai 把 WebSocket 失败压成文本、分类器漏词 → 落到 `PI_AI_ERROR` 而不进重试 | 修复提案 |

- **commit `7e95a00` 已包含在我们的 0.1.5 里**（本地验证）：写入侧用 version-2 `ReplayEnvelope`（`readReplayState` 要求 `kind==="pi-ai"` + `version===2`）；读侧 `toPiAssistant(message, onDegrade)` 在状态不可用时 `onDegrade?.(...)` + `foreignAssistant(message)` **降级重建**而不是抛错 —— 因此"截断后不能继续"的毒化场景在当前版本已缓解。

**"发继续"到底行不行（实测结论）**：
- **web**：官方 UI 就是这么引导恢复的，且会话可 resume ✓
- **headless**：**不支持 resume** —— 实测 `dsh --profile headless --resume <id>` → `error: unknown option '--resume'`。所以 gate 走的 headless 会话中断后**不能续写**，只能重跑或分块重发。
- 本机 headless patch 只暴露 `-h/--help`；`--resume` 是 tui/web 侧 app 插件的参数。

**实测：超长单次生成不可靠（两次同规模对照，均失败但失败点不同）**：
| 次 | 配置 | 结果 |
|---|---|---|
| 第 1 次 | maxRetries=5 | 流式中断 TRANSPORT → `llm/retry-started` → 15 分钟无新事件（卡在重试流），手动停进程 |
| 第 2 次 | maxRetries=8 | 连首个流事件都没回来，8 分钟无 `assistant/attempt`，手动停进程 |

→ **瓶颈是流式传输时长/稳定性**，不是 maxTokens、也不是重试次数。长任务必须分块（与既有「单块 ≤18KB」规范一致）。

## 七、DSH ↔ Reasonix 双向集成

| 方向 | 机制 | 状态 |
|---|---|---|
| Reasonix → DSH | `dsh-gate` 钩子：难任务/需 pro 自动调 DSH headless，只整合结果不重复推理 | ✅ |
| DSH → Reasonix 记忆 | dsh-gate 注入 `~/.reasonix/memory` 目录（含画像），DSH 按需读取 | ✅ |
| DSH → Reasonix 技能 | dsh-skill-filesystem 的 `customSkillDirs` 指向 `~/.reasonix/skills`，skill_search/skill_load 可发现 | 可配 |
| DSH 输出落盘 | 本机 `/tmp/dsh-gate/`，主力机 `%TEMP%\dsh-gate\` | ✅ |

## 八、会话日志分析工具

`~/.reasonix/global-workspace/scripts/dsh-analysis/`：
- `analyze-session.py <jsonl>` — 打印每个 request/header 的模型、effort、工具目录、system 开头
- `fingerprint2.py <jsonl>` — 统计 reasoning 指纹（we / let's / let me）与字符数
- `dump-event.py <jsonl> <type> [n]` — dump 指定类型事件
- `summary.py <jsonl>` — 事件类型分布 + 最后事件 + error

用法：`zstd -dc <session.v3.jsonl.zstd> > /tmp/x.jsonl && python3 analyze-session.py /tmp/x.jsonl`
（0.1.5 起文件名带 `.v3.`；0.1.1 及更早为 `session.jsonl.zstd` — 两者并存于同一会话目录时，取 v3）

## 九、已知坑

1. dev-sidecar 死代理会挂 npm（已清用户级代理变量）
2. headless 无 preset 选择——锚定靠 profile patch；web 才有 preset 选择
3. 会话日志按 cwd 分组：`~/.dsh/sessions/<cwd-encoded>/`
4. 本机 dsh 在 `~/.local/node22/bin/dsh`（系统 node 18 未动），主力机在 npm 全局
5. **（0.1.5）会话文件是多帧 zstd**：`session.v3.jsonl.zstd` 由大量独立 zstd 帧拼接（一个会话实测 720 帧），**Node 的 `zstdDecompressSync` 只解第一帧**（表现为"解压后仅剩 header 行"，本次踩到）。逐帧解压法：扫描 magic `28 b5 2f fd` 的每个 offset，对 `buf.subarray(offset)` 调 `zstdDecompressSync`，按 `type+seq` 去重（脚本已存 `~/.dsh/_backup-20260920-upgrade/dump-session.mjs`）。zstd **CLI**（`zstd -dc`）按标准支持多帧拼接，`dsh-gate.sh` 的 `find -name "*.zstd"` + `zstd -dc` 因此无需改动；若某次输出明显截断，再改用逐帧脚本。
6. **（0.1.5）profile 的 `node_modules` 是被 CLI 改写的 junction**：`~/.dsh/profiles/node_modules/@deepseek-ai/*` 全是指向 *当前 dsh 安装目录* 的 junction，**每当任何一个 dsh CLI 实例启动就会重建**。用临时目录里的 dsh 跑一次，就会把生产 profile 的 249 个链接全部改指到临时目录（本次实测踩到，用生产 `dsh --profile headless ...` 跑一次即可自动改回）。做版本对照实验时，务必用独立的 `DSH_HOME`，不要只换 CLI 路径
7. **（0.1.5）插件默认挂载变化**：`str_replace_editor` 不再默认（见第三节）；`tool-subagent-report` 已并入 `dsh-tool-subagent`；`dsh-client-runtime` / `dsh-host-apiproxy` / `node-addon-landlock-run` 不再随包分发（升级后会留下 9 个失效 junction，须手工删）
8. **（0.1.5）preset 的 persona 字段改名（最隐蔽的坑）**：`@deepseek-ai/dsh-persona` 的 config 由 `text`（0.1.1）改为 **`prefix`（必填）**，另有 `suffix` / `complete` / `includeRuntimeContext`。写旧名 `text` → 该行 `invalid config` → **整个 preset 挂载失败** → web 侧选该 preset 时「选择工作区」报
   `SessionCreateError: agent-preset/invalid: agent-presets: preset "<name>" failed to mount: failed to apply loader entry persona (@deepseek-ai/dsh-persona): invalid config`
   **表现**：点了工作区也进不去会话（页面始终无输入框）。**诊断法**：这个错误**只在浏览器 console 里**（`console.warn`），服务端 stdout 不打印 —— 必须用 `page.on('console')` 抓；单看 dsh 进程输出会误判成"UI 卡住"。

## 十、2026-08-16 实测事实（v1.1 新增，防止错误结论扩散）

1. **锚定机制生效但轨迹未迁移**：本机 8 个 live 会话首请求 tools=2（bash+str_replace_editor）100% 生效，但 reasoning 首行全部 "Let me …"（let_me=6~143），**无一 "We need"**。上游 98/99（Project2 英文编码任务）在本机中文架构任务上**不成立**。正确预期：锚定 = 首轮噪声隔离与成本结构优化，**不是**轨迹风格保证；不要以 we/let me 指纹作为本机 dsh 健康度指标。
2. **settings.yaml 中继状态**：dsh-gate 运行时临时改写 settings.yaml（trap EXIT INT TERM 恢复）；SIGKILL/断电会残留 pro+max，下个简单任务烧 pro。已加固：flock 并发锁（同机第二实例 exit 9）+ 启动预检（发现 .bak 即恢复）。**dsh-gate 同机不可并发**。
3. **三插件实态**：dsh-hooks 0.2.2 原本未配（2026-08-16 已补 turn/end 落盘）、dsh-llm-fallbacks 0.1.4 默认关（已补 settings.yaml `fallbacks:` 节，pro 失败降 flash）、dsh-model-router 0.8.1 auto 保留。⚠️ **2026-09-20 作废**：三个外装插件均已不在 profile（`dependencies` 为空），见第五节订正与第十一节。
4. **routing-suite 结论**：不装。issue #13（首轮路由结构性失效，所有会话首轮落 weak）+ PR #10 只修 near-field + 与 dsh-gate 功能重叠。复查触发：issue #13 关闭 + 官方 rc.7 发布后再评估。（注：dsh-gate 的 HARD_PATTERNS 关键词判定已于 2026-09-09 废除，routing-suite 更无重叠价值）

## 十一、2026-09-20 dsh 0.1.5-rc.2 升级档案（Windows 主力机）

**升级**：`npm i -g @deepseek-ai/dsh@0.1.5-rc.2`（0.1.1-rc.2 → 0.1.5-rc.2，npm latest；alpha 通道当时为 0.1.6-alpha.2，未采用）。
**备份**：`~/.dsh/_backup-20260920-upgrade/`（settings.yaml、.env、整个 .agent-presets、两个 profile 的 yml、npm 全局包清单，以及本次写的一次性工具脚本 `dump-session.mjs` / `scan-zstd.mjs`）。

### 兼容性核查结论（升级前逐项实测）

| 检查项 | 结论 |
|---|---|
| CLI 参数面 | **未变**：`--profile` / `--patch` / `web` / `plugin` / `--dump-config` 全兼容；新增 sdk / sdk-minimal / acp profile |
| 包清单 | 0.1.1 的 196 个 `@deepseek-ai/*` 包 → 0.1.5 只少 4 个（`dsh-client-runtime`、`dsh-host-apiproxy`、`dsh-tool-subagent-report`、`node-addon-landlock-run`），其余 240 个健在；`dsh-llm-pi-ai` / `dsh-llm-deepseek` / `dsh-web-search-deepseek` / `dsh-tool-str-replace-editor` 均在 |
| settings schema | `id: settings` + `config.path`（dsh-gate 的 patch 注入点）未变；`persona` 字段仍有效；`llm-pi-ai` provider 路由、`fallbacks`、`agent-loop.maxParallelToolCalls`、`web-search-deepseek.maxUses` 全部照旧生效（gate 实跑证实） |
| 会话文件 | `session.jsonl.zstd` → **`session.v3.jsonl.zstd`**（旧文件保留可读） |
| session 对象 | **`session.events` 已移除**（0.1.1 是数组）；0.1.5 提供 `snapshotEvents(fromSeq, toSeqExclusive)` + `log`；`session.header` 仍在 |
| 默认工具挂载 | `str_replace_editor` 不再默认挂载（官方改推 `read`/`write`/`edit`），需 profile/patch 显式 insert |
| **persona config** | **`@deepseek-ai/dsh-persona` 的字段 `text` → `prefix`（必填）**，新增 `suffix`。写旧名会让整个 preset 挂载失败（web 建不出会话） |

### 本次改动的四处

1. `~/.dsh/profiles/headless/cordis.patch.yml`：在 `insert:` 尾部补挂 `@deepseek-ai/dsh-tool-str-replace-editor`（`maxOutputChars: 16000`），并加注释说明原因。
2. `~/.dsh/.agent-presets/anchored-standard/compaction-epoch.mjs`：新增导出 `sessionEvents(session)`（优先 `snapshotEvents()` → 兼容旧 `events` → 兼容可迭代 `log` → 兜底空数组），`scan()` 改用它；`tool-bootstrap.mjs` 的 `unlockedFor()`、`instruction-hint.mjs` 的 `hintIsDurable()` 同步改为 `sessionEvents()`。
   - **回归根因**：`for (const event of session.events)` 在 0.1.5 抛 TypeError，被 `tool-bootstrap.mjs` 的 catch 吞掉后返回**全量 26 工具目录** → 锚定静默失效。修前实测首轮 26 工具，修后 2 工具。
3. `~/.dsh/.agent-presets/anchored-standard/agent.cordis.yml`：`persona` 行的 `text:` → **`prefix:`**（0.1.5 的 schema 必填字段），并加注释说明回滚时需改回 `text`。
   - **回归表现**：preset 整体挂载失败 → web 侧「选择工作区」报 `SessionCreateError ... agent-preset/invalid ... failed to apply loader entry persona`，**会话根本建不出来**；错误只出现在浏览器 console，服务端无输出。
4. 清理 9 个失效 junction（见第九节第 7 条），并重建 240 个被临时 CLI 改指到临时目录的 junction（见第九节第 6 条）。

### 升级后验证证据

- headless 首轮 tools = `pwsh, str_replace_editor`（2 个，**与 0.1.1 一致**）；带工具任务实跑成功（pwsh echo 返回）
- `dsh-gate-conc.ps1` 同步调用端到端通过：`-Model deepseek-v4.1-flash -Effort high` → 4s 返回，状态 `✅ 完成`；**异步**（schtasks 脱离会话）派发 → 4s 完成 → 产物 13B 落盘
- web profile 启动正常（端口监听、401 授权围栏、token URL 打印）；240 个插件包全数解析
- **web preset 端到端（2026-09-20 补测，puppeteer + Chrome 131）**：修复 persona 字段后 —— ① 选工作区成功建会话（无 `SessionCreateError`，UI 出现输入区）；② 发一条消息得到回复（2s、1.3K tok、缓存命中 86%）；③ 会话 header `agentPreset=anchored-standard`；④ **首个 `request/header` 的 tools = `bash, str_replace_editor`（2 个）** —— 证明 preset 的 7 个插件（含 Windows 上的 `custom-bash`）在 0.1.5 下全链路正常；⑤ 全程无 console warning/error
- `sessionEvents()` 单元测试四形态通过（snapshotEvents / legacy events / 可迭代 log / 缺字段），epoch 语义正确（compaction/end 后重新计龄）

### 回滚

`npm i -g @deepseek-ai/dsh@0.1.1-rc.2` + 从 `_backup-20260920-upgrade/` 恢复 `settings.yaml`、`.agent-presets/`、`profiles/*/cordis.patch.yml`（`sessionEvents` 补丁对 0.1.1 向后兼容，可不回退）。

### 未完成

Linux 天阙机（100.79.96.82）升级时 **offline（已 7 天未上线）**，双机版本暂不一致（Linux 仍 0.1.1-rc.2）。上线后需同步：`npm i -g @deepseek-ai/dsh@0.1.5-rc.2` + 补挂 `str_replace_editor` + 打同一个 `sessionEvents` 补丁 + 重建 junction + 跑一次锚定验证（若 0.1.5 会话在 Linux 上也变 26 工具，即为未打补丁的表征）。

### preset 插件兼容性核查（anchored-standard 7 个 mjs）

| 插件 | 依赖的 0.1.5 接口 | 核查结果 |
|---|---|---|
| `tool-bootstrap.mjs` | `system-prompt/assemble`、`session/event`、`agent/request`、`ctx.logger` | 事件存在；已改 `sessionEvents()`；headless **实测通过** |
| `context-gate.mjs` | `agent/pre-step`、`system-prompt/assemble`、`session/event`、`ctx.logger` | 事件存在；经 `createEpochPromotion` 间接受益于修复 |
| `compaction-epoch.mjs` | `session.snapshotEvents()` | **本次新增兼容层**（根因所在） |
| `instruction-hint.mjs` | `agent/pre-step`、`session/event`、`ctx.fs`、`user/message` | 事件存在；已改 `sessionEvents()` |
| `skill-search.mjs` | `ctx.skills`、`ctx.tools` | 接口面未变（web 侧验证） |
| `dev-tool-search.mjs` | `ctx.tools` | 接口面未变 |
| `custom-bash.mjs` | `ctx.subprocess`、`ctx.tools`、`session.header.cwd` | `session.header` 仍在（本次探针实测 header 为 object） |

事件名存在性：`agent/pre-step`、`agent/request`、`session/event`、`system-prompt/assemble`、`compaction/end`、`assistant/message`、`tool/call`、`user/message` —— **8/8 在 0.1.5 中存在**（逐名在包内定位到定义处）。

### web preset 路径的验证（已打通，含踩坑复盘）

- **初始症状**：无头浏览器里点「选择工作区」→ 选目录候选后**进不去会话**（页面始终没有输入框）。合成 click、真实 mouse 事件、URL 深链三种方式都试过 —— 当时误判为"UI 自动化难题"。
- **真相**：抓 `page.on('console')` 后才看到根因是 **preset 挂载失败**（`SessionCreateError ... failed to apply loader entry persona: invalid config`）—— 即第 3 处改动（`text` → `prefix`）。**这个错误只在浏览器 console，dsh 进程 stdout 完全没有**。教训：web 侧"点了没反应"要先抓浏览器 console，不要先怀疑 UI 自动化。
- **修复后完整链路**（可复现，脚本存 `_backup-20260920-upgrade/web-verification/preset-e2e.cjs`）：
  1. `dsh web --no-open --port <p>` 启动，从输出取 `?token=...`（token 每次启动都变，必须现取）
  2. `puppeteer.launch({ headless: true, executablePath: '<Chrome 131 路径>' })`（puppeteer 25 自带期望 Chrome 150，本机缓存只有 131，需显式指定；Edge 亦可）
  3. `page.goto(url)` → 等 ~9s → 点「选择工作区」→ 点目录候选（如 `27063`）→ 等 ~6s
  4. 会话页出现 `[contenteditable="true"]` → `click()` 聚焦 → `page.type()` → `keyboard.press('Enter')` → 等 ~25s
  5. 用 `dump-session.mjs` 解压最新 `session.v3.jsonl.zstd`，检查 header 的 `agentPreset` 与首个 `request/header` 的 tools
- **通过判据**：`agentPreset=anchored-standard`、首轮 `tools = [bash, str_replace_editor]`、无 console warning/error
- **另一结论**：**preset 是 web 专属路径，headless 无法承载** —— 用 `--patch` 在 headless 里 `disabled: true` 掉 profile 的 tool-bootstrap 再 insert `@deepseek-ai/dsh-agent-presets`（配置树正确、插件行确实出现），会话仍拿不到 preset（`agentPreset` 为空、首轮 26 工具）。与第九节第 2 条一致。

> ⚠️ 排查脚本（多帧解压）在 `~/.dsh/_backup-20260920-upgrade/dump-session.mjs`，用法：`node dump-session.mjs <session.v3.jsonl.zstd> <out.jsonl>`。
> 另注：本机 `bash` 工具里的 `$env:TEMP` 被 Reasonix 重定向到 `reasonix-session-tmp-*`，与真实 `%TEMP%` 不同 —— 传路径给 dsh 的 `--patch` 时必须用**绝对真实路径**，否则 dsh 报 `failed to read overlay`（本次踩到，一度误导了探针结论）。

---

> 以下第十二节为 2026-10-01 从 Windows 侧版本（v1.1.0）合并回来的独有内容；本文件其余章节以 v1.3.0（2026-09-20）为准。

## 十二、2026-09-11 实测事实（长任务必须 --async；-e 曾长期失效）

> 起因：用户报告 agent 调主力机 dsh 时「通知也没了」+「经常失败」。以下均有双机对照实验支撑。

### 1. 同步调用在 ~167s 丢失结果 —— 长任务必须 `--async`
同一任务/模型/`-e high` 的决定性对照：

| 调用方式 | 结果 | 耗时 | 输出 |
|---|---|---|---|
| 同步 `dsh-remote`（SSH 前台） | ❌ `rc=1` | 167s | **0 字节（stdout+stderr 全空）** |
| `--async`（schtasks 脱离 SSH 会话） | ✅ `done` | **192s** | 6426 字节 |

唯一变量是**进程树归属**。此项是 `-Async` 机制（本文件第一节）的强力佐证：不仅"S​SH 断开时保命"，**长任务在 SSH 前台本身就不可靠**。

已逐项排除：
- **API 上游**：同 prompt 用 curl 直打 `api.commandcode.ai`（走 dev-sidecar 代理）→ **148s / HTTP 200 / 10.37MB 成功**
- **dev-sidecar 代理**：`curl --noproxy '*'` 亦正常
- **Node 内存**：`NODE_OPTIONS=--max-old-space-size=8192` 无效，仍 167s `rc=1`
- **SSH/TCP/保活**：同 IP 字面量方式 SSH 空跑 **210s 后 `rc=0` 返回**
- **传参/长度/并发**：手动直调 `dsh --profile headless --patch ...`（绕过 dsh-remote）同样 168s `rc=1`；2462 字符占位任务成功

失败耗时刚性集中在 164–181s，成功 4–199s；失败时**零诊断输出**（= 进程被外部终止、来不及 flush）。
**操作结论：预计 >90 秒的任务一律 `--async`。**

### 2. `-e/--effort` 曾长期完全失效（2026-09-11 已修）
- 根因：`settings.yaml` 的 `agent-default-model:` 段**没有 `reasoningEffort:` 键**，而 `dsh-gate-conc.ps1` 只用
  `-replace '(?m)^  reasoningEffort: .*$'` → **静默空转**（无匹配即无操作、不报错）。
- 铁证：`-e high` 与 `-e off` 生成的 settings 副本 **SHA256 完全相同**。「用 `-e` 区分算力」此前是空文。
- 修复：`settings.yaml` 补 `reasoningEffort: high`；脚本改为**按键存在性判断**+写入校验。
- 验证：`-e off` → hash `C895E599…`，`-e max` → `hash D520EF91…`，两副本不同 ✔

### 3. 踩坑（自引入后已修，务必记住）
第一版修复用「`-replace` 前后是否变化」判断键是否存在；当 `-Effort` 恰好等于原值（`high`）时替换结果不变 →
误判为「无该键」→ **重复插入 → `DUPLICATE_KEY at line 7` → dsh 启动即失败（2s、4158B 报错）**。
**判断 YAML 键存在性必须用 `-match`，不能靠替换前后差异。**

### 4. 失败可见化（已落地）
`dsh-gate-conc.ps1` 现在把 `rc / 耗时 / 输出字节` 写进 `status.note`，并落盘 `.diag.txt`（含原始 stdout+stderr）。
实测输出形如 `完成 192s 6426B`、`失败 rc=1 0s 输出=5B`。此前只写"失败"，等于无信息。

### 5. 通知约束（已落地）
通知链路本身完好（本机 `notify-send` + 主力机反向 SSH 均实测发出横幅）。
「通知没了」的真因是**调用方在 9 处调用上全加了 `--no-notify`**。
**铁律：除非用户明确要求静默，禁止 `--no-notify`。**

### 6. 未钉死项
~167s 这个数字的**最底层触发者**（为何 167s 而非 SSH 实测的 210s 上限）未定位到具体代码行；
现象、边界与规避方案已被对照实验确定，规避方案（`--async`）已实测有效。
