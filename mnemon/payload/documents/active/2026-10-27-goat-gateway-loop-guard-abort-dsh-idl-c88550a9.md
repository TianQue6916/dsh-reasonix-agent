---
id: "c88550a9-d4d6-4dc1-b9e3-48f007b19709"
title: "输出退化三层防线（2026-10-27）：goat-gateway loop-guard abort 落地、阈值双峰校准、dsh idle-loop-guard 跨 turn 判据"
description: "2026-10-27 完成的输出退化/空转治理：gateway 侧 loop-guard 从 shadow 转 abort 的阈值依据（线上 8359 次请求 fast novelty 双峰分布，0.11/0.15 定法）、6-gram 判据对短英文周期的设计边界、selftest 四类零误报、以及新增 dsh 侧 idle-loop-guard.mjs（无 tool call 结构判据、214 行、三 profile 插入位置）。含未验证项与 RESTART 生效条件。"
status: "active"
created_at: "2026-10-26T16:25:04.853Z"
updated_at: "2026-10-26T16:25:04.853Z"
content_hash: "f8739eda3814c9482c9b91fd847d9b0b40e1baad2e7aca25d44aba03fc416b5c"
source_paths:
  - "PLAN.md"
  - ".agent-presets/anchored-standard/idle-loop-guard.mjs"
  - ".agent-presets/anchored-standard/stall-guard.mjs"
  - "profiles/web/cordis.patch.yml"
session_ids:
  - "954aa213-fea7-4b2d-abf6-29726bc64201"
memory_body_ids:
  []
---

# 输出退化三层防线（2026-10-27）

同一天落地的两层防护：**gateway 管单次响应内的退化**，**dsh 管跨 turn 的空转**。
第三方 `dsh-thinking-guard` 那条线的调参史见 956f6754（不同实现、不同判据层，可对照但勿混同）。

## D 定论

1. **判据要分层，因为工作单位不同。** `goat-gateway/loop-guard.mjs` 的观察窗口是**一次 SSE 响应**；它对「连续 N 轮只描述打算、不动手」这种模式结构性不可见——每一轮的 6-gram novelty 都在 0.9+，单看任何一轮完全正常。这类问题必须由 dsh 侧跨 step 判据兜。
2. **抓「无 tool call」比抓文本相似度可靠。** 三条候选判据的取舍：
   - 文本相似度：每轮换个说法就是全新 6-gram，判不出来；
   - 输出长度：该次空转 2639 字符，比正常短任务还长，长度不区分；
   - **有无 tool call：结构事实，判错不了**（代价：抓不到「一边空转一边真调了工具但方向错」，那类归 `stall-guard` 的工具失败熔断）。
3. **熔断后只纠正一次，绝不 autoContinue。** `idle-loop-guard` 注入一条提示后 `streak=0` + `cooldownLeft=6`；`stall-guard` 干脆只写日志、把控制权交还用户。这与 `dsh-thinking-guard` 的「熔断→注入继续→新 attempt→再空转」正反馈形成对照，后者会把一次问题放大成连环问题。
4. **`preset .mjs` 不参与 HMR。** HMR 只 exact-path watch profile 的 `cordis.patch.yml`；`.agent-presets/**` 下的 `.mjs` 必须重启进程才加载。`dsh --profile <p> --dump-config` 通过 **只证明配置合成正确，不证明 `apply()` 跑过**。（同 `dsh-profile-manifest-change-requires-restart-20261003`）

## M 机制

**goat-gateway/loop-guard.mjs**：双通道 `reasoning` + `text`，按 fast(256 字符起点) / slow(4096) / long(16384) 三档采样，滚动 6-gram novelty 低于阈值即触发；`mode=abort` 中止流。

**idle-loop-guard.mjs**（214 行，`profiles/*/cordis.patch.yml` 三处挂载）核心判定仅一行：

```js
const idle = s.stepToolCalls === 0 && (maxText === 0 || s.stepTextChars <= maxText);
s.streak = idle ? s.streak + 1 : 0;
```

`maxConsecutiveIdleSteps=3` 时在下一个 `agent/pre-step` 注入纠正提示（要求二选一：立刻调工具推进，或直接给结论停止；并声明非用户发送），随后重置 streak 并进入 6 step 冷却。默认 `maxTextCharsPerStep=2000`。

`stall-guard.mjs` 的活性判据是正交的另一条路：`agent/pre-step` 记起点、`agent/assistant-stream` 每帧刷新 `lastActivity`、每 15s 扫描，idle 超 `stallMs=240000` 就 `agent.cancel({kind:'stall-guard'})`。设计前提：agent-loop 的 `for await` 无 stream 级 timeout，本机已实测冻死 11 次。

## J 判据与阈值依据（不是拍的）

线上 8359 次请求、405 次 fast 命中，分布呈**双峰**：

```
[0.00,0.02): 187   几乎逐字复制
[0.02,0.05):   4
[0.05,0.08):  17
[0.08,0.10):   5
[0.10,0.12):  17   ← 0.11 切在这里
[0.12,0.15):  35
[0.15,0.20): 136   擦边，误报未知
```

- `reasoning.fast = 0.11`：一次实测空转 `minFast=0.1055` 落在 `[0.10,0.12)`，0.11 刚好收进来，同时把 `[0.15,0.20)` 那 136 次擦边全排除。
- `text.fast = 0.15`：列表/表格天然重复，放宽。
- slow/long 取 0.20，离线校准误报约 0.6%。

## X 反例与已知边界

- **6-gram 对短英文周期不敏感**——这是设计边界不是 bug。`line line line...` 重复时 6-gram 是 `"line l"/"ine li"/"ne lin"`，每滑一格就变，novelty 稳定在 0.83–0.96。它专为中文与长周期设计（n=6 个字符，中文一句话就够长）。
- **自造退化请求两次都没撞响**：第一次 Anthropic 端点直接报 `Model "deepseek/deepseek-v4.1-flash" is not supported on this endpoint`；换 OpenAI 端点后 6 条记录 `chans` 全是 `['reasoning']`、content 始终为空，text 通道 0.15 阈值根本没机会生效。
- 真正会被抓住的是 2026-10-01 那批：`chars=8106 slow=0.0032`、`chars=30098 slow=0.0032`——长输出、几乎逐字复制。

## R 复现与验证

`selftest-loop-guard.mjs` 全过：DEGENERATE 在 320 字符经 fast 通道触发（fast=0.1289 period=33×4）、STALL 在 4160 字符经 slow 触发（slow=0.0293），而 CoT / 中文散文 / 代码块 / markdown 表格四类**零误报**。

gateway 日志自认：`LOOP-GUARD enabled mode=abort channels=reasoning+text n=6 fast=256 slow=4096 long=16384`。

运行时观察 `logs/loop-guard.jsonl` 出现 `"streamError": "loop-guard abort"`；dsh 侧看 `~/.dsh/logs/idle-loop-guard.log`，起始行 `installed pid=<新pid>`，命中行 `FIRE sess=<id> steps=N textChars=M cooldown=6`。

## 回滚

gateway：`mode` 改回 `shadow` + `curl http://127.0.0.1:8788/_gateway/reload`（改前留 `config.json.bak-<ts>`）。

## 未完成 / 待验

- `reasoning.fast=0.11` 的**线上误报率未实测**（仅由命中分布推定）；真退化被 abort 的实际案例仍在等自然命中。
- idle-loop-guard 已写入三个 profile 但**尚未重启加载**，属「配置对、apply 未跑」状态。
