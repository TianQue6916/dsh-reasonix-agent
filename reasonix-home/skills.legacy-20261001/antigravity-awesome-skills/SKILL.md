---
name: antigravity-awesome-skills
description: Antigravity Awesome Skills 合集（1493+ SKILL.md 技能库）。涵盖开发、测试、安全、架构、写作、DevOps等全领域。安装后可搜索调用子技能。当需要查找 Claude Code / Cursor 生态的最佳实践技能时触发。
---

# Antigravity Awesome Skills — 1493+ 技能库

来自 [sickn33/antigravity-awesome-skills](https://github.com/sickn33/antigravity-awesome-skills) 的跨平台 SKILL.md 技能库（39K+ Stars）。包含 Claude Code、Cursor、Gemini CLI、Codex CLI 等平台的 1493+ 可复用技能。

## 安装方式

由于网络限制，安装方式如下：

### 方式一：npx 安装（推荐）

```bash
# 安装到默认路径
npx antigravity-awesome-skills

# 安装到 Reasonix skills 目录
npx antigravity-awesome-skills --path "%USERPROFILE%\.reasonix\skills"

# 按类别筛选安装
npx antigravity-awesome-skills --category writing,development --risk safe
```

### 方式二：git clone

```bash
git clone --depth 1 https://github.com/sickn33/antigravity-awesome-skills.git
```

### 方式三：直接浏览在线目录

https://sickn33.github.io/antigravity-awesome-skills/

## 技能库概览

### 与降AI率/写作相关的子技能

| 技能 | 类别 | 说明 |
|------|------|------|
| `unslo` | writing | 去除AI写作痕迹 |
| `writing-style` | writing | 写作风格优化 |
| `rewriting-refinement` | writing | 文本改写与润色 |
| `humanize-text` | writing | 文本人类化 |
| `prompt-engineering` | development | 提示工程优化 |
| `code-refactoring-refactor-clean` | development | 代码重构与清理 |
| `error-message-style` | writing | 错误信息风格化 |
| `storytelling` | writing | 叙事写作 |

*注：实际技能名称以最新的 CATALOG.md 为准*

### 完整类别索引

| 类别 | 数量 | 说明 |
|------|------|------|
| architecture | 97 | 架构设计 |
| business | 85 | 商业技能 |
| coding | 81 | 编程技能 |
| communication | 87 | 沟通技能 |
| compliance | 22 | 合规 |
| creative | 77 | 创意写作 |
| data | 72 | 数据处理 |
| design | 78 | 设计 |
| development | 99 | 开发 |
| devops | 93 | DevOps |
| education | 89 | 教育 |
| finance | 81 | 财务 |
| health | 89 | 健康 |
| infrastructure | 62 | 基础设施 |
| marketing | 96 | 市场营销 |
| productivity | 85 | 效率工具 |
| project-management | 66 | 项目管理 |
| security | 87 | 安全 |
| testing | 81 | 测试 |
| writing | ~100 | 写作 |

## 与本项目已有技能的结合

```markdown
降AI率最优流水线（组合使用）：

1. antigravity-awesome-skills 中搜索相关写作技能
   → 配合 unslop (CLI) 做自动清洗
   → 配合 humanizer 规则做人工校对
   → 配合 ai-vibe-writing 做风格迁移

2. 开发场景：
   → 配合 cssap-deep 进行系统学习
   → 配合 latex-writing 进行学术写作
   → 配合 skill-creator 创建自定义技能
```

## 使用建议

1. 先用 `npx antigravity-awesome-skills` 安装完整库
2. 根据需求阅读对应 SKILL.md 文件
3. 与本项目已有技能（unslop, humanizer, ai-vibe-writing）配合使用
4. 可利用 skill-creator 创建专属的组合技能
