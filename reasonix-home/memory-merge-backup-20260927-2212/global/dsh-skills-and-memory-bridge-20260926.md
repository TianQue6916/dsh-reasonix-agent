---
name: dsh-skills-and-memory-bridge-20260926
description: dsh web 与 reasonix 共用技能与记忆已落地：80 个技能镜像生效（分片验证通过）+ 只读记忆插件 memory_search/memory_read 已挂载（待重启 web 生效）
type: reference
scope: global
created: 2026-09-26
priority: high
---
# dsh ⇄ reasonix 技能与记忆桥接（2026-09-26 落地）

**结论**：dsh web 已可直接使用 reasonix 的全部合规技能，且能按需检索 reasonix 的记忆（只读、不分叉、不改 reasonix 侧一个字）。

## 一、P0 技能镜像（已生效，无需重启）

- 落点：`~/.dsh/skills/`（dsh 默认扫描根 rank 400，**不用改任何配置**）
- 做法：79 个目录型技能用 junction 链到 `~/.reasonix/skills/<name>`；1 个平铺技能（`reasonix-workspace-mergeback-doctor.md`）复制过来 → **共 80 个**
- 刻意排除 18 个：
  - 12 组 bundle/flat 重名（MD5 完全相同，保留 bundle 版）：aigc-master、anthropic-skills、anti-aigc-2026、baoyu-slide-deck、course-summarizer、html-ppt、mit-ocw-downloader、paper-slide-deck、planning-with-files、playwright-automation、ppt-master、vercel-agent-skills
  - 4 个非 kebab-case 中文名（dsh 要求 name 必须 kebab-case，会静默跳过）：元规则-Reasonix运营规则、开发方法论-Superpowers、降AIGC-文科-ALH、降AIGC-理工科-ACS
  - 2 个无 SKILL.md 的目录：`.archive-shadowed-20260804`、`ai-vibe-writing-skills`（后者是只有 .git 的空壳仓库）
- **实测证据**：在 dsh 会话里调 `skill_search` 返回 reasonix 技能（bilingual-translator / bilingual-ocw-translator 等）；12 组重名去重成功（aigc-master 只出现一次）；4 个中文名确认搜不到
- 回滚：`rm -rf ~/.dsh/skills` 即可（零副作用）

## 二、P1 记忆插件（配置已就位，**需重启 dsh web 才生效**）

- 插件：`~/.dsh/.agent-presets/anchored-standard/memory.mjs`（自写，零依赖，**只读**）
- 挂载点：`~/.dsh/profiles/web/cordis.patch.yml` 的 `preset-anchored-standard` → plugins 段（`- id: memory-reasonix`），**0.1.7 起 `.agent-presets/` 目录不再被扫描**，必须写在这里；`agent.cordis.yml` 只作逐字来源同步
- 工具：`memory_search`（关键词搜 name/description/正文，中文可用）+ `memory_read`（按精确名读全文）
- **设计要点（关键）**：`skill-search.mjs` 已实证「9KB 常驻目录注入 → 0/9 anchored，移除后 ~81%」，且 dsh 上下文注入是 append-only，所以记忆插件**不注入任何常驻文本**，只给按需工具——与 skill-search 同构
- 语料：`~/.reasonix/memory/{global,project}/*.md`，实测扫到 **121 条** fact（global 119 + project 2），自动跳过 `MEMORY.md`、`*.conflict.*`、`*.bak`
- 验证：脱离 dsh 的 apply 单测全绿（工具注册、中文检索、空查询、scope 过滤、未命中提示）；`dsh --profile web --dump-config` exit=0 且 memory-reasonix 已进组合树
- 备份：`cordis.patch.yml.bak-20260926-pre-memory-reasonix`、`agent.cordis.yml.bak-20260926-pre-memory-reasonix`
- 回滚：从上面备份恢复 patch，或删掉 plugins 里那两行

## 三、尚未做（下一步候选）

1. 4 个中文名技能：需改名成英文 kebab-case 并同步引用（涉及内容修改，未擅动）
2. 记忆**写入**：当前插件只读，dsh 里新产生的记忆还写不回 reasonix（涉及 MEMORY.md 索引同步，留待第二阶段）
3. ZIM/浏览器/RAG：按需再上（技能路径已通，`tool-offline-wiki` 可直接在 dsh 用）
4. headless profile 未挂记忆插件

## 四、其他实测事实

- dsh `--dump-config` 显示 `tool-result-pruner`/`compaction-basic` 在 profile 层是 `disabled: true`，但 preset 层重新挂载 → **实际启用**（thresholdChars 8192 / head 4096 / tail 1024）；`token-meter`、`spill-local`、`spill-policy`(maxInlineTokens 12500) 均启用 → P2 上下文卫生**全绿，无需动作**
- dsh web 当前实例：127.0.0.1:3080（PID 34800）
