# @local/dsh-thinking-language

思考链（reasoning / thinking）语言开关：Settings 里一个 radio，切 中文 / English。
**只切思考链**，正文语言仍遵守语言契约。

建于 2026-09-30。用户原话：「思考语言有没有插件能给我加个开关，能切换中英文」/
「只切换思考链，直接上 ui 完整版，因为很多时候都是英文思考链」。

## 为什么不是「有没有现成插件」

扫过 `~/.dsh/storages/community-readmes/`（24 个社区插件）与已装的 12 个 bundle：**没有**
任何插件碰 model 的 thinking 语言。最接近的两个（`dsh-skill-scoreboard`、`dsh-graph`）
做的是它们**自己 UI 的** i18n，跟随界面语言，不注入 prompt。所以这里自己写。

## 架构

```
Settings → 思考语言（radio）
   │  GET  /api/thinking-language   → {"thinking":"zh"|"en"}
   │  POST /api/thinking-language   ← {"thinking":"zh"|"en"}
   ▼
lib/index.js（host 半侧）
   ├── 状态：$DSH_HOME/storages/thinking-language.json（mtime 热读）
   ├── system-prompt/assemble waterfall：按当前状态追加 directive
   └── /thinklang 命令：不带 UI 也能切
lib/client.js（UI 半侧）：settings.section 一页
```

### 关键设计：指令与语言解耦

原来 clause 5 是**写死**在 persona `prefix:` 里的「用中文思考」。本插件把它降级为中性的
「以 thinking-language directive 为准」，真实 directive 由 host 半侧在每个请求的
`system-prompt/assemble` 里注入。因此：

- 切换是**请求级**的 —— 下一条消息即生效，不重启、不开新会话；
- 静态文案保持中性，插件坏了也不会出现两条互相打架的语言指令（默认回落中文）。

### 幂等

directive 带 `[thinking-language: zh|en]` 标记，写入前先剥旧的再写新的，所以多次
assemble、en↔zh 往返、以及「输入里已经带标记」三种情况下，文本里最多只有一个 directive。
**注意**：标记 regex 必须是 regex literal（`/\[...\]/`）。写成字符串源需要 `\\[` 双转义，
掉一个反斜杠就会把 `\[thinking-language: ...\]` 变成**字符类**，剥离时吃掉半个 persona
且幂等性静默失效 —— 2026-09-30 实测踩过（145 → 148 字符）。

## 安装在哪

- 源码：`D:/Toolbox/dsh-thinking-language`
- 两个 profile（`web` / `desktop`）各有：
  - `node_modules/@local/dsh-thinking-language` → junction 到源码
  - `package.json`：`dependencies` + `dsh.profile.bundles` 各加一行
  - 备份：`package.json.bak-20260930-thinklang`
- 静态 clause 5 中立化（各 1 处，备份 `*.bak-20260930-thinklang`）：
  - `profiles/web/cordis.patch.yml`
  - `profiles/desktop/cordis.patch.yml`
  - `.agent-presets/anchored-standard/subagent-language.mjs`

## 生效条件

`.mjs` / bundle 代码**不参与 HMR**（只有 profile patch 文件参与），所以：

- **首次安装要重启一次**进程；desktop 用 `~/.dsh/storages/tools/restart-desktop.ps1`
  （从 dsh 内部 Start-Process 重启会被级联终止，必须由 Task Scheduler 拉起）。
- 之后切换开关**永不重启**。

## 验证

```bash
cd D:/Toolbox/dsh-thinking-language
node test-host.mjs      # 30 断言：directive 幂等 / live switch / route / 命令 / child
node test-client.mjs    # 20 断言：ModuleLoader / slot / fetch 契约 / 状态机 / 失败路径
```

配置树校验（`desktop` 这个名字被 Electron 锁了，`--dump-config` 会报
`profile "desktop" is managed exclusively by the Electron application`，所以要用一个
临时 profile 名 + junction 它的 `node_modules`）：

```bash
dsh --profile web --dump-config | grep -A2 '== @local/dsh-thinking-language'
```

## 未验证

Electron 桌面端的前端在 `resources/app.asar`（121 MB，官方 nightly 自动更新会覆盖）。
**package-declared client module 能不能在桌面端渲染，没有验证过** ——
`platform: "web"` 的 goat-panel 在 web 侧确认可用，桌面侧未知。

兜底：host 半侧不依赖 UI，`/thinklang [zh|en]` 命令行随时可切。

## 回滚

```bash
# 1) 两处 package.json 去掉 dep + bundle（或用 .bak-20260930-thinklang 还原）
# 2) 删 junction：profiles/{web,desktop}/node_modules/@local/dsh-thinking-language
# 3) 三处 clause 5 用 .bak-20260930-thinklang 还原
# 4) 重启
```
