---
name: baoyu-slide-deck
description: 宝石风格幻灯片生成 — 17 种视觉预设 + 多轮确认流程 + SVG 设计图生成，输出 PPTX/PDF
---
# 宝石幻灯片生成器 — baoyu-slide-deck 风格

将内容转化为专业幻灯片。支持 17 种视觉风格、多轮确认、PPTX/PDF 导出。

## 触发条件

用户要求：做幻灯片 / 创建 PPT / 生成 slide deck / 演示文档 / 演讲幻灯片

## 17 种视觉风格

| 风格 | 最佳用途 |
|------|---------|
| `blueprint` (默认) | 系统设计、架构 |
| `chalkboard` | 教育、教程 |
| `corporate` | 投资人简报 |
| `minimal` | 高管简报 |
| `sketch-notes` | 教学笔记 |
| `hand-drawn-edu` | 过程图解 |
| `watercolor` | 生活/健康 |
| `dark-atmospheric` | 游戏/创意 |
| `notion` | 产品演示 |
| `bold-editorial` | 产品发布 |
| `editorial-infographic` | 科技解释 |
| `fantasy-animation` | 教育故事 |
| `intuition-machine` | 技术文档 |
| `pixel-art` | 开发者演讲 |
| `scientific` | 科学/医学 |
| `vector-illustration` | 创意/儿童 |
| `vintage` | 历史/传统 |

**自动选择逻辑**：
- 教程/教育 → `sketch-notes` / `chalkboard`
- 科技/架构 → `blueprint`
- 商务/投资 → `corporate`
- 科学/医学 → `scientific`
- 产品发布 → `bold-editorial`
- 默认 → `blueprint`

## 工作流程

### Step 1: 分析内容
1. 接收用户的内容/文件
2. 分析长度：<1000 词 → 5-10 页；1000-3000 → 10-18 页；3000-5000 → 15-25 页
3. 生成主题 slug
4. 检查是否已有输出目录（如有则提供选项：重新生成大纲/重新生成图片/备份后重做）

### Step 2: 确认规格（必须）

与用户确认 5 项：
1. **风格** — 推荐预设 + 可选自定义维度（纹理/氛围/字体/密度）
2. **受众** — 普通/初学者/专家/高管
3. **页数** — 推荐 N 页，可选更少/更多
4. **是否预览大纲** — 推荐是
5. **是否预览 Prompt** — 推荐是

### Step 3: 生成大纲

按页组织：

```markdown
# outline.md

## Slide 1 — 封面
标题: [主标题]
副标题: [副标题]

## Slide 2 — 目录
1. [章节 1]
2. [章节 2]
3. [章节 3]
...
```

### Step 4: 生成图片（每页一张设计图）

每页使用 SVG 格式设计。SVG 规格：
- viewBox: 1920x1080（16:9）
- 使用对应风格的配色方案
- 每页包含：标题区 + 内容区 + 页码

### Step 5: 导出

可选 PPTX/PDF 合并导出：
- PPTX：将图片插入幻灯片
- PDF：按顺序合并图片

## 每页 SVG 模板

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1a2e"/>
      <stop offset="100%" style="stop-color:#16213e"/>
    </linearGradient>
  </defs>
  <!-- 背景 -->
  <rect width="1920" height="1080" fill="url(#bg)"/>
  <!-- 装饰线 -->
  <rect x="0" y="0" width="1920" height="6" fill="#e94560"/>
  <!-- 标题 -->
  <text x="120" y="200" font-family="sans-serif" font-size="64" font-weight="bold" fill="#ffffff">页面标题</text>
  <!-- 内容点 -->
  <text x="120" y="320" font-family="sans-serif" font-size="36" fill="#ccc">• 要点 1</text>
  <text x="120" y="390" font-family="sans-serif" font-size="36" fill="#ccc">• 要点 2</text>
  <!-- 页码 -->
  <text x="120" y="1040" font-family="sans-serif" font-size="24" fill="#666">页码 / 总数</text>
</svg>
```

## 设计哲学

- 每页**自解释** — 不需要口头补充
- 滚动式阅读 — 逻辑流自然
- 适合社交媒体分享
- 使用 Web 安全字体（Arial, Microsoft YaHei, sans-serif）

## 输出目录结构

```
slide-deck/<topic-slug>/
├── source.md        # 源内容
├── outline.md       # 大纲
├── prompts/         # 每页 prompt
├── 01-cover.png     # 图片输出
└── <slug>.pptx      # 可选导出
```
