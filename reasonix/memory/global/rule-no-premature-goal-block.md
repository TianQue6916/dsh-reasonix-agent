---
id: mem-5b687555efcb04f5101239970ed91ce4
revision: 1
created_at: "2026-09-28T07:06:06.524Z"
updated_at: "2026-09-28T07:06:06.524Z"
name: rule-no-premature-goal-block
description: "不得因\"某个子项需要用户拍板\"而整体 block goal；先推进不需要授权的剩余项"
metadata:
  type: user
  fact_type: feedback
  scope: global
---

**规则（2026-09-28 用户质询"明明任务没完成，自己就断了"后确立）**

1. 子项需要用户拍板 ≠ 整个 objective 阻塞。dsh 自己的 policy 原文就写着：`difficulty, uncertainty, or useful remaining work is not blocked`。
2. block 之前必须先自查：objective 的剩余项里有没有**不需要用户授权**的？有 → 继续做，不 block。
3. 真的必须停时：优先用**普通回复提问**（turn 结束后用户自然会看到），而不是 `update_goal(action=blocked)`——因为 block 会 disarm 自动续跑 + 注入 `<goal_blocked>` 强制收尾，且 resume 只有人类能做。
4. 只有"objective 的全部剩余项都卡在同一个需要人的决策上"才允许 block。
5. 轮次打满不要 block：用 `edit` 扩 `max_goal_rounds` 后 `resume`。
6. 创建 goal 时**不要手设小的 `max_goal_rounds`**（默认 256）；曾误设 12 和 30 两次。
