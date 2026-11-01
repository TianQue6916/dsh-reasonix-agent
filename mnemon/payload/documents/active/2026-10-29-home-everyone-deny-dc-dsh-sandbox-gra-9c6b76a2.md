---
id: "9c6b76a2-b3a7-46e6-b5f0-2629fb708b2a"
title: "2026-10-29 白纸图标再定案：home 根上的 Everyone:(DENY)(DC) 是 dsh-sandbox grantWrite() 指纹；icacls 必须先断继承再删，per-item 图标缓存与 iconcache_*.db 是两层"
description: "白纸图标第 N 轮：C:\\Users\\27063 上三条显式 ACE（Everyone:(CI)(DENY)(DC) + capability SID + Low label）认出是 dsh-sandbox-windows-acl grantWrite() 的指纹，DENY 优先导致 explorer 无法删 iconcache 条目；含 icacls 假成功（继承 ACE 需先 /inheritance:d）、root /T 在 165k 文件上跑不完、per-item 缓存 vs .db 两层、SHChangeNotify 重通知程序与社区旁证、桌面已重定向 D:\\Desktop 的现状与残留项。"
status: "active"
created_at: "2026-10-28T19:42:08.568Z"
updated_at: "2026-10-28T19:42:08.568Z"
content_hash: "fc15ed487fbc12ec94ece0f37494e03c01d3a1b01efccd1aa805ad5db414ecf5"
source_paths:
  - ".dsh-lab/tools/renotify-lnk-icons.ps1"
session_ids:
  - "c91c4eba-7655-4015-8c6e-d1383d3daf71"
memory_body_ids:
  []
---

# 白纸图标再定案（2026-10-29）

承接前几轮结论（见下方「参考」）。本轮把失败点从「.lnk icon handler」和「Low mandatory level」推进到**一条具体的 deny ACE**，并纠正了前几轮用过的一个错误修复手法。

## 1. 根因：`Everyone:(CI)(DENY)(DC)` 的 ACE 三元组

`C:\Users\27063` 上存在三条**显式**（无 `(I)`）ACE：

```
Everyone:(CI)(DENY)(DC)                            <- 元凶
S-1-4-1049387402-452331294:(OI)(CI)(W,D,DC)        <- sandbox capability SID
Mandatory Label\Low Mandatory Level:(OI)(CI)(NW)   <- Low IL
```

这三条的组合是 `dsh-sandbox-windows-acl` 的 `grantWrite()` 的**唯一指纹**——源码注释即写明：给 capability SID 授 `GRANT_MASK`（Write+Delete）、**对 world SID 拒绝 ambient `FILE_DELETE_CHILD`**、并施加 Low mandatory label，一次合并完成。

**机制**：ACE 求值中 DENY 优先于 ALLOW，对非管理员无条件生效。因此即使 `天阙九泉\27063:(I)(OI)(CI)(F)` 给了 Full Control，本用户与 `explorer.exe` **仍不能删除 `C:\Users\27063` 任何子目录内的文件**，因为 `Everyone` 的 DENY 先掐死了 `FILE_DELETE_CHILD`。

**为什么表现为白纸图标**：explorer 重建图标缓存要**先删旧条目再写新的**，删不掉 ⇒ 新图标写不进 ⇒ 白纸。旁证：`.exe` 图标正常（读 exe 内嵌资源，不走删缓存这条路径），只有 `.lnk` 白——正好卡在「需要删缓存」这一层。`iconcache_idx.db` 一直在更新（116,496 字节、时间戳前进）说明 explorer 一直在尝试写但写不完整。

同一 deny 继承到整个 home，顺带解释：`%LOCALAPPDATA%\Temp` 里删不掉的文件、程序清缓存失败、桌面/下载里「删了没反应」。

**污染时间线**：`session-a6a281f1` 自 2026-09-25 起以 `workspace-write`、cwd = `C:\Users\27063` 运行，每次调 bash 就走一遍 `grantWrite()`。这与用户所述「老毛病」起点吻合。

## 2. 操作教训一：`icacls /remove` 删不掉继承 ACE，且会**假成功**

第一轮 `icacls "<dir>" /remove:d Everyone /T` 打印 `Successfully processed 34 files; Failed processing 0 files`，复查 ACL **那条 deny 原封不动**。

原因：它是**继承来的** ACE（带 `(I)`）。`icacls /remove` 只能删显式 ACE；继承的删掉后父目录下次复位又发下来。

**正确顺序是先断继承再删**（`/inheritance:d` = 先复制下继承项为显式再断开，SYSTEM / Administrators / 本用户权限一条不丢）：

```cmd
icacls "<dir>" /inheritance:d
icacls "<dir>" /remove:d Everyone
icacls "<dir>" /setintegritylevel "(OI)(CI)Medium" /T
```

一条判据：**icacls 的 "Successfully processed N files" 不代表 ACL 变了**，改完必须用 `icacls` 回读 AFTER 段比对。

## 3. 操作教训二：在 home 根上 `/T` 铺 165k 文件跑不完

在 `C:\Users\27063` 根上做 `/inheritance:d` + `/remove:d`，Windows 要把新继承重新铺到约 **16.5 万个文件**上。实测跑了几分钟后进程自行退出，ACL 停在半更新状态，`/remove` 那一步从未执行。因此**不要在 home 根上带 `/T` 做重继承**；只处理具体子目录（如 Explorer 缓存目录），根上要么不带 `/T`（断根，仅影响后续新建项），要么接受它慢慢传播。

## 4. 操作教训三：per-item 图标缓存 ≠ `iconcache_*.db`

删磁盘上的 `iconcache_*.db` + 重启 explorer 只清了后者。**Explorer 另有一套 per-item 图标缓存**（内存/另一套结构中），且它认为自己的条目是新鲜的，所以永远不重新问图标资源。社区证据（unslothai/unsloth commit 3ff365b）：

> blank shortcut icons are a stale Explorer **per-item** icon cache: when a same-name `.lnk` is recreated across reinstalls, Explorer caches the previously-resolved (often generic "white page") icon and won't re-extract the .ico on its own.

**这解释了「换桌面到 D 盘」为何曾修好**：换路径让所有 `.lnk` 的身份全变，per-item 缓存整张作废。那是把缓存表扔掉，不是修好了。现在桌面已重定向到 `D:\Desktop`（`HKCU\User Shell Folders` → `Desktop = D:\Desktop`），**换无可换**，该捷径失效。

## 5. 本轮实际做过的动作与程序

1. 二级清理：先只对 `C:\Users\27063\AppData\Local\Microsoft\Windows\Explorer` 做 `/remove:d Everyone /T`（第一次失败，见 §2）→ 改 `/inheritance:d` 后成功，删掉 `Everyone(DC)` deny 并把该目录 label 提到 Medium，停 explorer、清 30 个缓存文件、重启 explorer。**保留** capability SID 那条（它只授写权限，不拦删除，无害）。
2. 该目录已被 `/inheritance:d` 从 root 继承链上摘出，**以后不会再被 root 上那条 deny 污染**。
3. per-item 缓存重通知：`.dsh-lab/tools/renotify-lnk-icons.ps1`，对三个根下全部 `.lnk` 逐个发 `SHChangeNotify(SHCNE_UPDATEITEM)`，再 `ie4uinit -show`：

   ```
   D:\Desktop                                       183 个 .lnk
   %APPDATA%\Microsoft\Windows\Start Menu\Programs   88
   %PROGRAMDATA%\Microsoft\Windows\Start Menu\Programs 201
                                         notified    472
   ```

   该脚本只发通知、不动文件，可反复跑。执行后本轮用户反馈「没有改善」——即单纯重通知不足以让 per-item 条目失效。

## 6. 现状与残留（未解决项）

- `C:\Users\27063` 根上三条 ACE **仍在**（`Everyone:(CI)(DENY)(DC)`、capability SID、`Low Mandatory Level`）。影响：**新建**的文件/目录仍继承那条 deny，某些删除仍会「没反应」。
- 图标问题在本轮结束时**未解决**。用户的下一步选项：根上不带 `/T` 断根（慢，165k 文件）、或先放着。社区对「删缓存 + 重启 explorer + 重注册 shell 都无效」的标准结论是 `sfc /scannow` / `DISM /RestoreHealth`，最后是新建用户配置文件。
- 另注：`D:\Desktop` 属性带 `ReadOnly`（目录上的 ReadOnly 位在 Windows 上无实际语义，不是拦截原因）。
- 环境噪声提示：写 PowerShell 落盘时别用 bash heredoc 包带引号的 ps1，本轮仍出现过 `unexpected EOF while looking for matching '"'` 的失败；先写文件再执行。

## 7. 旁证（社区）

微软 Q&A 帖 [Win11 26H2 新建桌面快捷方式无图标（白纸），重建图标缓存无效](https://learn.microsoft.com/zh-cn/answers/questions/6049274/win11-26h2)：症状一致（白纸、蓝箭头在、双击可开、重建缓存无效），回答直接指向「用 deepseek Harness 把桌面当工作区，会把桌面文件夹打上 Low 标签且不还原」。与本轮 `icacls` 挖出的 ACE 独立吻合。

## 参考

- `a8a10cd0-28d7-473f-8466-d7c8c76e3f3c` — 2026-10-06 机制层定案：profile 树整体 Low Mandatory Level 导致 shell 降级图标。
- `d71561f3-518a-4e33-ad58-fd71036a1a25` — 2026-10-05 失败点收敛到 `.lnk` 的 IconHandler（PE 取图标失败、读独立 `.ico` 成功）。
- `741c915f-574f-4130-afa9-5d4db87b26e4` — 2026-10-07 D 盘不可写：dsh sandbox 把工具子进程降为 Low IL，no-write-up 拒绝写 `D:\*`。
