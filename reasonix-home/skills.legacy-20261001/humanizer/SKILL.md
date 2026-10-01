---
name: humanizer
description: AI 写作人类化专家。基于24种AI写作模式检测和500+禁用词汇表，全面去除AI生成痕迹。自动计算文本统计指标（突发性burstiness、类型-标记比、句子长度变异系数），改写至自然人类写作。当需要降低AI率、通过AI检测器、让文本自然时触发。
---

# Humanizer — AI Writing Pattern Remover

基于 Wikipedia "Signs of AI writing" 指南的全面 AI 写作人类化系统。检测24种 AI 模式，使用500+ 三级词汇表，结合统计指标分析，让文本听起来像真人写的。

## 核心原理

AI 文本的三个统计信号：

| 指标 | 人类 | AI | 原因 |
|------|------|-----|------|
| **突发性 (Burstiness)** | 高 (0.5-1.0) | 低 (0.1-0.3) | 人类写作有节奏变化；AI 是节拍器 |
| **类型-标记比 (TTR)** | 0.5-0.7 | 0.3-0.5 | AI 反复使用相同词汇 |
| **句子长度变异系数** | 高 | 低 | AI 句子长度几乎相同 |
| **三元词组重复率** | 低 (<0.05) | 高 (>0.10) | AI 重复使用3词短语 |

## 24种 AI 模式检测清单

### 内容模式
1. **夸张象征 (Inflated Symbolism)** — "serve as a testament to", "stands as a beacon of"
2. **宣传语 (Promotional Language)** — "revolutionary", "game-changing", "transformative"
3. **-ing 结尾的表面分析** — "delving into", "leveraging the power of", "navigating the complexities of"
4. **模糊归属 (Vague Attribution)** — "some experts believe", "it is widely thought", "research suggests"
5. **空洞呈现 (Empty Presentation)** — "it is crucial to note", "it is worth mentioning that"
6. **AI 专属句子骨架** — "In today's rapidly evolving [landscape/ecosystem]", "Not only... but also"

### 语言与语法
7. **AI 常用词汇 (Tier 1-3)**
   - **Tier 1（绝对禁用）**: delve, tapestry, vibrant, intricate, testament, beacon, foster, foster, navigate, robust, seamless, transformative, nuanced, landscape, realm, leverage, pivotal, revolutionize, paradigm
   - **Tier 2（谨慎使用）**: illuminate, encompasses, multifaceted, cornerstone, foster, facilitate, spearhead, cornerstone
   - **Tier 3（监控使用）**: ubiquitous, quintessential, plethora, synergy, holistic
8. **过多修饰语堆叠** — "truly unique and innovative approach"
9. **否定平行结构** — "It's not just about X, it's about Y", "Not only do we X, we also Y"
10. **三法则过度使用 (Rule of Three)** — "seamless, intuitive, and powerful"
11. **AI 标志性过渡词** — "Moreover", "Furthermore", "Additionally", "Consequently"

### 风格模式
12. **破折号（em dash）过度使用**
13. **引导性问句滥用** — "But what does this mean?", "So, what's the takeaway?"
14. **结论套路** — "In conclusion", "To summarize", "The future looks bright"
15. **AI 同义反复** — 同一观点用不同词说两遍
16. **段落结尾空洞升华** — "As we look to the future..."

### 交流模式
17. **奉承/谄媚 (Sycophancy)** — "Great question!", "Excellent point!"
18. **聊天机器人痕迹** — "I hope this helps!", "Let me know if you have questions!"
19. **过度礼貌** — "I would be happy to", "I'd be glad to assist"

### 填充模式
20. **过量连接词** — "In order to" (→ "to"), "Due to the fact that" (→ "because")
21. **冗余表达** — "Added bonus" (→ "bonus"), "Exactly the same" (→ "the same")
22. **抽象化语言** — 用抽象名词代替具体描述
23. **对称结构堆砌** — 大量使用平行结构
24. **AI 段落模板** — 提出观点→举例→升华

## 使用流程

### 第一步：检测 AI 模式

将文本逐项扫描以上24种模式，标注每种模式的密度（1-5分）。

### 第二步：计算统计指标

```python
# 突发性 (Burstiness)
# = 句子长度标准差 / 平均句子长度
# 人类: 0.5-1.0, AI: 0.1-0.3

# 类型-标记比 (Type-Token Ratio)  
# = 唯一词数 / 总词数
# 人类: 0.5-0.7, AI: 0.3-0.5

# 句子长度变异系数 (CoV)
# = 句子长度标准差 / 平均句子长度 * 100
# 人类高, AI低
```

### 第三步：运行改写

按以下优先级处理：

1. **删除 Tier 1 AI 词汇** — 替换为日常用语
2. **拆解 AI 句模** — 否定平行、三法则、引导问
3. **砍掉填充** — "In order to" → "to", 删掉空洞过渡词
4. **打破节奏** — 制造长短句交错，插入口语化表达
5. **添加具体细节** — 用具体替代抽象
6. **加入个人观点** — 对事实有态度，不要只报道

### 第四步：验证

```markdown
修改摘要：
- 删除 ___ 处 AI 词汇
- 改写 ___ 处 AI 句模
- 句子长度变异系数: ___ → ___
- 突发性: ___ → ___
```

## 核心改写原则

### 写得像人，不是新闻稿

- 能用"是"就不要用"作为" → "serves as" → "is"
- 每条主张最多一个修饰语
- 点名来源，不然去掉
- 用具体细节结尾，不要"未来充满希望"

### 加入个性

- 有观点。对事实有反应，不要只报道
- 变化句子节奏。短的。然后是长的、散漫的。
- 承认复杂性和矛盾感受
- 允许有些不完美——完美的结构看起来像算法生成的

### 删除废话

| AI 表达 | → 人类表达 |
|---------|-----------|
| In order to | to |
| Due to the fact that | because |
| It is important to note that | (直接说) |
| In the event that | if |
| With regard to | about |
| On a daily basis | daily |
| A majority of | most |
| Is able to / is capable of | can |

## 配合 unslop 使用

最有效的流水线：

```bash
# 1. 先用 unslop 做自动化清洗
unslop --deterministic --mode full 文档.md

# 2. 再用 humanizer 规则手动逐条检查
# （检查24种模式的残留）
```

## 与其他 Skill 配合

- **unslop** — 自动化正则清洗 > 再用 humanizer 规则微调
- **ai-vibe-writing** — 先用 style transfer 学习风格，再用 humanizer 去痕迹
