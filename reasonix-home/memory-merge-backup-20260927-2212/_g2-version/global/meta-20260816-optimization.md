---
id: meta-20260816-optimization
revision: 1
created_at: "2026-08-16T15:00:00.000000000Z"
updated_at: "2026-08-16T15:00:00.000000000Z"
name: meta-20260816-optimization
description: 2026-08-16 全系统优化总览——技能精简/记忆优化/dsh 锚定与创造模式/思维链实验结论
metadata:
  type: user
  fact_type: reference
  scope: global
---

# 2026-08-16 全系统优化总览（技能 · 记忆 · dsh · 思维链）

> 用户指令："让 Reasonix 与 dsh 如虎添翼而非降智，大幅精简技能、优化记忆、强制 Pro 走 dsh、双机分工、测试思维链语言"。本次大决策由 dsh 极简模式（pro+max 锚定）产出 448 行方案后执行。

## 一、技能精简 91 → 22
- 备份：`~/.reasonix/skills-backup-20260816/`（91 全量）+ `skills-backup-20260816-consolidate/`
- 归档：`~/.reasonix/skills-archive-20260816/`（84 项）
- 8 组合并：新建 `academic-writing`（5 学术写作技能）、`thinking-modes`（caveman/grill-me/zoom-out）；aigc-master 吸收 humanizer+ai-vibe 增量；pdf 吸收 xparse-parser；docx 吸收 detailed-docx；reasonix-power-user 吸收元规则；bilingual-ocw-translator/playwright-automation 吸收冗余来源
- 保留 22 个目录型技能，0 文件型；config.toml disabled_skills 清空
- 技能路由记忆重写 v2（22 技能映射）
- control-main-machine 明文凭据去硬编码 → 单一来源 `windows-main-machine-full`

## 二、记忆优化 59 → 26（5435 → 2110 行，-61%）
- 备份：`~/.reasonix/memory-backup-20260816/` + `memory-backup-20260816-consolidate/`
- 原始件：`~/.reasonix/memory-archive-20260816/`（含 legacy-eecdfd/）
- 15 组合并（merge_memories.py 剥离 frontmatter 拼接，零丢失）
- 4 大件蒸馏：方舟计划 / 离散数学 / 高数 / CSAPP（原文 3298 行 → 精华）
- **安全**：计划-方舟与 Codex 件的明文 sk- key 全库脱敏归零
- MEMORY.md 重建为 26 份索引

## 三、dsh 增强（本机 Linux + 主力机 Windows 同步）
- **首轮锚定**：headless patch 引用 `~/.dsh/.agent-presets/anchored-standard/tool-bootstrap.mjs`；首轮工具=Minimal 对（Linux: bash+str_replace_editor；Windows: pwsh+str_replace_editor）+ minimal persona；晋升后全量。已验证 tools=2 100% 生效（12 会话）
- **⚠️ 轨迹未迁移**：所有会话 reasoning 首行 "Let me/The user wants"，无一 "We need"。锚定=首轮噪声隔离（剥离 skill-catalog），不是轨迹保证；不要以 we/let me 作健康度指标
- **创造模式**：`DSH_TOOLS_MODE=code` → 首轮只剩 run_code（已验证 tools=1）；dsh-gate 新增 `--mode code`
- **并发锁**：dsh-gate flock 互斥（同机第二实例 exit 9）+ settings 启动预检 + trap INT TERM。settings.yaml 已恢复 flash+high 默认
- **插件补配**：web profile dsh-hooks（turn/end 落盘 /tmp/dsh-hooks.log）+ llm-fallbacks（settings.yaml `fallbacks:` 节，pro 失败降 flash）
- **routing-suite 不装**（issue #13 首轮路由失效 + 功能重叠）；复查触发：issue #13 关闭 + rc.7
- 主力机：preset 已传、headless 锚定 patch 已打、dsh-gate.ps1 已加 -Mode

## 四、思维链语言实验结论（6 run，pro+max）
- **所有臂 reasoning 自发英文**（纯中文 prompt 也英文思考）；A/C 无差异；B（纯英文）最长
- **不引入语言工程**；纯中文 prompt 最优（最短 + 最低 let_me + 最省）
- 报告：`输出文件/思维链语言对照实验报告-20260816.md`
- 限制：任务简单 n=2，复杂任务需复测

## 五、新技能/记忆/工具
- 技能：`dsh-mode` v1.1（模式手册）、`academic-writing`、`thinking-modes`
- 记忆：`meta-pro-route-dual-machine`（Pro 必走 dsh + 双机分工铁律）、`meta-20260816-optimization`（本篇）
- 脚本：`~/.reasonix/global-workspace/scripts/dsh-analysis/`（analyze-session / fingerprint2 / dump-event / summary / merge_memories）
- 方案全文：`输出文件/方舟系统架构决策方案-20260816.md`（448 行，dsh 产出）
