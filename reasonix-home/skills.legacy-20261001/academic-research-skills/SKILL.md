---
name: academic-research-skills
description: 学术论文全流程 — research → write → review → finalize，含文献综述、论文撰写、审稿回复
---

# Academic Research Skills — 学术全流程

完整学术论文工作流：从文献调研到终稿提交。

## 工作流

```
Research → 文献综述 → 论文撰写 → 审稿回复 → Finalize
```

### 1. Research（调研）
- 搜索相关论文（arXiv / Google Scholar / Semantic Scholar）
- 提取关键方法、数据集、实验结果
- 建立文献矩阵（对比各论文方法/结果/局限性）

### 2. 文献综述
- 按主题/方法/时间线组织文献
- 识别研究空白
- 生成综述段落（含引用）

### 3. 论文撰写
- IMRaD 结构：Introduction → Methods → Results → Discussion
- Abstract 四要素：背景/问题 → 方法 → 结果 → 结论
- LaTeX 模板支持（NeurIPS/ICML/ICLR/AAAI/ACL）

### 4. 审稿回复
- 逐条回复审稿意见
- 标注修改位置（页码+行号）
- 礼貌专业的语气

## 使用本技能

本技能与内置的 `ars_conference_templates`（LaTeX 模板）和 `ars_citation_verifier`（引用验证）配合使用。

```bash
# 步骤示例
1. /skill academic-research-skills research "transformer efficiency"
2. /skill academic-research-skills review "给出文献综述框架"
3. 使用 ars_conference_templates 生成 LaTeX 骨架
4. 使用 ars_citation_verifier 验证引用
```
