# reasoning echo filter —— 让思考链回到中文（gateway 侧棘轮）

状态：**已上线并验证**（2026-10-03 16:11，Windows 侧 gateway pid 18688）。
对应问题：用户 m00003「思考链似乎还是会是英文，这是怎么回事」、m02206「额思考语言还是英文?为什么?」、
m02462 / m02498「重启了」「思考语言怎么还是英文」。

## 症状

- system prompt 里的语言契约（`profiles/*/cordis.patch.yml` 的 `- id: persona` → `prefix: |-`）完好且逐字含
  「语言契约（最高优先级…）」6 条，真实请求体的 system 消息里 `cjk=0.032` 且含 `Chinese undergraduate` —— **契约没丢**。
- `thinking-anchor.mjs` 每步都在注入（本会话 492 条 `source.kind='thinking-anchor'`，最近一条与 git-context/plan-anchor 同秒），
  尾部位置正确（真实 body 的 messages[127] 就是它）。
- 然而本会话（`session-a0d5fbf8-0fb1-419e-9baf-d95df0190144`）2653 个 reasoning block，
  最后 200 块 **CJK 中位 0.00–0.02、中文块 0/200**。
- 对照：**新建的**会话（mnemon review subagent、`session-19b055a6` 等）首块 CJK 0.42–0.57 —— **新鲜会话中文，长会话英文**。

⇒ 不是配置坏、不是注入断、不是进程没重启。是**长会话自己被锁住了**。

## 根因（离线消融实验，决定性）

pi-ai 适配层把上一步 assistant 的 thinking 块回灌进请求：
`@earendil-works/pi-ai/dist/api/openai-completions.js:996-1005`
```js
let signature = nonEmptyThinkingBlocks[0].thinkingSignature;
if (signature && isOpenAICompletionsReasoningField(signature)) {
  assistantMsg[signature] = nonEmptyThinkingBlocks.map((block) => block.thinking).join("\n");
}
```
（`OPENAI_COMPLETIONS_REASONING_FIELDS = ["reasoning", "reasoning_content", "reasoning_text"]` 在 `:138`；`isOpenAICompletionsReasoningField` 在 `:139`。）

抓到的真实请求体（`D:\Toolbox\goat-gateway\logs\bodies\2026-10-03T07-15-08-165Z-0.json`，411990 B）里
有 **24 条 assistant 消息带 `reasoning_content`**，逐条 CJK 全 0.00–0.19。

**同一份请求体重复 N 次**（`~/.dsh/tmp-probe/replay-fix9.py`，非流式、`max_tokens=1500`）：

| variant | 改动 | cjk 逐次 | 中文块 |
|---|---|---|---|
| `full-control` | 原样（保留 24 条英文回灌） | 0.000 / 0.002 / 0.000 / 0.000 / 0.000 / 0.000 | **0/6** |
| `full-echo-drop` | 删掉全部 `reasoning_content` | 0.580 / 0.000 / 0.593 / 0.740 / 0.548 / 0.000 | **4/6** |
| `full-echo-zh` | 24 条换成中文 reasoning 原文 | 0.599 / 0.032 / 0.013 / 0.606 / 0.551 / 0.000 | **3/6** |
| `full-zh-all` | echo 中文化 + checkpoint/git-context 也中文化 | 0.719 / 0.669 / 0.000 / 0.578 / 0.503 / 0.000 | **4/6** |

⇒ **回灌的自身 reasoning 是「语言自锁」的唯一载体**（0/6 vs 11/18，Fisher p≈0.033；单一处理组 p≈0.033）。

机制自洽：每步把自己上一段的语言回灌给自己 ⇒ 锁死；compaction / 进程重启重置链条 ⇒ 翻语言；
短上下文（`tail6`）没有链条可黏 ⇒ 变成抛硬币（`replay-fix6.py --n 5`：26 tools 时 1/5、去 tools 时 5/5、
`temperature:0` 仍 3/5）。

**被这些实验排除的假设**（都不是原因）：
- 「调工具 ⇒ 英文」：本会话带 tool-call 的 2565 步 cjk 中位 **0.47**（中文）⇒ 证伪。
- 「tools 数量是剂量」：`replay-fix8.py --n 6` 的 0/2/6/10/13/18/26 → 4/3/0/1/1/2/4 次中文，**完全没有单调性**。
- 「注入语料量/质」：`gitctx-zh` / `ckpt-zh` / `injects-zh` / `toolres-zh` / `all-zh` 全 0.000–0.017；
  英文 bulk 加到 137k token 也压不出英文。
- 「把锚点加长/换位置/给 system 角色」：`anchor-2x-tail`、`anchor-strong-tail`、`anchor-system-tail` 全 0.000–0.009。

## 修法：棘轮（ratchet）

**非中文的 reasoning 一律不回灌，中文的原样保留。**
英文链条被切断 → 重掷先验；一旦某一步落到中文，它就被自己回灌强化 ⇒ 收敛到中文，且中文会话保留完整思维连续性。

实测（生产 gateway 重启后第一批请求）：
```
2026-10-03T08:11:05.376Z ECHO-FILTER id=1 dropped=27 kept=0 chars=116281 bytes=387414
2026-10-03T08:11:25.718Z ECHO-FILTER id=2 dropped=28 kept=0 chars=117311 bytes=392808
2026-10-03T08:11:39.485Z ECHO-FILTER id=3 dropped=28 kept=1 chars=117311 bytes=404794   ← 出现第一条中文 reasoning 并被保留
```

## 为什么落在 gateway，而不是 dsh 侧

- `agent/pre-step` 看不到 durable history —— `context-gate.mjs` 自己的头注释原文：
  “Durable history (compaction summaries included) never passes through this gate.”
  ⇒ preset 插件无法改写历史消息。
- 改 `@earendil-works/pi-ai` 或 `dsh-llm-pi-ai` 要动 npm 树 + desktop 的 `resources/app.asar`，
  而官方 nightly 更新会覆盖 asar（见 `dsh-desktop-renders-package-client-modules-20260930`）。
- gateway 是本机自己的代码（Win / Linux 同构）、**所有** dsh 出口的必经点（两个 profile 的 `baseURL` 都是
  `http://127.0.0.1:8788/v1`），且只需 JSON 层的一处字段裁剪 —— `forward()` 用 `sendBody` 重算
  `content-length`（`gateway.mjs:955, 991`），不需要别的改动。

## 产物

| 文件 | 说明 |
|---|---|
| `D:\Toolbox\goat-gateway\gateway.mjs` | 81713 → **85057 B**；备份 `gateway.mjs.bak-20261003-reasoning-filter-pre-reasoning-filter` |
| `~/.dsh/storages/tools/patch-gateway-reasoning-filter.py` | `--check/--apply/--verify/--restore/--write-config/--disable/--file` |
| `~/.dsh/storages/tools/selftest-reasoning-filter.mjs` | 集成用例（真 gateway + 假上游，端口 18790），5 组断言 |
| `D:\Toolbox\goat-gateway\logs\.reasoning-filter.json` | 开关（**存在即启用**，每请求现读；删掉即关闭） |

补丁形状（两处 `count==1` 锚点、纯插入、幂等）：
- helper 插在 `function forward(clientReq, clientRes, keyEntry, body, meta) {` **之前**，
  标记 `// reasoning-echo-filter-start` … `// reasoning-echo-filter-end`；
- 调用块插在 `// bodylog-end` **之后**，标记 `// echo-filter-call-start` … `// echo-filter-call-end`。
- 调用块把 `body` 重写成 `Buffer.from(JSON.stringify(parsed))`（`let body` 本就可重赋值）。

## 开关

```json
{ "enabled": true, "minCjk": 0.25, "mode": "strip",
  "uaHints": ["deepseek-harness"], "verbose": false }
```
- `mode`：`"strip"`（删字段，默认）/ `"empty"`（置空串 —— 给要求 assistant 必须带该字段的上游兜底）。
- `uaHints`：只对 UA 含这些片段的客户端生效。**reasonix 的 UA 是 `Go-http-client/1.1`，不受影响。**
- `minCjk`：`han/(han+latin)` 阈值。
- 改完**不需要重启**（每请求现读 `logs/.reasoning-filter.json`）。

## 验证链

1. `python ~/.dsh/storages/tools/patch-gateway-reasoning-filter.py --check` → 锚点各 `count=1`、`node --check: OK`。
2. `--apply` → 81713 → 85057 B，语法 OK；再跑一次被幂等拒绝。
3. `--verify` → 抽出 helper 在 node 里真跑 6 组断言（阈值边界 / mode=empty / UA 过滤 / 空字段不动 / 缺 `messages` 不炸）。
4. `node ~/.dsh/storages/tools/selftest-reasoning-filter.mjs` → **A/B/C/D/E 全 PASS**：
   - A 关开关 = 字节原样转发（阴性对照）；
   - B 开开关 = 英文被删、中文保留、`tool_calls`/`role`/`system`/`user`/`tool` 不动、`content-length` 已重算（body 691 → 562 B）；
   - C `Go-http-client/1.1` 不受影响；
   - D `mode=empty` 保字段并置空；
   - E `minCjk=0.99` 时连中文块也被裁 ⇒ 证明阈值真的读自配置。
5. 生产：重启 gateway（`restart-gateway.ps1`，old pid 16372 → 新进程 16:11:00）后真实请求上 `ECHO-FILTER … dropped=28 kept=1`。

## 回滚

```
python ~/.dsh/storages/tools/patch-gateway-reasoning-filter.py --restore
python ~/.dsh/storages/tools/patch-gateway-reasoning-filter.py --disable --write-config   # 或直接删 logs/.reasoning-filter.json
powershell -NoProfile -ExecutionPolicy Bypass -File D:\Toolbox\goat-gateway\restart-gateway.ps1
```
只删开关文件即可立即恢复原行为（不必回滚代码）。

## 陷阱

- **删字段可能撞上游校验**：某些 provider 要求 assistant 消息必须带 `reasoning_content`
  （pi-ai 的 `compat.requiresReasoningContentOnAssistantMessages`，`openai-completions.js:1044-1048` 会补空串）。
  若出现 400，把 `mode` 改成 `"empty"`。截至 10-03 16:12 未观测到相关 4xx。
- **`logs/.reasoning-filter.json` 的路径由 gateway 的 `ROOT` 决定**（`gateway.mjs:17-18` 的 `ROOT = dirname(import.meta.url)`），
  不受 `GATEWAY_LOG_DIR` 影响 ⇒ selftest 必须临时动真实路径的文件（用例已做前状态备份/还原）。
- Linux 侧 `~/goat-gateway/gateway.mjs` 是**另一个版本**（1642 行 vs Windows 1744 行，同一 tail bug 在 Linux 行 1101），
  **本补丁尚未应用到 Linux**。
- 这是**棘轮**而非无条件删除：中文 reasoning 会被保留并自我强化。若发现模型在英文语境下仍被判非中文而丢失上下文连续性，
  调低 `minCjk` 或临时 `enabled:false`。
