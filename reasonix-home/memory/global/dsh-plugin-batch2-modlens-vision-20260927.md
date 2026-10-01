---
id: mem-b39c42bbe41ef07138aad8aaa506560d
revision: 1
created_at: "2026-09-26T16:31:52.465Z"
updated_at: "2026-09-26T16:31:52.465Z"
name: dsh-plugin-batch2-modlens-vision-20260927
description: "装了 modlens（视觉插件，4043★）让纯文本 DeepSeek 能看图；含 14 项候选插件清单与判定；并记录解除了一个卡死 22 分钟的 pnpm 安装"
metadata:
  type: user
  fact_type: reference
  scope: global
---

# 插件生态第二批：装了 modlens（视觉）+ 完整候选清单（2026-09-27）

## 一、本轮装的
**`@liustack/modlens@3.26.5`**（4,043★，MIT，TypeScript）—— **视觉插件**：
- 核心价值：DeepSeek 旗舰模型是 **text-only**，看不了图；modlens 给纯文本模型"眼睛"
- 支持**直接往聊天框粘贴图片**（不用先存文件给路径）
- 自动给每个携带 eligible text-only DeepSeek/GLM/MiMo Pro 模型的 provider 路由加一个 `(modlens vision)` 包装 entry
- 安装：`dsh plugin --profile web add @liustack/modlens@3.26.5`（5.5s 完成）
- 验证：dump exit=0，组合树出现 `- id: modlens`，diff 只多两行
- ⚠️ **需要视觉后端**：Antigravity CLI（免费无 key）/ 免费 Gemini key / 任意 OpenAI-compatible 多模态 provider；**待确认本机走哪条**（dsh 有 `llm-pi-ai` provider，可能有视觉模型）
- 无 hook / 无 proxy daemon / 无 harness 配置改动，卸载 = 删一个文件夹

## 二、顺带处理的事故
另一个会话在 `dsh plugin --profile web add link:D:/Toolbox/goat-gateway/dsh-plugin-local-search` 上**卡死 22 分钟**（CPU 0.3s，pnpm add link: 无响应），占着 web profile，阻塞一切插件安装。已：
1. 备份 profile（`package.json.bak-20260927-pre-kill`、`pnpm-lock.yaml.bak-20260927-pre-kill`）
2. `taskkill /T /F /PID 4812` 杀掉整棵进程树
3. 装 modlens 成功（pnpm 报 `Packages: +3 -5`）
- ⚠️ **遗留**：`dsh-plugin-local-search` 是**孤儿依赖**（在 deps 里、不在 bundles 里）→ 不加载但会参与下次 pnpm install；那是别的会话的意图，未擅自删除

## 三、候选清单（GitHub API 实时搜索，按与用户需求的相关度）
| 类别 | 插件 | ★ | 判定 |
|---|---|---|---|
| **视觉** | `liustack/modlens` | 4,043 | ✅ **已装** |
| 视觉 | `Anionex/dsh-vision-toolkit` | 884 | 备选（dshfind 评分 94，最高分插件） |
| 视觉 | `ysr666/dsh-vision-router` | 1,120 | 备选（内置免费视觉链） |
| **科研** | `1692775560/dsh-Mimir-Academic-research` | 540 | 推荐（LaTeX 边写边编译 + arXiv + 实验追踪 + GPU SSH 编排） |
| **学习** | `Miaotofu01/Study-Mate` | 328 | 推荐（定路线/讲知识/做项目） |
| 论文 | `alaliqing/claude-paper` | 337 | 推荐（跨 agent 论文 toolkit） |
| **token** | `giter00/dsh-headroom` | 13 | 推荐（**纯 JS 无原生依赖**；挂 tools/post-execute 自动压缩 + CCR 可逆取回；代码/文件工具默认不压） |
| 阅读 | `xiehuan123/dsh-deepread` | 56 | 备选（书/PDF → 证据优先阅读） |
| LaTeX | `liuup/dsh-latex-tools` | 10 | 备选（悬停公式复制 TeX 源） |
| 目标看板 | `miuzel/dsh-graph` | 13 | 备选（goal/判据/上下文卡片二维泳道） |
| 市场 | `yyyyukari/dsh-plugin-workshop` | 24 | 工具（Steam Workshop 式插件浏览器） |
| 记忆 | `EverMind-AI/EverOS` | 13,214 | 与 deja 重叠（但其 "Markdown-native" 与用户记忆体系同构，值得再看） |
| 手册 | `Electricitysheep/dsh-handbook` | 812 | 学习资料（非插件） |
| 技能商店 | `anbeime/skill` | 7,231 | 技能包集合 |

## 四、待办
1. **重启 dsh web** → deja + modlens 一起生效（当前两个都待重启）
2. 确认 modlens 的视觉后端（Antigravity CLI / Gemini key / pi-ai 路由）
3. 分批装下一批（建议顺序：headroom → Mimir → Study-Mate），**不要一次全装**（每个都是 bundle patch）
