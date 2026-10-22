---
id: mem-699054db70cdabe58c318820d15f4a47
revision: 1
created_at: "2026-10-04T10:19:12.466Z"
updated_at: "2026-10-04T10:19:12.466Z"
name: windows-temp-d-temp-unwritable-root-cause-20261004
description: "本机总根因：用户级 TEMP=D:\\Temp 不可写，且进程级 TEMP 必须在 workspace 之外"
metadata:
  type: user
  fact_type: project
  scope: global
---

## ★ 本机最大隐蔽根因：`D:\Temp` 不可写 + 两层 TEMP 语义不同
### 事实
- **用户级环境变量**：`TEMP=D:\Temp`、`TMP=D:\Temp`（PowerShell `[Environment]::GetEnvironmentVariable('TEMP','User')` 实测）；Machine 级是 `C:\Windows\TEMP`（TMP 空）。
- **`D:\Temp` 实测不可写**：`open('D:\Temp\x','w')` → `Access to the path 'D:\Temp\writetest.txt' is denied.`（用户非 admin）。ACL 里 `BUILTIN\Administrators (I)(F)` / `SYSTEM (I)(F)` / `Authenticated Users (I)(M)` / **`BUILTIN\Users (I)(RX)`** —— Authenticated Users 有 Modify 却仍拒写，存在未查明的额外阻写机制（疑似完整性级别 / 所有者约束），**已列为单独待办**。
- 写测试矩阵：`D:\Temp` FAIL / `D:\` 根 FAIL / `$env:USERPROFILE` OK / `%LOCALAPPDATA%\Temp` **OK** / `C:\Users\27063\.dsh\logs` OK。

### 症状（三个互不相关的故障同源）
1. **dsh 的 pwsh/bash 工具 100% 不可用**（新起的裸 node 进程）：`Error: EPERM: operation not permitted, mkdtemp 'D:\Temp\dsh-subprocess-XXXXXX'` ⇒ 命令根本不执行。
2. **`dsh-computer-use-win` 后端起不来**：`Add-Type` 的**编译过程**必然用 `$env:TEMP` 做 csc scratch（即使不加 `-OutputAssembly`）；`Add-Type : Access to the path 'D:\Temp\k01wzzcr.tmp' is denied.`
3. **`dsh-pilot` 起不来**：`mkdtemp(join(tmpdir(), PROFILE_PREFIX))`（`lib/index.js:238`）读 `os.tmpdir()` = `D:\Temp`。

### ★★ 两层 TEMP 语义（关键区分，修法不同）
| 场景 | 要求 | 本机可用值 |
|---|---|---|
| **MCP 行内 `env: TEMP/TMP`**（如 cu-lab 的 computer-use） | 任意**可写**目录即可，**可在 workspace 内** | `C:\Users\27063\.dsh-lab\tmp` ✔（实测让 B3 端到端跑通） |
| **进程级 `TEMP`/`TMP`**（dsh 自己的 pwsh/bash 工具沙箱用） | **必须在 workspace 之外** | **唯一可用 = `C:\Users\27063\AppData\Local\Temp`** |
依据：用 `~/.dsh-lab/tmp`（在 workspace `C:\Users\27063` **之内**）当进程级 TEMP 时，dsh 的 Windows ACL sandbox 直接拒绝一切命令执行，报逐字 **`Windows ACL temp root must be outside the workspace`**（字符串来源 `@deepseek-ai/dsh-sandbox-windows-acl/lib/types-Cl_DXjhk.js`）。

### 候选实测矩阵（`env TEMP=<d> TMP=<d> node -e "fs.mkdtempSync(path.join(os.tmpdir(),'probe-'))"`）
| 候选 | 结果 |
|---|---|
| `C:\Users\27063\AppData\Local\Temp` | **OK**（唯一同时满足「可写」+「在 workspace 外」） |
| `C:\dshlab-tmp` | ENOENT（`mkdir /c/dshlab-tmp` → `Permission denied`，C 盘根无权限） |
| `C:\Windows\Temp` | **EPERM** |
| `D:\Temp`（用户级默认） | **EPERM** |

### ★ 判断真值的正确姿势
- Git Bash 里 `echo $TEMP` 显示 `/tmp` —— 那是 bash 自己的 shell 变量 + MSYS 路径映射，**不是 node 看到的 Windows 进程 env**。
- 真值用 `node -e "require('os').tmpdir()"`（ESM 下用 `import os from 'node:os'`）或 PowerShell `[Environment]::GetEnvironmentVariable('TEMP','User')`。

### 生产 vs 测试的差异（重要）
- **生产 host 的 bash 工具一直正常工作** ⇒ host 进程（Electron / `launch-dsh.ps1` 起的那条链）的 TEMP 与用户登录 shell 不同（推测被 Electron 或 pnpm runtime 重设）。
- 受影响的是：**新起的裸 node 进程**、**MCP 后端子进程**、**Edge/Chromium 子进程**。

### 修法候选（未执行，需用户拍板）
① 把**用户级** TEMP/TMP 从 `D:\Temp` 改到 `C:\Users\27063\AppData\Local\Temp`（一行 `setx`，最彻底）；
② 修 `D:\Temp` 的 ACL（需提权，用户非 admin）；
③ 每个用例单独传 env（已对 cu-lab / browser-lab 这么做）。

### 已落盘的两处 env 修复
- `~/.dsh-lab/profiles/cu-lab/cordis.patch.yml`（18925 → 19390 B）：`mcp-dsh-computer-use-win` row 的 `config` 里加 `env: {TEMP: 'C:\Users\27063\.dsh-lab\tmp', TMP: …}`。依据 `dsh-mcp-client/lib/index.js:785 env: z.dict(String).default({})` + `:26 function buildChildEnv(extra) { return { ...scrubbedParentEnv(), ...extra }; }` ⇒ extra 覆盖 parent。
- `~/.dsh-lab/profiles/cu-lab/node_modules/dsh-computer-use-win/scripts/windows-uia.ps1`（106035 → 106197 B，**CRLF + UTF-8 BOM**）把 `Load-Assemblies` 里的 `Add-Type -OutputAssembly $dll` + `LoadFrom($dll)` 换成纯内存 `Add-Type -TypeDefinition $script:WcuCs`（同时规避第二个独立缺陷 `LoadFrom` 报 `0x80131515 Operation is not supported`）。
