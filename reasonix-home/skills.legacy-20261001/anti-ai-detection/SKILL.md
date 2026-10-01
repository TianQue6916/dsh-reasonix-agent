---
name: anti-ai-detection
description: 降AI率终极流水线。串联 unslop (CLI自动清洗) + humanizer (24种模式手动校对) + ai-vibe-writing (风格迁移) + antigravity-awesome-skills (技能库搜索)。当用户需要写出"AI检测器测不出来"的文本时触发。
---

# 降AI率终极流水线

整合全部4大工具的完整工作流。从 "AI 生成的文本" 到 "看起来就像人写的"。

## 两阶段工作流

### 阶段一：自动化清洗（unslop CLI）

```bash
# 第一步：用 unslop 做自动清洗
# 从 subtle 开始，不够再升级
unslop --deterministic --diff 输入文件.md   # 先预览
unslop --deterministic --mode full 输入文件.md   # 强力清洗
```

### 阶段二：人工校对（humanizer 规则检查表）

逐条检查以下 AI 常见模式：

```
□ 夸张象征词 (serve as a testament, beacon, cornerstone)
□ AI 三件套 (delve, nuanced, landscape)
□ 否定平行 (It's not just... it's...)
□ 三法则堆叠 (seamless, intuitive, powerful)
□ 破折号过度使用
□ 空洞过渡词 (Moreover, Furthermore)
□ 引导问 (But what does this mean?)
□ AI 词汇 Tier 1 (robust, leverage, transformative, etc.)
□ 模糊引用 (some experts believe)
□ 句子长度过于均匀
```

### 阶段三：风格注入（ai-vibe-writing）

检查当前文本是否与你的个人风格一致：
- 词汇级别符合吗？
- 句式长度有变化吗？
- 有没有你的个人用词习惯？
- 修正不一致的地方

### 阶段四：检测验证

将最终文本放入 AI 检测器验证。如果仍有问题：

```bash
# 用更强的 anti-detector 模式重写
unslop --deterministic --mode anti-detector 输入文件.md

# 或启用 detector-feedback 循环（需 API）
unslop --detector-feedback --detector-target 0.3 输入文件.md
```

## 检查清单（完整版）

### 写前
- [ ] 明确目标受众和写作目的
- [ ] 收集个人写作样本（3-5篇）做风格迁移
- [ ] 建立禁用词汇表

### 写中
- [ ] 保持句子长度变化（短句 + 长句穿插）
- [ ] 每段有明确的主题句
- [ ] 用具体细节替代抽象概括
- [ ] 加入个人观点和态度

### 写后
- [ ] unslop --deterministic --mode full 清洗
- [ ] 检查24种AI模式残留
- [ ] 读出声，感受是否自然
- [ ] AI检测器测试（目标：<30% AI概率）
- [ ] 记录本次错误到错误记忆

## 常用指令速查

```bash
# 轻度润色
unslop --deterministic --mode subtle 文档.md

# 标准清洗（推荐）
unslop --deterministic --mode balanced 文档.md

# 强力清洗
unslop --deterministic --mode full 文档.md

# 反检测模式（最强）
unslop --deterministic --mode anti-detector 文档.md

# 预览修改
unslop --deterministic --diff 文档.md

# 管道处理（不改原文件）
type 文档.md | unslop --stdin --deterministic --mode full > 清洗后.md
```
