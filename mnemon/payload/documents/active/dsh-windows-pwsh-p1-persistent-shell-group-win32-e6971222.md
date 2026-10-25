---
id: "e6971222-e273-4968-8258-74da4cc5c00a"
title: "dsh Windows 上 pwsh 常驻化（方案 P1）：persistent-shell group 被 win32 门控关闭是冷启动 209 ms 的根因"
description: "2026-10-26 定位 Windows 上 pwsh 每次调用 209 ms 的根因（cordis.patch.yml 的 persistent-shell group 以 process.platform === 'win32' 整体 disabled，导致无任何 PTY backend），并落地方案 P1：新增 win32-exclusive pty-win group（dsh-terminal + dsh-terminal-bash shellDialect: pwsh + dsh-tool-pwsh-persistent），同时把冷启动 dsh-tool-pwsh 改为 win32 下 disabled 以避免同名 `pwsh` 重复注册。含配置片段、源码证据（shellDialect union / shellPath 优先级）、四条静态验证、python heredoc 八进制转义把 `\\7` 写成 BEL 的踩坑与扫描修复方法、回滚一步与待做的重启后 PID/耗时/中文编码验收。"
status: "active"
created_at: "2026-10-25T18:27:23.631Z"
updated_at: "2026-10-25T18:27:23.631Z"
content_hash: "9cdf394d64ea963b310282999876506d4e4323c9ae1d07cb7859f8088384f0e3"
source_paths:
  - ".dsh/profiles/desktop/cordis.patch.yml"
  - ".dsh/profiles/desktop/cordis.patch.yml.bak-20261026-pre-pty-win"
  - ".dsh/PLAN.md"
session_ids:
  - "b3037b96-eb87-4e58-b725-be91cc9af416"
memory_body_ids:
  []
---

# dsh Windows pwsh 常驻化（方案 P1）

关联文档：
- `316b5d89-62ee-497c-8be6-25ab93cf09c1`（同平台 pwsh 主题：pwshPath 钉死 PowerShell 7 / WDAC 拦截 5.1 脚本）
- `c81e9fe7-b108-4f68-a8b2-326a2b26935c`（patch entry 的 `name` 必须是真实包名，裸名会 failed to import）
- `6471b357-f586-4315-a59d-42143704ee5a`（patch 会在 pnpm install / 前端构建后悄悄消失的运维事实）

## 一、问题与根因

Windows 上工具耗时实测（cold spawn）：

| 工具 | 当前实现 | 每次启动 |
|---|---|---|
| `bash` | `.agent-presets/anchored-standard/custom-bash.mjs`（win32-only，普通 `bash -c`，无 PTY、无 sandbox） | 24.8 ms |
| `pwsh` | `@deepseek-ai/dsh-tool-pwsh`（cold） | **209 ms**（≈ bash 的 8.4 倍） |

根因**不是插件不支持**，而是配置层的 group 级开关。`.dsh/profiles/desktop/cordis.patch.yml` 里：

```yaml
- id: persistent-shell
  name: cordis:group
  group: true
  disabled: !!js process.platform === 'win32'   # 整个 group 在 Windows 关掉
  isolate:
    terminals: true
  config:
    - id: pty                 # @deepseek-ai/dsh-terminal      （PTY seam）
    - id: terminal-bash       # @deepseek-ai/dsh-terminal-bash （backend，shellPath 可配）
    - id: persistent-bash     # @deepseek-ai/dsh-tool-bash-persistent
```

⇒ Windows 上根本没有挂载任何 PTY backend，两个 shell 都退化到 subprocess seam。

## 二、关键前提：需要的包全都已经装了（含从未启用的那个）

`profiles/node_modules/@deepseek-ai/` 下已存在 v0.2.1-rc.2：

- `dsh-terminal` —— Persistent PTY session seam（owner-scoped ids）
- `dsh-terminal-bash` —— Persistent shell PTY backend，支持 `shellDialect` / `shellPath`
- `dsh-tool-bash-persistent`
- `dsh-tool-pwsh-persistent` —— **用户此前从未用过；README 明确支持 "Windows ConPTY or a POSIX pwsh"**

⇒ Windows 是官方支持路径（ConPTY）。但该包注册的工具名**同样叫 `pwsh`**，与冷启动版冲突：同一 layer 重复注册会被 tools registry 拒绝。

## 三、官方 README 自带的限制（照抄，不美化）

1. **PSReadLine 回显无法消除** —— PowerShell 把输入回显到终端流，靠 marker-anchored 提取剥离；`stty -echo` 在 Windows 无对应物。
2. **命令执行期间无 interactive stdin** —— 读 stdin 的子进程会提前返回部分输出。
3. **SIGTSTP / SIGHUP 在 Windows 不可用**；SIGINT 是 console-wide Ctrl-C 写，在提示符处只取消当前行。
4. **Reset, never repair** —— 任何不确定状态（显式 `exit`、timeout、send failure、abort）都直接关 shell 重开。与「每条命令设时限」的铁律交互：命令内部 `timeout 30`（coreutils）无妨，但工具级 `timeoutMs` 设小会**杀掉常驻 shell 并丢状态** ⇒ 保持默认 300000，不要调小。
5. **Windows ACL sandbox read-only 模式下 pwsh 以 ConstrainedLanguage 启动**，可能拒绝 `[Console]::` 编码 pin 和 prompt marker —— 最需要实测的一条。

## 四、已落地的改动（仅 `.dsh/profiles/desktop/cordis.patch.yml`）

备份：`cordis.patch.yml.bak-20261026-pre-pty-win`（77523 bytes，改前）。

**① `tool-pwsh` 改成平台对称门控**（原为非 win32 启用）：

```yaml
- id: tool-pwsh
  name: '@deepseek-ai/dsh-tool-pwsh'
  # win32 → 由下方 pty-win group 的常驻版提供；非 win32 → 保留这个冷启动版
  disabled: !!js process.platform === 'win32'
```

**② `custom-bash` 之后新增 win32-exclusive group**：

```yaml
- id: pty-win
  name: cordis:group
  group: true
  disabled: !!js process.platform !== 'win32'
  isolate:
    terminals: true
  config:
    - id: pty-win-backend
      name: '@deepseek-ai/dsh-terminal'
    - id: terminal-pwsh-win
      name: '@deepseek-ai/dsh-terminal-bash'
      config:
        shellDialect: pwsh
        shellPath: 'C:\Program Files\PowerShell\7\pwsh.exe'
        timeoutMs: 300000
    - id: persistent-pwsh-win
      name: '@deepseek-ai/dsh-tool-pwsh-persistent'
      config:
        timeoutMs: 300000
        maxOutputChars: 16000
```

`web` / `headless` 两份 patch 一份未动 —— 等 desktop 跑稳几天再同步。

## 五、静态验证（四条均通过）

| 检查 | 方法 | 结果 |
|---|---|---|
| YAML 解析 | PyYAML `safe_load` | OK，顶层为 list |
| **门控对称性** | 把 `process.platform` 代入 `'win32'` 求值 | `tool-pwsh` → DISABLED ✓ / `pty-win` → ENABLED ✓ |
| **重复注册** | 枚举生效的 pwsh/bash 注册行 | Windows 上只有 `bash` ← `custom-bash`、`pwsh` ← `persistent-pwsh-win`；`persistent-bash` 仍被父 group 关掉 ✓ |
| `shellDialect` 合法性 | 读 `dsh-terminal-bash/lib/index.js` 源码 | `z.union(["bash","pwsh"]).default("bash")` ⇒ `pwsh` 合法；且 `config.shellPath` 非空时**显式值优先于 dialect 默认 `resolvePwshPath()`** ✓ |

**预期收益**：`pwsh` 209 ms → ~2 ms（首调用除外，ConPTY 预热预计 1–2 s）。按一天 200 次 pwsh 计约省 42 s/天。

**为何只做 pwsh 不做 bash（P1 而非 P2）**：收益最大的一笔在 pwsh 上（8.4×）；pwsh 常驻有官方 ConPTY 支持，而 bash 常驻在官方口径里在 win32 上 «cannot serve»；P1 是单点改动、失败好回滚，且不会改变当前每天在用的 `bash` 工具行为。

## 六、踩坑：python heredoc 把 `\7` 解析成 BEL(0x07)

写 `shellPath: 'C:\Program Files\PowerShell\7\pwsh.exe'` 时，python 字符串把 `\7` 当**八进制转义 → `\x07`（BEL，不可见）**，落到 YAML 里变成 `C:\Program Files\PowerShell␇\pwsh.exe`（少一级目录）。PyYAML 不报错、`cat` 看不出来，重启后才会在 ConPTY 启动时炸。

**同类污染还扩散进了 `PLAN.md` 的 5 行**：`C:\mingw64\bin\gcc.exe` 变 `C:\mingw64␈in\gcc.exe`（`\b` = backspace 0x08），以及两行历史 PowerShell 路径记录。全部已修复。

**固化规则**：Windows 路径一律用 python raw 字符串写；写完扫描 `ord(c) < 9 or 11 <= ord(c) <= 31` 找控制字符。（另一个陷阱：用 `re.sub` 做替换时，pattern 里的 `\P` 会触发 `re.error: bad escape \P` ⇒ 替换逻辑不要用含反斜杠路径当 pattern。）

## 七、回滚与待做验收

**回滚一步**（再重启一次）：

```
cp C:/Users/27063/.dsh/profiles/desktop/cordis.patch.yml.bak-20261026-pre-pty-win \
   C:/Users/27063/.dsh/profiles/desktop/cordis.patch.yml
```

**必须重启 dsh**：新增插件行 + `node_modules` 里的 bundle + preset `.mjs` 都不在 profile patch 的 `patchReload: live` 覆盖范围内（见既有 MEMORY 定论）。重启会中断当前 session。

**失败模式是软的**：PTY backend 起不来时 `pwsh` 工具激活但首次调用报错，dsh 进程不崩，`bash` 不受影响。

**重启后验收清单（尚未执行）**：

1. 连续两次调 `pwsh` 执行 `$PID` —— 相同 PID ⇒ 常驻成功；不同 PID ⇒ 未生效，回滚。
2. 记录首次调用耗时（ConPTY 预热）与后续每次耗时（预期 ~2 ms，对比 209 ms）。
3. 验证中文输出（`$OutputEncoding`）—— marker-anchored 提取要处理回显，最易出问题处。

## 八、环境注意事项

- `desktop` profile 曾被 Electron 守卫拒绝 `--dump-config`，校验时改用 pwsh 直接解析 YAML 或退到同结构的 `web` profile 验证。
- 2026-10-26 本机无法直接 `ls` `:/Users/...` 形式的路径（Git Bash 路径前缀处理问题），排查 `profiles/node_modules` 时用 Windows 原生路径。
