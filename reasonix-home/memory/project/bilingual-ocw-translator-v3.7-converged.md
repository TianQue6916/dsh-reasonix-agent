---
id: mem-1e48e989d26d5d8fa1f47f867ff809be
revision: 1
created_at: "2026-09-30T13:53:52.211Z"
updated_at: "2026-09-30T13:53:52.211Z"
name: bilingual-ocw-translator-v3.7-converged
description: "翻译技能定稿 v3.7：以 v3.6 为底座做 progressive disclosure（主文档 697 行 + references/ 8 文件），三端 sha256 一致，翻译技能收敛为唯一入口"
metadata:
  type: user
  fact_type: project
  scope: project
---

## 终态（2026-09-30，用户拍板「以 Linux 那份为底座融合」）

### 1. 谱系判定（关键，别再用错底座）
同一个 skill 在四份副本上长期分叉，2026-09-30 用 sha256 钉死：

| 位置 | 内容 | 结论 |
|---|---|---|
| Linux `~/.reasonix/skills/bilingual-ocw-translator/SKILL.md` | 2275 行 / 160063 B | **== Windows Roaming，同一份**（sha `ae7cd931…`）＝ v3.6 谱系 |
| Windows `AppData\Roaming\reasonix\skills\...` | 同上 | 同上（Reasonix Desktop 读这里） |
| Windows `.reasonix\skills\...` | 1338 行 / 88634 B（Sep-10 v3.2） | **陈旧 fork**，因同步器「冲突绝不覆盖」从 09-10 冻结至今；dsh 的 `~/.dsh/skills` symlink 指向这里，所以 dsh 一直读的是它 |

v3.6 多出 937 行：铁律 24/25/26 + 第 8 章（PS 流水线）/ 第 9 章（视觉核对）/ 第 10 章（图像流水线）。**v3.2 上做过的重构已作废**（中途还试过 `meta/muse-spark-1.3-contributor`，用户实测不好用，回退 v4.1 flash）。

### 2. v3.7 = v3.6 底座 + progressive disclosure
- 主文档 **2275 → 697 行**；移出 7 章 + 版本沿革到 `references/`（8 文件，1709 行，按需读）：
  - `notes-guide.md`（第 3 章）、`format.md`（第 4 章，格式唯一权威）、`toolchain.md`（第 5 章）、`prompts.md`（第 6 章）
  - `ps-workflow.md`（第 8 章，含 §8.9 渲染四道坑）、`vision-check.md`（第 9 章）、`image-pipeline.md`（第 10 章）
  - `changelog.md`（v3.1–v3.6 版本沿革 + 同步纪律）
- 新增「🎯 核心契约」12 条一览（模型/通道、双语格式、密度、数学格式、审计即修复、wiki 先行、全资源搜索、写注、扫描版视觉核对、插图不丢、替换式改稿覆盖公式边界、交付自检）
- **26 条铁律一条未删**且全在主文档；移出章节的**正文行零丢失**（脚本化守恒校验：剥掉跨引用行后逐行比对，通过）
- 交叉引用全部改指 `references/<file>.md`（含 §8.9 / §9.4 / §10.2 / §10.2.5 等节号）；`references/*.md` **不会**被 skill provider 误注册（provider 只认技能目录下的 `SKILL.md`，实测 `skill_search("notes-guide")` 无命中）
- frontmatter description 改为触发式措辞（补「凡是需要翻译讲义…都用这个技能」）

### 3. 翻译技能收敛：只留一个入口
`bilingual-translator` 与 `ocw-lecture-translator` **三端同时停用**：`SKILL.md` → `SKILL.md.disabled-20260930-keep`（各留 `SKILL.md.bak-20260930-pre-disable`）。三端 SKILL.md 均不存在；Windows dsh `skill_search` 已不再返回它们。

### 4. 三端一致性验证（唯一可信判据）
10 个文件在 `.reasonix` / Roaming / Linux 三处 sha256 **全一致**：`SKILL.md`(f41eb970…)、`HISTORY.md`(f9974965…)、8 个 refs。`HISTORY.md` 以 Linux 版为 canonical（它多 v3.4/v3.6 两节），追加 v3.7 行后三端覆盖；`.reasonix` 旧版留 `HISTORY.md.bak-20260930-pre-converge`；融合前底座三端留 `SKILL.md.bak-20260930-pre-v37-merge`。

### 5. ⚠️ 同步通道现状（2026-09-30 起，重要）
- **reasonix cron 已停用**：crontab 里 `30 8,12,21 * * * sync_cron.sh` 被注释（「停用：改用 dsh 同步」）。
- **新的 `~/.dsh/storages/tools/sync_dsh.py` 只同步 `~/.dsh` ↔ `C:\Users\27063\.dsh` 这一对**，**不覆盖 `~/.reasonix/skills`**。
- ⇒ **技能目前没有自动同步通道**，改完必须手动推三端（本次就是手动 scp/cp）。
- `sync_reasonix.py` 仍在（Linux 侧、paramiko 连 100.84.67.49），可手动 `--sync`；其已知局限：**size 相同即判为 same，等长改动不传播**。
- 旧的 `sync_reasonix.py` 仍在 skills 上产生过 conflict 副本：本次 21:37 那一轮撞上中间状态，留下 `SKILL.md.conflict.win.df9f53e4df.bak`（Windows v3.4 fork）与 `SKILL.md.conflict.linux.7c958398fb.bak`（Linux v3.6），**内容无损、可留作回滚点**。
- 既有分叉（未处理）：`.reasonix/skills` 有 98 项，Roaming/Linux 各 97 项，差一个 `ai-vibe-writing-skills`。

### 6. 手动同步操作（下次直接用）
```bash
# Windows → Linux（key 免密，别名 tianque / tianque-lan）
scp -q <file> tianque:/home/tianque/.reasonix/skills/bilingual-ocw-translator/<rel>
# Windows → Roaming
cp <file> "C:/Users/27063/AppData/Roaming/reasonix/skills/bilingual-ocw-translator/<rel>"
# 验收：三端 sha256 必须一致（size 相同才会被同步器判为 same，冲突不再产生）
```
