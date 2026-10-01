---
name: html-ppt
description: HTML PPT Studio — 从用户内容生成专业 HTML 演示文稿，36 主题 + 14 模板 + 31 布局 + 47 动画
---
# html-ppt — HTML PPT Studio

从用户提供的文本/大纲生成专业的 HTML 静态演示文稿。所有输出为纯 HTML/CSS/JS，无需构建工具，可在任何浏览器中打开。

## 触发条件

用户提到：演示文稿 / PPT / slides / 幻灯片 / 演讲稿 / 分享稿 / 演讲 / 做一份 PPT / deck / keynote / 小红书图文 / 技术分享

## 核心原则

1. **不要从零写 HTML** — 使用 templates/deck.html 作为起点
2. **使用主题变量** — 颜色、圆角、阴影都从 CSS 变量获取，不要硬编码
3. **一页一个 `.slide`** — runtime.js 控制显示
4. **按键优先** — 始终包含 runtime.js 实现键盘导航
5. **演讲者注释放 `<div class="notes">`** — 不要放在可见页面上

## 工作流程

### 第一步：确认三件事（必须问用户或根据已有内容推荐）
1. **内容与受众** — 页数、观众（工程师/高管/学生/小红书读者/VC）
2. **风格/主题** — 从以下推荐：
   - 商业/投资 → `pitch-deck-vc`, `corporate-clean`, `swiss-grid`
   - 技术分享 → `tokyo-night`, `dracula`, `catppuccin-mocha`, `terminal-green`, `blueprint`
   - 小红书图文 → `xiaohongshu-white`, `soft-pastel`, `rainbow-gradient`, `magazine-bold`
   - 学术/报告 → `academic-paper`, `editorial-serif`, `minimal-white`
   - 极客/发布 → `cyberpunk-neon`, `vaporwave`, `y2k-chrome`, `neo-brutalism`
3. **起点** — 用哪个全 deck 模板还是从单页布局组合？

### 第二步：构建幻灯片
1. 在项目目录下创建 `index.html`
2. 引入 `assets/base.css`（设计令牌 + 基础样式）
3. 引入 `assets/themes/<theme>.css`（主题 CSS 变量覆盖）
4. 引入 `assets/runtime.js`（键盘导航 + 演讲者模式）
5. 每页内容包裹在 `<div class="slide">...</div>` 中
6. 添加 `<div class="notes">逐字稿内容</div>` 到需要注释的页面
7. 可选：引入 `assets/animations/animations.css` + `data-anim` 属性

### 第三步：幻灯片结构模板

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>演示文稿标题</title>
<link rel="stylesheet" href="assets/base.css">
<link rel="stylesheet" href="assets/themes/tokyo-night.css">
</head>
<body>
<main class="deck">
  <div class="slide is-active">
    <h1>标题</h1>
    <p>内容</p>
    <div class="notes">演讲者注释</div>
  </div>
  <!-- 更多 slides -->
</main>
<script src="assets/runtime.js"></script>
</body>
</html>
```

### 布局类型参考
- 封面：大标题居中 + 副标题
- 内容页：标题 + 正文 + 可选的图表/图片
- 对比页：左右两栏对比
- 数据页：KPI 卡片网格
- 引用页：大号引用加粗
- 议程页：编号列表
- 结尾页：总结 + 联系方式

### CSS 变量（所有主题通用）
- `--text-1` / `--text-2` / `--text-3` — 文本色阶
- `--bg-1` / `--bg-2` / `--bg-3` — 背景色阶
- `--accent` / `--accent2` — 强调色
- `--radius` — 圆角
- `--shadow` — 阴影

### 演讲者模式
如果用户需要带讲稿的演示：
- 每页写 **150–300 字** 逐字稿（口语化，非书面语）
- 放入 `<div class="notes">`
- runtime.js 按 S 键弹出演讲者窗口（当前页 + 下一页 + 讲稿 + 计时器）

## 渲染为 PNG（可选）
需要本地安装 Chrome：
```bash
/path/to/Google\ Chrome --headless=new --screenshot=output.png --window-size=1920,1080 file:///path/to/deck.html
```

## 输出
生成一个 `.html` 文件即可直接打开浏览。所有资源为本地引用，无外部依赖。
