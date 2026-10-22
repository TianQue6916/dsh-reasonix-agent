---
id: mem-97b3b91bb3ce5066c713ed38d9811de9
revision: 1
created_at: "2026-10-03T05:38:44.005Z"
updated_at: "2026-10-03T05:38:44.005Z"
name: dsh-compaction-summary-language-zh-patch-20261003
description: "把 dsh compaction 摘要指令从英文改成中文的本地补丁（等长替换 npm js + desktop asar，含脚本/state/README/验证口径）"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 症状
长会话 reasoning 整体漂英文；根因之一是 compaction checkpoint 全是英文（11/11，CJK 0.04–0.13），
而它是压缩后上下文里最新最权威的一大块（实测 `compact-checkpoint` = 7449 tokens，占当步 prompt ≈8%）。

## 代码级根因（2026-10-03 取证）
`C:\Users\27063\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\dsh-compaction-basic\lib\index.js:273`
的 `COMPACTION_INSTRUCTION` 里明写 `"- Write concise English engineering prose. Preserve exact file paths, ..."`；
配置 schema `BasicCompactionConfig` 无语言开关 ⇒ 只能改代码。

## 改法（等长字节替换，这是能改 asar 的前提）
`English engineering prose` → `Chinese engineering prose`（25 B → 25 B）。
asar 头存 offset/size，改长度会错位其后所有条目。
两个 target：npm-js（web/CLI 用）1 处命中；`C:\Users\27063\AppData\Local\Programs\DeepSeek Harness\resources\app.asar`（desktop 用）3 处命中 —— desktop 走 asar 内核心插件，**两份都要打**。

## 工具与状态
- `~/.dsh/storages/tools/patch-compaction-language.py`：`--check / --apply(幂等) / --verify(含 node --check) / --restore(按 offset 逆替换)`
- state：`~/.dsh/storages/compaction-language-patch.json`（121 MB asar 无需备份）；npm-js 整文件备份 `index.js.bak-20261003-133812-pre-zh-compaction`
- 说明：`~/.dsh/patches/README-compaction-language-zh.md`
- 2026-10-03 13:38 已 apply + verify PASS（English x0 / Chinese x1 & x3）
- **必须重启才生效**；官方更新会覆盖（App 更新重下 asar、npm 升级覆盖 npm 份）⇒ 更新后重跑 `--check`/`--apply`

## 验证口径
重启后下一次 compaction 的 `compaction/summary` 事件 `data.summary[0].text` 的 CJK 比例目标 > 0.3（改前 0.04–0.13）。

## 边界
摘要指令是英文句子（等长约束换来的取舍）；思考链语言的主因仍是锚点太弱（`thinking-anchor` 每步 44 tokens ≈ prompt 的 0.05%）。
