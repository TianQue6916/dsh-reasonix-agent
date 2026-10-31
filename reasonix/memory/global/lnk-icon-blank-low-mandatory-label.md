---
id: mem-ebdb982ca531b308d376242fa1979dc8
revision: 1
created_at: "2026-10-28T19:59:34.059Z"
updated_at: "2026-10-28T19:59:34.059Z"
name: lnk-icon-blank-low-mandatory-label
description: ".lnk 图标全白纸的根因是文件 mandatory label = Low（不是缓存/注册表）；含哈希指纹判据、分离测试法、正确排查顺序与一行修复"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 一句话

**`.lnk` 图标全变白纸（左下角蓝色箭头还在、双击能打开），而 `.exe`／文件夹／`.ico` 图标全部正常 —— 先查 `.lnk` 文件的 mandatory label，不要先清缓存。**

## 症状（2026-10-29 实测，本机）

- 桌面、`工具箱`、开始菜单里所有 `.lnk` 显示成白纸 + 蓝箭头
- 同一目录下的 `.exe`（Firefox）图标正常，文件夹正常，图片缩略图正常
- 双击 `.lnk` 能正常启动程序
- `.lnk` 的 `IconLocation` 有的写了显式 `.ico`（且文件存在可读）、有的是空（`,0`）—— **两种情况一样白**

## 客观判据（关键，能免掉「叫用户看一眼」的往返）

用 `SHGetFileInfo(SHGFI_ICON)` 拿每个 `.lnk` 的图标位图，算 SHA256 取前 12 位：

```
坏：  1A0152E881F6  x25        VERDICT: 25/25 全白
好：  24 distinct hashes       VERDICT: real icons are resolving
```

脚本：`C:\Users\27063\.dsh-lab\tools\probe-lnk-icons.ps1 -Root <dir> -Limit N`
**判读规则：哈希全同 = 全白；哈希分散 = 正常。** 一个重要细节：`ie4uinit -ClearIconCache` 之后哈希会变（`1A0152E881F6` → `A86F6535ECC7`），但**仍然是同一个值** —— 说明缓存清干净了、重新解析出来还是白纸，**问题不在缓存**。

## 根因

**`.lnk` 文件的 mandatory label（完整性级别）是 `Low`。**

```cmd
D:\Desktop                                    （无 label = Medium）
D:\Desktop\工具箱\Git Bash.lnk                Mandatory Label\Low Mandatory Level:(I)(NW)
```

修法（一行，管理员）：

```cmd
icacls "D:\Desktop" /setintegritylevel "(OI)(CI)Medium" /T /C /Q
```

跑完立刻恢复。**实测耗时 30-60 s（取决于树大小），`/T` 会递归。**

## 排查顺序（照这个顺序，能省半小时）

我按下面的顺序全查了一遍，**前六项全部正常**，第七项才是答案：

1. `ie4uinit -ClearIconCache` + 删 `iconcache_*.db` + 重启 explorer —— 无效
2. `SHChangeNotify(SHCNE_UPDATEITEM)` 逐个 `.lnk` 发通知 —— 无效
3. `HKCR\lnkfile\shellex\IconHandler` = `{00021401-0000-0000-C000-000000000046}` —— 正确
4. `HKCR\CLSID\{00021401-...}\InProcServer32` = `C:\Windows\System32\windows.storage.dll`, `ThreadingModel=Both` —— 正确
5. `HKCR\lnkfile` 的 `IsShortcut` / `NeverShowExt` / `FriendlyTypeName` —— 全在
6. `COM` 能否 `CreateInstance` 这个 CLSID —— 能
7. **`icacls` 看 `.lnk` 的 mandatory label** —— **`Low` ← 就是这个**

**⇒ 遇到 `.lnk` 白图标，第 1 步就该是 `icacls <file> | findstr Mandatory`，而不是清缓存。**

## 为什么「把桌面换到 D 盘」当时有效、后来又犯

- 换盘那一次：`.lnk` 是新建路径，label 还是 Medium ⇒ 正常
- 后来 dsh 的 `workspace-write` sandbox 对 workspace（`C:\Users\27063`）递归打 Low label，**`Desktop` 是 junction，label 顺着它落到了 `D:\Desktop` 的真实文件上**
- **⇒ 换无可换**：桌面放哪个盘都会中，只要它还挂在 `C:\Users\27063` 下面被 junction 指过去

## 分离测试法（定位「是哪个来源坏了」）

同一套 `SHGetFileInfo` 分别对不同类型的源跑一遍：

```
.ico file          42FE9E865CF2   ✓
.exe notepad       2B3D4ACFD541   ✓
.dll shell32       2A30681ABA07   ✓
folder             102BB22D7281   ✓
plain .txt         B3CEF1509368   ✓
──────────────────────────────────
.lnk explicit-ico  1A0152E881F6   ✗
.lnk implicit      1A0152E881F6   ✗
.lnk empty-target  1A0152E881F6   ✗
```

**除 `.lnk` 外全正常 ⇒ 问题在 `.lnk` 这条分支，不在图标子系统本身。** 脚本：`probe-icon-sources.ps1`。

## 顺带查出的另一个坑（同源，但症状不同）

`C:\Users\27063` 上被 dsh 的 `grantWrite()` 留了三条显式 ACE：

```
Everyone:(CI)(DENY)(DC)                       ← FILE_DELETE_CHILD deny，DENY 优先于 ALLOW
S-1-4-1049387402-452331294:(OI)(CI)(W,D,DC)   ← sandbox 的 capability SID
Mandatory Label\Low Mandatory Level:(OI)(CI)(NW)
```

`(DC)` deny 让 explorer 删不掉过期的 `iconcache_*.db` 条目。**注意：删这个 ACE 必须先在目标目录上 `/inheritance:d` 再 `/remove:d`** —— 直接 `/remove:d /T` 会打印「Successfully processed」但 ACE 立刻从父目录重新继承回来（实测踩过）。但这一条最终**不是**图标变白的原因，只是让缓存重建更堵。

## 工具清单

```
C:\Users\27063\.dsh-lab\tools\
  probe-lnk-icons.ps1        哈希指纹判据（修没修好看 VERDICT）
  probe-icon-sources.ps1     按来源分离测试
  probe-lnkfile-reg.ps1      lnkfile 注册表全量比对
  fix-desktop-label2.ps1     撤 Desktop 树的 Low label（UAC）
  fix-iconcache2.ps1         /inheritance:d 后删 Everyone deny（UAC）
  renotify-lnk-icons.ps1     SHChangeNotify 逐个失效 per-item 缓存（对本病无效，但对「换过图标但缓存不刷新」有效）
```
