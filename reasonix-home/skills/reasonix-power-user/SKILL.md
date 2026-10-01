---
name: reasonix-power-user
description: Reasonix 高级用法 — code/chat/run 命令, Skill/MCP/记忆/系统提示管理
disable-model-invocation: true
---

# Reasonix高级用户

核心命令: reasonix code/chat/run/commit
Skill系统: /skill list/new/show/<name>, ~/.reasonix/skills/<name>/SKILL.md
MCP集成: reasonix mcp list/search/install/browse/inspect
会话管理: --continue/--new/--resume, reasonix sessions
记忆系统: ~/.reasonix/memory/global/, MEMORY.md, /memory list
系统提示: --system-append, --system-append-file, REASONIX.md
Dashboard: --dashboard-port, --open-dashboard

## DSH 钩子（DeepSeek Harness 集成 — 2026-09-04 更新）

**本机不跑 dsh（性能不足），一律走主力机 dsh**——用 `dsh-remote`（本机已装 `~/.local/bin/dsh-remote`）：

- 同步调用：`dsh-remote -m deepseek-v4.1-flash -e high "任务"`（模型必须显式，裸调用报错 exit 2）；强制最高能力：`dsh-remote -m deepseek-v4.1-flash -e max "任务"`（v4.1 flash + max；pro 已弃用）
- 后台化：`dsh-remote --async "任务"` → 返回 id；查进度：`dsh-remote --status`
- 学术/翻译任务铁律：一律 `dsh-remote -m deepseek-v4.1-flash -e max`，任务描述显式写「发挥你最高能力 / max thinking / 详尽输出」
- 完整档案：`~/.reasonix/memory/global/工具-dsh并发调度与命令铁律-20260904.md`
- 绝不用本机 dsh（`~/.dsh` 只在主力机生效）

## 运营规则（2026-08-16 合并自 元规则-Reasonix运营规则.md）

### 黄金法则
**只改名不改内容** — 文件正文、描述、playbook 主体、数据内容全部不变。配套更新索引（MEMORY.md）中的链接和显示名。

### 记忆文件命名
`category-subject-key-description.md`（全小写 kebab-case）；前缀：anti-aigc-* / meta-* / plan-* / skill-* / study-* / tool-*。

### 会话文件命名
- 有实质内容：`code-主题英文kebab-YYYYMMDDHHmm.扩展名`
- 仅 session.opened：`brief-YYYYMMDDHHmm.events.jsonl`
- mind-* / subagent-sub-* 保留原名

### 技能文件命名
- 文件名 = frontmatter `name:` 字段，两者一致
- 避免纯缩写；目录型技能名字清楚的不改

### 禁止操作
不修改正文内容（只改名时）；不合并不同主题文件；不删除无内容会话。
