---
id: mem-4bbfa8e0be59dbf2c043818433f26b92
revision: 1
created_at: "2026-09-27T02:18:30.110Z"
updated_at: "2026-09-27T02:18:30.111Z"
name: dsh-batch3-headroom-mimir-and-codex-gap-recheck-20260927
description: "插件第三批：卸 modlens（手工改 4 处 + 删 .bin shim，并回收 commander/undici）、装 headroom 0.3.0（工具输出可逆压缩）与 Mimir 0.21.0（学术工作台）；用 282 个官方包实证复核 Codex 缺口 #4-#7 全部仍未闭合及社区填充；收录 awesome-dsh-plugins 每日兼容性追踪等社区目录"
metadata:
  type: user
  fact_type: reference
  scope: global
---

# 插件第三批（headroom + Mimir）+ modlens 卸载 + Codex 缺口复核 —— 2026-09-27

## 一、卸载 modlens（用户决定）

理由：DeepSeek V4.1 Flash 原生多模态，modlens 对它**不接管**（它只接管「元数据positive确认是 text-only」的模型），
对 v4.1-flash 纯冗余；留着只为 v4-pro 那条假设路径服务。用户拍板：卸。

```
dsh plugin --profile web remove @liustack/modlens
```

但**实际是手工卸的**（CLI 只是 pnpm passthrough，且怕再卡）。改的四处：

1. `package.json` → `dependencies` 删 modlens
2. `package.json` → `dsh.profile.bundles` 删 modlens
3. `node_modules/@liustack` 整个删掉
4. `pnpm-lock.yaml` 手改：importer 行 + `packages:` 条目 + `snapshots:` 条目，
   外加**只有它用的两个传递依赖** `commander@13.1.0`、`undici@8.11.2`
5. 补一刀：`node_modules/.bin/modlens{,.CMD,.ps1}` 三个 shim 会残留，必须单独删

验证：`dsh plugin --profile web list` → 干净。

### 两个坑（可复用）

- **锁文件的行尾**：`pnpm-lock.yaml` 是 **LF**，`package.json` 是 **CRLF**。
  用 Python `open(p,'w')` 改锁文件会把整个文件变成 CRLF，
  `diff` 立刻变成「整文件重写」，看不出真实改动。改完必须 `open(p,'wb')` 写回 LF。
- **`pnpm install --offline` 修锁文件是错的**：它仍会去 fetch git 依赖
  （`dsh-web-search-multi` 是 `git+https` 依赖），既慢又可能触发 gh-proxy 间歇 403。
  **锁文件可以手改**，它就是个小 YAML（本例 5KB），比跑 install 安全得多。

## 二、装 headroom（`dsh plugin --profile web add github:giter00/dsh-headroom`）

- 版本 **0.3.0**，Apache-2.0，纯 JS 无原生依赖
- 装机耗时 **7.3s**；自动追加进 bundles
- 机制：挂 `tools/post-execute`，工具输出**进模型前**先压缩；有损压缩的原文存本地 CCR store，
  注入一个短 marker，模型要原文时调 `headroom_retrieve(id=…)` 取回
- 默认**不压缩** `read`/`str_replace_editor`/`edit`/`write` 与代码文件（避免破坏可补丁字节）——
  这条很关键，说明它不会毁掉改代码的能力
- 可选 ML 压缩要额外装 `onnxruntime-node` + `@huggingface/transformers`，不装就走纯 JS 启发式
- 直接命中用户「token 效率」这条主线

## 三、装 Mimir（`dsh plugin --profile web add dsh-mimir@0.21.0`）

- 走 npm（npmmirror），**5.9s**，+97 个包
- 学术研究工作台：Literature / Paper(Overleaf 式 LaTeX 编辑+编译+预览) / Experiments(指标图表) /
  Figures / Meetings(组会 PPT) / Servers(GPU 探测) 等九视图
- 结构：`dsh.bundle.patch = ./cordis.patch.yml` + web client inject；`insert: [{id: mimir, name: dsh-mimir}]`
- 数据落 `~/.dsh/storages/research_wiki.json`，产物在 `./.research`
- 可选依赖：LaTeX 引擎（tectonic）、SearXNG、Zotero —— **不装也能跑**
- 直接命中用户画像（宁夏大学本科生、要读论文/做组会/跑实验）

## 四、Codex 缺口复核（这次是**实证**，不是查文档）

数据源：dsh 自带包目录 `C:/Users/27063/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai`，
**282 个包**，逐个 grep：

| 关键词 | 命中 |
|---|---|
| `computer` | **无** ← 缺口 #7 确认 |
| `edge` / `graph` / `thread` | **无** ← `thread_spawn_edges` 缺口确认 |
| `csv` / `batch` | **无** ← `agent_jobs` CSV 缺口确认 |
| `budget` / `quota` | **无** ← goal 预算维度缺口确认 |
| `memory` / `vision` | **无**（记忆由我们自建的 memory.mjs 补上） |
| `job` | `dsh-jobs` / `dsh-jobs-local` / `dsh-tool-jobs` / `dsh-api-job-controller` / `dsh-client-ui-jobs` ✅ |
| `remote` | 只有 `dsh-api-remotes`（是「远端 BFF 组装」，**不是**远程接管） |
| `schedule` | `dsh-schedule` ✅ |
| `goal` | `dsh-goal` 等 5 个 ✅ |

顺带发现官方包 **`dsh-compaction-image-offload`**：「Durable image offload for image-capable routes:
replace over-budget request images with placeholders and retry」——图像也能参与上下文压缩，与 headroom 同思路。

### 缺口 #4-#7 状态：**全部仍未闭合**

| # | Codex 能力 | dsh 官方 | 社区填充 |
|---|---|---|---|
| 4 | `agent_jobs` CSV 进/出 + output_schema | 无 | 未找到 |
| 5 | `thread_spawn_edges` 父子线程关系 | 无 | `zhaoyuntao-wl/dsh-plugin-thread`（待查） |
| 6 | `remote_control_enrollments` 远程接管 | 无 | `sandbaseai/sandbase-harness`、`dsh-market/dsh-market`(installable:false)、znc15 dsh-web 家族 |
| 7 | `computer-use/` 桌面控制 | 无 | `988hj7tczd-oss/dsh-computer-use` ★36（跨平台，虚拟光标+AX/UIA+截图，12 个受控工具）；`Admaing/dsh-plugin-computer-use` ★2 仅 macOS；`mekos2772/dsh-plugin-mimi` ★4（Windows CU + 桌宠） |

### 但 #6/#7 我**没有擅自安装**

两者都是「把控制权交出去」的能力：远程接管 = 外部 socket 能驱动你的 agent；
Computer Use = 一个能截图+点击+打字的 agent。**这是安全决策，必须用户拍板**，不能因为「你看着做吧」就替用户开这个口子。

## 五、社区工具（这次最值钱的收获）

- **`AdamPlatin123/awesome-dsh-plugins` ★292** —— DSH 插件目录 + **每日兼容性追踪**。
  preview 期上游天天 breaking，别的目录只给星数，这个给「今天还能不能装」——**比星数有用得多**。
- **`imsai-sh/awesome-deepseek-harness-plugins`** —— 4120 个插件目录，开源了市场 + 目录流水线 + 公开查询 API，可 fork 自建。
- **`dsh-market.com`** / `awesome-dsh-plugin.com` —— 社区插件市场（含分类 `remote` 等）
- **`znc15/dsh-web-plugins`** —— 「dsh-web 家族」，带一张**「原生 dsh 有什么 / 家族补什么」对照表**
  （任务看板：原生无 / 移动端远程：原生无 / SSH 面板 …），是找缺口最快的入口
- 中文社区站：`dsharness.io/zh`、`deepseekagent.io/zh`

**流程教训（与 2026-09-26 那条一致）**：先查社区目录再自写；查目录优先看**兼容性追踪**，不要只看 star。

## 六、顺带：视觉那条的两个补充

- 出网实测再次确认 **bash `curl` 000 / PowerShell 200** 的格局；git 走 gh-proxy 见另一条记忆
- 重要细节：**DeepSeek 官方 chat-completions 路由是纯文本**，文档明说不能配成多模态；
  要图必须走**声明了 `image` 的模型**（本机是 GOAT 网关提供的 v4.1-flash 条目）。
  → 所以「模型能看图」和「某条路由能传图」是两件事，**判据要落在模型条目的 capability 声明上**，
  不能只看模型名。

## 七、落地状态

装完未重启。当前 `dsh plugin --profile web list`：

```
@local/dsh-plugin-goat-panel, dsh-deja@0.21.2, dsh-headroom@0.3.0,
dsh-mimir@0.21.0, dsh-plugin-local-search, dsh-web-search-multi@0.1.0
```

**待用户择时重启 dsh web（PID 34800 / :3080）** 才生效。
（我在 dsh web 内部运行，**不能重启它——那等于自杀**。）

备份：`package.json.bak-20260927-pre-rm-modlens`、`pre-headroom`、`pre-mimir`，锁文件同步备份。

