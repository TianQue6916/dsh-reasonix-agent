---
id: mem-e92672b43876438932de753cb2ea0c00
revision: 1
created_at: "2026-10-03T08:19:42.449Z"
updated_at: "2026-10-03T08:19:42.449Z"
name: dsh-reasoning-language-selflock-and-echo-filter-20261003
description: "思考链锁英文的根因是 pi-ai 回灌自身 reasoning_content；gateway 侧棘轮补丁已上线"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 症状
系统提示词里的「语言契约（最高优先级）」完好、thinking-anchor 每步注入且位置正确（真实 body 的 messages[127] 就是它），
但长会话（`session-a0d5fbf8`）最后 200 个 reasoning block 的 CJK 中位 0.00–0.02、中文块 0/200；
**新建会话**却是 0.42–0.57 中文。用户 m00003 / m02206 / m02462 / m02498 反复追问。

## 根因（离线消融，`~/.dsh/tmp-probe/replay-fix{1..9}.py`）
pi-ai 适配层把上一步 assistant 的 thinking 以 `reasoning_content` 回灌：
`%APPDATA%\npm\node_modules\@deepseek-ai\dsh\node_modules\@earendil-works\pi-ai\dist\api\openai-completions.js:996-1005`
（`OPENAI_COMPLETIONS_REASONING_FIELDS = ["reasoning","reasoning_content","reasoning_text"]` 在 `:138`）。
真实 body（`D:\Toolbox\goat-gateway\logs\bodies\2026-10-03T07-15-08-165Z-0.json`）里 24 条 assistant 带该字段、逐条全英文。
**同一请求重复 6 次**：原样 **0/6 中文**；删掉回灌 **4/6**；回灌换中文 **3/6**（Fisher p≈0.033）
⇒ 回灌是「语言自锁」的唯一载体，并解释「锁死几天 / compaction 或重启后翻转 / 短上下文抛硬币」三种现象。

**已排除（都不是原因）**：调工具（带 tool-call 的 2565 步 cjk 中位 0.47）；tools 数量（0/2/6/10/13/18/26 → 4/3/0/1/1/2/4，无单调性）；
注入语料中文化（gitctx-zh/ckpt-zh/injects-zh/toolres-zh/all-zh 全 0.000–0.017）；锚点加长/换位置/给 system 角色（0.000–0.009）；
`temperature=0`（仍 3/5 中文）；英文 bulk 137k token（压不出英文）。

## 修法（已上线）
棘轮：**非中文 reasoning 不回灌、中文原样保留**（英文链条切断→重掷先验；落到中文后被自己回灌强化→收敛）。
落在 gateway（`agent/pre-step` 看不到 durable history —— context-gate.mjs 头注释明说 Durable history 不走这个 gate；改 pi-ai 会被 asar 更新覆盖）。
- `D:\Toolbox\goat-gateway\gateway.mjs` 81713 → **85057 B**，两个 `count==1` 锚点纯插入（helper 在 `function forward(` 前、call 块在 `// bodylog-end` 后），
  备份 `gateway.mjs.bak-20261003-reasoning-filter-pre-reasoning-filter`，重启后 pid 18688。
- 开关 = `D:\Toolbox\goat-gateway\logs\.reasoning-filter.json`（**存在即启用**，每请求现读 ⇒ 改完不用重启；删掉即关闭）：
  `{"enabled":true,"minCjk":0.25,"mode":"strip","uaHints":["deepseek-harness"],"verbose":false}`；`mode:"empty"` 保留字段置空（给要求字段存在的上游兜底）。
- 脚本 `~/.dsh/storages/tools/patch-gateway-reasoning-filter.py`（`--check/--apply/--verify/--restore/--write-config/--disable/--file`，幂等）；
  集成用例 `~/.dsh/storages/tools/selftest-reasoning-filter.mjs`（真 gateway + 假上游，端口 18790）A–E 全 PASS。
- 生产生效：`ECHO-FILTER id=1 dropped=27 kept=0` → `id=3 dropped=28 kept=1`。
- 说明文档 `~/.dsh/patches/README-reasoning-echo-filter.md`。

## 未完成
- **Linux 侧 `~/goat-gateway/gateway.mjs` 未打**（那是 1642 行的另一版本，无 bodylog 锚点 ⇒ `--check` 会失败，要先改锚点）。
- 残余英文概率：先验（26 个 tools、英文注入累积）仍可能让个别 step 落英文；兜底方案是闭环重抽样（`dsh-thinking-guard` v1.0.2 的 abort + autoContinue 骨架）。

## 陷阱
- selftest 会临时改**真实** `logs/.reasoning-filter.json`（路径由 gateway 的 `ROOT = dirname(import.meta.url)` 决定，不受 `GATEWAY_LOG_DIR` 影响），用例已做前状态备份/还原。
- 删字段可能撞上游校验（pi-ai `requiresReasoningContentOnAssistantMessages`，`openai-completions.js:1044-1048` 会补空串）；截至 10-03 16:12 未观测到相关 4xx。
