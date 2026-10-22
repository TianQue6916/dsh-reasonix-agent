---
id: mem-3f902bfb59bfcb22f081bb6c7fb9990e
revision: 1
created_at: "2026-10-04T03:49:14.775Z"
updated_at: "2026-10-04T03:49:14.775Z"
name: headroom-searchfold-timestamp-corruption-fix-20261004
description: "dsh-headroom 的 search-fold 会把时间戳等「冒号+数字」行误判成 grep 结果并篡改内容；已修 SEARCH_LINE_RE 的 .+? → \\S+?"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 症状（用户可见的静默数据损坏）
`dsh-headroom` 的 `tools/post-execute` 压缩会把**工具输出真删改掉**，例如日志里出现过：
`[headroom: search-fold 5598→5467 chars; headroom_retrieve(id="hr:…")]`，并把时间戳 `23:10:17` 改写成 `10: 17`。

## 根因（精确定位）
`~/.dsh/profiles/{web,desktop}/node_modules/dsh-headroom/lib/compress.js:263`（两 profile 是**同一 inode**，pnpm hardlink）：
```js
const SEARCH_LINE_RE = /^(.+?):(\d+)(?::(\d+))?:(.*)$/
```
`(.+?)` 允许 file 段**含空格** ⇒
```
2026-10-04 23:10:17.521 host wrote file A
```
被解析成 `file="2026-10-04 23"` / `line=10` / `rest="17.521 host wrote file A"`，再在 `:296` 重组为
``out.push(`${match.lineNo}${colText}: ${match.rest}`)`` ⇒ 输出：
```
2026-10-04 23 (4 matches)      ← 假组头，只出现一次（日期+小时被吞）
10: 17.521 host wrote file A
```
整段还会被**按 file 分组重排**（原始行序丢失）。触发门槛在 `:284-285`：`matched >= 3 且 matched / totalNonEmpty >= 0.5`。

## 修法（一个 token）
`(.+?)` → `(\S+?)`。已验证对下列输入全部保持原行为：`src/index.ts:12:const a = 1`、`C:\Users\x.js:120:const b = 2`、`Makefile:7:all:`；而对 `2026-10-04 23:10:17.521 …` 与裸 `23:10:17.521 …` 不再匹配（返回 null = 原样保留）。

## 产物
- 复现（含对照与修法验证表）：`~/.dsh/storages/tools/repro-headroom-searchfold.mjs`
- patch：`~/.dsh/storages/tools/patch-headroom-searchfold.py`（`--check/--apply/--verify/--restore`，幂等，备份 `<target>.bak-pre-searchfold-fix`）
- 已 apply：`compress.js` 28986 → **28987 bytes**（长度 +1，纯 JS 无 asar header 约束），md5 `f5ebe4dd6df0`
- ⚠️ target 在 `node_modules` ⇒ `pnpm install` 会覆盖，需重跑脚本。

## 教训
`dsh-headroom` 不是只做无损折叠 —— 读**关键源码/长输出**时若看到 `[headroom: …-fold …]` 或 `[N rows omitted — headroom]` 标记，必须重取或改用 `sed -n 'a,bp'` 分段读，否则会把被篡改的内容当成原文。
