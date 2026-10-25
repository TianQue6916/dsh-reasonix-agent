---
id: "c81e9fe7-b108-4f68-a8b2-326a2b26935c"
title: "dsh patch entry 的 name 必须是真实包名：cordis.patch.yml 裸名导致 failed to import（thinking-guard 案例）"
description: "2026-10-03 定位并修复 @ethanwong-hk/dsh-thinking-guard 的 boot 失败：包自带 cordis.patch.yml 的 name 写成裸名，dsh 按模块名 resolve 失败 → ERR_MODULE_NOT_FOUND → entry.fiber 建不起来 → 日志只有 `failed to import`。含「profile patch 按 (id, name) 匹配，不能靠加 name 修」的反例、正确改法（改包内源头）、幂等脚本与两条验证方式。"
status: "active"
created_at: "2026-10-03T10:15:02.532Z"
updated_at: "2026-10-03T10:15:02.532Z"
content_hash: "aa52076e39092f7d5aad87488607d56f1006d212a5f52b7b5478f7db9a54ad0b"
source_paths:
  - "profiles/web/node_modules/@ethanwong-hk/dsh-thinking-guard/cordis.patch.yml"
  - "profiles/web/cordis.patch.yml"
  - "storages/tools/patch-thinking-guard-name.py"
  - "patches/README-thinking-guard-name.md"
session_ids:
  - "2272e69f-bdc6-4da2-b4bb-5f23bd57ed94"
memory_body_ids:
  []
---

# dsh patch entry 的 `name` 必须与真实模块名一致

关联文档：`956f6754-806c-456b-8339-bb7206c9c43a`（thinking-guard 第二轮调参，同一插件的参数与算法侧）、`6471b357-f586-4315-a59d-42143704ee5a`（pnpm install 冲掉 node_modules patch 的运维背景）。

## 症状

web profile 每次 boot 时 stderr 出现：

```
1 entry did not activate
... failed to import
```

`--dump-config` 可能 exit=0、stderr 干净、entry 的 config 段也合成得出来——**config 合成成功 ≠ 模块能 import**。判断一个插件「有没有真的加载」不能只看 dump-config，要看 boot 日志有没有 `failed to import` / `did not activate`。

## 诊断方法（最直接的一条）

在 profile 目录下用 node 直接试模块名解析：

```bash
node -e "import('dsh-thinking-guard')"                 # → ERR_MODULE_NOT_FOUND  ❌
node -e "import('@ethanwong-hk/dsh-thinking-guard')"   # → ['apply','detectDegenerate','inject','name']  ✅
```

## 根因

包自带的 `profiles/web/node_modules/@ethanwong-hk/dsh-thinking-guard/cordis.patch.yml` 里写的是**裸名**：

```yaml
- id: thinking-guard
  name: dsh-thinking-guard        # ❌ 真包名带 scope
```

dsh 从 profile 目录按这个 `name` 当作**模块名**去 resolve。Node 在 `node_modules/dsh-thinking-guard` 找不到（实际目录是 `node_modules/@ethanwong-hk/dsh-thinking-guard`，无 scope 的同名目录不存在），抛 `ERR_MODULE_NOT_FOUND`，导致 entry 的 `fiber` 建不起来。

报错点：`@deepseek-ai/dsh-app-boot/lib/index.js:3910`，判断条件是 `entry.fiber === undefined`。该分支把**原始错误整个吞掉**，日志只剩一句没头没尾的 `failed to import`——所以排查时要自己复现 import，别指望日志。

## 错误修法（已试过并 revert）

往 `profiles/web/cordis.patch.yml` 的 `- id: thinking-guard` row 后面补一行 `name: "@ethanwong-hk/dsh-thinking-guard"`。dsh 直接拒绝并 skip：

```
dsh: [C:\Users\27063\.dsh\profiles\web\cordis.patch.yml] patch: name mismatch for "thinking-guard"
     (expected "dsh-thinking-guard", got "@ethanwong-hk/dsh-thinking-guard"), skipping
```

**原因**：profile patch 是按 **(id, name) 二元组**去匹配已存在 entry 的，而 entry 的 name 来自包自己那份 `cordis.patch.yml`。profile 侧写不一样的名字只会 mismatch，不能覆写。⇒ **只能改包内源头**。

## 正确修法

改 `profiles/web/node_modules/@ethanwong-hk/dsh-thinking-guard/cordis.patch.yml` 的 `name` 为 `@ethanwong-hk/dsh-thinking-guard`（文件 928 → 942 B）。

工具（幂等，带 `--check` / `--apply` / `--verify` / `--restore`，state 文件 `~/.dsh/storages/thinking-guard-name-patch.json`，自动备份 `.bak-<timestamp>-pre-scope-name`）：

- `~/.dsh/storages/tools/patch-thinking-guard-name.py`
- 说明与回滚：`~/.dsh/patches/README-thinking-guard-name.md`

## 两条验证（都是真跑，不是看配置）

1. `dsh --profile web --dump-config` → exit=0，stderr **0 字节**（修之前有 name mismatch 警告）。
2. 起隔离实例实测（不动用户正在用的进程）：

```bash
nohup dsh --profile web --port 3099 --no-open > logs/dsh-web-3099.out.log 2> logs/dsh-web-3099.err.log &
```

   30 秒后 out 日志只有一行 token URL，err 日志 0 字节，无 `failed to import`、无 `1 entry did not activate`。验完 kill 并确认端口释放。

## 生效条件与注意事项

- patch 在 boot 时读取，**不能 live reload**，必须重启对应 profile 的进程（web 侧重启 3080 那条）。
- target 位于 `node_modules` 内部 ⇒ **`pnpm install` 会覆盖，升级/重装后必须重跑脚本**（同类风险见 `6471b357-f586-4315-a59d-42143704ee5a`）。
- desktop 侧 CLI 不能 dump（`error: profile "desktop" is managed exclusively by the Electron application`），需在桌面端冷启动验证；本次 desktop 的 `node_modules` 下没有 `@ethanwong-hk`，auto-discovery 不会扫到同一问题。
- 排查任何插件的 `failed to import`，先做「裸名 vs 真名」的 import 对照，再怀疑代码。
