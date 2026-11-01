---
id: "55ab0b45-9ea5-4dba-8985-b8d36ccedf41"
title: "2026-10-29 定案：.lnk 图标全白 = 快捷方式文件自身 Low mandatory label；缓存/注册表/COM 全正常是假线索，icacls /setintegritylevel Medium 一行修好"
description: "白纸图标根因定案：`.lnk` 文件自身 NTFS mandatory label 为 Low，Shell 在 lnkfile IconHandler 分支直接返回白纸；清 iconcache/重启 explorer/重注册/注册表全对均无效，`icacls /setintegritylevel \"(OI)(CI)Medium\" /T` 立即修复。含 hash 指纹客观判据（25/25 同 hash → 24 distinct）、按来源分离测试、7 步排查顺序、换盘因此前 junction 使 label 跨盘传播而失效、附带坑与工具清单。引用 9c6b76a2/41ce8bea/196df70c。"
status: "active"
created_at: "2026-10-28T20:05:55.935Z"
updated_at: "2026-10-28T20:05:55.935Z"
content_hash: "52a7297442859d223c06243880468bc72858ddccc248f111ac815daef8354062"
source_paths:
  - ".dsh-lab/tools/probe-lnk-icons.ps1"
  - ".dsh-lab/tools/probe-icon-sources.ps1"
  - ".dsh-lab/tools/fix-desktop-label2.ps1"
  - ".dsh-lab/tools/renotify-lnk-icons.ps1"
session_ids:
  - "ca182609-e4c9-4dbc-9324-a4445170e3cd"
memory_body_ids:
  []
---

# 定案：`.lnk` 白纸图标的真根因是文件自身的 Low mandatory label

**症状**：桌面/开始菜单里 `.lnk` 图标全变白纸（左下蓝色箭头仍在，双击能正常打开）；同时 `.exe`、文件夹、`.ico`、`.dll`、`.txt` 图标全部正常。

**根因**：`.lnk` **文件自身**的 NTFS mandatory label 是 `Low`。Shell 走到 `lnkfile` 的 IconHandler 分支时直接失败、返回同一张白纸，根本没去读 `.ico`。与 `iconcache_*.db`、per-item 图标缓存、注册表、COM 注册均无关 —— 这些检查全部正常的场景下问题依然存在。

**修复（一行，UAC 提权）**：
```
icacls "D:\Desktop" /setintegritylevel "(OI)(CI)Medium" /T /C /Q
```
执行后立即生效，`explorer` 不必重启。

## 客观判据（不再靠"叫用户看一眼"）

`probe-lnk-icons.ps1` 对每个 `.lnk` 调 `SHGetFileInfo` 取图标位图哈希：

- 坏：`1A0152E881F6  x25` → `25/25 identical -> largely broken`
- 好：`24 distinct hashes` → `real icons are resolving`

易踩细节：`ie4uinit -ClearIconCache` 之后 hash 会变（`1A0152E881F6` → `A86F6535ECC7`），**但仍是同一个值**。这正好证明「缓存清干净了、重新解析还是白纸」，问题不在缓存。

## 按来源分离测试

`probe-icon-sources.ps1` 对不同来源分别取图标：

| 来源 | 结果 |
|---|---|
| `.ico` 文件 / `.exe` (notepad) / `.dll` (shell32) / folder / 普通 `.txt` | 各自真图标 ✓ |
| `.lnk` 显式 IconLocation / 隐式 / 空 target | 全部同一张白纸 ✗ |

三个 `.lnk` 变体一律相同 ⇒ 问题在 `lnkfile` 这条分支被整体短路，与 `.lnk` 内容无关。

## 排查顺序（前六项全正常，第七项才是答案）

1. 清 `iconcache` + 重启 explorer → 无效
2. 对 472 个 `.lnk` 逐个发 `SHChangeNotify(SHCNE_UPDATEITEM)` → 无效
3. `HKCR\lnkfile\shellex\IconHandler` = `{00021401-0000-0000-C000-000000000046}` → 正确
4. `CLSID\{00021401-...}\InProcServer32` = `C:\Windows\System32\windows.storage.dll`，COM `CreateInstance` 可创建 → 正确
5. `lnkfile` 的 `IsShortcut` / `NeverShowExt` / `FriendlyTypeName` 全在 → 正确
6. HKCU 无 `.lnk` / `lnkfile\shellex\IconHandler` 劫持；`.lnk=lnkfile` 关联正常 → 正确
7. **`icacls <某个 .lnk> | findstr Mandatory` → `Low`** ← 答案

## 为什么"换到 D 盘"当时能修、后来又犯

- `C:\Users\27063\Desktop` 是 **junction** → `D:\Desktop`；注册表 `User Shell Folders\Desktop` 也已指向 `D:\Desktop`，形成两套路径身份。
- dsh `workspace-write` 的 `grantWrite()` 对 workspace（`C:\Users\27063`）递归打 Low label，**label 顺着 junction 落到 `D:\Desktop` 的真实文件上**。
- 换盘那次 `.lnk` 全是新路径、还没被碰过 ⇒ Medium ⇒ 正常；那**不是修好了，是把 per-item 缓存表整张作废**。
- 之后 label 继续顺着 junction 传播 ⇒ 桌面放哪个盘都白，换无可换。

⚠️ 本轮已验证：**单独删掉 junction 不能修图标（反而打断用户桌面路径），必须撤 mandatory label**。

## 附带坑

- **`Get-Acl` 读不到 mandatory label**：默认不读 SACL，对带 Low label 的路径也报 `(no ML)`，与 `icacls` 结论矛盾 —— 一律以 `icacls` 为准。
- **删继承来的 ACE 必须先断继承**：直接 `/remove:d /T` 会打印 `Successfully processed`，但 ACE 立刻从父目录继承回来；要先 `/inheritance:d` 再 `/remove:d`（`fix-iconcache2.ps1`）。
- **社区旁证**：微软 Q&A 有完全同症状帖子，归因到「AI 工具把桌面当 workspace 打上 Low 标签且不会还原」；unsloth 的 commit 说明 blank shortcut icon 常是 per-item 缓存，但本例缓存层正常，缓存解释不适用。

## 工具（workspace 相对路径）

- `.dsh-lab/tools/probe-lnk-icons.ps1` — hash 指纹判据
- `.dsh-lab/tools/probe-icon-sources.ps1` — 按来源分离测试
- `.dsh-lab/tools/probe-lnkfile-reg.ps1` — lnkfile 注册表全量比对
- `.dsh-lab/tools/fix-desktop-label2.ps1` — 撤 Desktop 树 Low label（UAC）
- `.dsh-lab/tools/fix-iconcache2.ps1` — `/inheritance:d` 后删 Everyone deny
- `.dsh-lab/tools/renotify-lnk-icons.ps1` — 逐个 SHChangeNotify 失效 per-item 缓存
- `.dsh-lab/tools/fix-desktop-junction.ps1` — junction 删除/恢复

## 防复发

`dsh-sandbox-policy` patch 已在位：`workspace-write` 强制降级为 `danger-full-access`；当前 shell IL 已是 Medium（`S-1-16-8192`）。剩余待清理项：`C:\Users\27063` 根上三条 ACE（`Everyone:(DC)` deny、capability SID、Low label），需 `-Full` 档全量清理，165k 文件，属独立任务。

## 参考

- `9c6b76a2-b3a7-46e6-b5f0-2629fb708b2a` — 上一轮把失败点归到 home 根的 `Everyone:(DENY)(DC)`；**本文推进其结论**：那轮之后图标仍白，真正生效的修复项是 mandatory label，deny ACE 不是主因。
- `41ce8bea-bcaf-48a1-bf8b-38bca0fc55a5` — Low Mandatory Level 是 NTFS 持久状态而非运行期 token 降级。
- `196df70c-aca7-4ce5-a93e-6458f31e0b40` — `icacls /setintegritylevel` 的引号语法与 Low IL 目录可写性定案。
