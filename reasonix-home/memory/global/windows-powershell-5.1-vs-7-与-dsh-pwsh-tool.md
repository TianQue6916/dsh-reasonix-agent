---
id: mem-af89b3665dce32eb1afb24b8565dde99
revision: 1
created_at: "2026-10-23T10:12:28.543Z"
updated_at: "2026-10-23T10:12:28.543Z"
name: windows-powershell-5.1-vs-7-与-dsh-pwsh-tool
description: "本机 PowerShell 形态：5.1 内置 + 7.6.8 MSI 并存、dsh pwsh tool 的 exe 解析链与构造期缓存坑、WDAC 拦 5.1 脚本、$OutputEncoding 吞中文"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 本机形态（2026-10-23 实测）

- Windows PowerShell **5.1.26100.9711**（OS 组件，`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`，**不可卸载**）
- PowerShell **7.6.8**（2026-10-22 发布的 latest stable，Core/.NET 10.0.13）装在 `C:\Program Files\PowerShell\7\`，283.5 MB / 1104 文件，冷启动 169 ms；机器 PATH 已含 `C:\Program Files\PowerShell\7\`
- Windows Terminal 默认 profile 已改成 PowerShell 7（`packages\Microsoft.WindowsTerminal_8wekyb3d8bbwe\LocalState\settings.json`，defaultProfile = `{574e775e-4f2a-5b96-ac1e-a2962a402336}`，这是 WT 给 pwsh 的**固定常量 GUID**，与安装路径无关；同 GUID 显式定义 profile 可覆盖自动生成条目）
- 命令名两套：`powershell` 永远是 5.1，`pwsh` 才是 7

## 装 7 的下载通道（本机分层网络实测）

| 通道 | 结果 |
|---|---|
| 直连 github.com | DNS 不通，18s timeout |
| DevSidecar 代理 127.0.0.1:31180 | 通但仅 43 KB/s（117 MB ≈ 45 分钟） |
| **gh-proxy.com 镜像** | **3.8 MB/s，31s 下完**（首选） |
| winget | `winget --version` rc=0 但**零输出**，静默失效，不可用 |

- DevSidecar 链路上 curl 必须加 `--ssl-no-revoke`（否则 `schannel: CRYPT_E_NO_REVOCATION_CHECK`）
- **镜像不可信没关系，校验要可验证**：`api.github.com` 可直连，从其 asset 的 `digest` 字段取官方 sha256（7.6.8 = `079e7cecedd1e87fa7b4676e5c33ddfbe66859a44a97fbcd1db797245cbb93d2`，size 117493760），下载后本地 `sha256sum` + `Get-AuthenticodeSignature` 三重校验（Status=Valid / CN=Microsoft Corporation）
- 安装：`msiexec /i ps1.msi /qn /norestart ADD_PATH=1 REGISTER_MANIFEST=1`（需提权，ExitCode 0）

## ★ dsh pwsh tool 的 exe 解析链与缓存坑（最容易踩）

`profiles/node_modules/@deepseek-ai/dsh-pwsh-local/lib/index.js` 的 `resolvePwshPath(configured, env, platform)` 顺序：

1. 显式 `pwshPath` 配置（trusted as-is）
2. `%ProgramFiles%\PowerShell\7\pwsh.exe`
3. 遍历 `env.PATH` 每个目录下的 `pwsh.exe`（**60+ 条，含 Store 的 `WindowsApps\pwsh.exe` alias**）
4. `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe` ← **5.1 兜底**
5. 裸 `pwsh` 交给 PATH

**坑（核心）**：`PwshLocalExecutor` 构造函数里 `this.resolvedPwshPath = resolvePwshPath(...)` **一次性求值并缓存**；getter 只在 `declared` 值变化时重算：

```js
get pwshPath() {
  const declared = this.config.pwshPath.get();
  if (declared !== this.declaredPwshPath) { re-resolve }
  return this.resolvedPwshPath;
}
```

⇒ **装完 PowerShell 7，运行中的 dsh 完全感知不到，pwsh tool 仍静默跑 5.1**（实测 `exe_path = System32\WindowsPowerShell\v1.0\powershell.exe`）。改 profile patch 的 live HMR 也救不了（host-plane 的 executor 实例不参与 reload）。**必须重启 dsh 进程。**

**已做的修复**：三个 profile 的 `pwsh-sandbox` config 都钉了 `pwshPath: 'C:\Program Files\PowerShell\7\pwsh.exe'`
- `profiles/web/cordis.patch.yml:1344`
- `profiles/desktop/cordis.patch.yml:1306`
- `profiles/headless/cordis.patch.yml:691`

`pwshPath` 虽在 schema 里是 `z.string().volatile()`，**实测可以被静态配置**（`dsh --profile <p> --dump-config` 会保留并输出）。纯函数验证：`resolvePwshPath(undefined)` 与 `resolvePwshPath(pinned)` 都返回 7。

## ★ WDAC 拦 5.1 脚本（社区排查法挖出来的）

**`Get-ExecutionPolicy` 会骗人**。本机实测：

```
CodeIntegrityPolicyEnforcementStatus : 2   (Enforced)
C:\Windows\System32\CodeIntegrity\CiPolicies\Active\ → 8 个 .cip
Get-ExecutionPolicy -List → CurrentUser=RemoteSigned, LocalMachine=Unrestricted
```

但 `powershell -File x.ps1` **一律被拒**（"is not digitally signed"），即使显式 `-ExecutionPolicy RemoteSigned` 或 `Set-ExecutionPolicy -Scope Process RemoteSigned` 后仍拒；**只有 `-ExecutionPolicy Bypass` 能绕**（因为 Bypass 让 PowerShell 跳过 `SystemPolicy.GetLockdownPolicy()` 检查）。同一个文件用 `pwsh -File` 直接跑通。

已排除：GPO 键不存在、无 Zone.Identifier（`Unblock-File` 无效）、`__PSLockDownPolicy` 未设、SRP 键是空壳、AppIDSvc Stopped。

⇒ **本机任何 `.ps1` 交给 5.1 跑都必须带 `-ExecutionPolicy Bypass`**（这就是 `.dsh/storages/tools/*.ps1` 里 49 个脚本、12 个提权包装全都挂着 Bypass 的原因）。排障顺序（社区 SO 9742775，260 分）：GPO → 文件 block → Bypass 兜底 → **最后才是 WDAC/CI script enforcement**。

## 5.1 对 agent 的实际劣势（同机对照实测）

| 项 | 5.1 | 7.6.8 |
|---|---|---|
| `$OutputEncoding`（管道喂原生程序） | **us-ascii** → `"中文" \| findstr 中文` 返回**空** | utf-8，正常返回 |
| `powershell -File x.ps1` | 被拒（见上） | 直接跑 |
| `ForEach-Object -Parallel` / `ConvertFrom-Json -AsHashtable` / `Get-Content -AsByteStream` | False | True |
| `&&` / `\|\|` / `?:` | 语法错误 | 支持 |
| runtime | .NET Framework 4.8 | .NET 10.0.13 |

注：本机 ACP = utf-8（chcp 65001），所以 5.1 读无 BOM UTF-8 脚本**不乱码**；但 `$OutputEncoding=us-ascii` 那条依然致命。

## 社区经验（可引用的锚点）

- **不能卸 5.1**：[SO 70931513](https://stackoverflow.com/questions/70931513/how-to-uninstall-powershell-5-1-on-windows-after-installing-72)（38 分采纳答案开头就是 "You don't."，硬删"will very literally break parts of Windows"；类比 cmd.exe 不会消失）
- **`pwsh`/`powershell` 两个名字，生态大量硬编码**：[SO 76153269](https://stackoverflow.com/questions/76153269/powershell-the-term-powershell-is-not-recognized-as-the-name-of-cmdlet)（Ansible/pywinrm 场景）
- **自动 fallback 是新版本生态的反复出事点**：[actions/runner#3415](https://github.com/actions/runner/issues/3415)（open，文档说 `shell: pwsh` 会 fallback 到 Desktop，实测报 `pwsh: command not found`）、[#2975](https://github.com/actions/runner/issues/2975)（诉求"让我显式指定路径"）⇒ 共识：**钉死路径 > 依赖探测**
- **"ExecutionPolicy 正常但脚本被拒"是 260 分老坑**：[SO 9742775](https://stackoverflow.com/questions/9742775/why-is-my-locally-created-script-not-allowed-to-run-under-the-remotesigned-execu)

## 未做 / 下一步

- 那 18 处硬编码 `powershell.exe` 的调用点（`\dsh-web-3080`、`\GitHub-Mirror-Agent`、`\GitHub-Mirror-Probe` 三个计划任务用 5.1 全路径跑；`storages/tools/edge-lite/*.py` 3 处 `["powershell",...]`）**尚未改**。改 `launch-dsh.ps1` 是最高风险点（那是 dsh 服务的 boot 脚本），要单独评估 + 保留 5.1 回滚。
- prompt 注入让 agent 优先用 pwsh tool 是**边际收益**，社区无先例；硬约束靠工具描述与显式配置。
