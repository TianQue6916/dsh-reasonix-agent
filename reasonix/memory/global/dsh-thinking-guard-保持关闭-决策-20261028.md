---
id: mem-507b824cde9fc443690b8c83515cc714
revision: 1
created_at: "2026-10-28T11:28:19.107Z"
updated_at: "2026-10-28T11:28:19.107Z"
name: dsh-thinking-guard-保持关闭-决策-20261028
description: "thinking-guard 保持关闭（社区调研后拍板 C）：改走「勤开新会话 + per-session plan」路线，附三插件对比与退化=context-saturation 的证据"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 决策（2026-10-28 用户拍板「C」）

**保持 `thinking-guard` 关闭，不换插件，先解决「长会话污染」这个根因。**

## 为什么不是「重新打开」或「换 dsh-loop-guard」

社区调研结果（2026-10-28）：

| 插件 | stars | 最后更新 | 观测点 | 判断 |
|---|---|---|---|---|
| `@ethanwong-hk/dsh-thinking-guard` | **3** | 2026-09-28（停了约一个月） | `agent/assistant-stream`（**事后**计数） | 这条线上最弱的一环 |
| `@mrweicodes/dsh-loop-guard` | **20** | 2026-10-23 | `llm/stream` 瀑布内部（**实时切断 HTTP**） | 更强，但换插件是更大动作 |
| `walksls/dsh-degeneration-kit` | — | 2026-10-13 | 折叠历史中的退化块 | 补的是「打断之后」那半 |

关键实证：`dsh-degeneration-kit` 作者跑 493 个会话日志得出——**24 个真退化块里 18 个回合正常结束，只在思考里烂**；且复读分两型（A 型同一句死磕 10³–10⁴ 次、B 型短句轮换 20–200 次）。

⇒ 熔断器治的是「已经烂了的那一轮」，治不了「污染在历史里每轮回传」。我们的 `sparseMinCount: 999999` 其实把 B 型那一档彻底关死了，等于漏掉最难抓的一半。

## 更重要的一条：退化是 context-saturation 的症状

[社区 FAQ](https://dsh-ai.com/faq/762/) 结论：「长会话出现空转时及时新建会话，避免退化思考反复回传累积」。
[插件作者的复盘](https://eogee.com/article/172)：一轮 4927 行思考里 98.6% 是重复，「执行。」出现 1254 次，模型反复说停止一次没停，最后靠 max_tokens 硬掐断。

**所以「勤开新会话」不是偷懒建议，是对症的**。per-session plan（`dsh-plan-anchor-per-session-20261028`）正好让新会话从干净骨架起步，不再继承一堆无关历史——这是这条线上已经落地的第一块。

## 当前配置（保持不动）

```yaml
# profiles/{desktop,web}/cordis.patch.yml
- id: thinking-guard
  config:
    enabled: false
    sparseWindow: 4000
    sparseMinCount: 999999
```

## 待办（尚未实现）

「解决长会话污染」还缺可执行机制。候选（未拍板）：
1. 会话水位提醒：超过 N 步 / M 字符时注入一句「该开新会话了」。
2. 退化块折叠：命中复读时从历史里删掉那段 reasoning（`dsh-degeneration-kit` 的做法）。
3. 自动 compaction：现在 `compaction-basic` 是 `auto: false`，只支持手动 `/compact`。

## 回滚

若日后要重开 thinking-guard，只需把 `enabled: false` 改 `true` —— sparse 参数（4000 / 999999）和 cancel kind 的修复都还在。
