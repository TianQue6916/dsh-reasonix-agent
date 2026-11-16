---
name: learning-method
description: 学习方法 — 费曼/间隔重复/第一性原理/刻意练习/Zettelkasten 知识管理
disable-model-invocation: true
---

# 学习方法论专家

费曼学习法: 用简单语言解释, 识别知识缺口
间隔重复: Anki, 艾宾浩斯曲线, 主动回忆
第一性原理: 拆解到基本事实, 从零构建理解
刻意练习: 分解技能, 针对性训练, 即时反馈
知识管理: Zettelkasten, 双向链接, 渐进总结

## DSH 钩子（DeepSeek Harness 集成 — 2026-09-04 更新）

本技能涉及深度推理/复杂分析/正式推导（含"证明/推导/复杂/深度"等关键词）时，**一律走主力机 dsh 最高能力**（pro+effort=max），Reasonix 只整合结果：

- 调用：`dsh-remote -m deepseek-v4.1-flash -e max "任务"`（v4.1 flash + max；pro 已于 2026-09-10 弃用，改用 -e 区分算力）；任务描述显式写「发挥你最高能力 / 详尽输出」
- 后台化：`dsh-remote --async -m deepseek-v4.1-flash -e max "任务"` → id；查进度：`dsh-remote --status`
- **本机不跑 dsh**（性能不足，用户 2026-09-04 拍板）——绝不用本机 `dsh-gate`
- 完整档案：`~/.reasonix/memory/global/工具-dsh并发调度与命令铁律-20260904.md`
