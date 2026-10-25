---
id: "4194eda2-fab7-424e-ac31-87191ee90296"
title: "思考链锁英文的根因（reasoning_content 回灌自锁）与 goat-gateway echo filter 棘轮修复"
description: "2026-10-03 定位到的「思考链长期锁英文」根因：pi-ai 适配层把上一步 thinking 以 reasoning_content 回灌造成语言自锁（消融 0/6 vs 4/6，Fisher p≈0.033，已排除调工具/tools 数量/注入语料/锚点位置等假设），以及落在 goat-gateway 的棘轮式修复（非中文 reasoning 不回灌）：补丁脚本、开关文件、A–E 自测、生产 ECHO-FILTER kept 单调增长证据、回滚方式，外加 Linux 侧未打这一遗留。"
status: "active"
created_at: "2026-10-03T08:26:49.541Z"
updated_at: "2026-10-03T08:26:49.541Z"
content_hash: "318e6dc9f0c5dcbda791755bf09c352503ebd00f538438f0f81f102bc9ac7bdb"
source_paths:
  - ".dsh/storages/tools/patch-gateway-reasoning-filter.py"
  - ".dsh/storages/tools/selftest-reasoning-filter.mjs"
  - ".dsh/patches/README-reasoning-echo-filter.md"
  - ".dsh/.agent-presets/anchored-standard/context-gate.mjs"
  - ".dsh/thinking-language.json"
session_ids:
  - "a12d0f09-9c70-44b1-aae6-e7730606e2ab"
memory_body_ids:
  []
---

# 思考链锁英文：根因定位与 gateway 侧修复（2026-10-03）

状态：**Windows 侧已上线并生效**；Linux 侧未打（SSH 不通）。回滚一条命令。

## 现象与配置侧排除

- 本会话 2653 个 reasoning block，**最后 200 块 CJK 中位 0.00–0.02（中文块 0/200）**；而**新建会话 0.42–0.57**。
- 配置侧全部健康：`.dsh/thinking-language.json` = `{"thinking":"zh"}`；persona 的「语言契约（最高优先级）」6 条逐字在真实请求体 system 里；thinking-anchor 每步注入且位于最尾（真实 body `messages[127]`），本会话共 492 次注入。
- 结论：**不是注入路径问题**（这一点与 `9b045665` 的度量口径、与 `6d1f493b` 的哈希对照结论一致：注入存在不等于生效）。

## 根因：上一步自己的 thinking 被回灌

载体在 pi-ai 适配层：
`node_modules/@earendil-works/pi-ai/dist/api/openai-completions.js:996-1005`
把上一步的 thinking 块以 `reasoning_content` 塞进 assistant 消息。抓到的真实请求体（411990 B）里有 **24 条**，逐条全英文。模型每一步都在读自己过去 24 段英文内心独白。

### 消融证据（同一份真实请求体重复 6 次，`~/.dsh/tmp-probe/replay-fix9.py`）

| 改动 | 中文块 |
|---|---|
| 原样（保留 24 条英文 `reasoning_content`） | **0/6** |
| 删掉全部 `reasoning_content` | **4/6** |
| 换成中文 reasoning 原文 | **3/6** |

Fisher p≈0.033 ⇒ 回灌是「语言自锁」的**唯一载体**。

### 该机制一次解释三种现象

1. **能连续几天锁死** —— 英文回灌自我强化；
2. **compaction / 重启后语言会翻转** —— 链条被重置；
3. **短上下文像抛硬币** —— 没有链条可黏。

### 已排除的假设（都不是原因）

- 「调工具 ⇒ 英文」：本会话带 tool-call 的 **2621 步 cjk 中位 0.47**（反倒更高）；
- 「tools 数量是剂量」：0/2/6/10/13/18/26 → 中文 4/3/0/1/1/2/4 次，无单调性；
- 「注入语料质/量」：全中文化后仍 0.000–0.017；
- 「锚点加长/换位置/给 system 角色」：0.000–0.009；
- `temperature=0`：仍 3/5；
- 英文 bulk 加到 137k token：压不出英文。

## 修法：棘轮（非中文 reasoning 不回灌，中文原样保留）

一旦落到中文就自我强化。

**落点选择的理由**：`agent/pre-step` 看不到 durable history（`.dsh/.agent-presets/anchored-standard/context-gate.mjs` 自己的头注释写明）；改 pi-ai 会被 App 更新覆盖；goat-gateway 是**两台机器所有 dsh 出口的必经点**，且其 `forward()` 会按 `sendBody` 重算 `content-length`。

### 实现

- `D:\Toolbox\goat-gateway\gateway.mjs` **81713 → 85057 B**（两处 `count==1` 锚点纯插入；之后 md5 `6ef0ab15233e8b5a27dfb637bdb50750`）；备份 `gateway.mjs.bak-20261003-reasoning-filter-pre-reasoning-filter`。
- 脚本 `~/.dsh/storages/tools/patch-gateway-reasoning-filter.py`：`--check / --apply / --verify / --restore / --write-config`。
- 开关 `D:\Toolbox\goat-gateway\logs\.reasoning-filter.json`（**每请求现读，改完不用重启；删掉即关闭**）：`enabled` / `minCjk` / `mode`（`strip` | `empty`）/ `uaHints` / `verbose`。生产值 `enabled=true, minCjk=0.25, mode=strip, uaHints=["deepseek-harness"]`。
- UA 过滤：reasonix 的 `Go-http-client/1.1` 不受影响。

### 验证链

`--check`（锚点各 1、`node --check` OK）→ `--apply`（幂等）→ `--verify`（抽出 helper 真跑 6 组断言）→ 集成用例 `~/.dsh/storages/tools/selftest-reasoning-filter.mjs` **A–E 全 PASS**：

- A 关开关 = 字节原样转发；
- B 开开关 = 英文被删 / 中文保留 / `content-length` 已重算 / `tool_calls` 未受影响（body 691 → 562 B）；
- C UA 过滤生效；
- D `mode=empty` 保留字段并置空；
- E `minCjk` 读自配置（0.99 时中文块也被裁）。

（E 曾因断言写错失败一次，修正后 EXIT=0。）

### 生产证据（棘轮按设计工作）

```
ECHO-FILTER id=1  dropped=27 kept=0
ECHO-FILTER id=2  dropped=28 kept=0
ECHO-FILTER id=3  dropped=28 kept=1   ← 首条中文 reasoning 被保留
…
ECHO-FILTER id=13 dropped=28 kept=11
```

`dropped` 恒定 28（历史英文每步被剔除），`kept` 0→11 单调增长。

## 回滚

`python ~/.dsh/storages/tools/patch-gateway-reasoning-filter.py --restore`，或只删开关文件。说明见 `~/.dsh/patches/README-reasoning-echo-filter.md`。

## 未完成 / 遗留

- **Linux 侧未打**：`~/goat-gateway/gateway.mjs` 是另一个版本（1642 行，无 bodylog 锚点，要改锚点）；`ssh tianque` 当时 `Connection timed out`（100.79.96.82:22），机器可能没开机 ⇒ Linux 上的 dsh 会话仍被英文回灌锁住。
- 附带结论（另一处补丁的回归）：上游 usage 覆盖率 **10-03 = 530/532 = 99.6%**（此前长期 12–41%）⇒ 先前的 SSE tail 滑动窗口补丁（原为 `if (tail.length < 65536) tail += chunkStr;` 前 64KiB 封顶）确实长期有效，四 agent 台账的 request 级 spine 完整。

## 相关文档

- `9b045665-f20c-44ea-9f1b-f16d6e018350` —— reasoning 语言分布度量口径与一个被撤回的因果结论；
- `6d1f493b-0f17-4258-a972-e48c37fb1ebf` —— 语言契约注入路径盘点与运行时开关可行性；
- `fa611c46-9dc6-42aa-93a8-1002be2468bd` —— subagent 中文思维链修复与 gateway 403 taxonomy。
