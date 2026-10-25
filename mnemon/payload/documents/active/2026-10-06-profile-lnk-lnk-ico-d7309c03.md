---
id: "d7309c03-8cf2-4f6e-a986-0e3c17b80601"
title: "2026-10-06 白纸图标第七轮：位置维度分裂（profile 树内 lnk 必白、树外同字节 lnk 彩色），探针判据统一，并否证第三轮「读独立 .ico 成功」"
description: "白纸图标第七轮实测：同一份 md5 相同的 lnk 只换位置即分裂——C:\\Users\\27063\\ 树内（Desktop/Temp）→ idx=0、非灰 48 种、白占比 0.76 → WHITE；C:\\Users\\Public\\ 与 D:\\ → idx=50、非灰 511 → COLOR，与裸 notepad.exe 同图标。统一探针判据（旧「非灰>=3」把带蓝箭头的白纸误判为 COLOR，导致误报「两条 API 分裂」）。反例否证第三轮 d71561f3 的「读独立 .ico 成功」（D:\\zzicons\\dsh_real.ico=WHITE 而 dsh_src.png=COLOR）。否证 ProfileImagePath / KnownFolder / User Shell Folders 存在性 / ACL / iconcache；撤回 {031E4825} CLSID 遮蔽假说。HKCR\\lnkfile 无 DefaultIcon ⇒ 无 fallback。社区检索无精确匹配。含清理状态与 A/B/C/D 待定方案。"
status: "active"
created_at: "2026-10-06T05:21:19.441Z"
updated_at: "2026-10-06T05:21:19.441Z"
content_hash: "1cd22ac77574367a0538c1770062e7e3a1eaeaa30a2ff259c45bc2ef4cc2c1eb"
source_paths:
  - "PLAN.md"
session_ids:
  - "89e26276-442d-476d-9068-4bf9bf1e0a91"
memory_body_ids:
  []
---

# 白纸图标第七轮：位置维度分裂与判据统一

> 承接同一故障线的既有文档（本轮不重复其内容，只记录新增证据与修正）：
> - `d71561f3-518a-4e33-ad58-fd71036a1a25`（第三轮：失败点收敛到 `.lnk` 的 IconHandler）
> - `c97a2a01-a6de-4ed5-951c-52cb0d00cd2b`（定案：cumulative update InstallPending）
> - `f94f359a-90cb-439c-b2c3-8ce874fa16ef`（第六轮：48/32 档分裂、临时账户对照）
>
> **本轮对上面第一篇的结论有直接反例，见「三」。**

## 一、核心新证据：位置维度分裂（同字节 lnk，只换位置）

同一份 `.lnk`（内容逐字节相同，md5 一致），同一时刻、同一套 DLL、同一账户下只换存放位置，用两个 API 各测一次：

| lnk 位置 | `SHGetFileInfo` | `IShellItemImageFactory`（explorer 实际用的那条） |
|---|---|---|
| `C:\Users\27063\Desktop\zzu_desktop.lnk` | `idx=0`，非灰 **48** 种，白占比 0.76 | WHITE |
| `C:\Users\27063\AppData\Local\Temp\dshprobe\zzu_temp.lnk` | `idx=0`，非灰 **48** | WHITE |
| `C:\Users\Public\dsh-icontest\samples\zzu_public.lnk` | `idx=50`，非灰 **511** | **COLOR** |
| `D:\zzu_d.lnk` | `idx=50`，非灰 **511** | **COLOR** |
| 裸 `C:\Windows\System32\notepad.exe`（对照） | `idx=50`，非灰 537 | COLOR |

判读：**非灰 48 种 = 白纸 + 蓝色快捷箭头**（即用户看到的「白纸」）；树外 lnk 拿到 `idx=50`，与裸 `notepad.exe` 是**同一颗图标**。

⇒ 收敛边界：**凡是需要 shell 去读 `C:\Users\<user>\` 树内文件内容才能解析出的图标，全部失败。**

用户可肉眼自验（`桌面\工具箱` 22 个 lnk）：彩色 4 个 = `dev-sidecar`(`D:\devsidecar\...`)、`Git Bash`(`C:\Git\mingw64\...ico`)、`GNU Octave`(`D:\Octave-11.3.0\...ico`)、`Radmin VPN`（空 → `Program Files`）；其余为白纸，其 `IconLocation` 均落在 `C:\Users\27063\AppData\Local\Programs\...` 或 `C:\Users\27063\Desktop\工具箱\...`。分裂点与路径位置一致。

## 二、探针判据教训（本轮最重要的方法论修正）

旧判据 `非灰种类 >= 3` 就把「白底 + 蓝箭头」判成 COLOR，因此此前**误报**「`SHGetFileInfo` 与 `IShellItemImageFactory` 两条 API 分裂」。

- 正确做法：白占比 + 非灰种类**量级**对比（~48 vs ~511），并与**裸 target exe** 的测量结果做同轮对照。
- 修正后：**两个 API 其实一致**，都是「树内 → 白纸，树外 → 正常」。

另一条探针噪声：`BagMRU`/`Bags` 的「非法 PIDL」统计把 `MRUListEx`、`Sort`、`ColInfo` 这类非 PIDL 二进制值也算进去了（`MRUListEx` 尾部本就是 `FF,FF`），所以那一列计数**不能**单独作为 PIDL 损坏的证据。仅记录到的事实：`HKCU\...\Local Settings\...\Shell\BagMRU` 子键 1246、`Bags` 子键 4017（异常大）、且旧位置 `HKCU\Software\Microsoft\Windows\Shell\BagMRU` 仍并存一份。

## 三、对第三轮文档结论的否证（本轮反例）

第三轮 `d71561f3` 记录「PE 资源取图标分支失败，**读独立 `.ico` 成功**」。本轮直接反例，`D:\zzicons`（**在 D 盘，完全不在 profile 树**）下：

| 文件 | `img48` | `shgfi32` |
|---|---|---|
| `D:\zzicons\dsh_real.ico` | **WHITE** | `idx=0` |
| `D:\zzicons\dsh_src.png` | **COLOR** | — |

⇒ 「`.ico` 可读」不成立；位置不是唯一变量。当前观测到的分档是：**`.ico`/`.lnk` 白，`.exe`/`.png`/文件夹彩**。对既有文档的相关结论应视为**待重新验证**，不能继续引用为定论。

## 四、本轮否证与撤回清单

已否证（均有实测）：
- `ProfileImagePath`：完全正确。
- 全部 KnownFolder 解析成功；`ComputerFolder` 的 `HR=0x80004005` 是虚拟文件夹的正常表现。
- `User Shell Folders` 每一项（含全部 GUID 项）展开后目录**均存在**。
- ACL、文件属性（无 reparse point / 加密 / 压缩）。
- iconcache / thumbcache：改 mtime 无效；16→512 全尺寸表现一致。

**撤回**：此前提出的 `{031E4825}` CLSID「遮蔽型损坏」假说错误——它是连 `InprocServer32` 子键都没有的**空键**，而 HKCR 合并是**逐子键**进行的，空键不遮蔽任何东西。

新增结构性解释：`HKCR\lnkfile` **没有 `DefaultIcon`**（实测该类只有 `CLSID, shellex, tabsets`），所以 `.lnk` 图标**只能**靠 IconHandler 解析 target，没有 fallback —— 这条路一断就是白纸。

## 五、社区检索结论（明确「不存在现成方案」）

用 `cn.bing` 会被降级成导航页，可用通道：`www.bing.com?mkt=en-US`、Bing RSS、StackExchange 官方 API、GitHub raw 拉 MicrosoftDocs 源文档。检索结论：**没有该症状的精确匹配案例**。最接近两条：

- `superuser/1705106`（exe 与快捷方式全变 blank page）：作者自答根因是**文件夹 ACL**（`Get-Acl 'C:\Program Files\' | Set-Acl C:\bin\`）——已核，**本机不适用**。
- `superuser/1276824`（**某一个**用户账户图标缺失、其它账户正常）：症状形态一致，但**至今零回答、未解决**。

⇒ 对「是不是系统更新导致」：**不是**。同一份字节、同一时刻、同一套 DLL，只在路径维度分裂；系统文件对两个账户完全相同，而新账户正常。系统更新做不出这种效果。（与 `c97a2a01` 的 InstallPending 定案存在张力，需继续验证。）

## 六、当前状态与待定方案

- **根因仍未锁定**，不宣称锁定。
- 清理已完成：桌面只剩 `desktop.ini`、`工具箱`、`程序`、`课程文件`；`桌面\工具箱` 保留原有 **22** 个 lnk；D 盘仅剩用户原有的 `Snipaste - 快捷方式.lnk`、`zzloc.lnk`；`D:\` 与 `C:\Users\Public\` 下的测试文件已清。iconcache/thumbcache 目录未改动。
- 用户已明确**禁止写注册表**，方案 D 需此前提，暂不可行。

待用户选择的方案（assistant 未自行执行）：

| | 方案 | 依据 | 代价 | 风险 |
|---|---|---|---|---|
| **A** | 迁移到新账户（图标取决于 HKCU，可用 junction 把 `Desktop`/`Documents`/`.dsh` 指回原目录，不搬数据） | 用户已肉眼验证新账户正常 | 需重登把凭证放注册表的软件 | 低，可回退 |
| **B** | 把 Desktop 重定向到 `D:\`（只改 `User Shell Folders\Desktop` + 移动文件） | `D:\` 下同一份 lnk 稳定 COLOR，多次复现 | 桌面路径改变 | 中；**不确定 explorer 是否遵循探针规律**（explorer 有自身缓存，探针是独立进程），需重启一次验证 |
| **C** | 不动系统，用 `Win+R` / 开始菜单搜索 / Everything 启动 | 功能已确认正常 | 观感差 | 零 |
| **D** | 用 `RegLoadKey` 交叉加载两个账户 hive 做 bisect | 探针可复现症状，具备 bisect 条件 | 需写注册表（已被禁止）+ 注销后操作 | 中高 |

建议的**零风险前置验证**：把 `桌面\工具箱` **复制**（不是移动）一份到 `D:\`，重启一次，看 `D:\工具箱\` 里是否变彩。不动任何设置即可验证方案 B 是否成立。

## 七、复现探针要点（供下轮直接复用）

1. 同一份 lnk 同时铺到 profile 树内 / 树外两个位置，**同轮**测量，不要跨时刻对比。
2. 每条结果同时读 `SHGetFileInfo` 与 `IShellItemImageFactory`，并附裸 target exe 作为基准。
3. 判读用「白占比 + 非灰种类量级」，不要用「非灰 >= 3」。
4. 跨账户对照必须用**同一个脚本 + 探针测量**，肉眼判断不足以支撑结论（此前「新账户图标正常」全是肉眼判断）。
5. PowerShell 侧教训：`-f` 格式化与 `-nonewline` 混用会报 `Unexpected token '-nonewline'`；Python 脚本里的 Windows 路径必须用 raw string，否则 `\U`/`\z` 触发 `SyntaxWarning` 甚至 `SyntaxError`。建议脚本写到独立 `.ps1`/`.py` 文件再执行，避免内联引号地狱。
