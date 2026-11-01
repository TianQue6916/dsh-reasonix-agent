---
id: "fa6b195b-33a7-4222-aed0-f8f4cf4d559b"
title: "dsh-sandbox-allowlist 在 Windows 的能力边界（2026-10-29）：只解 write/edit 应用层栅栏，不解 bash 子进程的内核 MAC —— 最终采用 icacls 打 Low label"
description: "第三方插件 dsh-sandbox-allowlist@0.1.0 在 Windows 上只解决 write/edit 路径围栏（lib/fs.mjs 生效），provider.mjs 在 win32 被 disabled 因而管不到 bash 里 python/powershell 撞的内核 no-write-up；实测结论是给目标子目录 icacls /setintegritylevel \"(OI)(CI)Low\" /T 即可三路全通，无需装插件。含验证判据与回滚命令。"
status: "active"
created_at: "2026-10-28T17:20:43.288Z"
updated_at: "2026-10-28T17:20:43.288Z"
content_hash: "8c03aff75eb54b56bb99387f542bb66887bec3ddd49d1b752cffd3b25c6bdef7"
source_paths:
  - "profiles/web/cordis.patch.yml"
  - "PLAN.md"
session_ids:
  - "a2a9edb0-83c8-4f1c-84e3-40a198aceb79"
memory_body_ids:
  []
---

# dsh-sandbox-allowlist 在 Windows 的能力边界（2026-10-29 定案）

**结论一句话**：想让 dsh 沙箱内的工具写 workspace 之外的持久目录（本次为 `D:\Toolbox` 下的插件源码目录），
**装 `dsh-sandbox-allowlist` 在 Windows 上只解决问题 1/3**；直接用 `icacls /setintegritylevel` 给目标子目录打 Low label
可解 3/3，且不需重启 dsh、不禁用原生 sandbox 行。

## 1. 被否证的需求前提

用户报告：当前会话写权限限于 `C:\Users\27063`，`D:\Toolbox` 整个盘只读，
`python` / `powershell` / `str_replace_editor` 三种方式全部 `EPERM`；
并询问「这样的限制按理说可以增加（白名单）」。

dsh 侧没有可配置入口：`@deepseek-ai/dsh-sandbox/lib/index.js` 的 `writableRoots(policy)`
在 `workspace-write` 下**硬编码**为 `[policy.workspaceRoot, "/tmp", tmpdir()]` 三项（去重后 canonical）；
`sandbox-policy` 的 Config 只有 `mode` 一个字段，`writableRoots` 是推导结果而非输入。
⇒ **不存在「加一个目录」的配置项**，必须绕到系统层或换插件。

## 2. 为什么 ACL 看起来有权限却 EPERM

```
icacls 'C:\Users\27063'  → Mandatory Label\Low Mandatory Level:(OI)(CI)(NW)   ← dsh 给 workspace 打了 Low
icacls 'D:\Toolbox'      → Authenticated Users:(I)(M)                        ← DACL 有 Modify
                           但没有 Mandatory Label 行 ⇒ 默认 Medium
```

**DACL 允许写入，MAC 层拦截**：Low IL 进程不能写 Medium IL 客体（no-write-up），该规则**优先于 ACL**。
这就是「ACL 明明有 Modify 却 EPERM」的唯一解释。（机制层详见 41ce8bea、741c915f。）

## 3. 插件 `dsh-sandbox-allowlist@0.1.0` 的实际覆盖面

npm 存在同名包（`engines.node >= 20.11`；另有 `0.2.1-beta.2/.3`）。`npm pack` 后读实现：

`cordis.patch.yml`（bundle patch 层）做的事：

```yaml
- id: sandbox-policy   → disabled: true          # 原生行被禁用
- id: fs-sandbox       → disabled: true          # 原生行被禁用
- id: sandbox
  disabled: !!js process.platform !== 'win32'    # Linux 专用
- insert:
    - id: sandbox-allowlist-policy
    - id: sandbox-allowlist-fs                   # write/edit 围栏，全平台
    - id: sandbox-allowlist-provider             # bwrap --bind 扩展
      disabled: !!js process.platform === 'win32'  # ← Windows 上根本不挂载
```

README 原文对应：

> `lib/fs.mjs` — 替换 fs-sandbox：**write/edit 栅栏**放行 extraRoots
> `lib/provider.mjs` — 替换 sandbox（**仅 Linux**）：bwrap --bind 追加

对照三种写入方式：

| 方式 | 拦在哪一层 | 插件能解 |
|---|---|---|
| `str_replace_editor` / `write` / `edit` | `fs-sandbox` 的**应用层路径围栏**（JS 检查） | ✅ |
| `bash` 里跑 `python` | Windows **内核 MAC**（Low IL no-write-up） | ❌ |
| `bash` 里跑 `powershell` | 同上 | ❌ |

唯一能处理内核 MAC 的 `provider.mjs` 在 Windows 上是 `disabled: true`。
⇒ 只装插件会在换一个工具后再次撞同一个 `EPERM`。

代价另计：它**禁用原生 `sandbox-policy` 与 `fs-sandbox` 行**并换成自己的实现，属侵入性改动，
出问题需连这两行一起回滚，不只是卸载一个包。

## 4. 采用的修复（社区实践 = `icacls /setintegritylevel`）

Microsoft Q&A 与多个插件仓库指向同一条路：把**客体**降到 Low，而不是给进程提权。
限定为实际需要写的两个子目录（它们正是 `@local/*` 插件的 `link:` 目标）：

```powershell
icacls 'D:\Toolbox\goat-gateway'          /setintegritylevel "(OI)(CI)Low" /T /C   # 560 files
icacls 'D:\Toolbox\dsh-thinking-language' /setintegritylevel "(OI)(CI)Low" /T /C   # 9 files
```

（**引号语法坑**见 196df70c：PowerShell 会把不加引号的 `(OI)(CI)Low` 拆坏。）

验证标志：

```
Mandatory Label\Low Mandatory Level:(OI)(CI)(NW)
```

实测三种方式全通：`bash touch` ✅、`python open(p,'w')` ✅、`powershell Set-Content` ✅。

回滚：

```powershell
icacls 'D:\Toolbox\goat-gateway'          /setintegritylevel "(OI)(CI)Medium" /T
icacls 'D:\Toolbox\dsh-thinking-language' /setintegritylevel "(OI)(CI)Medium" /T
```

**范围**：只动这两个子目录，`D:\Toolbox` 根与其兄弟目录仍为 Medium，在那里新建文件仍会 `EPERM`。

## 5. 决策规则（下次直接套用）

- 只需要 `write`/`edit` 能写工作区外目录，且目录清单会持续增长 → 上 `dsh-sandbox-allowlist`（受其 Windows 1/3 限制）。
- 需要 `bash` 内的 python/powershell 也能写 → 必须打 Low label，插件替代不了。
- 两者**互补而非替代**；先做 label 能立即验证，成本一行命令。
- 危害面：本机任何 Low IL 进程（浏览器渲染进程、其他受限应用）都能改被打 label 的目录，
  故**不要对含密钥/网关配置的整盘或整父目录**批量打 Low，只打确需的子目录。

## 6. 未确证 / 待办

- 插件 `0.2.1-beta.*` 是否改变了 Windows 平台分工 —— 未查（本次只审 `0.1.0`）。
- 是否真有插件在 Windows 上实现内核 MAC 层放行 —— 未发现，保持「需要装 driver/服务」的怀疑。
