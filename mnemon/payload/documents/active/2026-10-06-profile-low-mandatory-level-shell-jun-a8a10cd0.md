---
id: "a8a10cd0-28d7-473f-8466-d7c8c76e3f3c"
title: "2026-10-06 白纸图标机制层定案：profile 树被整体降为 Low Mandatory Level 导致 shell 主动降级图标，junction 修复生效"
description: "白纸图标第十轮：用同目录同内容仅改 IL 的单变量实验，把根因从「路径维度」推进到机制层——C:\\Users\\27063 整棵 profile 树是 Low Mandatory Level（继承全树），shell 对低完整性内容降级图标；含 ACL 与 Default 模板逐条对照、icacls 可逆修复、三个 junction 修复与备份副作用、回滚路径、否证清单与仍未确证的元凶。"
status: "active"
created_at: "2026-10-06T08:25:59.902Z"
updated_at: "2026-10-06T08:25:59.902Z"
content_hash: "03a03952ccc583548b3694b3f14e20c7761e03c79067c2e5ee583ff700c92cd4"
source_paths:
  - "PLAN.md"
session_ids:
  - "546d361a-287b-4c14-a2c8-c8c147cec7d1"
memory_body_ids:
  []
---

# 2026-10-06 白纸图标机制层定案：Low Mandatory Integrity Level

承接既有文档（本轮结果与它们的假说不同，部分推翻）：
- `c97a2a01-a6de-4ed5-951c-52cb0d00cd2b` —— 2026-10-05 定案「Windows cumulative update InstallPending / 组件版本不同步」
- `d71561f3-518a-4e33-ad58-fd71036a1a25` —— 2026-10-05 第三轮「失败点收敛到 .lnk 的 IconHandler」
- `791df5ae-94eb-427f-ad49-bc550e56c075` —— 2026-10-06 第八轮「实测否证火绒/杀软」

## 判据（可复用指纹）

| 状态 | `SHGetFileInfoW` 的 `iIcon` | 渲染非灰种类数 |
|---|---|---|
| 白纸 | `0` | ≈48（空白文档图标） |
| 正常 | ≥50 | ≥300 |

任务栏 pin 的核验方式是逐个 `SHGetFileInfo` 取 idx：正常表现为 idx 连续且各自独立（本轮 10 个 pin 得到 50–59）。

## 机制层根因

**`C:\Users\27063` 整棵 profile 树被程序化重写 ACL 并降为 `Mandatory Label\Low Mandatory Level`，该 label 以 `(OI)(CI)` 形式继承到每一个子对象**（连 `NTUSER.DAT` 都是 Low IL，正常系统绝不如此）。shell 读 lnk 自身时，对「低完整性 = 不受信任内容」主动降级图标（与 IE Protected Mode 临时文件的标记同类）。

要点：**这不是权限拒绝，是 mandatory access control 的主动降级。**
- DACL = discretionary access control（谁被允许访问）
- SACL 上的 mandatory label = mandatory access control（对象本身的可信等级）

两者失效模式完全不同，因此出现「ACL 明明给了 `用户:(F)` 完整权限，图标却是白的」这种反直觉现象。

### 决定性单变量实验

同一目录、同内容、同 DACL、全新文件名、同时创建：

| 文件 | 唯一变量 | iIcon | nongray | 结果 |
|---|---|---|---|---|
| `t5c.lnk` | `setintegritylevel Medium` | 50 | 511 | 彩色 |
| `t5d.lnk` | `setintegritylevel Low` | 0 | 48 | 白纸 |

### 端到端可逆验证（不需要管理员权限）

对测试目录执行 `icacls /setintegritylevel "(OI)(CI)Medium" /T /C` 后，**同一路径、同一源文件** `t0.lnk` 从 `idx=0 nongray=48`（白）变为 `idx=50 nongray=511`（彩）。

⇒ IL 是**唯一控制变量、且可逆可控**。

> 置信度说明：机制部分为**高置信假说**，不是定论。已确认 IL 是唯一变量且可控，但 Windows 内部在哪一步分支退出、无调试器无法确定。

### 行为层现象（此前只描述到这一层，现已被机制解释）

决定因素是**文件自身路径在 `C:\Users\27063\` 树内**，与 target / 内容 / 大小 / 新旧 / 杀软无关：
- 逐字节相同的 lnk 放 `D:\` 彩、放 Desktop 白
- lnk 在 D 盘而 target 在 `AppData\Local\Programs\` 仍**彩**
- 显式 `IconLocation` 指向树内则白，改成 `,0`（退回 target 解析）即彩
- **junction 路径也彩** —— shell 会把 junction 解析到真实目标，所以 junction 不是玄学绕过，它做的正是「把数据实体移出被污染的 IL 树」

## ACL 逐条对照（`C:\Users\Default` 模板 vs `C:\Users\27063`）

| ACE | `C:\Users\Default` | `C:\Users\27063` |
|---|---|---|
| `SYSTEM` / `Administrators` `(OI)(CI)(F)` | ✓ | ✓ |
| 用户自己 `(OI)(CI)(F)` | — | ✓（正常） |
| `Everyone:(RX)` | ✓ | ✓ |
| `Everyone:(OI)(CI)(IO)(GR,GE)` | ✓ | **被删** |
| `BUILTIN\Users:(RX)` | ✓ | **被删** |
| `BUILTIN\Users:(OI)(CI)(IO)(GR,GE)` | ✓ | **被删** |
| `Everyone:(CI)(DENY)(DC)` | — | **多出** |
| `S-1-4-1049387402-452331294:(OI)(CI)(W,D,DC)` | — | **多出**（未知 SID） |
| `Mandatory Label\Low Mandatory Level` | — | **多出**（`(OI)(CI)(NW)`，继承全树） |

`C:\Users\27063` 上**没有任何 `(I)` 继承标记**。形态像一次程序化 ACL 重写：删标准继承项 → 加 DENY → 给未知 SID 写权限 → 降完整性级别。

对照结果：`C:\Users\Default` / `admin` / `dev` / `runner` / `Public` / `ProgramData` / `D:\` 全部是标准继承且**无** mandatory label。⇒ **白纸问题只钉在 `C:\Users\27063` 这一个 profile 上，换账户或新建账户不会复现。**
（`C:\Users\dsh_test_temp`、`WsiAccount` 当前账户读不到 ACL，未验。）

## 修复（已生效）

1. `Desktop` → `D:\Desktop` + junction 反指
2. `%APPDATA%\...\Quick Launch` → `D:\ExplorerData\Quick Launch` + junction
3. `%APPDATA%\Microsoft\Windows\Start Menu` → `D:\ExplorerData\Start Menu` + junction
4. 10 个 `IconLocation` 指向树内的 lnk 改成 `,0`（每个留 `.bak-iconloc`）

**核验结果**：任务栏 10/10（idx 50–59 连续）、开始菜单 87/89、桌面树 173/181 全彩；`D:\Desktop` 顶层结构完好（`工具箱\会话断点\fix-2026-10-04`、`程序\` 内 QQ/Steam/微信 lnk、`课程文件\` 内 `006算法导论`/`100b实分析`）。

**该修复是症状级的** —— 以后在 `C:\Users\27063` 里新建的 lnk 仍会白。

### 副作用（重要）

桌面 / 开始菜单 / Quick Launch 的**实体已在 D 盘**，而备份工具默认跳过 reparse point ⇒ 备份 `C:\Users\27063` 会漏掉这三处，必须把 `D:\Desktop`、`D:\ExplorerData` **显式加入备份**。

### 回滚

`D:\Desktop\工具箱\会话断点\fix-2026-10-04\before-desktop-move\`（含 .reg + README）；修复报告见同目录 `图标白纸-修复报告-2026-10-06.md`。

## 根治选项（当时交用户决定，未决）

- **① 保守**：只改 profile 根的 IL（不 `/T`），让以后新建的文件不再继承 Low。风险最低、可回滚。
- **② 根治**：按顶层子目录**分批** `icacls /T` 整棵树恢复 Medium（需先估规模，分批限时执行）。
- **③ 不动**：维持 junction 现状。

待用户确认的前置问题：**aTrust（深信服）是自己装的还是学校/单位合规要求装的** —— 合规软件可能周期性重置 IL 甚至告警。

## 已否证 / 已排除

系统更新、病毒、ACL（DACL 加 `Everyone` / `INTERACTIVE` / `ALL APPLICATION PACKAGES` 全无效）、文件属性、`ProfileImagePath`、KnownFolder、User Shell Folders、iconcache + thumbcache、CLSID 遮蔽、overlay、BagMRU、DPI、**火绒**（关文件监控 + 加信任区后结果不变）、**target 的 IL**（lnk 在 `D:\`、target 指向 C 树内 Low IL 文件照样出图标 ⇒ 触发点在「读 lnk 自身」，不是解析 target）。

## 元凶：仍未确证

- 火绒：配置 / 二进制 / 日志 grep 全无命中（与 `791df5ae` 一致）
- aTrust（深信服）：嫌疑**下降** —— 只装了 `aTrustNetflt_0` = 网络过滤驱动 `C:\Program Files (x86)\Sangfor\aTrust\NetfltDriver\SdpNetFilter0.sys`，**没有文件系统过滤驱动**；二进制与日志 grep 不到 SID 或 IL 相关字符串
- dsh 历史里搜到 3 处提到 `Mandatory Label`，全是**讨论文本**（2026-10-04 17:58、2026-10-05 21:56 SSH 会话 token 提权、2026-10-06 14:44 同内容），**无任何执行 `icacls /setintegritylevel` 的痕迹**

结论：**不下断言，不编答案。**

## 复用教训

1. **同目录单变量对照实验**是定位机制层根因的最强手段：控制路径、内容、DACL、文件名、创建时间，只翻转 IL，一次即可定性。
2. **ACL 允许 ≠ 对象可信**：排查「权限明明够但功能异常」时，必须单独查 `icacls` 输出里的 `Mandatory Label`（SACL），不要只看 DACL。
3. **截图 / 观测有时点偏差**：用户截图拍于 15:52，explorer 于 15:53:13 才重启（系统 `LastBootUpTime` 07:34，未重启过系统），该截图反映的是旧 explorer 状态 —— 拿旧截图判断「修复无效」会得出假阴性。任务栏 / 开始菜单有自己的 cache，改完必须确认 explorer 真的重载过。
4. **junction 会让备份漏数据**：修复手段本身引入备份盲区，改路径时同步更新备份清单。
5. 本机环境 `qwinsta` / `query user` 不存在（`System32` 下无实体），改用 `Get-CimInstance Win32_Process` 按 `SessionId` 分组来枚举会话更可靠；`Session 4` + `LogonUI.exe` + `RustDesk.exe` 是当前用户自己的锁屏/远程会话，`Win32_LoggedOnUser` 只列出 `27063`，**不存在第二个真实账户**。
6. 写 ps1 落盘时不要用 bash heredoc 包 PowerShell 单引号（`-join ' | '` 会截断 heredoc），先写文件再执行。
