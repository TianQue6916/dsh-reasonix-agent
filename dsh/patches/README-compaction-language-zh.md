# 本地补丁：把 compaction 摘要指令从英文改成中文

日期：2026-10-03 · 触发者：用户追问「思考语言还是英文?为什么?」

## 症状

长会话里 reasoning（思考链）会整体漂到英文；抽查发现 **所有 compaction checkpoint 都是英文**
（11/11，CJK 比例 0.04–0.13），而 checkpoint 是压缩后上下文里**最新、最权威**的一大块
（本机 `contextTimeline` 实测 `compact-checkpoint` = **7449 tokens**，占当步 prompt 约 8%）。
语言契约要求中文（英文技术术语保留原词），摘要生成器却要求英文 ⇒ 它把整段语境的「语种先验」重新写成英文。

## 代码级根因

`@deepseek-ai/dsh-compaction-basic/lib/index.js`（1027 行）里的 `COMPACTION_INSTRUCTION`
（注释说明它「作为回放对话之后最后一条 user message 下发，以便复用 provider 的 KV cache」）：

```js
"Rules:",
"- Write concise English engineering prose. Preserve exact file paths, commands, error strings, identifiers, numeric values, function signatures, and syntax fragments.",
```

`lib/index.js:273` 即这一行。整个 `COMPACTION_INSTRUCTION` 里**只有这一处**语言指令，
配置 schema（`BasicCompactionConfig`）只暴露 `summarizationProvider/Model`、`maxTokens`、
`thresholdRatio`、`retention`、`modelPolicies` 等，**没有语言开关** ⇒ 只能改代码。

## 改法：等长字节替换（这是能同时改 app.asar 的前提）

| | |
|---|---|
| 替换 | `English engineering prose` → `Chinese engineering prose` |
| 长度 | 25 B → 25 B（**等长**） |
| 为什么必须等长 | `resources/app.asar` 头里存的是每个条目的 offset/size；改长度会让其后**所有**条目偏移错位，整包报废 |

两个 target：

| target | 路径 | 命中 | 用途 |
|---|---|---|---|
| npm-js | `C:\Users\27063\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\dsh-compaction-basic\lib\index.js` | 1 处 | web / CLI profile 的 compaction |
| desktop-asar | `C:\Users\27063\AppData\Local\Programs\DeepSeek Harness\resources\app.asar` | 3 处 | desktop App 的 compaction |

desktop 走的是 asar 内的 dsh（核心插件不在 `~/.dsh/profiles/desktop/node_modules/` 里），
所以只打 npm 那份不够 —— 这两份**必须都打**。

## 产物

- 补丁脚本：`~/.dsh/storages/tools/patch-compaction-language.py`
  模式 `--check` / `--apply`（幂等）/ `--verify`（含 `node --check`）/ `--restore`（按 offset 逆替换）
- state 文件：`~/.dsh/storages/compaction-language-patch.json`（记录每个 target 的 offset、before/after 字节）
  —— 121 MB 的 asar **不需要备份**，restore 靠 offset 就够了
- npm-js 的整文件备份：`index.js.bak-20261003-133812-pre-zh-compaction`
- 本说明

## 实测

```
$ python patch-compaction-language.py --check
npm-js                49452 B  'English' x0  'Chinese' x1  已打补丁=True
desktop-asar      121348951 B  'English' x0  'Chinese' x3  已打补丁=True
$ python patch-compaction-language.py --verify
npm-js                49452 B  'English' x0  'Chinese' x1
desktop-asar      121348951 B  'English' x0  'Chinese' x3
node --check npm-js: OK
RESULT: PASS
```

幂等：再跑 `--apply` 报「没有命中」（`English` 计数已为 0），不会重复替换。

## 生效条件与回滚

- **必须重启**：`dsh-compaction-basic` 是进程启动时加载的核心插件。
  - web/CLI：重启 `dsh --profile web --port 3080` 进程
  - desktop：重启 DeepSeek Harness App（asar 在启动时读取）
- 回滚：`python ~/.dsh/storages/tools/patch-compaction-language.py --restore`
  （逐 offset 校验当前字节确实是 `Chinese engineering prose` 再写回英文，不匹配则跳过）
- **官方更新会覆盖**：desktop App 更新会重下 asar，`npm i -g @deepseek-ai/dsh@*` 会覆盖 npm 那份
  ⇒ 更新后重跑 `--check`，命中 `English` 就再 `--apply`。

## 验证口径（重启后）

1. `python ~/.dsh/storages/tools/patch-compaction-language.py --verify` → PASS
2. 下一次 compaction 之后，读会话日志里 `compaction/summary` 事件的 `data.summary[0].text`，
   算 CJK 比例 —— 目标 **> 0.3**（改之前 11 条全是 0.04–0.13）
3. 观察翻转：compaction 之后头 4 个 reasoning block 的中文比例

## 残余与边界

- 摘要指令改成 "Chinese engineering prose" 是**英文句子**（为了等长），模型仍会照做；
  没有改成完整中文句是 asar 等长约束换来的取舍。
- 这不是思考链语言的唯一变量：`thinking-anchor` 每步注入只有 **44 tokens**（实测），
  占 ~90,000 token prompt 的 0.05%。锚点 v2（轮换措辞 + 越权纠正式）是下一步。
