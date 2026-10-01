---
id: mem-f353f4b7a266ee801322986c1497efc7
revision: 1
created_at: "2026-08-09T06:52:06.818855817Z"
updated_at: "2026-08-09T06:52:06.818855817Z"
name: bilingual-ocw-translator-refactored-v2
title: bilingual-ocw-translator 重构完成（v2.0）
description: bilingual-ocw-translator 已重构为 11 章单文件（v2.0）：铁律前置/双审计/全资源搜索；双机同步以 Linux 版为准，win 旧 8b 必须被覆盖
metadata:
  type: user
  fact_type: project
  scope: global
---

# bilingual-ocw-translator 重构完成（v2.0，2026-08-09）

**Why:** 用户根据网页版（DeepSeek）诊断 + 本机实测（双机冲突 .bak），决定按使用场景重构技能为 11 章单文件。

**How to apply:**
- 新版结构：⚡快速上手路由表 → 第一章🚨铁律（18条）→ 第二章标准翻译流程（含全资源搜索+双审计）→ 第三章大规模策略（8a-8j 波次分工）→ 第四章译者注指南 → 第五章配色标签速查（唯一权威）→ 第六章工具参考 → 第七章子代理Prompt模板 → 第八章历史错误记忆 → 附录
- 内容零删除：Strang/prob7sol/PS01/lec16 教训、Part C/D 来源表、8h 对比审计、Reader Testing 等全部保留（见技能第八章 8.2 错误清单表）
- **双机同步铁律：以 Linux 版 SKILL.md 为准**。win 端旧版（含被否决的"50 worker 子代理翻译"8b）必须被覆盖；已清理本机 2 个 .bak 冲突文件（8月4日 linux 版 + 8月8日 win 版）
- 旧 8b"主代理亲自翻译"铁律（2026-08-04）已被 2026-08-09 新分工替代：25×2 子代理翻译 + 32 上限波次（见 [[reasonix-32-parallel-limit-and-translation-division]]）
- 新技能文件：`/home/tianque/.reasonix/skills/bilingual-ocw-translator/SKILL.md`（1356行/78KB）
