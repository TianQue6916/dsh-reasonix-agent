# 05 · 上下文预算、推理链与压缩

> 一句话概括：context window 是物理墙，compaction / compress 是三层权限不同的删改权，prefix cache 是对删改最敏感的账本——钱与故障都落在「谁动了 prefix」这一件事上。

## D 定论

1. window 只有三个数是真的：上游 registry 的 native 值（`/v1/models` 报 `deepseek/deepseek-v4.1-flash context_length=1000000`）、bili 的生效值 `native × (1 − 25% output headroom)`、dsh 侧 compaction 阈值。任何第三方配置文件改掉其中一个数，故障都在下一个数上显形。
2. `compress.modelContextLimit` 不是省钱旋钮，是自杀按钮。它制造 preflight 硬墙；一旦 `context ≥ 硬墙`，每轮都触发 fold，而 fold 本身要发一次带全历史的 summary 请求——被同一堵墙拦下 ⇒ `futile round` 死锁，`retryable:false`，整条会话不可救。永远不低于真实窗口。
3. compaction 分三层，可按可逆性排序：工具输出裁剪（pruner / headroom，可 retrieve）< bili wire 层 fold（自己的 raw history 还在）< dsh native compaction checkpoint（bili 逐字：`a landed dsh checkpoint would durably shadow the raw history`，不可逆）。越不可逆的层，越只能手动触发。
4. cache hit 退化的第一元凶从来不是「压缩太频繁」，而是 ① 会话内切模型 ② `degenerate-fold`（一次压掉 89–94% 上下文、anchor 只剩 1.5–2.3K token ⇒ 整个 prefix 重写）。`compress re-pay` 只占 miss 的 4.8%，与社区基线「压缩本身只吃掉 ≤2%」同量级。
5. `finish_length` 不是「模型话没说完」。本机 4 条 `finish=length` 全部是 session title 的辅助请求：`maxOutputTokens: 64` 且继承主 session 的 thinking route ⇒ reasoning 吃光 64 token 预算。
6. 思考链语言不是「提示词没写好」，是回灌自锁：上游把上一轮自己的 `reasoning_content` 原样灌回去，模型看见自己过去几十段英文独白 ⇒ 继续英文。破法是棘轮（非中文 reasoning 不回灌、中文原样保留），不是加强 system 契约。
7. `/compress` 不存在。斜杠命令只有 `/compact`（走 native compaction pipeline）；`compress` 是 tool，一次调用给完所有 range，summary 必须自己写。

## M 机制

### M1 上下文账本（四个独立计数器）

| 计数器 | 来源 | 现状值 | 谁在读 |
|---|---|---|---|
| native window | registry / `/v1/models` | 1,000,000 | `/__bili/sessions` 的 `contextWindow` |
| bili 生效 window | `native × (1 − 25%)` | 868,928（1M − 131,072） | bili preflight、nudge |
| dsh compaction 阈值 | `floor(min(W×thresholdRatio, (W−reserved)−headroom))`，默认 `thresholdRatio 0.8` / `headroomTokens 65536` / `reserved`≈65536 | W=1e6 时 800,000 | `@deepseek-ai/dsh-compaction-basic/lib/index.js:15,124–142,940–941` |
| `tokenMeter.measure(session).totalTokens` | 真实 usage + surface delta | 运行期唯一真值，从不写进 event log | 触发判据 |

三条生效 window 的实测刻度（同一台机、同一个 1M 上游）：

$$W_{eff} = W_{native} \times (1-0.25) \;\Rightarrow\; 200000 \to 150000,\quad 1M(\text{maxTokens }32768) \to 967232,\quad 1M(\text{maxTokens }131072) \to 868928$$

账本虚高事故（本机最贵的一个 bug）：`dsh-token-meter/lib/index.js:654` 的门控 `baseline = usage !== void 0 && usageTokens(usage) >= estimatedAnchorTokens ? {kind:"usage"} : {kind:"estimated"}` 把 char-based 估算（`CHARS_PER_TOKEN = 4`）当下界。per-step 注入（`plan-anchor` / `git-context` / `thinking-anchor`，经 `dsh-agent-loop/lib/index.js:1061` 每 step 无条件 append）把估算撑到真实值的 ~10 倍 ⇒ 真实 usage 永远够不到门槛 ⇒ 判据退化成纯 heuristic 账本。取证：账本 ÷ 真实 prompt 第 1–10 次 0.60–0.76（CJK 被 chars/4 低估，健康），第 11–13 次 9.50 / 9.75 / 10.56，压缩发生在窗口的 11.2% / 15.7% / 10.0%。修法：去掉那个 `>=`，`totalTokens = 真实 usage + surfaceDeltaTokens`。

### M2 三层压缩的分工

| 层 | 触发者 | 动作 | 可逆性 | 开关 |
|---|---|---|---|---|
| L1 工具输出裁剪 | 每次 tool round-trip | `tool-result-pruner`：`thresholdChars 8192→32768`、`headChars 4096`、`tailChars 1024`；`dsh-headroom` 挂 `tools/post-execute`，原文进 CCR store `~/.dsh/storages/dsh-headroom-ccr.json`，注入 `[headroom: …]` marker + `headroom_retrieve(id=…)` | 可逆（store 里） | preset / profile patch |
| L2 wire 层 fold | bili，模型驱动 | 注入 `compress` / `decompress` / `search_context` / `acp_status` 四个工具；`nudgeGrowthTokens 50K→150K`、`preserveRecentTokens 5000→20000`、`preserveRecentMessages 3→10`、`maxContextLimit 60%`、`emergencyThresholdPercent 95%`、`compress.reasoning {drop:true, threshold:2048}` | raw history 仍在 | `C:/Users/27063/.config/billion-context/billion-context.json`（启动快照） |
| L3 native compaction | dsh `compaction-basic` | 调模型产出 checkpoint 摘要，durably shadow 原始历史 | 不可逆 | `auto:false`（只关自动）+ bili `dsh.allowDshCompaction`（管 wire 层放行） |

L3 是两层开关，缺一不可：`auto:false` 防自动破 cache；`allowDshCompaction:true` 让 `/compact` 能用。而 bili 0.1.204 把 `allowDshCompaction` 的 opt-in 删掉（issue #3651）⇒ 拒绝变成无条件，`/compact` 回 422 `dsh_compaction_refused`，dsh 再把它包装成误导性的 `Compaction could not produce a useful summary.`。

L2 的 preflight 硬墙：`compress.modelContextLimit` 是预检压缩的硬墙，不是截断上限。271k 上下文 + 150k 墙 ⇒ 每轮 fold；raw 折叠与 tier-distillation 都拿不到 summary（`0 summary call(s)` / `distillation summary was unavailable`）。死锁的数学本质：压缩的前提是能发一次带全历史的 summary 请求，而这次请求被同一堵墙判死。

L1 的隐藏成本见 X2：headroom 不是无损。

### M3 autofold 有两套，别混

auto compaction（`auto: true`）：社区 issue #1772 记录 preset group 内嵌的 `compaction-basic` 实例无法被 `- id: compaction-basic` patch 触及。本机 `--profile web --dump-config` 里 `- id: compaction-basic` 共 5 处：顶层 `:727` 已被 dsh-web-app 设 `disabled: true`；group 内 4 处（`:1197` / `:1379` / `:1643` / `:2145`）无 config 无 disabled ⇒ 默认 `auto: true`。overlay 试验 `- id: compaction-basic / config: {auto: false}` 只改到顶层，group 内 4 处纹丝不动。⇒ 本机曾同时跑两套压缩（原生 `compaction/summary` 14 次 + bili `compress` 104 次）= 「上下文消失」的真身。

reasoning row autofold（UI）：思考行默认折叠、`running=true` 强制展开、结束自动收回。改产物 `lib/client.js:5719`：

```js
- const { expanded, toggle } = useDisclosure();
+ const __dspDisclosure = useDisclosure();
+ const expanded = running || __dspDisclosure.expanded;
+ const toggle = __dspDisclosure.toggle;
```

标记串是 `__dspDisclosure`，不是字符串 `reasoning-autofold`（按后者 grep 会误判 0 命中）。`dsh-client-modules/lib/index.js:815,946` 每次请求都 `readFileSync(clientPath)` ⇒ 刷新页面即生效，无需重启。desktop / asar 侧从未打过：新旧串长度不同（1 行 → 3 行），asar 不能等长替换，改 size 会让后续 entry 的 offset 全位移。

### M4 推理链语言的三层管道

1. 配置层：`~/.dsh/storages/thinking-language.json` 全文 `{"thinking": "zh"}`；`thinking-anchor` 每 step 注入，顺序 `git-context → plan-anchor → thinking-anchor`（thinking-anchor 最贴采样点），早期每次仅 44 tokens ≈ prompt 的 0.05%。
2. 回灌层（真凶）：`@earendil-works/pi-ai/dist/api/openai-completions.js:996-1005` 把上一步 thinking 以 `reasoning_content` 回灌，字段表在 `:138` `OPENAI_COMPLETIONS_REASONING_FIELDS = ["reasoning","reasoning_content","reasoning_text"]`。离线消融（同一请求重复 6 次）：原样 0/6 中文；删掉回灌 4/6；回灌换中文 3/6（Fisher p≈0.033）⇒ 回灌是语言自锁的唯一载体，同时解释「锁死几天 / compaction 或重启后翻转 / 短上下文抛硬币」三种现象。
3. 过滤层：goat-gateway 的 `reasoning-echo-filter`，开关 `D:\Toolbox\goat-gateway\logs\.reasoning-filter.json` = `{"enabled": true, "minCjk": 0.25, "mode": "strip", "uaHints": ["deepseek-harness"]}`（删掉即关闭）。棘轮实测：首条 `ECHO-FILTER id=1 dropped=27 kept=0 chars=116281` → 末期 `dropped=1 kept=12`；CJK 中位 0.000/0% → 0.487/91% → 0.504/96%。

已排除的伪因（消融都做过）：工具调用数量（带 tool-call 的 2565 步 cjk 中位 0.47）、tools 个数单调性（0/2/6/10/13/18/26 → 4/3/0/1/1/2/4）、注入语料中文化（0.000–0.017）、锚点加长/换位/给 system 角色（0.000–0.009）、`temperature=0`（仍 3/5）、英文 bulk 137k token。

### M5 cache 的物理

prompt cache 是前缀匹配：prefix 任一字节变化，其后全部失效。miss 归因只有四类（bili `GET /__bili/cache-report` 的 GRAND LEDGER）：`new content` / `compress re-pay` / `model switch` / `restart-refork`，剩下的统一记 `upstream-ttl-or-client-rewrite`（unattributed）。

价格（USD / 1M token，`~/.dsh/storages/dsh-context-price-overlay.json`；`hit` = cache_read，`miss` = 未命中 input，`write` = cache_write，`out` = output 含 reasoning）：

| provider / model | hit | miss | write | out |
|---|---|---|---|---|
| `commandcode-goat` / `deepseek/deepseek-v4.1-flash` | 0.0030285 | 0.151425 | 0.151425 | 0.6057 |
| `deepseek-official` / `deepseek/deepseek-v4-flash` | 0.003 | 0.15 | 0.15 | 0.6 |
| `deepseek-official` / `deepseek/deepseek-v4-pro` | 0.003625 | 0.435 | 0.435 | 0.87 |

$$\frac{\text{miss}}{\text{hit}} = \frac{0.151425}{0.0030285} \approx 50,\qquad \frac{\text{out}}{\text{hit}} = \frac{0.6057}{0.0030285} \approx 200$$

手感换算：1M token 从 hit 掉到 miss ≈ 0.148 USD ≈ 1 CNY；一次 137K 全 miss ≈ 0.020 USD。单次看着小，1823 request 的会话 cumulate 就是账单。`deepseek-v4.1-flash` 的价不是抄 models.dev，而是由 reasonix 自报成本反解（384×0.02019 + 47873×1.0095 + 702×4.038 = 0.05117043 CNY vs 自报 0.051170222，差 4e-7；按 1 CNY = 0.15 USD）⇒ models.dev 刊登价系统性偏低 0.95%。

### M6 `finish_length` 与 `max-tokens` notice 是三件事

- 真 length：session title 辅助请求。`dsh-session-title-first-prompt-llm` 的 `maxOutputTokens` 默认 64，`resolveRoute()` 在未配 provider+model 时 `return request.route`（继承主 session 的 thinking route）⇒ reasoning 吃光 64 预算 ⇒ `finish_reason:"length"` ⇒ `session-title-llm: title output reached maxOutputTokens`。4 条日志全部 `completion_tokens == reasoning_tokens == 64`、prompt 141–192、单发。近期 finish 分布 `535 tool_calls / 16 stop / 4 length` ⇒ length 仅 0.7%。
- 假 max-tokens：上游提前收流（`TRANSPORT upstream stream ended before a completion event` + `llm/retry 1/8` + gateway `STREAM-ERR`），却把 `finish_reason` 标成 length；某 turn completion 仅 2899 token 也被标。UI 唯一触发条件在 `dsh-client-ui-chat/lib/client.js:9920` `match.event.type !== "turn/end" || match.event.data.reason.kind !== "max-tokens"` ⇒ 通知 `kind: "turn-max-tokens"`（文案键 `message.maxTokens`）。
- 真截断：dsh-mnemon 后台 idle checkpoint review subagent 的 `maxTokens` 只有 4096（`dsh-mnemon/lib/index.js:63` 的 `DEFAULT_IDLE_REVIEW`），`reasoningEffort: high` 的思维先烧光预算 ⇒ 侧栏里那些「其他对话」被截断。config 路径是 `idleReview.maxTokens`（schema min 128 / max 131072），已改 32768，另一个未动的是 `runtimeMemory.maintenanceMaxTokens` 默认 8192。

## J 判据

- 判断真实 window：不要猜，读 `curl -s http://127.0.0.1:18787/__bili/sessions` 的 `contextWindow`。`868928` = native 1M 减 131072 output headroom。
- 判断 bili 配置是否生效：`/__bili/config` 会立刻返回新值（它读了新文件），但日志 `nudge idle: … interval=50000` 仍是旧值 ⇒ `nudgeGrowthTokens` 映射到内核字段 `nudge.growthFloor` / `nudge.growthCap`，只在进程启动时固化。真判据 = 重启后日志出现 `interval=150000`（分母 `22500 → 67500`）。
- 判断 compaction 是否过早触发：`python ~/.dsh/storages/tools/compaction-audit2.py --session <id8>`，看「触发时真实占用百分比」。`shadowedTokenCount` 不是触发账本（那是被压节点的 char/4 估算，对 CJK 低估 27%，ratio 0.73），`measure().totalTokens` 才是且它不落盘 ⇒ 只能靠运行期探针。
- 判断 cache 退化归因：`curl -s http://127.0.0.1:18787/__bili/cache-report`。`identity check residual > 0` 说明归因算法自身错了，先修工具；`compress re-pay` 占比 < 5% 就可以排除「压缩太频繁」假设。
- 判断 thinking-guard 是否真出手：不能用「session JSON 含 `thinking-guard` 字符串」（会命中会话自己在讨论它的文本），也不满足于 `--dump-config` exit=0。正确判据 = session 解压文本含 `思考空转被熔断中止`，或 `user/message` 的 `data.source.plugin === 'thinking-guard'`。
- 判断 patch 是否生效：`--dump-config` 里同名 plugin 会出现多处，只有行号最大的那处是最终值（例：`tool-result-pruner` 5 处，`:977` 来自 base bundle、`:2400+` 才是 anchored-standard）；注释 `# == <pkg>, patched by <path>` 指出最后应用的是哪一层。
- 判断 manual compaction 是否可行：`/compact` 需要 agent 处于 idle，否则回 `busy`；失败时不要读 UI 文案，解 `session.v4.jsonl.zstd` 看 `compaction/end` 的 `error`（`422 dsh_compaction_refused` / `400 invalid_request_error`）。
- `maxTokens` 必须逐 model 实测：relay 合法域 `[0, 393216]`（`393217` → 400 `must be between 0 and 393216`），但只有 29/87 个 model 吃满 393216。原声明的 262144 里有 19 个 model 真实上限更低（Qwen3.6/3.7/3.8 全家、zai-org GLM-5/5.2/5.3、z-ai/glm-5.3-flash、MiniMax-M2.5、Kimi-K2.5、xiaomi/mimo-v2.5(-pro)、tencent/hy3-paid、gemini-3.8-flash、poolside/laguna-s-2.1-free）⇒ 改前一调用就 400，属坏配置。分档实测：393216 / 262144 / 196608 / 131072 / 98304 / 65536 / 32768。部分 model（Kimi-K2.5 / GLM-5 / MiniMax-M2.5）还额外要求 `prompt_tokens + max_tokens ≤ context_window`。

## X 反例

- X1「窗口调到 150000 省钱」：本批最贵的错误。`modelContextLimit` 只造硬墙，不省钱；一旦 summary 后端不可用（`0 summary call(s)`）就是死锁：每条消息 502 `preflight_compress_failed`，`retryable:false`，且 bili 的 `compress` 段是启动快照——改 json 不热生效，必须 kill 进程。改完立刻用 `/__bili/sessions` 核对 `contextWindow`。
- X2「headroom 只是无损折叠」：`dsh-headroom/lib/compress.js:263` 的 `SEARCH_LINE_RE = /^(.+?):(\d+)(?::(\d+))?:(.*)$/` 里 `(.+?)` 允许 file 段含空格 ⇒ `2026-10-04 23:10:17.521 host wrote file A` 被拆成 `file="2026-10-04 23"` / `line=10` / `rest="17.521 …"`，再在 `:296` 重组成 `2026-10-04 23 (4 matches)` + `10: 17.521 …` —— 时间戳写坏 + 行序被按 file 重排（门槛 `:284-285`：`matched >= 3` 且 ≥0.5）。修法一个 token：`(.+?)` → `(\S+?)`（28986 → 28987 B，md5 `f5ebe4dd6df0`）。通用教训：读到 `[headroom: …-fold …]` 或 `[N rows omitted — headroom]` 必须重取或 `sed -n 'a,bp'` 分段读，否则会把被篡改的内容当原文。
- X3「`/compress` 是斜杠命令」：不存在。`compress` 是 tool；空调用报 `kind=missing-content`；多个 range 必须塞进同一个 call 的 `content` 数组，分多次调用无效；summary 模型不代劳，写不好就是真丢信息（要含路径、判据、原话、时间锚点）；startId/endId 用 `m00175` 形式，不带 XML 包装。调用形态见 02 篇。
- X4「fold 之后就清爽了」：`degenerate-fold` 一次覆盖 89–94% 上下文、anchor 只剩 1546–2295 token、1–4 个 active block ⇒ 整个 prefix 重写、下次请求缓存从零开始。旁证 `[cache-seam] suspected mid-history prefix break: hit 8.1% (input=50427, unexplained=46331 tok) … first divergence at byte 14011, message[?] of 118→38`——118 条消息被砍到 38 条。13 天 8 次（10-06×3 / 10-07 / 10-10 / 10-11 / 10-13×2）。
- X5「改一行 system prompt 无伤」：system 在 prompt 最前，改一字节 ⇒ 其后全部 prefix 失效。同类事故：`plan-anchor` 旧实现「删历史中间的旧消息 + 尾部追新」会让每一步击穿一次 prefix cache；v2 改为「确认历史里有逐字节相同副本则跳过，一条都不动」，fail-open 回原行为。
- X6「thinking-guard 从来没生效」：该结论被 4 个 session 的 durable 证据推翻（`思考空转被熔断中止` ×10 / ×2 / ×2 / ×6）。真正的坑是配置优先级：bundle 自带的 `cordis.patch.yml` 不是最终值，`profiles/web/cordis.patch.yml:1271` 的 `- id: thinking-guard` / `enabled: true` 排在它后面覆盖了它 ⇒ 在 node_modules 里改 `enabled: false` 对 web 完全无效，而 desktop 没有那行 ⇒ 两侧行为一直不同。
- X7「改 profile patch row 来修 thinking-guard 的 name」：不行。profile patch 按 (id, name) 匹配已有 entry，改 name 会让 dsh 直接 `patch: name mismatch for "thinking-guard" (expected "dsh-thinking-guard", got "@ethanwong-hk/..."), skipping`。必须改源头 `profiles/web/node_modules/@ethanwong-hk/dsh-thinking-guard/cordis.patch.yml`（`name: 'dsh-thinking-guard'` → 带 scope，928 → 942 B）；它在 node_modules ⇒ 每次 `pnpm install` 覆盖，需重跑 `--apply`。
- X8「replay 能回放历史 thinking」：`@mingozhou/dsh-replay` 0.4.1 提供逐 step token / audit / cost / fork lineage / compare / HTML 导出，但 `GET /replay/api/sessions` 30 秒无响应（host half 对每个 session 调 `readTitleSnapshots`/`readTitle`）⇒ 会话列表实际不可用。用户 2026-10-22：「dsh-replay，什么鲸小深这个插件，我不要了」⇒ 两 profile 卸载（deps + bundles + node_modules，desktop 14.3 MB / web 18.4 MB = 32.7 MB），须重启生效；补丁脚本留在 `~/.dsh/storages/tools/` 已是死代码。
- X9「上下文打满会自动变聪明地截断」：不会。饱和后的三种表现：① dsh 侧 `max-tokens` 时丢 tool-call 块（`dsh-llm/lib/index.js:1053`，内部语义不可动）⇒ 工具调用凭空消失；② bili 侧 `context ≥ 硬墙` 每轮 fold，summary 不可用即死锁；③ UI 只给一句误导文案。没有任何一层会告诉你「现在开始丢东西了」。

## R 复现

```bash
# bili 自带三个只读诊断端点
timeout 20 curl -s http://127.0.0.1:18787/__bili/sessions   # contextWindow 真值
timeout 20 curl -s http://127.0.0.1:18787/__bili/config     # allowDshCompaction / compress
timeout 20 curl -s http://127.0.0.1:18787/__bili/cache-report

# compaction 是否过早触发（运行期探针口径）
timeout 60 python ~/.dsh/storages/tools/compaction-audit2.py --session a0d5fbf8

# 思考链 CJK 占比（按小时分桶、只取带 tool-call 的 step）
timeout 60 python ~/.dsh/tmp-probe/stat-reasoning-cjk.py session-a0d5fbf8-0fb1-419e-9baf-d95df0190144
# ⚠️ 块类型在 data.message.content[]，不是 data.content

# 生效配置：同名 plugin 取行号最大的那处
timeout 90 node "$APPDATA/npm/node_modules/@deepseek-ai/dsh/lib/bin.js" --profile web --dump-config   | grep -n "compaction-basic\|tool-result-pruner\|thinking-guard"

# 让 bili 应用新配置（不保证自动拉起，需自己确认 listener）
taskkill //PID <bili_pid> //F ; timeout 20 curl -s http://127.0.0.1:18787/__bili/status
```

改完必查三件：① `/__bili/sessions` 的 `contextWindow`；② 日志 `nudge idle: … interval=<新值>`；③ `/__bili/config` 的 `allowDshCompaction.enabled` 与 `source`。

## S 溯源

- `bili-window-150000-deadlock-根因与修复.md` — 502 `preflight_compress_failed` 根因链、`native×(1−25%)` 三条实测刻度、删 `modelContextLimit`
- `bili-allow-dsh-compaction-and-manual-compact-20261016.md` — `auto:false` + `allowDshCompaction:true` 两层开关、`REFUSED, not forwarded` 逐字、与 `injectNudge:false` 的共存
- `bili-无条件拒绝dsh原生compaction-20261023.md` — 0.1.204 删 opt-in（#3651）、422 `dsh_compaction_refused`、UI 文案误导、session log 取证法
- `bili-compress-frequency-tuned-20261016.md` — `nudgeGrowthTokens 50K→150K` / `preserveRecentTokens` / `preserveRecentMessages`、启动快照、诊断端点清单
- `bili-compression-policy-final-20261016.md` — 落地完整 config、`maxContextLimit: 60%`
- `cache-hit-degradation-attribution-20261016.md` — hit 82.0% 的 miss 拆解、MODEL SWITCHES 逐条、`degenerate-fold` 8 次逐字、`cache-seam` 118→38
- `billion-context-community-solution-and-dsh-preset-blindspot-20261004.md` — 社区立场（关原生 auto-compaction）、issue #1772、dump 里 5 处 `compaction-basic`
- `dsh-compaction-threshold-and-audit-pitfalls-20261004.md` — 阈值公式与源码行、账本 5.7× 矛盾、`compaction-audit2.py` 口径修正
- `dsh-preset-effective-path-and-pruner-tuned-20261016.md` — preset 真实生效路径、`tool-result-pruner` 8192→32768、同名多处的判读法
- `tm-usage-first-plugin-desktop-token-meter-fix-20261004.md` — usage-first 门控、desktop 从 asar 解析的差异、`tm-usage-first.mjs`
- `dsh-context-pricing-overlay-patch-20261002.md` — 价目 overlay 根因（provider 名 / model id 前缀 / models.dev 缺条目）与三处纯插入修法
- `dsh-maxtokens-上限实测与校正-20260930.md` — relay `[0, 393216]`、29/87、逐 model 分档表、19 个坏配置
- `dsh-maxtokens-notice-suppress-patch-20261003.md` — `turn-max-tokens` 触发条件、假警报取证、等长替换 `max-tokenz`
- `mnemon-idle-review-maxtokens-truncation-fix-20261003.md` — idle review `maxTokens 4096`、`idleReview.maxTokens` 路径
- `finish-length-is-internal-64token-20261004.md` — title 请求 64 token、route 继承、4 条日志与 finish 分布
- `dsh-reasoning-language-selflock-and-echo-filter-20261003.md` — pi-ai 回灌点、6 次消融 0/6→4/6→3/6、棘轮修法
- `thinking-chain-english-lock-rootcause-20261004.md` — echo-filter 配置、CJK 分桶实测、跨机未打补丁的残留
- `dsh-thinking-guard-name-scope-fix-20261003.md` — 裸名 vs scope 名、`ERR_MODULE_NOT_FOUND`、隔离实例 3099 验证法
- `thinking-guard-config-precedence-and-tune-20261004.md` — profile row 覆盖 bundle patch、4 个 session 的 durable 判据
- `thinking-anchor-habituation-and-dedupe-fix-20261001.md` — 锚点重复注入的去重修法
- `dsh-reasoning-row-autofold-20260930.md` — `__dspDisclosure` 标记、条件渲染为何不能用纯 CSS 解决
- `dsh-replay-installed-for-gap5-20260928.md` — replay 提供的能力与安装方式
- `dsh-replay-卸载与两个悬案查证-20261023.md` — 卸载范围 32.7 MB、须重启
- `headroom-searchfold-timestamp-corruption-fix-20261004.md` — 时间戳正则事故与一个 token 修法
- `dsh-batch3-headroom-mimir-and-codex-gap-recheck-20260927.md` — headroom 机制、CCR store、默认不压 read/edit/write

## 存疑

1. CCR store 三个口径不一致：`dsh-headroom-ccr.json` 本次实测 794,288 B / `entries: 59`；10-16 fact 记 `entries: 12`；10-23 fact 记 `1.73 MB`。可能是 0.2.1-rc.2 整目录替换时被重建，未取证。
2. T4「关 `dsh-headroom`」始终没落地：cache 归因后列为待办，后续 fact 无关闭记录 ⇒ 仍在链路上（本轮工具输出里多次出现 `[headroom: log-fold …]` 即证据）。
3. 窗口恢复 868928 后 bili fold 的 summary 后端是否可用未验证：要上下文真的涨到 `60% ≈ 608k` 才知道；此前 `0 summary call(s)` 是在 150k 墙下测的。
4. desktop 侧 reasoning row autofold 仍是已知 gap：需要「重写 asar header」的通用工具 + update 后自动重打，未做。
5. Linux 侧 `~/goat-gateway/gateway.mjs` 没有 reasoning-echo-filter（1642 行版本、锚点不同），那边 dsh 出口走同一 `127.0.0.1:8788/v1` ⇒ 仍会被回灌锁英文。
6. `compaction-basic` group 内 4 处是否已关：PLAN 记为「待决策（未执行）」，本轮未 dump 复核 ⇒ L3 自动触发是否仍活着没有当前状态证据。
7. `dsh-reasoning-language-selflock-and-echo-filter` 里 `finish=length` 与 `dsh-maxtokens-notice-suppress-patch` 的「假警报」两个结论都指向 `reason.kind` 判定，但二者时间线（10-03 / 10-04）交叠，是否同一批 turn 未逐条比对。
