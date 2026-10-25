---
id: "0a4a1fca-d0cd-4115-8c33-3d59593e4cf4"
title: "本机 mnemon 语义检索（Ollama embedding）启用、验证与查询方式（2026-10-06）"
description: "把 mnemon embedding 从 enabled:false 改 true 的确切配置位置与开关语义、dump-config 与 mnemon recall --verbose 的实测验证、生效时机边界、以及「查询要用问句形式」的实测 quirk；订正 ollama「闲置」判断。关联已完成的开机弹窗排查文档 81c792dc。"
status: "active"
created_at: "2026-10-06T15:21:20.127Z"
updated_at: "2026-10-06T15:21:20.127Z"
content_hash: "d6fb282c1ea4a69904b0c2ed60d424fa0dd3b12cb66948b67b5fb708ece673b7"
source_paths:
  - "profiles/desktop/cordis.patch.yml"
  - "profiles/web/cordis.patch.yml"
session_ids:
  - "4a2efe7c-4508-4441-842e-1166e9a2e26e"
memory_body_ids:
  []
---

# 本机 mnemon 语义检索（Ollama embedding）启用、验证与查询方式

> 2026-10-06 晚实测。承接同晚的 `81c792dc`（开机弹窗 / launch-dsh.ps1 来源排查）；该文档把 ollama 记为「便携版闲置现状」，**本文订正**：ollama 实际被 mnemon 的 embedding 语义检索使用。

## 一、改了什么

两处 profile patch 的**文件内容**（不是新增 row），把 embedding 开关从 `false` 改 `true`：

```
~/.dsh/profiles/desktop/cordis.patch.yml:1326-1329
~/.dsh/profiles/web/cordis.patch.yml:1365-1368
  embedding: { enabled: true, endpoint: http://localhost:11434, model: nomic-embed-text }
```

回滚备份：`cordis.patch.yml.bak-20261006-pre-embedding-on`（desktop / web 各一份）。

## 二、开关的确切语义（来自插件 i18n，非猜测）

出处 `dsh-mnemon/lib/client.js` 的文案（该文件另见 `lib/index.js:90-93` 的 `DEFAULT_EMBEDDING_ENDPOINT/DEFAULT_EMBEDDING_MODEL/DEFAULT_EMBEDDING_PROTOCOL = "auto"`）：

> 让 DSH Host 为每次 Mnemon CLI 调用注入嵌入 Endpoint 与模型；开启后以这里保存的值**覆盖 Mnemon 子进程环境**；关闭后继续沿用 Host 环境与 Mnemon 默认值。

即：这个开关不是「启用 mnemon 的记忆」，而是「Host 向 mnemon 子进程注入 embedding 配置」。

## 三、双向验证（合成配置 + 运行时）

**合成配置**：
- `dsh --profile web --dump-config` 行 1969-1971 → `enabled: true` ✓
- `dump-desktop-config.ps1` 行 1948-1950 → `enabled: true` ✓

**运行时（硬证据）**：`mnemon recall --verbose` 真实输出

```json
"score": 0.4688, "intent": "WHY", "via": "temporal",
"signals": { "keyword": 0.333, "entity": 0, "similarity": 0.512, "graph": 0.948 }
```

`similarity: 0.512` 就是**向量余弦分量**，是 4 路加权 signal（keyword / entity / similarity / graph）之一 —— 证明语义路径真的在跑。用「为什么桌面版启动要加 no-sandbox 参数呢」查，top-3 第 3 条正中目标。

**覆盖率**（mnemon 数据目录 `~/.mnemon`）：`embedded 385 / total_insights 386`，`model: nomic-embed-text`，`protocol: ollama`，`coverage: 100%`。

## 四、查询方式的坑（实测）

- mnemon 的 automatic intent 只认**有限问句线索词**；中文**陈述式**短语会落 `GENERAL`，语义路径基本不参与排序 ⇒ **查询要用问句形式**（例：「为什么…呢」被正确判成 `WHY`）。
- CLI 形态：`mnemon recall [keyword] [flags]` —— **没有 `--query` flag**（误用报 `unknown flag: --query`）。可用 `--verbose`、`--brief`、`--intent`、`--limit`、`--cat`、`--source`、`--basic`。

## 五、生效时机边界

改的是 `cordis.patch.yml` 的**文件内容**（不是新 row）。按 2026-09-27 已实测的 preset 热重载边界：**内容变更不进已有 session** ⇒ 需**新开 App / 新 session** 才生效；不能靠「重启了没有」判断，判据是「新建 session 试」。

## 六、ollama 现状（订正「闲置」）

- `C:\Users\27063\.local\ollama\ollama.exe` v0.34.4，便携版（不走安装程序），监听 `127.0.0.1:11434`
- `/api/tags` 只有一个模型：`nomic-embed-text:latest`（137M / F16 / 768 维）—— 是 **embedding 模型不是聊天模型**
- 由 Startup 里的 `ollama-serve.vbs` 启动，内部 `sh.Run ..., 0, False`（`0` = 隐藏窗口）⇒ **它不会弹窗**
- 实测连接数：开启语义检索前 5 → 用后回落 2，说明确有客户端在连它

## 七、教训

「开关打开」和「功能在跑」是两件事：这次用 **dump-config（配置面）+ recall signals（运行面）** 两条独立判据互证，而不是只看 patch 文件里写了 `true`。
