---
name: paper-slide-deck
description: 从学术论文生成专业幻灯片，支持自动图表提取和多视觉风格（17种），输出 PPTX/PDF
---
# Paper Slide Deck — 学术论文→幻灯片生成

将学术论文（PDF）或内容转化为专业的幻灯片。支持自动图表识别、多种视觉风格、导出 PPTX/PDF。

## 触发条件

用户提到：论文转PPT / 论文演示 / 学术报告 / defense slides / conference talk / paper presentation / 阅读论文产出slides / 把论文做成幻灯片

## 工作流程

### Step 1: 分析内容
1. 接收用户提供的 PDF/文本/链接
2. 提取论文标题、作者、摘要、核心贡献
3. 识别论文结构（Introduction → Method → Experiments → Conclusion）
4. 计划幻灯片数量（通常 10-15 页）
5. 确定听众水平（专家 / 初学者 / 跨领域）

### Step 2: 选择风格

从以下 17 种风格中根据论文领域自动选择或询问用户：

| 风格 | 适用场景 |
|------|---------|
| `academic-paper` | 会议报告、答辩（默认） |
| `blueprint` | 系统设计、架构 |
| `minimal` | 高管简报、极简 |
| `scientific` | 生物/化学/医学 |
| `corporate` | 投资人演示 |
| `sketch-notes` | 教学、教程 |
| `chalkboard` | 课堂教学 |
| `notion` | SaaS/产品演示 |
| `bold-editorial` | 发布/主题演讲 |
| `dark-atmospheric` | 娱乐/创意 |
| `editorial-infographic` | 科技解释/研究 |
| `intuition-machine` | 双语技术简报 |
| `pixel-art` | 开发者/怀旧 |
| `fantasy-animation` | 教育/故事 |
| `vector-illustration` | 创意/儿童 |
| `vintage` | 历史/传统 |
| `watercolor` | 生活/旅行 |

**自动选择逻辑**：
- neurips/icml/iccv/cvpr/acl → `academic-paper`
- tutorial/learn/education → `sketch-notes`
- architecture/system/data → `blueprint`
- biology/chemistry/medical → `scientific`
- 默认 → `academic-paper`

### Step 3: 生成大纲

每页幻灯片的结构：

```markdown
# 大纲

## Slide 1: 封面
- 标题：[论文标题]
- 作者：[作者]
- 会议/年份：[如 NeurIPS 2024]

## Slide 2: 问题定义
- Motivation
- 现有工作的不足

## Slide 3: 核心贡献
- Contributions 1/2/3

## Slide 4-N: 方法论
- Overview
- 每个模块逐步展开

## Slide N+1: 实验
- 数据集
- 定量结果（表格/图表）
- 定性结果（可视化对比）
- 消融实验

## Slide N+2: 结论
- 总结
- 未来工作
```

### Step 4: 生成每页幻灯片

对于每一页：

1. **标题区** — 简短有力的标题（≤ 20 字）
2. **内容区** — 核心要点（每页 ≤ 5 个 bullets，每个 ≤ 15 字）
3. **图表区** — 插入论文中的关键图表或手绘示意图
4. **注释区** — 演讲者注释（与论文页面内容对应的解释）

设计原则：
- 每页幻灯片必须**自解释**——无需口头补充也能看懂
- 使用 `// IMAGE_SOURCE` 标记图表来源（论文某页 → 提取）
- 使用 `// LAYOUT` 标记布局偏好（如 `two-columns`, `hub-spoke`）

### Step 5: 生成输出

#### 方案 A: 纯文本 PPTX（使用 python-pptx）

```python
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)

def add_slide(title, bullets, style="academic-paper"):
    layout = prs.slide_layouts[6]  # blank
    slide = prs.slides.add_slide(layout)
    # 添加标题
    # 添加内容
    # 应用样式（颜色、字体大小等）
    return slide

# 为每页调用 add_slide
```

#### 方案 B: SVG 设计稿（更高质量）

每页生成独立 SVG，然后使用 `ppt-master` 技能转换为 PPTX。

### Step 6: 输出

- 幻灯片保存为独立目录：`slide-deck/<论文短标题>/`
- 输出格式：PPTX（推荐）+ PDF
- 告知用户文件位置

## 布局类型

| 布局 | 用途 |
|------|------|
| `title-hero` | 封面 |
| `outline-agenda` | 目录大纲 |
| `two-columns` | 对比/方法 |
| `split-screen` | 图文并茂 |
| `key-stat` | 关键数据 |
| `results-chart` | 实验结果 |
| `equation-focus` | 公式推导 |
| `contributions` | 贡献列点 |
| `references-list` | 参考文献 |

## 质量检查

- ✅ 每页 ≤ 5 个要点
- ✅ 字号 ≥ 24pt（正文） / ≥ 36pt（标题）
- ✅ 颜色不超过 3 种主色
- ✅ 图表清晰可读
- ✅ 演讲者注释完整
