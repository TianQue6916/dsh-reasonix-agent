---
id: mem-3740dba798daddb72b83a013f32ead17
revision: 1
created_at: "2026-09-30T11:13:23.793Z"
updated_at: "2026-09-30T11:13:23.793Z"
name: dsh-thinking-language-switch-20260930
description: "思考链语言开关插件（自建，@local/dsh-thinking-language）：host 半侧 assemble 注入 + settings.section UI + /thinklang 兜底"
metadata:
  type: user
  fact_type: reference
  scope: global
---

# 思考语言开关插件（自建）— 2026-09-30

## 结论
社区/市场**没有**现成的思考语言开关插件。已自建 `@local/dsh-thinking-language`，装在
`web` + `desktop` 两个 profile。只切**思考链**（prompt 里的 reasoning / thinking），
正文语言仍走语言契约。

## 架构（按层）
1. **状态**：`$DSH_HOME/storages/thinking-language.json` → `{"thinking":"zh"|"en"}`，mtime 热读。
2. **注入**：`system-prompt/assemble` waterfall 里，往 `deployment:persona-prefix` section
   追加 directive。因为是每请求执行 ⇒ **切换下一条消息即生效，不重启、不开新会话**。
3. **HTTP 面**：`GET/POST /api/thinking-language`（同源，注册在 `ctx.connection.fetch.register`
   —— 与 `dsh-session-log-export` 同一 API；`inject: ["connection","commands"]`）。
4. **UI 半侧**：`ctx.slots.inject("settings.section", ...)` 一页 radio。
5. **兜底**：`/thinklang [zh|en]` 命令，UI 不加载也能切。

## 关键设计决定：指令与语言解耦
原 clause 5 写死在 persona `prefix:`（「思考链同样遵守本契约：用中文思考」）。已把三处
clause 5 **中立化**为「语言由部署的 thinking-language directive 指定（默认中文）」：
- `profiles/web/cordis.patch.yml`
- `profiles/desktop/cordis.patch.yml`
- `.agent-presets/anchored-standard/subagent-language.mjs`（child 的契约）
首次安装需**重启一次**（bundle 代码不参与 HMR）；之后切换永不重启。

## 踩过的坑（重要）
标记 regex **必须写成 regex literal** `/\[thinking-language: (?:zh|en)\][^\n]*/`。
写成字符串源时 `\\[` 掉一个反斜杠会让 `\[...\]` 退化成**字符类** —— 剥离时吃掉半截
persona，幂等性静默失效（实测 145 → 148 字符）。另外 bash heredoc 会吃掉双反斜杠，
regex 密集的代码不要走 heredoc，改用 str_replace_editor。

## 验证（可复现）
```
cd D:/Toolbox/dsh-thinking-language
node test-host.mjs      # 30 断言，ALL PASS：幂等 / live switch / route / 命令 / child / 异常
node test-client.mjs    # 20 断言，ALL PASS：ModuleLoader / slot / fetch 契约 / 状态机 / 失败路径
```
client 半侧用自制 React shim（host 侧解析不到 `react`，`require` 由浏览器 ModuleLoader 供）。

`desktop` 这个名字被 Electron 锁死，`--dump-config` 报
`profile "desktop" is managed exclusively by the Electron application`；校验要建一个**临时
profile 名**、拷它的 json/yml、再 junction 它的 `node_modules`。

## 未验证
Electron 前端在 `resources/app.asar`，**package-declared client module 在桌面端能否渲染未知**。
兜底 `/thinklang` 不依赖 UI。

## 回滚
`profiles/{web,desktop}/package.json` 与三处 clause 5 都有
`.bak-20260930-thinklang`；删 junction
`profiles/{web,desktop}/node_modules/@local/dsh-thinking-language`。
