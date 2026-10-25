---
id: "b01208b5-6216-4343-b97a-860fa3bfcfd5"
title: "dsh-pilot 浏览器自动化 + computer-use 双线端到端打通，与 D:\\Temp 不可写根因（2026-10-04）"
description: "2026-10-04 实测交接：用户级 TEMP/TMP 指向不可写的 D:\\Temp 这一单根因如何长出三类故障及两层 TEMP 语义；computer-use 双缺陷修复与 B3PROBE 端到端判据；dsh-pilot v0.7.2 三个阻塞（webServer 依赖、Edge 154 Page.enable 需 --no-sandbox、--profile web 不收位置参数）与独立服务端日志证据；三项待用户拍板决策。"
status: "active"
created_at: "2026-10-04T10:20:28.472Z"
updated_at: "2026-10-04T10:20:28.472Z"
content_hash: "327299e86c492207082909614e8d07dbaf90e9c03e81f9b41e3bb8bc672371c5"
source_paths:
  []
session_ids:
  - "3026ea0d-17b4-41af-a70f-5a2bf07a0776"
memory_body_ids:
  []
---

# dsh-pilot 浏览器自动化 + computer-use 双线端到端打通，与 D:\Temp 不可写根因

日期：2026-10-04。全部结论基于本机（Windows，用户 `天阙九泉\27063`，非管理员）实机实验。
相关：Edge 相关实测见 `11cee314-0b8c-45bc-ac9c-9f436a73d608`；desktop host 取证见 `b2d5fd4e-11b1-4266-af11-50fec153e1e9`。

## 1. 根因：用户级 TEMP/TMP 指向不可写的 D:\Temp

```
D:\Temp  owner=BUILTIN\Administrators
ACL: BUILTIN\Users | ReadAndExecute  (只有 (I)(RX))
write=FAIL: Access to the path 'D:\Temp\writetest.txt' is denied.
currentUser=天阙九泉\27063   isAdmin=False
```

写测试矩阵：`D:\Temp` FAIL · `C:\Windows\Temp` EPERM · `C:\dshlab-tmp` 无权创建 · **`C:\Users\27063\AppData\Local\Temp` OK**。

单根因长出三个看起来无关的故障：

| 症状 | 机制 |
|---|---|
| dsh 的 pwsh/bash 工具报 `EPERM ... mkdtemp 'D:\Temp\dsh-subprocess-XXXXXX'`，命令根本不执行 | 子进程用 `os.tmpdir()` 建临时目录 |
| `dsh-computer-use-win` 后端起不来 | `Add-Type` 的编译过程必然写 `$env:TEMP` 做 csc scratch（即使不加 `-OutputAssembly`） |
| `dsh-pilot` 起不来 | `mkdtemp(join(tmpdir(), …))` |

★ **两层 TEMP 语义不同**（踩坑后分清）：

- **MCP 行内 `env: TEMP`**（如 computer-use 的 MCP 行）→ 任意可写目录即可，**可以在 workspace 内**；
- **进程级 `TEMP`**（给 dsh 自身工具沙箱用）→ **必须在 workspace 之外**，否则 ACL sandbox 直接拒掉一切命令执行，逐字报 `Windows ACL temp root must be outside the workspace`。

生产 host 未受影响（其启动链的 TEMP 与登录 shell 不同），受影响的只是「新起的裸 node 进程」。

## 2. B：computer-use —— 已修复并端到端跑通

隔离环境 `~/.dsh-lab/profiles/cu-lab`（生产 `~/.dsh` 全程未动）。

**两个独立缺陷，必须同时修**：

1. TEMP 不可写 → 给 MCP 行加 `env: {TEMP/TMP: …}`；依据 `dsh-mcp-client/lib/index.js:26` 逐字 `...scrubbedParentEnv(), ...extra`，extra 覆盖 parent；
2. `Add-Type -OutputAssembly $dll` 之后再 `LoadFrom($dll)` 报 `0x80131515 Operation is not supported` → 改为纯内存 `Add-Type -TypeDefinition $script:WcuCs`。

**端到端判据**（零爆炸半径的 WinForms 测试窗口 `B3PROBE`）：

| 步 | 工具 | 结果 |
|---|---|---|
| 1 | `list_windows` | 找到 `B3PROBE`，HWND `10751278` |
| 2 | `snapshot` | `probeBox = uia:rt:42-1511390` (Edit)、`probeBtn = uia:rt:42-3084006` (Button) |
| 3 | `set_value` | `{"ok":true,"method":"ValuePattern"}` |
| 4 | `invoke` | `{"ok":true,"action":"invoke","method":"Invoke"}` |

**独立判据**（用 pwsh 读文件，完全不经过 wincu 自证）：`b3-out.txt` 内容 = `B3-PROBE-OK` ✓。随后 `close_window` 清理，窗口已消失。

## 3. C：browser-use —— dsh-pilot v0.7.2 从零到端到端跑通

选型前提：本机**只有 Edge、没有 Chrome**，因此排除一切「驱动真实 Chrome」的方案。
选了 `github:guo6x/dsh-pilot` v0.7.2（零 runtime 依赖、raw CDP、17 个 `pilot_*` 工具）。

三个阻塞及解法：

1. **插件声明 `inject = ["webServer","tools"]`**，而 headless 栈没有 `webServer` → 插件一直 `pending`，17 个工具一个都不出。解法：手插 `@deepseek-ai/dsh-host-webserver`，且 config **必须显式给 `host` + `port`**（schema 是 `.required()`）。
   另注：`dsh-pilot` 已在 `dsh.profile.bundles` 里，bundle auto-discovery 会自动加载它自带的 `cordis.patch.yml`（内含 `- insert: {id: pilot, name: 'dsh-pilot'}`）；手工再插一份 `file://` 是多余的且会 import 失败（已删除）。
2. **★ Edge 154 的 `Page.enable` 报 `Target crashed`**（`--port` 9231，`/json/version` 与 `/json/list` 均正常，`Page.navigate` / `Page.getNavigationHistory` 也正常回包，只有 `Page.enable` / `Runtime.enable` 失败）。逐 flag 矩阵实测，**唯一决定因素是 `--no-sandbox`**：

| flag | `Page.enable` |
|---|---|
| 无 / 只 `--disable-gpu` / `--headless=old` / 有头完整窗口 | **FAIL `{"code":-32000,"message":"Target crashed"}`** |
| **只加 `--no-sandbox`** | **OK `{}`** |

   这是 Edge renderer sandbox 在该受限 token 下起不来（与 `D:\Temp is not writable` 同一环境根源），不是 pilot 的 bug。
   落地：patch 了 pilot bundle 内 `spawn` 段的 argv（约 `:241-247`），加入 `--no-sandbox` 并留注释 `// [lab-patch 2026-10-04]`；patch 后 new size 60468，`syntax OK`。
3. **`--profile web` 不接受位置参数**（逐字 `error: too many arguments`）⇒ 一次性 prompt 只能走 headless 类 profile。

**端到端判据**（本地测试页 `http://127.0.0.1:18777/`，服务端日志独立记录全部请求）：

```
2026-10-04T10:16:53.381Z GET /
2026-10-04T10:16:58.935Z GET /favicon.ico
2026-10-04T10:17:07.277Z GET /api/clicked?name=HELLO-PILOT
2026-10-04T10:17:14.191Z GET /done
```

`HELLO-PILOT` 是 agent 经 `pilot_fill` 写进 input 的值，`/api/clicked?name=…` 是 `pilot_click` 点击按钮后页面真实发出的 `fetch` ⇒ **填表 → 点击 → 真实副作用，闭环成立**，且判据完全不经过 pilot 自证。

## 4. 待用户拍板（截至本记录未决策）

1. **`--no-sandbox` 是否上生产？** 它是本机 Edge 能跑 CDP 的唯一条件（账号非 admin，renderer sandbox 起不来）。属安全降级——pilot 只在指定 URL 上跑且用独立临时 profile，但确实关掉了一层隔离。
2. **是否把用户级 `TEMP`/`TMP` 从 `D:\Temp` 改到 `C:\Users\27063\AppData\Local\Temp`？** 一条 `setx` 即可消掉本机所有「新起 node 进程跑不了 shell」的怪症；不改也行，则每个用例都要单独传 env。
3. **computer-use 是否推生产？** 待办还差：横向对比 ★7385 的 `browser-skill-dsh-plugin` 与 `dsh-builtin-browser`（pilot 已够用，但需要对比数据支撑 go/no-go），以及完整的推生产方案 + 回滚。
