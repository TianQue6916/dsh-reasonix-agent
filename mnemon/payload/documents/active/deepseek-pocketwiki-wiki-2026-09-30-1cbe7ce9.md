---
id: "1cbe7ce9-d1ef-4674-b0d7-e2cf529077d5"
title: "DeepSeek 网页版对话归档 → PocketWiki wiki + 记忆三处同步（2026-09-30 全量重渲染）"
description: "2026-09-30 完成的 DeepSeek 网页版对话归档链路：raw vs snapshot 数据陷阱、PocketWiki 144 页全量重渲染与索引/导入日志、reasonix memory 语料 → mnemon → Linux 同步的可复现操作流程与已知缺口。"
status: "active"
created_at: "2026-09-30T12:37:14.865Z"
updated_at: "2026-09-30T12:37:14.865Z"
content_hash: "e4e2573641d585a5708e21343fddbb9b18cc05ee075500169c86ead597b4061b"
source_paths:
  - "storages/tools/memory-to-mnemon.py"
session_ids:
  - "8472db09-174d-4937-a148-cc3efb71fa9d"
memory_body_ids:
  []
---

# DeepSeek 网页版对话归档链路（2026-09-30）

**性质**：可复现的操作流程 + 一次真实数据缺陷定位。适用于任何「网页版对话 → wiki 页面 → 长期记忆」的归档任务。

---

## 1. 数据位置（两机同源，md5 已核对一致）

Windows `C:\Users\27063\.reasonix\global-workspace\deepseek_data\` ＝ Linux `~/data/deepseek_data/`

| 文件 | 含义 | 规模（2026-09-30） |
|---|---|---|
| `all_sessions.json` | 会话索引（id / title / model_type / updated_at） | 2304 条，跨 2025-01 → 2026-08-07 |
| `deepseek_all_chats.json` | 侧边栏 top-100 快照 | `fetchedAt 2026-08-06T18:54:54Z`，100 会话 / 99 唯一标题 |
| `raw/<session_id>.json` | 每会话**全量** fragments（REQUEST / THINK / RESPONSE / FILE / SEARCH） | 2304 个文件 ≈ 195 MB |

## 2. 核心陷阱：raw 才是权威，snapshot 是残片

- `deepseek_all_chats.json` 的 `conversations[].messages` **每个会话只含末尾几条 THINK 片段**，LaTeX 与换行在抓取时已被破坏。
- 证据：wiki 旧版 `DS_实分析.md` 头部写「共 4 条消息」，而 raw 中该会话真实有 **457 条**（thinking 合计 170,756 字）。
- 后果：2026-07-30 首轮导入（`import_to_wiki.py` 吃 snapshot）产出 99 页全是残片，且角色按下标奇偶硬套成「我 / DeepSeek」。
- **铁律：渲染一律走 `raw/`，不要读 `conversations[].messages`。**

## 3. 渲染与索引（可重跑，Linux 侧）

脚本：`~/.reasonix/global-workspace/render_ds_pages.py`、`build_ds_index.py`（Windows 备份在 `~/reasonix-ops/`）。

- 复现：`python3 render_ds_pages.py --plan` 预演 → `--apply` 落地（`--apply` 自带 tar.gz 备份）。
- 页面结构：`# 标题` → 元信息（消息数 / 模型 / 最后更新 / session id）→ `### 🧑 我` 与 `### 🤖 DeepSeek` 交替；正文标题下沉两级避免抢层级；thinking 以 `> ` 引用块附在回答之后并标注字数。
- 页面寻址：标题 → 文件名时替换 `[\\/:*?"<>|]` 为 `_`，前缀 `DS_`；`page_path()` / `page_title_from_path()` 是唯一入口，改名 bug 曾产生两个孤儿页（已移入 `~/backups/orphans-20260930/`）。
- 2026-09-30 本轮结果：快照 99 ∪ 已有页面 = **144 页**，其中**新增 45 页**（07-30 13:53 → 08-07 02:52），总渲染 **25.1 MB**；索引 `DeepSeek对话记录.md` 重建（快照 99 + 历史归档 45 + 🆕 45），新增 `DeepSeek导入日志.md`。
- 自检口径：`DS 页面 144 · 索引链接 144 · 失效 0 · 未索引 0 · 🆕 45`；curl 抽查 `/view/DS_实分析` → 200、2.36 MB、渲染 0.29 s。
- 服务：`nohup python3 pocket-wiki.py`，`127.0.0.1:8808`。
- 备份：`~/backups/pocketwiki-pages-20260930-202826/…-202926.tar.gz`（改前残片版 / 第一版全量）。
- 已知未决：`首页.md` 的「最近更新」未找到预期行，脚本选择不硬改（**需手工确认**）。

## 4. 记忆层同步链（三处）

写入面：reasonix 语料 `C:\Users\27063\.reasonix\memory\<scope>\*.md` → mnemon → Linux 语料。

1. 语料 fact（本轮 5 条）：`deepseek-webarchive-wiki-pipeline`（reference）、`real-analysis-user-sticking-points-202607`（feedback）、`bertsekas-probability-chinese-translation-bad`（reference）、`course-materials-repo-and-print-workflow-202608`（project）、`deepseek-v4-flash-ga-0731`（更新到 rev 2）。
2. 喂入 mnemon：`C:\Users\27063\.dsh\storages\tools\memory-to-mnemon.py`，**按 markdown 的 `##` 分节**切块，预算按**字节**而非字符（mnemon 是 Go：`content ≤ 8000` 字节、每 tag ≤ 100 字节，脚本自用 7500/100）。全量重喂安全（mnemon 走正常写入路径去重）。
3. 计划任务 `\MemoryToMnemon`：每日 12:20，`python.exe memory-to-mnemon.py`，Started in `C:\Users\27063\.dsh\storages\tools`，最多跑 30 分钟；手工触发 `schtasks /run`。验证：`insights` 276 → 278，五条关键词全部命中。
4. 下发 Linux：`scp -p` 到 `tianque:~/.reasonix/memory/global/`；合并口径是 `rsync -au`（同名以较新 mtime 胜，Linux 独有文件保留，不删除），脚本 `sync-home-linux.sh` / `sync-courses-linux.sh`，diff 产物在 `C:\Users\27063\rx-sync-linux\{diff-memory.txt,win-memory.tsv,list-memory-linux.tsv}`。
5. 注意：memory 目录里存在多个 `*.conflict.{linux,win}.*.bak` 冲突副本，喂库前必须排除 `.bak` 与 `.conflict.`（脚本已过滤）。

## 5. 仍在的缺口与可选后续

- **08-08 → 09-30 的网页版对话不在库里**（抓取最新只到 2026-08-07 02:52）；补抓依赖浏览器 cookie，失效需人工重新登录。
- **全量回填未做**：`all_sessions.json` 有 2304 会话，wiki 目前仅覆盖 top-100 ∪ 首轮 100 = 144 页；raw 齐全，回填随时可跑（预计 ~200 MB，建议先只回填 `model_type=expert` 的 38 个会话）。
- `DeepSeek人格分析.md` 仍写「基于 15 个对话」，与 144 页现状不符，待重做或并入既有 persona fact。

## 6. 工具情报（同批会话产出，供后续 dsh 排障参考）

V4-Flash 正式版（284B/13B 激活，输入 ¥1 / 输出 ¥2）在 agent 基准上反超 V4-Pro 预览版（1.6T/49B，¥12/¥24），硬核推理仍归 Pro；社区反馈 flash 在「强制工具调用 + 长 prompt」下约 40–60% 概率吐格式错误 JSON（**仅社区说法，未独立验证**）——dsh 栈里 tool call 解析异常时可作可疑原因。官方基准在未公开的自研 Harness 下测得，看数据要打折。
