---
id: "2b88301b-af9e-4a11-85b7-ed82ac3baf04"
title: "2026-10-06 白纸图标第五轮：IconHandler 接口返回分裂（E_NOTIMPL / E_FAIL）、16 项否证清单与 Clean Boot / Repair Install 决策"
description: "白纸图标故障第五轮实测定案：同对象上 IShellLinkW::GetIconLocation 通而 IExtractIconW::GetIconLocation 断（.lnk=E_NOTIMPL 0x80004001，.url=E_FAIL 0x80004005）、PE 导出表三版本 632 个导出零差异、EnforceShellExtensionSecurity/ShellExecuteHooks/EnableShellExecuteHooks 全部否证、BuildNumber 26300 系 enablement package 翻转而 LCU 无可修路径；汇总 16 项否证与仅剩的 Clean Boot / Repair Install 两条路径，含 cleanboot 脚本误执行的只读-破坏性混写教训与三处探测假阴性。"
status: "active"
created_at: "2026-10-05T23:51:17.081Z"
updated_at: "2026-10-05T23:51:17.081Z"
content_hash: "8b479632e1da297b1216b3c9b0157985e442645ab5c02a68e8ae6c08017ef163"
source_paths:
  - "PLAN.md"
session_ids:
  - "c7917746-e5f6-418d-9f20-dc8bdd79a429"
memory_body_ids:
  []
---

# 2026-10-06 白纸图标第五轮：IconHandler 接口返回分裂与 16 项否证清单

> 承接同一故障线的既有文档：
> - `2a3a3f1e-f17c-470d-a66e-f595588d583a`（第一轮：症状定位与 shell extension 审计）
> - `d71561f3-518a-4e33-ad58-fd71036a1a25`（第三轮：失败点收敛到 `.lnk` 的 IconHandler）
> - `41263deb-bd9c-47b3-b371-0bb9f67eb58a`（第四轮：32 档 / 48 档 iconcache 分裂）
>
> 本文只记录**本轮新增的实测**，不重复前述轮次已记录的内容。测试均在 Windows 本机完成，日志时间 2026-10-06 07:4x。

## 一、本轮唯一被确认的核心形态

```
所有 IconHandler 类型失败：.lnk  .url  .library-ms
所有非 IconHandler 类型正常：.exe  .pdf  .zip  folder
跨进程 / 跨架构（amd64 与 wow64）/ 有无杀软用户态注入 —— 行为完全一致
重启不改变
```

结论：这是**系统级、非文件层、无配置开关**的持久故障。重启无效这一点排除了全部「运行时状态」类原因。

## 二、本轮新增的关键实测：接口返回分裂

同一次 `QueryInterface` 成功、但方法返回错误，说明接口**已实现但走不通**，不是「不支持」：

| 目标 | CLSID / 实现 DLL | QI | `IExtractIconW::GetIconLocation` |
|---|---|---|---|
| `.lnk` | ShellLink（`windows.storage.dll`） | S_OK | **E_NOTIMPL (0x80004001)** |
| `.url` | InternetShortcut | S_OK | **E_FAIL (0x80004005)** |

与之复现的对照现象：**同一个对象上，`IShellLinkW::GetIconLocation` 正常**（`WScript.Shell` 能正确读出 `IconLocation`），而 `IExtractIconW::GetIconLocation` 返回 `E_NOTIMPL`。**一个对象、两个接口、一个通一个断**——这是本轮最强的形态证据。

### PE 导出表静态比对（否证「文件版本落后」）

直接静态解析 PE 导出表，比对 amd64 的 **9278** 与 wow64 的 **9549** 两份 `windows.storage.dll`：**三个版本均为 632 个导出，集合完全一致，零差异。** 高版本并不存在低版本缺失的导出 ⇒「文件版本落后导致接口缺失」的假设被实测否证。

### Shell extension 批准列表路径（否证）

基于「IconHandler 是 shell extension，存在只允许批准列表内 extension 加载的策略」这一假说逐条检查：

- `EnforceShellExtensionSecurity` 在三个位置**均不存在** ⇒ Approved 列表不生效；
- 且 `{00021401}` 本就不属于该批准清单（那是给第三方 extension 用的）。
⇒ 该假说否证。

### `EnableShellExecuteHooks` 路径（否证）

发现 `HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\Explorer` 下存在非默认值 `EnableShellExecuteHooks = 1`，它会激活 `ShellExecuteHooks` 登记表。但实测：

- `HKLM`（含 `WOW6432Node`）下的 `ShellExecuteHooks` 键**存在但为空**，`HKCU` 下不存在；
- `ShellServiceObjectDelayLoad` 只有微软自带 `WebCheck`；
- BHO 那 6 项（另 wow64 3 项）属 IE/浏览器，不参与 shell 图标。

⇒ 无 hook 可加载，该路径否证。

### `SHChangeNotify(SHCNE_ASSOCCHANGED)`（否证）

以 `SHCNF_IDLIST|SHCNF_FLUSH` 调用，命令 shell 丢弃内存中的图标/关联缓存并重读。异步等待 5 秒后复测，结果逐项不变（48 档仍为 3/10 正常），「shell 内存关联缓存」假说否证。

## 三、系统版本与更新面（本轮新增事实）

```
BuildNumber   = 26300        （报告为 26H2）
UBR           = 9550
BuildLabEx    = 26100.1.amd64fre.ge_release.240331-1435   ← 基础构建仍是 26100
```

- 26300 是通过 **enablement package** 在 26100 基线上「翻转」出来的，因此 shell 组件文件仍标 `26100.x`；看到 26100 与 26300 并存**不构成版本不一致的证据**。
- 可用更新中**没有任何 LCU / shell 相关更新**（只有 Dell 显示器、Intel 网卡、`KB5128775` OpenVINO）⇒「装个更新修好」这条路不存在。

## 四、非 Microsoft 服务清单（Clean Boot 目标，本轮盘点）

```
HipsDaemon / HRWSCCtrl   Huorong（火绒，用户态注入已单独否证）
NvContainerLocalSystem   NVIDIA
RvControlSvc             Famatech APAC（Radmin VPN）
Tailscale                Tailscale Inc.
RustDesk                 Purslane Tech Pte. Ltd.
GameViewerService        NetEase
Flydigi Space Station    Flydigi
eaio_service / GCUBridge 未识别厂商
```

RustDesk + Tailscale + Radmin VPN 三个远程访问工具并存，这类软件常有内核驱动与 API hook；但 explorer 内只加载了 7 个第三方 DLL（火绒 / WPS / 百度网盘 / OneDrive / Nahimic / Bonjour），**不含这三个**，故它们未做用户态注入。**内核驱动层是本轮之前唯一未排除的层面**，这正是 Clean Boot 的价值。

## 五、操作教训与探测假阴性（重要，防复犯）

1. **只读操作与破坏性操作必须分离到不同脚本**：本轮把「备份非 MS 服务状态」与「`sc config ... start=disabled` + `sc stop`」写进了同一个 `disable-nonms.ps1`，并整体执行；只因脚本**未提权**（10 次调用全部 `[SC] OpenService FAILED 5: Access is denied`）才未生效，事后核查所有服务仍为 `StartMode=Auto State=Running`。`head` 只截断显示，不截断执行。破坏性脚本必须与只读脚本分开，并在执行前先给用户看清单与还原方式（`restore-nonms.ps1`）。
2. **`BindToHandler` 假阴性**：对 `.lnk` 与裸 `.exe` 调用 `SHCreateItemFromParsingName` + `BindToHandler(BHID_SFUIObject, IID_IExtractIconW)` 与 `IQueryInfo`，全部返回 `0x800401E5`（`MK_E_NOOBJECT`）。对裸 exe 也一样返回 ⇒ 是调用姿势问题，该测试作废，不能据此下结论。
3. **`GetUIObjectOf` 早前测试曾被误作废**：`shellpath.py` 中对 `firefox.exe` 的 `GetUIObjectOf(IID_IExtractIconW)` 返回 `0x80004005 pv=None`，当时判为「绝对 PIDL 传错导致整测作废」；本轮意识到 shell 获取 IconHandler 走的正是这条链路，该结果不宜直接丢弃。

## 六、累计否证清单（16 项，其中 12 项为实测否证）

```
✗ iconcache 损坏（删掉后结果逐字节不变，三次验证）
✗ 注册表关联链（.lnk→lnkfile→IconHandler/DropHandler/CLSID 全指向 {00021401}）
✗ 通配 *\shellex\IconHandler 覆盖
✗ UserChoice / Shell Icons / Blocked / Approved / EnforceShellExtensionSecurity
✗ Ext\Stats 禁用
✗ ShellExecuteHooks（键存在但为空）/ ShellServiceObjectDelayLoad
✗ 系统文件完整性（SFC「未找到任何完整性违规」+ DISM「Repairing 0 components」）
✗ 组件版本落后（632 个导出，三个版本零差异）
✗ 火绒用户态注入（无注入的进程结果相同）
✗ DPI 感知 / 调用顺序 / 32 vs 64 位 / 重启
✗ overlay 超限（19 项 DLL 全健康）
✗ AppX / WinRT 运行时（全 Ok）
✗ 可用的 LCU 更新（WU 只有 Dell 显示器 / Intel 网卡 / OpenVINO）
✗ SHChangeNotify 强制重建
✗ 批准列表策略（EnforceShellExtensionSecurity 不存在）
✗ shell 内存关联缓存
```

## 七、下一步：仅剩两条路径（未执行，待用户决策）

### 第一步 Clean Boot（一次重启，可一锤定音）

禁用全部非 Microsoft 服务，彻底排除第三方**内核驱动**这一唯一未排除层面。清单见第四节 10 个服务，还原方式为 `restore-nonms.ps1`。**上一轮因脚本混写而实际未做成**，本轮约定：先给用户看清单与还原方式，用户确认后才执行。

### 第二步 Repair Install（就地升级修复）

若 Clean Boot 后仍坏，则可确定是 Windows 自身。用同版本或更高版本 Windows 11 ISO 运行 `setup.exe`，选「保留个人文件和应用」，重装全部系统组件而不动程序与数据（与用户此前拒绝的「新建账户」是不同方案）。

- **成本/风险**：约 20 GB 空间、30–60 分钟；小概率中途失败需重来。
- **收益**：官方对「文件完好但功能失效」的标准解法，唯一有把握修好的手段。

### 若不修复的兜底

该故障**只影响外观不影响功能**：白图标快捷方式仍可正常启动程序，系统文件完好、无恶意迹象、程序运行正常。绕开图标启动：`Win+R` 输入名字、开始菜单搜索、或 Everything。

## 八、未解决

**根因未定位。** 本轮完成了 `IExtractIconW::GetIconLocation` 返回 `E_NOTIMPL`/`E_FAIL` 而 `IShellLinkW` 同对象正常的接口级分裂证据，以及 PE 导出表、批准列表、ShellExecuteHooks、SHChangeNotify 四条否证；故障仍表现为「系统级、非文件层、无配置开关、重启不改变」，超出常规诊断可定位范围。
