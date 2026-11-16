---
name: ppt-master
description: 从任意文档生成原生可编辑的 PPTX 文件，真实形状+文本框+动画，支持 SVG 逐页设计
---
# PPT Master — 原生可编辑 PPTX 生成

从用户提供的源文档（PDF/DOCX/文本/网页）生成真正的、可直接在 PowerPoint 中编辑的 `.pptx` 文件。输出包含真实的 DrawingML 形状、文本框和动画——不是图片打包。

## 前置条件

需要 Python 3.10+ 和以下依赖：
```bash
pip install python-pptx Pillow numpy beautifulsoup4 requests PyMuPDF
```
可选：`pip install cairosvg`（SVG → PNG 回退）、系统安装 pandoc（旧文档格式）

## 触发条件

用户提到：生成 PPT / 做 PPTX / 文档转PPT / 论文转演示 / 演讲稿转幻灯片 / 创建PowerPoint / 幻灯片生成

## 核心架构

采用 **SVG → PPTX** 路线：
1. 使用 AI 模型（Claude/GPT）将内容转化为每页 SVG 设计稿
2. SVG 中嵌入真实文本和矢量图形
3. Python 脚本 `python-pptx` 将 SVG 解析为 PPTX 的原生形状

## 工作流程

### 第一步：准备内容
- 直接接受用户粘贴的文本
- 或读取 PDF/DOCX/网页文件
- 或接受已有的 Markdown 大纲

### 第二步：确认设计规格
与用户确认：
- **模板**：自由设计 / 使用模板
- **格式**：PPT 16:9（默认）/ 4:3
- **页数**：8-15 页
- **风格**：商务 / 学术 / 创意 / 极简
- **语言**：中文 / 英文 / 双语

### 第三步：逐页生成 SVG

为每一页生成独立的 SVG 代码，样式规则：
- 使用 CRAP 设计原则（对比/重复/对齐/亲密性）
- 文本不可溢出（SVG viewBox 固定为 1920x1080 或 960x540）
- 颜色搭配和谐，不超过 3 种主色
- 每页 SVG 包含完整布局（标题区、内容区、页脚页码）

SVG 结构模板：
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1a2e"/>
      <stop offset="100%" style="stop-color:#16213e"/>
    </linearGradient>
  </defs>
  <rect width="1920" height="1080" fill="url(#bg)"/>
  <text x="120" y="200" font-family="sans-serif" font-size="64" font-weight="bold" fill="#ffffff">标题</text>
  <!-- 更多内容 -->
  <text x="120" y="1040" font-family="sans-serif" font-size="24" fill="#888">页码</text>
</svg>
```

### 第四步：SVG → PPTX 转换

使用 Python 脚本 `svg_to_pptx.py` 的核心逻辑：

```python
from pptx import Presentation
from pptx.util import Inches, Pt
import xml.etree.ElementTree as ET

def svg_to_pptx(svg_string, output_path):
    """将 SVG 转换为原生 PPTX"""
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    
    root = ET.fromstring(svg_string)
    ns = {'svg': 'http://www.w3.org/2000/svg'}
    
    slide_layout = prs.slide_layouts[6]  # blank layout
    slide = prs.slides.add_slide(slide_layout)
    
    # 解析 SVG 元素 → PPTX 形状
    # 文本 → PowerPoint 文本框
    # 矩形 → PowerPoint 形状
    # 图片 → 插入图片
    
    prs.save(output_path)
```

### 具体转换规则

| SVG 元素 | PPTX 元素 | 属性映射 |
|----------|-----------|---------|
| `<rect>` | 形状 (矩形) | x, y, width, height, fill → fill.color |
| `<text>` | 文本框 | x, y → left, top; font-size → font.size |
| `<circle>` | 形状 (椭圆) | cx, cy, r → 位置和大小 |
| `<image>` | 图片 | href → 嵌入图片 |
| `<line>` | 形状 (线条) | x1,y1 → x2,y2 映射 |
| `<path>` | 形状 (自由曲线) | d 属性映射 |

### 第五步：输出

- 保存为 `exports/<项目名>.pptx`
- 同时保存 SVG 源文件到 `svg_output/` 便于重新导出
- 告知用户文件位置和打开方式

## 模板参考

常用布局：
- **封面**：大标题 + 副标题 + 装饰元素
- **目录**：编号列表 + 图标
- **内容页**：标题 + 正文 + 侧边装饰
- **对比页**：两栏 A vs B
- **数据页**：KPI 数字突出展示
- **图表页**：柱状图/折线图 SVG 手绘
- **引用页**：大号引用 + 人物
- **总结页**：核心要点回顾 + 下一步

## 注意事项

- SVG 中的文本**必须使用 Web 安全字体**（Arial, Microsoft YaHei, sans-serif）
- 中文文本确保字体名称正确
- 每页 SVG 都是独立的，不要跨页引用
- viewBox 比例需与 PPTX 页面比例一致
- 输出前验证每个元素的位置不重叠
