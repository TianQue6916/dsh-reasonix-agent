---
name: skill-routing-rules
description: 强制技能路由规则 — 16个场景的 Skill 自动触发映射
type: project
scope: global
created: 2026-06-10
priority: high
---
# 强制技能路由规则（高优先级）

以下规则对所有对话生效，**违反视为错误**。

## 强制规则（MUST）

1. **写测试/TDD/先测再写** → 必须调 `tdd`，走 RED→GREEN→重构，禁止"写完所有测试再写代码"
2. **调试/bug/崩溃/性能问题** → 必须调 `diagnose`，先建反馈环再假设
3. **推演/challenge/评估方案** → 必须调 `grill-me`，走决策树一次一题
4. **架构总览/不理解代码** → 必须调 `zoom-out`，退后一层给模块地图
5. **百科知识/概念/定义** → 必须调 `offline-wiki-autosearch`（Python libzim）
6. **降AI率/去痕迹** → 必须调 `unslop` 清洗 + `humanizer` 校准
7. **LaTeX/学术论文** → 必须调 `latex-writing`
8. **Excel/CSV/数据分析** → 优先调 `data-analysis`

## 用户指定模式

| 用户说 | 执行 |
|--------|------|
| "简短点/caveman/压缩" | 切 `caveman` 模式，持续到"正常模式" |
| "handoff/交接" | 生成交接文档到临时目录 |
| "prototype/快速验证" | 走原型分支（逻辑或UI） |

## 原则
- 不打断用户：Skill 调用是后台动作
- 可组合：diagnose + tdd 可串联
- Fallback：无匹配时正常回答
