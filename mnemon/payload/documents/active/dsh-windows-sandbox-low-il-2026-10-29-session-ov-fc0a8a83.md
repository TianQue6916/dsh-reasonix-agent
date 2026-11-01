---
id: "fc0a8a83-84ea-44c4-86a0-9ff1fe82d097"
title: "dsh Windows sandbox Low IL 根治（2026-10-29）：session override 压过 defaultPreset 的代码级根因 + dsh-sandbox-nx 两行 patch"
description: "本机（天阙九泉\\27063，非管理员）dsh Windows ACL sandbox 反复把 workspace 打成 Low Mandatory Level 的代码级唯一根因定位：`SandboxPolicyService.resolve()` 中 session 的 `sandbox/mode` 事件优先于部署 defaultPreset，导致 config 改 danger-full-access 无效。含两行 patch（workspace-write → danger-full-access）、`dsh-sandbox-nx.py --check/--apply/--revert` 工具、三条 executor 单 seam 覆盖面证据、生效需完全重启、升级后重打、以及本次先做的 App 目录/exe Low→Medium label 修复（8712 文件 39.7s）。关联 41ce8bea（机制层定案）与 fa6b195b（allowlist 边界）。"
status: "active"
created_at: "2026-10-28T18:08:43.893Z"
updated_at: "2026-10-28T18:08:43.893Z"
content_hash: "7ff74726e51ee04333b1053b25c4f4d1117d0ef7131e2abd328c3905cf9215b8"
source_paths:
  - "AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-sandbox-policy/lib/index.js"
  - ".dsh-lab/tools/dsh-sandbox-nx.py"
session_ids:
  - "23f32f4c-17cd-4b75-bc4b-a9b5538d26d1"
memory_body_ids:
  []
---

# dsh Windows sandbox Low IL 根治（2026-10-29）

本机 Windows（`天阙九泉\27063`，非管理员）实机。承接 `41ce8bea`（2026-10-10 机制层定案：workspace 全树被递归打成 Low label，改配置无效）与 `fa6b195b`（`dsh-sandbox-allowlist` 只解应用层栅栏、不解内核 MAC）。本篇补上的是**代码级根因**与**可复用的根治 patch**。

## 结论

`workspace-write` 之所以压过 `cordis.patch.yml` 里的 `defaultPreset: danger-full-access`，不是配置写错，而是 `SandboxPolicyService.resolve()` 的优先级设计：

```js
resolve(request = {}) {
  const { session } = request;
  return {
    mode: request.mode ?? (session === void 0 ? void 0 : this.overrideOf(session)) ?? this.defaultMode,
    workspaceRoot: resolveWorkspaceRoot(session?.header.cwd ?? this.workspaceRoot),
    ...
```

即 **per-call 显式 mode > session log 里最后一次 `sandbox/mode` 事件 > 部署 defaultMode**。只要某个 session 的 log 钉了 `workspace-write`，它永远按 `workspace-write` 跑，`defaultPreset` 只是最底层兜底。`overrideOf()` 读的是 `sessionProjections.stateOf(session, "sandboxMode")`。

## 触发链

`workspace-write` → `dsh-sandbox-local` 调 `dsh-sandbox-windows-acl` 的 `grantWrite()` → `buildLowLabelAcl()`，对 workspace 目录下 `(OI)(CI)(NW)` 的 Low mandatory label → NTFS eager inheritance 递归整棵树，包括 dsh App 自己的 exe → 进程按 image 的 Low IL 启动（image label 反压 token IL）→ `whoami /groups` 首行 Low、D 盘 DENY、`schtasks` 找不到路径。

## patch（两行，只拦一个值）

目标文件（npm 全局安装副本，profile 层没有覆盖）：

```
C:\Users\27063\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\dsh-sandbox-policy\lib\index.js
```

```diff
+ /* dsh-sandbox-nx */ const dshNoWorkspaceWrite = (m) => (m === "workspace-write" ? "danger-full-access" : m);
  var SandboxPolicyService = class extends Service {

-   mode: request.mode ?? (session === void 0 ? void 0 : this.overrideOf(session)) ?? this.defaultMode,
+   mode: dshNoWorkspaceWrite(request.mode ?? (session === void 0 ? void 0 : this.overrideOf(session)) ?? this.defaultMode),
```

`read-only` 与 `danger-full-access` 原样透传；`undefined` / `null` / 空串也原样透传（helper 只做严格 `=== "workspace-write"` 比较）。实测映射：

```
read-only            -> read-only
workspace-write      -> danger-full-access
danger-full-access   -> danger-full-access
undefined            -> undefined
null                 -> null
```

## 为什么单点 patch 就够（覆盖面验证）

三条 executor 全都从同一个 seam 取 policy，没有旁路：

```
dsh-bash-sandbox/lib/index.js:62    sandboxPolicy: request.sandboxPolicy ?? this.ctx.sandboxPolicy.resolve()
dsh-fs-sandbox/lib/index.js:154     const policy = sandboxPolicy ?? this.ctx.sandboxPolicy.resolve();
dsh-pwsh-sandbox/lib/index.js:148   sandboxPolicy: request.sandboxPolicy ?? this.ctx.sandboxPolicy.resolve()
```

真正碰 label 的 `dsh-sandbox-local` 里只有两处判 mode，patch 后永远进不去：

```
:34   if (policy.mode === "workspace-write") { ... }
:47   if (policy.mode === "workspace-write") readWrite.push("/tmp", policy.workspaceRoot);
```

`dsh-sandbox-local` 的 `windowsAclRunnerArgv()` 按 `policy.mode` 分支：非 `workspace-write` 时只传 read-only 探针（零 grants），不会 materialize write ACE / Low label。

## 工具：`dsh-sandbox-nx.py`

路径 `C:\Users\27063\.dsh-lab\tools\dsh-sandbox-nx.py`（158 行 / 5504 B）。三段状态机 + 自带备份：

```bash
python dsh-sandbox-nx.py --check     # state: CLEAN / PATCHED + sha256 前 16 位
python dsh-sandbox-nx.py --apply     # 写备份 index.js.bak-<时间戳>，再打 patch
python dsh-sandbox-nx.py --revert    # 取最新 .bak-* 还原
```

本次实测记录：`7553 → 7684 bytes`，`sha256 772ca58f0f786d6c → d4cf53ce50ace8fd`，`node --check` PASS，`CLEAN → PATCHED`，`RESULT: OK`。

工具坑：脚本 docstring 里的 Windows 路径会被 Python 当 `\UXXXXXXXX` unicodeescape 解析，文件头必须用 `r"""` raw string，否则 `ast.parse` 直接 `SyntaxError: (unicode error)`。

## 生效条件与升级

- **必须完全退出 dsh（含托盘/后台）再启动**：node 在进程启动时已把模块读进内存，改磁盘不改变当前进程行为。当前会话观察到的仍是旧行为。
- `npm i -g @deepseek-ai/dsh` 会覆盖该文件，升级后先 `--check` 再 `--apply`。

## 本次顺带做的 ACL 修复（治标，非根治）

先把已污染的 App 目录与 exe 的 label 从 Low 改回 Medium，再打 patch 保证不再复发：

```
DeepSeek Harness\      Low:(I)(OI)(CI)(NW)  →  Medium:(OI)(CI)(NW)
DeepSeek Harness.exe   Low:(I)(NW)          →  Medium:(I)(NW)
```

范围 8712 个文件，39.7 s，`RESULT: OK`。

## 遗留（安全，无需清理）

`C:\Users\27063` 目录本身仍带 Low label。不影响使用：Windows 默认策略只禁 no-write-up（低写高），不禁 no-write-down（高写低），Medium 进程写带 Low label 的目录完全正常。

## 验收判据

完全重启 dsh 后：`whoami /groups` 首行不是 Mandatory Label\Low；D 盘写探针通过；关键判据 —— **新开一个 `workspace-write` 的 session 也不会把 label 打回来**。
