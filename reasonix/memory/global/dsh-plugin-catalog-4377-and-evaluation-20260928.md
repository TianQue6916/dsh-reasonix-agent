---
id: mem-1016930fd8bb46b553b6b9c65e873e3e
revision: 1
created_at: "2026-09-27T16:44:05.221Z"
updated_at: "2026-09-27T16:44:05.221Z"
name: dsh-plugin-catalog-4377-and-evaluation-20260928
description: "拿到完整插件目录（awesome-dsh-plugin.com/plugins.json，4377 插件）并做横向评估：memory 类 top（OpenViking ★38736 / hindsight ★32440 / 已装 mnemon ★417）、remote 类 top（dsh-web-remote ★8037 远超旧候选）、以及官方标注的 468 个安全红线插件"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 一、数据源：完整插件目录（**4377 个插件**）

```bash
curl -s --noproxy '*' --max-time 180 -o ~/.dsh/storages/plugins.json \
  "https://awesome-dsh-plugin.com/plugins.json"
# → 825 KB / 4377 条 / updated: 2026-09-27
# 注意：max-time 40 会截断成 825KB 的坏文件（末字符在半截字符串里），必须给足超时
```

**每条插件字段**：
`name / owner / url / page / category / description{en,zh} / stars / downloads / downloadsStart / downloadsEnd / npm / install / version / added / capabilities / capabilityCheckedAt / capabilityRedLines / capabilityRedLines*`

**分类分布 top15**：
```
ui 751 / tools 577 / dev 314 / session 286 / workflow 265 / usage 235 / model 212
memory 205 / skill 173 / notify 166 / theme 152 / security 149 / remote 134 / fun 131 / vision 111
```

**其他数据源**：
- `imsai-sh/awesome-deepseek-harness-plugins` ★251 —— "**11,000+ dsh plugins**"（开源了市场 + 目录流水线 + 公开查询 API）
- `AdamPlatin123/awesome-dsh-plugins` ★1466 —— "DSH Plugin Radar"
- `UPDATE-API-V1.md`（dshmarket 包内）

## 二、🔴 官方标注的**安全红线**（468 个插件有 `capabilityRedLines`）

例：
```
a903067276-rgb/dsh-hud        ['reads credentials/secrets AND has network access']
addie-ace/dsh-livebench-rankings  ['uses plaintext http:// to www.ibm.com']
AKIRACOD/dsh-drag-and-drop    ['reads credentials/secrets AND has network access']
```
→ **这直接服务 objective 的 #6/#7 安全决策**：装任何插件前先查它的 `capabilityRedLines`。
（468 / 4377 ≈ 10.7% 的插件被标了红线。）

## 三、memory 类 top 12（objective (1) 的横向对比）

| ★ | 插件 | 说明 |
|---|---|---|
| **38736** | `volcengine/OpenViking#examples/dsh-memory-plugin` | **火山引擎官方**。npm `@openviking/dsh-memory-plugin`。能力：**pre-step auto-recall + 画像注入**、session capture、`viking://` URI guarding、recall/write 工具。**依赖 OpenViking server**（额外部署）。`capabilities: ["env"]` |
| **32440** | `vectorize-io/hindsight#coding-agents` | npm `@vectorize-io/hindsight-coding-agents`。能力：**auto recall and retain**、**knowledge pages**、**deep reflection**、**per-repo memory banks** |
| 3525 | `agentscope-ai/ReMe#dsh` | 连 DSH 到 ReMe 的本地记忆 |
| 2662 | `zilliztech/memsearch#MemSearch` | Shared Markdown memory |
| 1051 | `vshulcz/deja-vu#extensions/dsh` | **就是已装的 deja** |
| 628 | `adoresever/graph-memory` | traceable / searchable cross-session memory |
| 511 | `Ikalus1988/MisakaNet` | failure-recovery memory |
| 436 | `text2future/flowix#dsh-flowix-memo` | 注册本地 flowix-cli MCP server |
| **417** | `omdsh-dev/dsh-mnemon` | **就是已装的 mnemon** |
| 191 | `tinqiao-oss/engramory` | long-term memory |
| 181 | `seriousz158/dsh-memory` | **Local Git-backed** long-term memory |
| 128 | `ZSeven-W/dsh-noema` | durable long-term memory |

**结论（我方判断）**：**star 数不代表适配度** —— OpenViking 的 38736 是整个 monorepo 的 star（插件只是 `examples/` 下一个），
且**需要额外部署 OpenViking server**；hindsight 的 32440 同理。
**而 mnemon 已完整落地**（195 insights / 5498 条 four-graph 边 / 三层 / embedding 100% / 自动同步 / 索引自愈），
且有它们没提的 **importance decay**。**建议保留 mnemon，hindsight 作为备选**（它的 "auto recall and retain" + "deep reflection" 确实是我们 guided 模式没有的）。

## 四、remote 类 top（objective (2) 的 #6）

| ★ | 插件 | 说明 |
|---|---|---|
| **8037** | `zhu1090093659/dsh-web#packages/dsh-web-remote` | **Remote control of a dsh web workspace** ← **远超我 round 15 找到的 ★225** |
| 8037 | 同仓库 `dsh-web-ssh` | SSH ops panel：web terminal |
| 319 | `saya-ch/dsh-mobile` | Android 访问 |
| 308 | `ZSeven-W/dsh-ios` | iOS Simulator / USB 设备 |
| 224 | `liguobao/ds-harness-remote` | 多端远程（round 15 的候选） |
| 177 | `wenbin-wb/dsh-bridge` | 远程 + 移动访问 |
| 163 | `ZSeven-W/dsh-android` | 会话内 Android 设备 |
| 137 | `Buzzso/dsh-sev` | 管理自己的远程 DSH host |

**注意**：`zhu1090093659/dsh-web` ★8037 是**一个 monorepo 出 7+ 个插件**（task board / plugin collection / vision tool / skill center / git / remote / SSH / market），
所以同 star 数的多行其实是同一个仓库 —— **看 star 数时要留意是不是同一个 monorepo**。

## 五、全库 top

```
72326★ tt-a1i/archify#integrations/deep...   [docs]  Generate validated, self-contained i...
38736★ volcengine/OpenViking#examples/d...   [memory]
32440★ vectorize-io/hindsight#coding-agents  [memory]
30368★ Tencent/WeKnora#dsh-weknora           [tools] Four read-only tools over a WeKnora...
 8037★ zhu1090093659/dsh-web#packages/...    [ui/vision/skill/git/remote/market] ×7 行
```
