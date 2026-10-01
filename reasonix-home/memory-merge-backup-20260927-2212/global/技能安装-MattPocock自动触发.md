---
name: matt-pocock-skills-auto
description: Matt Pocock 技能集 — 自动触发规则 + 已安装技能索引
type: project
scope: global
created: 2026-06-10
priority: high
---
# Matt Pocock 技能 — 自动触发规则

已安装为 Reasonix 内联技能，以下场景**自动调用**无需用户额外指示：

## 自动触发场景

| 用户说了/场景 | 触发技能 | 行为 |
|---|---|---|
| "写测试" / "测试这个" / "TDD" / "red-green-refactor" / "先写测试" | `tdd` | 推 TDD 循环：规划→RED→GREEN→重构 |
| "调试" / "bug" / "坏了" / "崩溃" / "出错了" / "性能问题" | `diagnose` | 建反馈环→复现→3-5假设→探针→修复→回归 |
| "推演" / "挑战" / "review 这个方案" / "grill me" / "评估" | `grill-me` | 面试式走通决策树，一次一题 |
| "简短点" / "压缩" / "caveman" / "少说废话" | `caveman` | 删冠词/填充/客套，片段句，→表因果 |
| "放大看" / "全局" / "架构" / "总览" / "zoom out" / "不理解这段" | `zoom-out` | 退后一层给模块地图+调用链 |
| "重构" / "改善架构" / "代码太乱" / "模块化" | `improve-codebase-architecture` | 扫描→HTML 报告→推演→改进 |
| "prototype" / "快速验证" / "试试" / "做个原型" | `prototype` | 逻辑原型(终端) 或 UI 原型(多方案) |
| "写交接文档" / "handoff" / "下一个agent用" | `handoff` | 生成交接文档到临时目录 |

## 原则
- **先看触发条件再回答** — 用户的问题可能隐含多个技能需求
- **不打断用户** — 在适当时机引入技能，而不是每个回答都声明"我将使用X技能"
- **技能可组合** — 如 diagnose + tdd 可串联：先诊断出 bug，再用 TDD 写回归测试
- **fallback** — 无匹配时正常回答，不硬套技能
