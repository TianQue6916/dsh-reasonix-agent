---
id: mem-86d47eaf084e9878d144baa690381840
revision: 1
created_at: "2026-09-30T13:15:46.538Z"
updated_at: "2026-09-30T13:15:46.538Z"
name: deepseek-v41-flash-effort-实测与三层档位域-20260930
description: "v4.1-flash 的 reasoning_effort 三层域（模型/ harness 面/ relay 校验）+ 85 次实测：档间差被方差淹没、正确率无差异、max_tokens 才是真杠杆"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 结论（2026-09-30 实测，85 次真实调用）

`deepseek/deepseek-v4.1-flash` 没有"哪档更聪明"——**思考深度由题目难度主导，`reasoning_effort` 只是弱预算提示**；能真正改变输出的参数是 `max_tokens`。

### 1) 三层"档位域"必须分开看（历史上的混淆根源）

| 层 | 合法档位 | 证据 |
|---|---|---|
| DeepSeek **模型本体** | `low` / `high` / `max` | 本机 pi-ai catalog：`deepseek/deepseek-flash`(=V4.1 Flash) `thinkingLevelMap {minimal:null, low:"low", medium:null, high:"high", max:"max"}`；baseten `DeepSeek-V4.1-Flash` 条目为 `{off:"none", low, medium:null, high, xhigh:null, max}` → 两个独立来源都判 `medium`/`xhigh` 为 **null** |
| **dsh / deepseek-harness** 对外面 | `off` / `low` / `high` / `max` | deepseek-harness 官方 README + 第三方 harness 文档一致 |
| **GOAT relay** 校验域 | `low` / `medium` / `high` / `xhigh` / `max` | 实测：`none` / `minimal` / `off` 一律 **400** `Invalid option: expected one of "low"|"medium"|"high"|"xhigh"|"max"`；`medium`/`xhigh` 返回 200 |

⇒ dsh 的 `off` = **不发送该字段**，而 relay 默认（官方"默认启用 high thinking"）仍会思考 → **这条 route 上思考关不掉**。

### 2) 85 次实测（temperature=0，6 题 × 6 档，ground truth 全部独立验证）

题：`n²|2ⁿ+1`={1,3}(brute-force n≤20000)、无相邻子集=144、无 111 串 f(10)=504、4×10 骨牌=18061(mask-DP)、8 珠 3 色项链=834(全枚举)、最小 n 使 n! 尾零≥2026=8120(Legendre 扫描)。

| 档位 | 相对思考量 | 均值 reasoning_tok | 正确率 |
|---|---|---|---|
| low | 0.83× | 1945 | 14/14 |
| xhigh | 0.84× | 2318 | 14/14 |
| off | 0.97× | 1935 | 13/13 |
| high | 1.04× | 2808 | 14/14 |
| medium | 1.13× | 2742 | 14/14 |
| max | 1.21× | 2393 | 13/13 |

- **档间差（±20%）远小于档内方差**：同题同档重复采样极差 602%–1527%（P4: `low` 913 tok vs `high` 9420 tok；P1: `low` 8020 > `high` 7610）。
- **正确率无差异 82/82 全对**，`off`/`low` 一样全对（P4 `low` 只花 913 tok 就答对）。
- 难度造成的档内极差 2.7–14.4×（难度 ≫ 档位）。

### 3) `max_tokens` 才是真杠杆（★ 最容易踩的坑）

- **上游硬顶 393216**：`max_tokens=400000` → 400 `must be between 0 and 393216`；384000 可用。
- **reasoning token 计入 `max_tokens`**：设 8192 时出现 3 次 `finish=length`、`content` 为空（观测最大单次 thinking = **11608 tok**）。社区同类故障模式记录：长分析任务只回 `reasoning_content`、`content` 为 0。
- dsh 适配器取值顺序（`dsh-llm-pi-ai/lib/index.js:677`）：`entry.maxTokens ?? base?.maxTokens ?? request.defaultMaxTokens` → 当前 profile 里模型级 `maxTokens: 262144` 生效，provider 级 `defaultMaxTokens: 65536` 只在无模型级声明时兜底。仍有 131072 余量可提，但无实测收益。

### 4) 实操建议

日常 agent/代码/翻译 → `high`；数学/证明/审计/规格 → `max`；批量机械活 → `low`；**不要选 `medium`/`xhigh`**（模型侧 null）；`off` 别指望省 token。

复现产物：`%TEMP%\probe-v41b.py` / `probe-v41c.py` / `probe-boundary.py` / `probe-maxtok.py` / `summarize.py`；原始数据 `C:\tmp\{v41b,v41c,v41-effort}.jsonl`；catalog dump `C:\tmp\pi-catalog.json`。

外部佐证：DeepSeek Thinking Mode 指南（`reasoning_effort` 控强度、默认 high）、Anthropic/OpenAI 对 `max` 的指引（成本显著、收益小、部分任务过度思考）。
