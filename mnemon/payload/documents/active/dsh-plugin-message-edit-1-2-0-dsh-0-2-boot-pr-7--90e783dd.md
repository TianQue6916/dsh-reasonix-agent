---
id: "90e783dd-3e30-406f-9225-1c21e25b71f5"
title: "dsh-plugin-message-edit 1.2.0 在 DSH 0.2 的 boot 崩溃修复（PR #7 语义等价补丁 + vendor tarball 声明，2026-10-02）"
description: "根因（DSH 0.2 把 sessions 数据与 uiWorkspace 导航拆成两个 service，1.2.0 client half 仍调 sessions.open()）、all-or-nothing boot 只报状态不报 error 的诊断盲点、本地补丁三件套（改包 / vendor tgz + file: 声明 / 验证脚本）与冷启动与回滚边界。关联 doc b028b5a5。"
status: "active"
created_at: "2026-10-02T06:56:54.030Z"
updated_at: "2026-10-02T06:56:54.030Z"
content_hash: "7660f1fcd9986894a68e6652d78440fb0c6e9ea49e3eff7241d06f08a680ab9d"
source_paths:
  - "PLAN.md"
  - "profiles/desktop/package.json"
  - "patches/apply-pr7-message-edit.py"
  - "patches/verify-message-edit-client.cjs"
  - "patches/README-message-edit-pr7.md"
  - "vendor/dsh-plugin-message-edit-1.2.0-pr7.tgz"
session_ids:
  - "dc0e4468-c923-4ac3-b246-9415b1761062"
memory_body_ids:
  []
---

# dsh-plugin-message-edit 1.2.0 在 DSH 0.2 的 boot 崩溃修复

状态（2026-10-02，commit `ee15e4b`）：**本地已修 + 激活期验证通过；生效待 desktop 冷启动核验**（红框是否消失、悬停旧 user 消息能否编辑）。
关联：`b028b5a5-54fd-4679-aeca-79e8b6d7958a`（desktop profile 手动安装 bundle 型插件的 pnpm/bundles 流程与重启边界）。

## 根因（社区已确认，非推测）

- DSH 0.2.0-rc.2 把 **session 数据**（`sessions`）与 **导航**（`uiWorkspace.openSession`）拆成了两个 service；`sessions` 上不再有 `.open()`。
- `dsh-plugin-message-edit@1.2.0` 的 client half 在激活期调 `ctx.get('sessions').open()`，`apply()` 直接抛错。
- 上游 issue #6（用户 `pariseed` 结论）；上游 PR #7（同作者）就是改这条，但**未合并、npm 未发版** ⇒ 1.2.0 已是 latest，「重新下载」无效，不是包损坏而是版本语义不兼容。

## 诊断盲点（复现同款问题时先记住）

- desktop 的 web boot 是 **all-or-nothing**。
- `app.asar` 里的 `eM()` **只报状态字不报 error**，所以红框只显示 `dsh-plugin-message-edit: failed`，crash log 里永远没有真因。
- ⇒ 插件 boot 失败时不能只信 UI 状态字，要在激活期用本地 stub（见验证脚本）直接跑 `apply()`。

## 落地三件事

1. **改包（PR #7 语义等价）**：`profiles/desktop/node_modules/dsh-plugin-message-edit/` 下
   - `lib/client.js`（运行时真正加载的构建产物）
   - `plugin.client.js`（源码镜像）
   - `package.json`（`dsh.client.inject` 加 `@deepseek-ai/dsh-client-ui-workspace`）
   核心改动：新增 `const navigation = { list: sessions.list, openVersion: id => uiWorkspace.openSession(id) }`，把 `openVersionTarget` / `openWhenListed` 的参数从 `sessions` 换成 `navigation`。
2. **可复现产物**：
   - `vendor/dsh-plugin-message-edit-1.2.0-pr7.tgz`（打过补丁的包，进 git；sha256 `0bcf698e0788ad4f9f1cf40edd211a56990dcabfc180a63e230f5c64506bb0d2`，65990 bytes，含 `lib/client.js`、`lib/index.js`、`lib/session-record.js`、`lib/tree-logic.js`）
   - `patches/apply-pr7-message-edit.py`（幂等；保 CRLF；逐条断言命中次数，不匹配即 exit 1 且不写坏文件）
   - `patches/verify-message-edit-client.cjs`（回归测试）
3. **声明方式**：`profiles/desktop/package.json` 用本地 tarball 而非 `^1.2.0`：
   `"dsh-plugin-message-edit": "file:../../vendor/dsh-plugin-message-edit-1.2.0-pr7.tgz"`，并把它加回 `dsh.profile.bundles`。
   ⇒ 以后任何一次 `pnpm install` 装回来也是打过补丁的副本，不会被 registry 原版悄悄覆盖。

## 验证证据

`node ~/.dsh/patches/verify-message-edit-client.cjs <patched> <pristine>` —— 4/4 断言通过：

- 补丁版在「`sessions` 无 `.open()` + `uiWorkspace` 有 `openSession`」下 `apply()` **不抛**，且三个 slot 注册（`settings.section` / `conversation.chat.node` / `conversation.view`）都跑到；
- `uiWorkspace` 缺失时抛新文案 `Missing DSH sessions or uiWorkspace navigation service`；
- 原版在同样条件下**复现崩溃**（旧文案）—— 即用户看到的红框；
- 原版只有配旧 `sessions.open()` 才通过。

`node --check` 通过、CRLF 行尾未被改写、脚本重跑幂等。
`uiWorkspace` 服务本身从 `app.asar` 核实存在：`uws_client.js:772 super(ctx, "uiWorkspace")`、`:821 openSession(target)`。

## 生效边界与回滚

- **必须完全退出 desktop**（含托盘/后台的 `DeepSeek Harness.exe` 进程）再冷启动；不要依赖热改热重载 —— profile 是 `patchReload: "live"`，连续热切本身就是当时崩溃时间线的一部分。
- 冷启动后看三处：① 不再弹红框；② 悬停旧 user 消息出现编辑按钮，编辑后气泡下出现 `‹ 2/4 ›`；③ 设置里多出「消息树」section、会话顶部多出「版本」tab。
- 仍弹红框时的退路（boot all-or-nothing 仍有单点风险）：点第三个按钮「禁用第三方插件、备份 profile patch 并重启」；或删掉 `profiles/desktop/package.json` 里那两处声明后重启。
- 完整回滚步骤：`patches/README-message-edit-pr7.md`；原包备份：`~/.dsh/backups/message-edit-1.2.0-pristine-20261002/`。
- 上游一旦发 1.2.1：改回 `"^1.2.1"`，并丢弃 vendor tarball 与该补丁，不长期自维护。
