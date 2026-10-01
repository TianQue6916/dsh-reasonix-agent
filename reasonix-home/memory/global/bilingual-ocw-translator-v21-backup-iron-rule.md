---
id: mem-c17e3cfa95f66198477b2097806405e3
revision: 1
created_at: "2026-08-11T11:34:42.895854071Z"
updated_at: "2026-08-11T11:34:42.895854071Z"
name: bilingual-ocw-translator-v21-backup-iron-rule
description: bilingual-ocw-translator v2.1：新增铁律 19 每一步备份（5 个必做备份点，快照保留 ≥3 份）
keywords: backup 备份 铁律19 bilingual-ocw-translator v2.1 快照 回滚
volatility: stable
metadata:
  type: user
  fact_type: project
  scope: global
---

# bilingual-ocw-translator 技能新增铁律 19（备份）

**变更**：2026-08-09 用户要求「每一步都必须不断备份」，已在技能第一章新增**流程类铁律 19**（第一章现有四类铁律：格式 1-10 / 分工 11-13 / 来源 14-18 / 流程 19），版本沿革记为 v2.1。

**Why:** 多波次 + 多子代理 + 多轮审计修复，合并与批量修复是破坏性操作；无备份则整波重跑（每波 ≤32 子代理）成本极高。

**How to apply:** 翻译流水线 5 个必做备份点——①开工前（源 PDF/原文/术语表）②波 1 worker 落盘后（打包 `pages/`）③每次执行审计修改意见前（8c/8i/8j）④8e 合并前（全部波次产物）⑤交付前。快照存 `.reasonix/attachments/backup/<时间戳>-<阶段名>/`，保留 ≥3 份，交付确认前不删。文件：`/home/tianque/.reasonix/skills/bilingual-ocw-translator/SKILL.md`（global）
