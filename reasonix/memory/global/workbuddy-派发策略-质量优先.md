---
id: mem-75a2b710a290ddcab7ad92a44da8859e
revision: 1
created_at: "2026-11-16T16:55:01.233Z"
updated_at: "2026-11-16T16:55:01.233Z"
name: workbuddy-派发策略-质量优先
description: "WorkBuddy 翻译通道的派发纪律：质量优先、不计成本，20 秒间隔与细粒度分片不可为省时间压缩"
metadata:
  type: user
  fact_type: feedback
  scope: global
---

## 用户决策（2026-11-17 00:50 原话）

> workbuddy端不计代价，质量为上

## 落地含义

WorkBuddy（弟弟机 GUI 翻译队列）派发时，成本/时间不是约束，质量是唯一目标：

1. **分片粒度**：不为减少派发轮次而合并分片。S2 一类「补定义/补前置」的修复按「一个概念一处」派，单片段可以小到 1 页。
2. **20 秒间隔不可压缩**：实测间隔 5 秒 + 双路 = 28% 成功率（18 派出 5），间隔 20 秒 + 6 路 = 100%。省下的时间是负收益。
3. **prompt 措辞**：修复类任务必须写「补定义 / 补前置知识」，不能写「润色」——否则模型会去改句子而不是补概念。

## 相关实测（2026-11-17）

`wbui.ps1` 动作序列 `MinimizeAll → 聚焦 → 剪贴板 → Ctrl+N → Ctrl+V → Enter`；`ui.log` 的 `done <name>` 只代表粘贴+回车成功，不代表生成完成。
