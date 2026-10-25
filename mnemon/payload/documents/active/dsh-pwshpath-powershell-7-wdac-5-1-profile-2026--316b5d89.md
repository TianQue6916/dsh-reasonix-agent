---
id: "316b5d89-62ee-497c-8be6-25ab93cf09c1"
title: "dsh 钉死 pwshPath 到 PowerShell 7：WDAC 拦截 5.1 脚本的根因、构造期缓存陷阱与三 profile 落地（2026-10-23）"
description: "2026-10-23 闭环：PowerShell 5.1 下 .ps1 被拒的根因是 WDAC/App Control script enforcement（非 ExecutionPolicy，Get-ExecutionPolicy 会被误导）；dsh-tool-pwsh 仍跑 5.1 的原因是 PwshLocalExecutor 构造期一次性缓存 resolvedPwshPath；pwshPath 虽标 volatile 但可静态配置并被 dump-config 保留；web/desktop/headless 三 profile 已钉死 PS7 路径，HMR 不生效需重启。含社区证据（actions/runner #3415/#2975）、candidatePwshPaths 的 PATH 遍历隐患与重启后验证方法。"
status: "active"
created_at: "2026-10-23T04:30:07.737Z"
updated_at: "2026-10-23T04:30:07.737Z"
content_hash: "5525f11b787c88442986de998aad33ca2aa1dc9a29a7d08135901a7e7f0df736"
source_paths:
  - "profiles/web/cordis.patch.yml"
  - "profiles/desktop/cordis.patch.yml"
  - "profiles/headless/cordis.patch.yml"
session_ids:
  - "2cbd2065-fa43-420f-8fdf-2a08407752c8"
memory_body_ids:
  []
---

# dsh 钉死 pwshPath 到 PowerShell 7

**日期**：2026-10-23 ｜ **机器**：Windows，用户目录 `C:\Users\27063` ｜ **配置根**：`C:\Users\27063\.dsh`
前序文档（对照实测与替换边界，本文闭环其「`-File` 无签名脚本被拒且根因未定位」一项）：`eef3a990-b234-42c0-accd-e098eaf79721`

## 1. 结论速查

1. **`powershell.exe`（5.1）跑 `.ps1` 被拒的根因是 WDAC / App Control for Business 的 script enforcement**，不是 ExecutionPolicy。`Get-ExecutionPolicy` 返回 RemoteSigned 且被显式设为 RemoteSigned 后仍被拒就是特征。
2. **dsh 的 `pwsh` tool 装了 PS7 仍跑 5.1**，原因是 `PwshLocalExecutor` 在**构造函数里一次性求值并缓存** `resolvedPwshPath`；解析只依赖 `config.pwshPath` 是否变化，不重新探测磁盘。
3. **`pwshPath` 源码里是 `z.string().volatile()`，但可以被静态配置**，且 `dsh --dump-config` 会原样保留 —— 「volatile ⇒ 只能运行时注入」是错误直觉。
4. **改 profile patch 的 live HMR 对 host-plane executor 无效**，必须重启进程。

## 2. WDAC 根因（社区三步法之后的第四种成因）

社区（SO 9742775，问题 260 分 / 最高答案 305 分）给的排查顺序是 GPO → Zone.Identifier / Unblock-File → `-ExecutionPolicy Bypass` 兜底。本机逐条走完：

| 排查步 | 本机结果 |
|---|---|
| GPO 键 `HKLM\...\Policies\Microsoft\Windows\PowerShell` | **不存在** |
| Zone.Identifier | 仅 `:$DATA`，`Unblock-File` 成功，**解 block 后仍被拒** |
| 显式 `-ExecutionPolicy RemoteSigned` | 仍被拒 |
| `Set-ExecutionPolicy -Scope Process RemoteSigned -Force` 后调用 | `Get-ExecutionPolicy` = RemoteSigned，**仍被拒** |
| `-ExecutionPolicy Bypass` | **跑通** |

关键推论：策略链明确且被 `Get-ExecutionPolicy` 确认后，脚本仍被要求签名 ⇒ 拦截发生在 ExecutionPolicy **之下**，即 `SystemPolicy.GetLockdownPolicy()`。本机确证：

```
CodeIntegrityPolicyEnforcementStatus : 2      # 2 = Enforced
SecurityServicesRunning              : 0
C:\Windows\System32\CodeIntegrity\CiPolicies\Active\ → 8 个 .cip
  {0283AC0F-...} {0939ED82-...} {1283AC0F-...} {1678656C-...}
  {1939ED82-...} {2678656C-...} {60FD87F8-...} {784C4414-...}
```

**排障要点**：任何「powershell 跑脚本被拒」，只看 `Get-ExecutionPolicy` 会把人带偏；必须查 `CodeIntegrityPolicyEnforcementStatus`。这也解释了 dsh 里所有 `.ps1` 调用都挂 `-ExecutionPolicy Bypass` —— 那不是肌肉记忆，是该机唯一的活路。`pwsh -File`（7）能直接跑，说明 7 的检查路径不同或这些策略 scope 不覆盖它（未深追，对我方有利）。

## 3. 构造期缓存陷阱（装 7 对运行中进程不可见）

`@deepseek-ai/dsh-pwsh-local` 的相关源码结构：

```js
static Config = z.object({ /* ... */ pwshPath: z.string().volatile() });

get pwshPath() {
  const declared = this.config.pwshPath.get();
  if (declared !== this.declaredPwshPath) {   // 只有 declared 变了才重算
    this.resolvedPwshPath = resolvePwshPath(declared);
    this.declaredPwshPath = declared;
  }
  return this.resolvedPwshPath;
}

constructor(ctx, config) {
  this.resolvedPwshPath = resolvePwshPath(this.declaredPwshPath);  // 一次性求值并缓存
}
```

dsh 进程启动早于 PS7 安装 ⇒ 候选链第 1 条（`Program Files\PowerShell\7\pwsh.exe`）当时不存在 ⇒ 一路滑到 `System32\WindowsPowerShell\v1.0\powershell.exe` ⇒ 结果被固化，之后装什么都没用，只要 `declaredPwshPath` 不变就永不重算。

## 4. candidatePwshPaths 的隐性不确定性

`candidatePwshPaths()` 在该用户超长 PATH 下的真实形态是：① `C:\Program Files\PowerShell\7\pwsh.exe` → ② **PATH 里每个目录拼 `\pwsh.exe`**（含 Store 版 alias `...\AppData\Local\Microsoft\WindowsApps\pwsh.exe`、`D:\miniconda\pwsh.exe` 等 60+ 条）→ 末位 5.1 兜底。未钉路径时实际跑哪个取决于 **PATH 顺序 + 该机装过什么**，正是社区抱怨的「别猜」。

## 5. 社区证据

- actions/runner **#3415（open）**：Windows 上显式 `pwsh` 不会 fallback 到 PowerShell Desktop，与文档不符 —— 「优先新版、兜底旧版」的自动探测在生态里反复出事。
- actions/runner **#2975（closed）**：诉求是「**让我显式指定 PowerShell 路径**」，而非让工具去猜。
- SO 76153269：`pwsh` 与 `powershell` 是两个独立名字、不共享；大量工具硬编码 `powershell`。
- 「用 prompt 注入让 LLM 选对 shell」在社区**无系统性先例**；工程界等效做法是在工具描述/配置里写死边界（prompt 是软的，配置与工具约束是硬的）。

## 6. 已落地的改动

三个 profile 的 `pwsh-sandbox` 各加一行（`web` 的 patch 已备份为 `cordis.patch.yml.bak-20261023-...`）：

- `profiles/web/cordis.patch.yml:1344`
- `profiles/desktop/cordis.patch.yml:1306`
- `profiles/headless/cordis.patch.yml:691`

```yaml
- id: pwsh-sandbox
  name: "@deepseek-ai/dsh-pwsh-sandbox"
  config:
    maxOutputBytes: 640000
    pwshPath: 'C:\Program Files\PowerShell\7\pwsh.exe'
```

三层验证：
1. **schema 接受**：`dsh --dump-config` 输出保留 `pwshPath: C:\Program Files\PowerShell\7\pwsh.exe`（零副作用校验，非猜测）。
2. **解析函数正确**：直接 import 包跑纯函数，`resolvePwshPath(undefined)` 与 `resolvePwshPath(pinned)` 均返回 `C:\Program Files\PowerShell\7\pwsh.exe`（包 `exports` 含 `PwshLocalExecutor` / `resolvePwshPath` / `candidatePwshPaths` 等）。
3. **运行时仍 5.1**（符合第 3 节的缓存解释）：`pwsh` tool 两次实测 `exe_path = ...\WindowsPowerShell\v1.0\powershell.exe`、`version 5.1.26100.9711`。

## 7. 待完成：重启 + 验证

改动只对新进程生效，且重启会中断当前会话：

```powershell
Stop-Process -Name node -Force        # 或精确杀掉 3080 端口的进程
schtasks /run /tn "dsh-web-3080"      # 桌面端直接关掉 DeepSeek Harness.exe 再打开
```

新会话里调一次 `pwsh` tool 验证：

```powershell
"version: " + $PSVersionTable.PSVersion; "exe: " + (Get-Process -Id $PID).Path
```

期望 `7.6.8` + `C:\Program Files\PowerShell\7\pwsh.exe`。**此项尚未证实**，属未完成验证。

## 8. 踩坑备忘

- 用 `node --eval` 验证含盘符路径时 `C:\Program Files` 的反斜杠会被当转义（`SyntaxError: Octal escape sequences...`），须写进文件或改 `node -e` 前的引号策略。
- 从 `%TEMP%` 跑 `probe.mjs` 会 `ERR_MODULE_NOT_FOUND`（不在 `@deepseek-ai` 的解析根内），要在 profile 目录或其 node_modules 可达处执行。
