# dsh-plugin-message-edit 1.2.0 → PR #7 本地补丁（DSH 0.2.0-rc.2 兼容修复）

## 为什么需要

`dsh-plugin-message-edit@1.2.0`（SpookySandwich）的 client half 在激活期调用 `ctx.get('sessions').open(...)`。
DSH 0.2.0-rc.2 把 **session 数据**（`sessions`）和 **导航**（`uiWorkspace.openSession`）拆成了两个 service，
`sessions` 上不再有 `.open()` ⇒ `apply()` 抛

    [dsh-plugin-message-edit] Missing DSH session navigation service. Check client dependencies and restart DSH.

desktop 的 web boot 是 all-or-nothing：任何 entry 的 fiber 不是 `active` 就 `throw`（`app.asar` 里的 `eM()`），
且该函数**只报状态字不报 error**，所以表现为「应用无法启动或已意外停止 / `dsh-plugin-message-edit: failed`」，
crash log 里也看不到真因。上游 issue #6、修复 PR #7（pariseed，未合并、npm 未发版）。

## 补丁内容（= PR #7 的语义等价）

- `lib/client.js`（运行时真正加载的构建产物）+ `plugin.client.js`（源码镜像，一起改保持同步）
  - `inject: ['slots','sessions','locale']` → `+ 'uiWorkspace'`
  - 断言改为要求 `sessions.list` + `uiWorkspace.openSession`，抛新文案
  - 新增 `const navigation = { list: sessions.list, openVersion: id => uiWorkspace.openSession(id) }`
  - `openVersionTarget` / `openWhenListed` 的第一个参数由 `sessions` 改为 `navigation`，内部 `sessions.open(id)` → `open(id)`
- `package.json`：`dsh.client.inject` 增加 `@deepseek-ai/dsh-client-ui-workspace`

## 产物

- `~/.dsh/vendor/dsh-plugin-message-edit-1.2.0-pr7.tgz`（已打补丁的包，git 同步）
  sha256 `0bcf698e0788ad4f9f1cf40edd211a56990dcabfc180a63e230f5c64506bb0d2`
- `~/.dsh/patches/apply-pr7-message-edit.py` —— 打补丁脚本，幂等、保 CRLF、逐条断言命中次数
  用法：`python ~/.dsh/patches/apply-pr7-message-edit.py <package-dir>`
- `~/.dsh/patches/verify-message-edit-client.cjs` —— 激活期回归测试（vm 沙箱 + 伪 ctx）
  用法：`node ~/.dsh/patches/verify-message-edit-client.cjs <patched-pkg> <pristine-pkg>`
  四条断言：补丁版在「sessions 无 .open() + uiWorkspace 有 openSession」下 `apply()` 不抛；
  uiWorkspace 缺失时抛新文案；原版在同样条件下复现崩溃；原版只有配旧 `sessions.open()` 才通过。
- `~/.dsh/backups/message-edit-1.2.0-pristine-20261002/` —— 未打补丁的原包（回滚源）

## 声明方式（`~/.dsh/profiles/desktop/package.json`）

- `dependencies`：`"dsh-plugin-message-edit": "file:../../vendor/dsh-plugin-message-edit-1.2.0-pr7.tgz"`
  （用本地 tarball 而不是 `^1.2.0`：任何一次 pnpm install 都会装回**打过补丁的**副本，而不是从 registry 拉原版覆盖掉修复）
- `dsh.profile.bundles` 末尾加 `"dsh-plugin-message-edit"`（bundles 才是「启用」的开关，`readProfilePlugins` 里 `enabled = bundles.includes(name)`）

## 回滚（若 desktop 再弹红框）

1. 最快：点报错框第三个按钮「禁用第三方插件、备份 profile patch 并重启」，或
2. 手工：删掉 `profiles/desktop/package.json` 里上面那两处声明 → 重启 desktop；或
3. 恢复原包：`cp -r ~/.dsh/backups/message-edit-1.2.0-pristine-20261002/. ~/.dsh/profiles/desktop/node_modules/dsh-plugin-message-edit/` 并做 2。

## 上游发 1.2.1 之后

`npm view dsh-plugin-message-edit version` 一旦 > 1.2.0，就改成 `"dsh-plugin-message-edit": "^1.2.1"`、
删掉 `vendor/` 里的 tarball 与本补丁，不再需要本地维护。
