> 来源：本技能原 `SKILL.md` 第五～六节（2026-10-01 重排时逐字保留，未作压缩）。第六节含模型与成本铁律、maxTokens 输出上限实测、流式中断与 retry。

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
