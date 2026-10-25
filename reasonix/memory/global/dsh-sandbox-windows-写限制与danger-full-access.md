---
id: mem-6f0ec1741eb8695add2726c319249b22
revision: 2
created_at: "2026-10-24T15:11:45.516Z"
updated_at: "2026-10-25T05:50:47.010Z"
name: dsh-sandbox-windows-写限制与danger-full-access
description: "dsh 在 Windows 的 bash tool 固定跑 Low IL，D 盘等 Medium 目录写不进去；解法是提权给目录降 integrity level（2026-10-25 实测通）"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 结论（2026-10-25 实测，已解决）

dsh 的 bash tool 进程在 Windows 上始终是 **Low Mandatory Level**（`S-1-16-4096`），与 `sandbox-policy.mode` 无关。

**验证过的完整事实链**：
- `pwsh -File ~/.dsh/storages/tools/dump-desktop-config.ps1 -Pattern 'sandbox'` 显示 desktop 实际生效配置已是 `id: sandbox-policy` → `config: { mode: danger-full-access }`，且 preset 表 `defaultPreset: danger-full-access`（`sandbox: danger-full-access / approval: never`）。**配置正确，重启也确认过**。
- 但进程仍是 Low：`/c/Windows/System32/whoami.exe /groups | grep "S-1-16"` → `Mandatory Label\Low Mandatory Level ... S-1-16-4096`。
- token 里**没有** AppContainer 组（无 `S-1-4-*` / `S-1-15-3-*`）⇒ 不是 AppContainer，纯 IL 限制。
- ⇒ `danger-full-access` 在 Windows 上不解除 integrity level（landlock 是 linux-only，两者不在同一层）。**重启 dsh 不会解决**。
- 表现：`D:\` ACL 明明给了 `Authenticated Users:(M)` 也写不了，因为 IL no-write-up 检查发生在 ACL 之前；`$HOME`（C:\Users\27063，本身带 `Mandatory Label\Low Mandatory Level:(OI)(CI)(NW)`）可写。
- 副产品：`C:\Users\27063\Desktop` 同样写不了（带 `Everyone:(I)(CI)(DENY)(DC)` + Low label 组合），所以 Windows 桌面也落不了盘。

## 解法：给目标目录降 integrity level（需 UAC 提权）

```powershell
Start-Process -FilePath icacls.exe -Verb RunAs -Wait -ArgumentList @(
  'D:\Desktop\课程文件\待处理文件夹', '/setintegritylevel', '(OI)(CI)Low')
```

- **只对目录本身**设 `(OI)(CI)Low`，**不要加 `/T`**（递归会遍历大量课程文件，违反铁律）。
- 子目录与新建文件自动继承 Low ⇒ low 进程可写。实测降完后 `touch` 立刻 OK。
- 副作用为零：Medium IL 进程（资源管理器、marktext、git）对 Low 对象仍可读写（write-down 允许）。
- 非提权执行会 `Error: ... Access is denied.`（改 label 需 SeRelabelPrivilege）。
- 验证：`icacls "<dir>" | grep -i Label` 应显示 `Low Mandatory Level`；`touch "<dir>/_wtest"` 应 OK。

## 已落实的目录（2026-10-25 01:5x）

- `D:\Desktop\课程文件\待处理文件夹` → 已降 Low，子目录 `数学` / `计算机` 均可写。
- 之后**新建**的一级分类目录仍是 Medium，需要重新跑一次上面的 icacls。

## 落盘验证

`backward-induction-逆向归纳法与最优性原理.md` + `assets/`（3 svg + 3 png + src py）+ `tools/`（check-katex.js / check-dollar.js）已 cp 到 `D:\Desktop\课程文件\待处理文件夹\数学\`，md5 `9da4bdd38cad` 与中转目录一致；此前的中转目录 `C:\Users\27063\Documents\待复制到桌面\` 可继续保留作备份，但不再是唯一通道。
