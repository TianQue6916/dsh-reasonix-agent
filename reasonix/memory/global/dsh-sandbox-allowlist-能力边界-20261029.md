---
id: mem-f34d81923022fb202a912f69975f1062
revision: 1
created_at: "2026-10-28T17:09:09.142Z"
updated_at: "2026-10-28T17:09:09.142Z"
name: dsh-sandbox-allowlist-能力边界-20261029
description: "dsh-sandbox-allowlist 在 Windows 只解 write/edit 的应用层围栏（lib/fs.mjs），解不了 bash 子进程的 Low IL MAC 限制（provider.mjs 在 Windows 不挂载）"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## `dsh-sandbox-allowlist` 在 Windows 上的**能力边界**（关键，装前必读）

包信息（2026-10-29 查）：
- npm `dsh-sandbox-allowlist`，latest = **0.1.0**（更高版本 0.2.1-beta.2/beta.3 不在 latest tag 上）
- `engines` 只有 `node >= 20.11`，**没有 `engines.dsh`、没有 peerDependencies**
  ⇒ 按 `dsh-app-boot` 的 `unmetRequirements()` 三分支，它**永远不会被兼容性门禁拦**（那条规则：无 `engines.dsh` 且无 `peerDependencies` ⇒ 直接判兼容）
- `dsh.bundle.patch: ./cordis.patch.yml` ⇒ 加进 `dsh.profile.bundles` 即自动挂载

它的 patch 做了什么：

```yaml
- id: sandbox-policy   # 原生行 → disabled: true
- id: fs-sandbox       # 原生行 → disabled: true
- id: sandbox
  disabled: !!js process.platform !== 'win32'    # Windows 上 disabled
- insert:
    - id: sandbox-allowlist-policy
      name: 'dsh-sandbox-allowlist'
      config:
        mode: !!js process.env.DSH_PERMISSION_MODE ?? 'workspace-write'
        workspaceRoot: !!js process.cwd()
    - id: sandbox-allowlist-fs
      name: 'dsh-sandbox-allowlist/lib/fs.mjs'
    - id: sandbox-allowlist-provider
      name: 'dsh-sandbox-allowlist/lib/provider.mjs'
      disabled: !!js process.platform === 'win32'   # Windows 上不挂载
```

README 原文：

> `lib/fs.mjs`   替换 fs-sandbox：**write/edit 栅栏**放行 extraRoots
> `lib/provider.mjs` 替换 sandbox（**仅 Linux**）：bwrap --bind 追加

## ⇒ Windows 上它只解 1/3

| 写入方式 | 拦在哪 | 插件能解？ |
|---|---|---|
| `str_replace_editor` / `write` / `edit` | `fs-sandbox` 的**应用层路径围栏**（JS） | ✅ 能（`lib/fs.mjs` 放行 extraRoots） |
| `bash` 里的 `python` | Windows **内核 MAC**（Low IL + no-write-up） | ❌ 不能 |
| `bash` 里的 `powershell` | 同上 | ❌ 不能 |

`provider.mjs`（bwrap bind 扩展）在 Windows 上**根本不挂载**，所以它碰不到内核 MAC 那一层。

## 结论：要给 bash 也能写，只能动对象 label

```powershell
icacls 'D:\Toolbox' /setintegritylevel "(OI)(CI)Low" /T
# 或只给需要的子目录
icacls 'D:\Toolbox\goat-gateway' /setintegritylevel "(OI)(CI)Low" /T
```

两条路是**互补**的，不是替代：
- 装插件 → 解 `write`/`edit` 工具的路径围栏
- 打 Low label → 解 bash 子进程的内核 MAC

## 侵入性提醒

这个插件会 **disable 原生 `sandbox-policy` 和 `fs-sandbox` 行**，换成自己的两个实现。出问题时要一起回滚：
`dsh plugin --profile <p> remove dsh-sandbox-allowlist` + 确认 profile patch 里原生行恢复 `disabled: false`。
