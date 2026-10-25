---
id: "9b045665-f20c-44ea-9f1b-f16d6e018350"
title: "reasoning 语言分布度量审计：口径、脚本、以及一个被撤回的因果结论"
description: "2026-09-30 对 ~/.dsh 全部 session 做的 thinking/reasoning 语言分布统计：测量口径（剥 code 后 CJK 占比、root session 筛选）、脚本 .dsh/scratch/reasoning-lang-audit.py 的用法、基线分布数据、首块语言锁定效应、directive 有效性「无任何支持证据」的取证过程与一处被撤回的 5x 因果误判，以及最低验收入口。区别于 6d1f493b（那份是注入路径与运行时开关可行性）与 fa611c46（那份是 subagent 中文思维链修复本身）。"
status: "active"
created_at: "2026-09-30T13:17:23.379Z"
updated_at: "2026-09-30T13:17:23.379Z"
content_hash: "1fb244e430da3d58b4a060409441c0cf352270b9662659b5e1342a4cb4156fc4"
source_paths:
  - ".dsh/scratch/reasoning-lang-audit.py"
  - ".dsh/profiles/web/cordis.patch.yml"
  - ".dsh/profiles/desktop/cordis.patch.yml"
  - ".dsh/.agent-presets/anchored-standard/git-context.mjs"
  - ".dsh/.agent-presets/anchored-standard/subagent-language.mjs"
session_ids:
  - "48c2a4b3-59bf-451d-a407-10b13f03a060"
memory_body_ids:
  []
---

# reasoning 语言分布度量审计（2026-09-30）

状态：**度量工具已落盘并可用；关于「thinking-language directive 是否有效」的结论仍未决**。
本文记录口径、数据、以及一个必须避免重犯的方法论错误。

相关文档：
- `6d1f493b-0f17-4258-a972-e48c37fb1ebf` —— 语言契约的编译期注入路径与 HMR 边界（可行性调查）
- `fa611c46-9dc6-42aa-93a8-1002be2468bd` —— subagent 中文思维链修复本身

---

## 1. 为什么需要这套度量

用户的目标是「思考链用中文」，正文（final answer）达标而 reasoning 不达标。要判断任何注入改动是否有效，前提是能把 reasoning 的语言**量化成分布**。此前所有判断（包括一次错误的 5x 因果结论，见第 5 节）都是在没有口径的情况下凭感觉做的。

## 2. 测量口径（必须保持一致，否则数字不可比）

- 指标：**CJK 占比** = CJK 字符数 / (CJK 字符数 + 拉丁字母数)。
- **先剥离** code fence、inline code、路径，再做比值；不剥离会把「中文散文 + 英文术语/路径」的正常形态误判成英文。
- 采样范围：只取 **root session**（`delegationDepth == 0` 且无 `parentSession`），避免 subagent 污染。
- 交集条件：只看**正文确实是中文**的 session（正文 CJK ≥ 0.25），否则基线里混入本该英文的会话。
- 数据源：`~/.dsh/sessions/**/session.v4.jsonl.zstd`（自研解析，非官方 API）。
- 语言契约的正确形态参考值：正文 CJK 中位 **0.588**（中文散文 + 英文术语），这就是要达到的形态；**0.3–0.4 的 reasoning 不算 bug**（术语保留英文），**0.00–0.05 的整段英文散文才是漂移**。

## 3. 工具

脚本：`.dsh/scratch/reasoning-lang-audit.py`

```
python reasoning-lang-audit.py sessions       # 正文为中文的 root session：reasoning vs 正文 对比 + 分桶
python reasoning-lang-audit.py blocks         # block 级 + 首块锁定效应
python reasoning-lang-audit.py one <id前缀>   # 单个 session 的逐 block 曲线
```

实现注意（踩过的坑）：`ratio()` 在文本剥离后可能返回 `None`，`rows.sort()` / `statistics.median()` 会因此抛
`TypeError: '<' not supported between instances of 'NoneType' and 'float'`。必须先过滤 `None` 再排序。
改口径时三处统计（sessions / blocks / one）要同步，否则对比不自洽。

## 4. 基线数据（口径见第 2 节）

正文为中文的 root session（n≈212–214）：

| 通道 | CJK 中位 |
|---|---|
| 正文 | 0.588 |
| reasoning | **0.062**（另一口径 n=214 下为 0.023；差异来自是否剥 code 与筛选细节） |

reasoning 侧英文 stopword 密度约 40/1k，中文虚词仅 8.6/1k —— 即近纯英文散文。
分桶（n=212）：0.00–0.02 占 11.8%，0.02–0.05 占 18.4%，0.05–0.10 占 38.2%，0.10–0.20 占 20.8%，**>0.20 合计约 10.8%**。**这是双峰分布，均值无意义。**

**首块锁定效应**（787 个 block≥4 的 root session）：

- 首块中文主导（≥0.3）仅 17 个（2.2%）。
- 首块英文主导的 770 个：b1…b10 中位 CJK 恒为 0.00–0.01，**从不回摆**；这些 session 后续出现中文主导块的比例约 0.43（局部块），但整段中位仍贴地。
- 结论方向：语言选择是**路径依赖的隐状态**，block 1 决定轨道，不是每步独立采样。

**同 model 内的巨大方差**（`deepseek/deepseek-v4.1-flash`，同 persona、同 harness）：n=211 中位 0.023、p90 0.123，但有 ~10 个（4.7%）≥0.3，最高 0.694，**且这些全部不带 directive**。
→ 主导变量（任务类型 / 上下文中文绝对量 / attention 落点 / 采样状态）**尚未被识别**。在这个变量被钉住之前，加 directive 是在测不出效应的噪声里再加一个测不出效应的因子。

## 5. 被撤回的因果结论（重要教训）

一度报出：`a0d5fbf8` 带 directive、reasoning 中位 0.301，对比基线 0.062，「5 倍生效」。
**该结论作废。** 原因是把 **before 当成了 after**：该 session 里 directive 只出现在 `seq 14259 / 2026-09-30 20:15`，它之前已有 **2171 个 step**。分段后：

| a0d5fbf8 分段 | blocks | reasoning CJK 中位 |
|---|---|---|
| directive **之前**（跑了 4 天） | 2017 | **0.544** |
| directive **之后** | 5 | **0.014** |

0.544 与 directive 无关；after 段只有 5 个 block，n 太小，不足以反向下结论。

截至审计结束，**不存在任何支持「directive 有效」的数据点**：唯二带 directive 的两段（`3a65fe96` 37 blocks、`a0d5fbf8` 尾部 5 blocks）reasoning 中位均为 0.014。

教训：判定因果前先定位 directive 在 session 里的**首次出现 seq**，并确认前后各有多少 block；n 不足时只报告「不足以判定」。

## 6. directive 的来源取证

- 943 个 session 中，含那段 directive 文本的只有 **2 个**。
- 在 `~/.dsh`（profiles / presets / plugins / skills）、`AppData/Roaming`（含 `node_modules/reasonix`）、`Documents`、`Desktop` 全量 grep `English reasoning` 与 `中文思考`：**零命中**。
- 会话 jsonl 里它以**独立的 `user/message`** 出现（约 238 字符），与用户提问分开发送；system prompt 的 persona 第 5 条只是**转介**（「由部署的 thinking-language directive 指定」）。
- 推论：它不在任何可用文件编辑的位置，更像是**每轮拼到 user message 前缀的一段文本**（甚至是手动粘贴做实验），而非开关。它落在服从度最低的注入通道上。

## 7. 已排除与加载边界

- **assistant prefill 走不通**：在 `~/.dsh/profiles/node_modules` 全量 grep `prefill` / `assistantPrefix` 零命中，该 harness 不支持把 block 1 的语言从采样结果变成输入。
- HMR 边界（用户实测）：`~/.dsh/profiles/*/cordis.patch.yml`（persona 文本）→ **开新会话即生效，无需重启**；`.agent-presets/anchored-standard/*.mjs`（`git-context.mjs`、`subagent-language.mjs`）→ **必须重启 dsh 进程**。
- 零副作用校验：`dsh --profile web --dump-config`。
- **「重启」与「生效」是两个独立问题**：重启只保证改动被加载，不改变服从度。用户问「重启就能行吗」时，必须分开回答。

## 8. 最低验收要求（下次改动的判定门槛）

1. 同会话 before/after：directive 必须位于 session **开头**，前后各 ≥50 个 block；
2. 或 10 组同类任务 A/B（一半带、一半不带）；
3. **比分布不比均值**：看 p90、`>0.3` 占比，或 Mann-Whitney U。

## 9. 待尝试的动作（按 ROI，尚未验证）

1. 把 persona 第 5 条的**转介句替换为 directive 正文**（`~/.dsh/profiles/web/` 与 `desktop/` 的 `cordis.patch.yml`，约 179–180 行）；开新会话生效。
2. 降低中段英文脚手架密度：`.dsh/.agent-presets/anchored-standard/git-context.mjs` 的 `LOCAL GIT STATE` 每步注入且紧贴生成点，让注入块以中文行首起头。
3. `subagent-language.mjs` 的 append 契约后加**首块强制中文**（锁定发生在 block 1）；该文件注释已记录实测 12/12 个 child 用英文推理。
4. 做完任一项后按第 8 节测一次：有效则留，无效则说明这条路不通，停止投入。
