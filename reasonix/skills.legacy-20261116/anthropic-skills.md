---
name: anthropic-skills
description: Anthropic 官方技能集 — MCP 构建/文档生成/前端设计/品牌规范/创意编码/Web 测试
---
# Anthropic 官方技能集

来自 anthropics/skills（145K⭐）的精选子技能。Anthropic 官方的 Agent 技能实现参考。

## 包含的子技能

### 1. mcp-builder — MCP 服务器构建
当用户需要创建 MCP（Model Context Protocol）服务器时触发。支持：
- 从 OpenAPI/Swagger 规范生成 MCP 服务器
- 创建自定义 MCP 服务器（stdio 或 SSE 传输）
- 工具定义和资源暴露
- MCP 服务器的测试和调试

工作流：
1. 了解需求（工具/资源/提示类型、传输方式、外部 API）
2. 设计服务器结构（工具名、参数、描述）
3. 生成代码（Node.js/TypeScript 或 Python）
4. 测试验证（MCP Inspector 或手动测试）

### 2. webapp-testing — Web 应用测试
Web 应用的功能测试、视觉回归和用户流程验证。
- 跨浏览器功能测试
- 用户流程和表单交互
- 视觉一致性检查
- 响应式布局验证
- 与 playwright-automation 互补使用

### 3. canvas-design — Canvas 设计
使用 HTML Canvas 创建自定义图形、图表和可视化。
- 数据可视化（柱状图、折线图、散点图）
- 自定义图形元素
- 动画和交互
- 导出为 PNG/SVG

### 4. brand-guidelines — 品牌规范
确保输出符合品牌的视觉和语调规范。
- 颜色调色板和排版
- Logo 使用规则
- 语调指南
- 输出格式规范

### 5. algorithmic-art — 算法艺术
使用代码生成创意视觉作品。
- 分形生成（Mandelbrot/Julia 集）
- 粒子系统
- 几何模式
- SVG 生成艺术

### 6. frontend-design — 前端设计
UI 设计和前端实现。
- 组件设计和布局
- 响应式设计
- 可访问性（WCAG）
- 设计系统和组件库

### 7. doc-coauthoring — 文档协同编辑
多轮迭代的文档编写和编辑。
- 大纲生成和结构化
- 分段编写和修订
- 一致性检查
- 格式规范应用

### 8. claude-api — Claude API 集成
Claude API 的使用模式。
- API 调用格式
- 流式响应处理
- 工具使用配置
- 错误处理和重试

### 9. theme-factory — 主题工厂
创建可复用的颜色主题和设计令牌。
- 颜色系统（主色/辅色/中性色）
- 设计令牌（间距/圆角/阴影/字体）
- 亮色/暗色模式
- 主题导出为 CSS 变量或 JSON

### 10. internal-comms — 内部沟通
企业内部沟通文档的起草和格式化。
- 公告/更新/备忘录
- 会议纪要和行动项
- 周报/月报
- 跨团队沟通

## 使用方式

当用户的任务匹配上述任一子技能时，使用对应的流程。组合使用时按需叠加：
- "我想创建一个 MCP 服务器" → mcp-builder
- "帮我测试这个网页" → webapp-testing
- "生成一些创意视觉" → algorithmic-art
- "设计一个前端组件" → frontend-design
- "创建品牌规范的 PPT" → brand-guidelines + html-ppt
