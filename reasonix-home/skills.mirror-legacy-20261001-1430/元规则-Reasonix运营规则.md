---
name: 元规则-Reasonix运营规则
description: Reasonix Code 运营规则全集——标准化命名/记忆管理/会话分类/Skill命名/编辑规范——调用后按规则执行命名标准化任务
---
# Reasonix Code 运营规则（标准化命名专用技能）

> 调用此技能执行命名标准化任务。**只改名不改内容**是铁律。

---

## 一、黄金法则

**只改名不改内容** — 文件正文、描述、playbook 主体、数据内容全部不变。
- 配套更新索引文件（MEMORY.md）中的链接和显示名
- 技能文件的 `name:` frontmatter 字段属于"名字"范畴，可以更新

## 二、记忆文件命名标准化

### 命名模板
```
category-subject-key-description.md
```
全部小写 kebab-case。

### 类别前缀（按字母排列自动分组）

| 前缀 | 用途 | 示例 |
|------|------|------|
| `anti-aigc-*` | 反AI检测/降率相关 | `anti-aigc-battle-log-10rounds.md` |
| `meta-*` | 系统元规则（关于工具本身） | `meta-auto-remember-rule.md` |
| `plan-*` | 计划/项目规划 | `plan-ark-project-summary.md` |
| `skill-*` | 技能安装/索引记录 | `skill-matt-pocock-auto-trigger.md` |
| `study-*` | 学习笔记/课程 | `study-csapp-cache-optimization.md` |
| `tool-*` | 工具配置/安装记录 | `tool-offline-wiki-51gb-zim.md` |

### 操作步骤
1. 确定记忆的类别（anti-aigc / study / tool / skill / meta / plan）
2. 提取核心描述词（2-4个英文kebab词）
3. 重命名文件
4. 更新同目录下 MEMORY.md 中的链接（格式: `- [新名](新名.md) — 描述不变`）

## 三、会话文件命名标准化

### 分类法

先判断会话类型——检查对应文件是否存在：

**有实质内容的会话**（存在 `.jsonl` 内容文件或 `.meta.json` 摘要文件）：
- 读取 `.jsonl` 第一行 `user content` 判断主题
- 或读 `.meta.json` 的 `summary` 字段
- 格式: `code-主题英文kebab-YYYYMMDDHHmm.扩展名`
- 同组文件（.events.jsonl + .jsonl + .meta.json + .plan.json + .bak）**必须一起改名**

**无实质内容的会话**（仅 `.events.jsonl` 且只有 `session.opened` 事件）：
- 统一改为 `brief-YYYYMMDDHHmm.events.jsonl`

**保留原名的会话**：
- `mind-*` — Mind语言测试会话
- `subagent-sub-*` — 子代理运行记录

### 主题命名建议

| 场景 | 主题词建议 |
|------|-----------|
| 离线Wiki/搜索 | `wiki-index` |
| 字幕翻译 | `subtitle-课程名` |
| MCP配置 | `fix-mcp-bridge` / `mcp-config` |
| VS Code插件 | `vscode-插件名-plugin` |
| 安装技能 | `install-技能名-skills` |
| 降AI率 | `paper-antiaigc` / `doc-antiaigc` |
| OCR | `ocr-install-check` / `ocr-followup` |
| Git推送 | `push-github` / `git-sync` |
| 查找文件 | `find-工具名-app` |
| 迅雷下载 | `thunder-download` |
| 启动脚本 | `工具名-startup` |
| 创建技能 | `create-主题-skills` |

## 四、技能文件命名标准化

### 文件型技能（.md）
- 文件名 = frontmatter `name:` 字段，两者必须一致
- 避免纯缩写：`ACS.md` → `acs-sci-eng-anti-aigc.md`
- `superpowers.md` → 可加前缀如 `dev-superpowers.md`
- 同时更新文件内的 `name:` frontmatter

### 目录型技能（`目录名/SKILL.md`）
- 目录名已清晰则保留（如 `python/`, `database/`, `docker/`）
- 目录名模糊则同文件型技能规则改名

## 五、禁止操作清单

- ❌ 不改正文内容
- ❌ 不改描述文字
- ❌ 不改数据内容
- ❌ 不改实际代码逻辑
- ❌ 不合并不同主题的文件
- ❌ 不删除文件（除非用户明确要求）
- ❌ 不修改 `mind-*` 和 `subagent-*` 会话名
