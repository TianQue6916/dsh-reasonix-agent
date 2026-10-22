---
id: mem-3c1ffea0b8bf4184e2b335a4d211f51e
revision: 1
created_at: "2026-10-22T14:54:26.222Z"
updated_at: "2026-10-22T14:54:26.222Z"
name: learn-translate-版本索引与三端状态
description: "learn-translate v4.2.2 终态索引：169 行 / 19 references / 5 版本沿革 / 三端实为 2 副本 / 备份链"
metadata:
  type: user
  fact_type: reference
  scope: project
---

## 技能 `learn-translate` 当前版本（截至 2026-10-22 23:10）

v4.2.2：`SKILL.md` **169 行**，references **19 个**，三端 sha256 一致。

### 版本沿革（每版一句话，细节在 `references/changelog.md`）
| 版本 | 内容 |
|---|---|
| v4.0 | 从"翻译技能"升为「方舟学习引擎」：A 翻译（原 8 步逐字不动）/ B 学习（定锚→取料→四问→验证→落盘）；四问锚点（本质 / 公式 / 现实承重+消失测试 / 拓展四层 L1-L4）；资料层；铁律 26→30 |
| v4.1 | 改名 `learn-translate`；铁律 21 去 Reasonix 时代化；`§A2` 补主力机输出路径；锚点卡落 `Desktop/课程文件/锚点卡/<课程>/`（Desktop 实测只有 工具箱/程序/课程文件）；description 468→342；加「与相邻技能边界」表 |
| v4.2 | 补 **学习科学证据分级** `references/learning-science.md`：九条学习法逐条判 [MA]/[RCT]/[EXP]/[CS]/[OBS]/[D] |
| v4.2.1 | 数字核到 DOI；纠一处误引（0.73/0.39 疑似串 Hattie 2009） |
| v4.2.2 | 加 **人-AI 讨论协议**（`learning-engine.md` 末节，默认角色「审稿人」） |

### references 清单（19）
原 16 个（format / toolchain / prompts / ps-workflow / vision-check / image-pipeline / notes-guide / workflow-core / workflow-large-scale / ironrules-format / ironrules-process / ironrules-roles-sources / chapter-briefs / quickstart-faq / runtime-and-appendix / changelog）+ 3 个新：`learning-engine.md`（179 行，四问 + 讨论协议）、`sources.md`（检索顺序 + 分级 + 社区手法）、`learning-science.md`（证据分级 + 禁用句式）。

### 位置与生效（实测）
- dsh 读 `~/.dsh/skills` → junction → `C:/Users/27063/ai-skills`
- `.reasonix/skills/learn-translate` 与 ai-skills 那份 **inode 相同** ⇒ 真副本只有 2 个（ai-skills + `AppData/Roaming/reasonix/skills`）
- `skill_search` 实时扫目录，改完**当场命中，无需重启 dsh**
- 备份链：`SKILL.md.bak-20261022-pre-v40-ark`、`learning-science.md.bak-20261022-pre-numbers`

### 协作偏好（用户反复确认过的）
- 名字改动、结构改动要给他**选项 + 推荐**，不要自行拍板
- 文件写入：单次 shell heredoc 超 ~8 KB 中文会截断 ⇒ 分段 ≤3 KB + `wc -l`/`tail`/grep 校验
- 三端同步纪律：先让字节一致再增删，否则同步器"仅一方有→补齐"会把删掉的文件补回来
