---
id: legacy-71910ffd02a85a918e0f8f83
revision: 1
created_at: "2026-07-13T23:13:56.0287315Z"
updated_at: "2026-07-13T23:13:56.0287315Z"
name: 降aigc-acs理工科-alh文科
description: ACS(理工科)+ALH(文科)降AIGC技能已创建，基于25篇知网论文真实数据分析
metadata:
  type: user
  fact_type: reference
  scope: global
---

# ACS + ALH 降AIGC技能创建记录

## 创建时间
2026年6月

## 数据来源
- 25篇知网PDF论文（C:\Users\27063\Desktop\工具箱\论文降低aigc分析文献库\）
- 提取为txt，按学科分类：ALH（文科/社科21篇）、ACS（理工科/方法5篇）
- 分析脚本：analyze_features.py（句长分布、连接词密度、句式特征、段落结构）

## 核心数据（真实论文统计）
| 指标 | ALH（文科） | ACS（理工科） |
|------|:----------:|:----------:|
| 平均句长 | 24.6字 | 27.6字 |
| CoV | 46.7% | 41.9% |
| 短句<15字 | 25.8% | 18.4% |
| 长句>40字 | 9.1% | 20.2% |
| 每段连接词 | 9.6 | 12.0 |
| 设问句 | 0.75% | 0.2% |
| AI高频词/千字 | 2.36 | 3.06 |

## 参考来源
- 离线维基百科：Stylometry、Perplexity、Burstiness、Signs of AI writing
- GitHub：deai-academic-zh、aigc-deslop、AIGC-Detector-Pro、aigc-reduce、Humanizer-zh-academic、paper-humanizer-skill
- 已有技能：anti-aigc-2026（10轮实测，最优红3.8%）
- 学术论文：中文AIGC检测8维度分析、C-ReD基准、多特征融合检测

## 安装位置
- ACS：~/.reasonix/skills/ACS.md
- ALH：~/.reasonix/skills/ALH.md

## 设计原则
1. 实事求是 — 所有量化参数来自真实论文数据
2. 分学科 — 文科CoV高(46.7%)、短句多(25.8%)；理工科长句多(20.2%)、连接词密集(12/段)
3. 专业性优先 — 不为降AIGC牺牲学术严谨，禁止编造数据/破坏术语/口水话
4. 数据驱动 — 每个参数都有论文语料支撑
