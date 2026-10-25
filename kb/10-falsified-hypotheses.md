# 10 · 否证档案：一个完整的"假说绞肉机"案例与可复用的否证纪律

> 本篇不写结论，写**结论是怎么被逼出来的**。
> 样本：2026-10-04 → 10-05 的「白纸图标」事件 —— 15 条假说被逐条否证，中途还有一次对**自己诊断结论**的重大更正。
> 这类档案的价值：下一次遇到"看起来像 A 其实是 Z"的问题，你能少花三小时。

---

## D 定论

**D1 · 一个"排除清单"比一个"结论"更耐用。**
结论会随新证据变；排除清单（每条附否证方式）不会。它把搜索空间真的缩小了，而结论只是当前最优猜测。

**D2 · 否证强度取决于对照。** 没有阳性对照的探针，只能证明"探针没报错"，不能证明"现象不存在"。

**D3 · 单点测量不是测量。** 至少一个阳性点 + 一个阴性点 + 一个方向性预测，才配叫证据。

**D4 · 诊断结论本身也要被否证。** 本案中间出现过「两条 API 路径在同一进程内分歧」的解释，后来被推翻（真正的分界是"该路径有没有现成的好 iconcache 条目"）。

**D5 · 「我做了什么修复」必须和「现象变了吗」分开记录。**
本案里 `ie4uinit -show`、`SHGetFileInfo` 预热都被当作"修复"试过，实测**逐位不变**；如果不分开记，很容易写成"试了一些方法后好了"。

**D6 · 外部安全软件在场时，"设置里关掉它"不等于"它不在生效"。**
用户"关闭火绒"只是关了面板，`dtrampo.dll` 仍注入全部 5 个 explorer 进程，驱动与 HipsDaemon 仍在跑。判据要用进程内模块 / 服务状态，不是 UI 开关。

---

## M 机制

**M1 · 为什么长尾故障会吞掉大量假说：可观测面太窄。**
"图标显示不对"只有"对/不对"一个二值观测，所有假说都能解释它 —— 所以必须先**把现象量化**（`sat` / `lum` / `bright_px` / `iIcon` 索引），把二值观测升级成多维向量，假说之间才会开始互相排斥。

**M2 · 为什么"看起来矛盾的两条 API"其实是同一个真相。**
当 `SHGetFileInfo(SHGFI_ICON)` 给彩色、`IShellItemImageFactory` 给白纸时，第一反应是"两条 API 分歧"。更省的第一性解释是：**两者读的是不同的数据源/缓存条目状态**，而"缓存条目是否存在"才是自变量。分清"观察层"与"数据层"能省掉一整轮排查。

**M3 · 为什么修复动作常常"看起来有效"：惰性分配与缓存回填。**
iconcache 的 24 B 快照不是写入失败（惰性分配），随后 32/48/256 尺寸都会涨到 1 MB。任何"操作后数字变了"的观测，都要先排除"它本来就会变"。

**M4 · 为什么探针会静默失效：编码层的隐性不匹配。**
PowerShell 5.1 读**无 BOM 的 UTF-8** `.ps1` 时按 GBK 解码 ⇒ 脚本内中文字面量与真实 Unicode 标题永不相等 ⇒ `dialog_count=0` 是假阴性，而不是"没有对话框"。**探针的失效模式必须被显式验证。**

---

## J 判据

**"我已经排除它了"是否成立（三问）：**

1. 我用的探针，在**已知阳性样本**上给出过阳性吗？（阳性对照）
2. 这个否证是**方向性**的吗？（比如"改成 0 后仍是白纸"才算，而不是"我看到它是 3"）
3. 有没有第三条假说能同时解释旧证据 + 新否证？

**本案最终可复现的分界线（最有用的判据）：**

> **唯一的自变量 = 该路径有没有现成的好 iconcache 条目。**
> 已缓存的 `desktop/Git Bash.lnk` → `colored sat=124.3`；
> 同一文件 `Copy-Item` 到新路径 → `blank sat=0.6`；
> 新建的 8 个 lnk（含显式 `IconLocation`）→ 全白。

这条判据能预测"未被观测过的结果"（任何新路径的 lnk 都会白），所以它是结论；其余只是描述。

**复发的操作顺序（勿跳）：**

1. 先看"有没有新的、未被缓存过的 .lnk" → 若只有新 lnk 白，落在本案；
2. 查 iconcache 相关键/文件与安全软件注入状态（进程内模块，不是 UI）；
3. 只用**多点 + 阳性对照**的探针下结论；
4. 任何"修复"必须配"逐位不变"的反向验证。

---

## X 反例

**下方全部为实测否证（2026-10-04/05，勿重复）：**

| # | 被否证的假说 | 否证方式 |
|---|---|---|
| 1 | MOTW / `Zone.Identifier` 污染 | 目标 exe 全 `MOTW=no`；且阳性对照证明检测法灵敏 |
| 2 | `ZoneMap/ProtocolDefaults/file` 值错误 | 改成 0 后**全新 lnk 仍白**，已还原为 3；HKLM 也是 3 |
| 3 | `IconLocation` 空导致 | 40 项交叉统计**零相关**：空→4 彩 18 白 / 非空→5 彩 13 白 |
| 4 | `lnkfile` 注册链缺失 | `CLSID={00021401-…}`、`shellex/IconHandler`、`DropHandler`、`.lnk/ShellEx/{E357FCCD..}` 全在；HKCU 无覆盖 |
| 5 | 组件版本错配（26100 vs 26120） | `BuildLabEx=26100.1` ⇒ 26H2 是 enablement package，全部 26100.x 属正常 |
| 6 | 系统组件损坏 | `CBS.log` 无 `Cannot repair` / `corrupt` 记录 |
| 7 | AppX 包异常 | 195 包仅 3 个 `Microsoft.Office.*` 组件 `Disabled`；关键 shell 包全 `Ok` |
| 8 | `Shell Extensions/Blocked` / `HKCU\Software\Classes\lnkfile` 遮蔽 / `TreatAs` / `Shell Icons` / `MaxCachedIcons` | 逐项检查无异常 |
| 9 | TEMP 不可写 | 强制 `TEMP=C:/Users/27063/AppData/Local/Temp`（可写）⇒ 结果**逐位相同** |
| 10 | `SHGetFileInfo` 预热能喂进缓存 | 预热前后 `IShellItemImageFactory` **逐位不变** |
| 11 | 磁盘空间 / 目录 ACL / junction 机制 | C: 69.4 GB free；`C:/Windows/Installer` 是**普通目录**，社区那条 symlink 机制不适用 |
| 12 | `ie4uinit.exe -show` 能重建缓存 | 执行后 12 个图标统计**逐位一致** |

**另外三条"看起来是结论、其实被推翻"的判断：**

- **X-a · "explorer 死了"** —— 重大更正：explorer **从头到尾没有死过**。任务栏图标缺失是另一条线（`Shell_TrayWnd` 不在窗口列表）的表象。
- **X-b · "两条 API 在同一进程内分歧 = 两个数据源坏了"** —— 已更正，见 M2。
- **X-c · "用户关了火绒所以排除它"** —— 只是关了面板；`dtrampo.dll` 仍注入 5 个 explorer 进程，`hrdevmon`/`hrndis6`/`hrwfpdrv`/`sysdiag` 驱动全 Running，`HipsDaemon`/`HRWSCCtrl` 仍在跑。**`taskkill /F /IM explorer.exe /T` 杀不死 explorer 本体**（进程保护生效）也是同一方向的证据。

**顺带确证的独立问题（不是本案根因，但要修）：**

- `ShellIconOverlayIdentifiers` 19 项 > 上限 **15**：WPS(`qingnse64.dll`) 4 + 百度网盘(`YunShellExtV164.dll`) 7 + OneDrive 7 ⇒ `OneDrive5/6/7` 与系统 `EnhancedStorageShell`(`EhStorShell.dll`) 被**静默丢弃**。
- `TEMP`/`TMP` 曾为 `D:/Temp`：本进程写它报 `PermissionError(13)`，`C:/…/Temp` 可写 ⇒ 已改回 `%LOCALAPPDATA%/Temp`（写 HKCU 无需提权，**需重启生效**）。

---

## R 复现

**量化探针（Python + ctypes，避免 PS 5.1 的编码陷阱）：**

```python
# IShellItemImageFactory::GetImage(48, SIIGBF_ICONONLY) → 计算 sat / lum / bright_px
# 判据：blank ≈ sat 0.6 / bright_px 34%；colored ≈ sat 124.3
```

**阳性对照（必须同时跑）：**

```bash
timeout 30 ls -l "/c/Users/27063/Desktop/Git Bash.lnk"   # 已缓存样本
timeout 30 cp "/c/Users/27063/Desktop/Git Bash.lnk" /c/Users/27063/Temp/lnktest/   # 未缓存样本
```

**安全软件在场判据（不要看 UI 开关）：**

```bash
timeout 30 powershell -NoProfile -Command "Get-Process explorer | ForEach-Object { \$_.Modules | Where-Object { \$_.ModuleName -like 'dtrampo*' } | Select ModuleName }"
timeout 30 powershell -NoProfile -Command "Get-Service HipsDaemon,HRWSCCtrl | Select Name,Status"
timeout 30 powershell -NoProfile -Command "Get-CimInstance Win32_SystemDriver | Where-Object { \$_.Name -like 'hr*' -or \$_.Name -eq 'sysdiag' } | Select Name,State"
```

**备份资产位置（可回滚）：**

```
C:/Users/27063/Desktop/工具箱/会话断点/fix-2026-10-04/
  ZoneMap-backup.reg  HKCU-lnkfile-backup.reg  IconCache.db.bak
  Taskband-backup.reg  LanmanServer-Shares.reg
诊断套件：C:/Users/27063/AppData/Local/Temp/dsh-diag/
```

---

## S 溯源

- `~/.dsh/PLAN.md` 三段连载：
  - 「★ 白纸图标问题：全链路排查结论（2026-10-04 23:xx）」
  - 「★ 白纸图标问题：已解除（2026-10-05 00:2x）—— 结论、机制、判据」
  - 「★★★ 白纸图标：根因定位完成 + 我造成的加重（2026-10-05 03:1x）」
  - 以及「★★ 重大更正 + 真正的根因方向（2026-10-05 00:5x）」
- 桌面侧完整复盘见 [`04-desktop-and-ui.md`](04-desktop-and-ui.md)；方法论层见 [`01-agent-protocol.md`](01-agent-protocol.md)
