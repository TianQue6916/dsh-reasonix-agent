---
id: mem-8d837446dd482187e6e2ade49329035a
revision: 2
created_at: "2026-09-27T02:46:33.000Z"
updated_at: "2026-09-27T02:57:22.000Z"
name: dsh-hooks-claude-code-setup-and-headless-finding-20260927
description: "dsh 挂 Claude Code hook 兼容层的完整做法（已配置成功）+ 实测 headless profile 不派发 hook 事件、web 待验；含 dsh-mimir 两个原有故障与「N entry did not activate」这个诊断手段"
metadata:
  type: user
  fact_type: reference
  scope: global
---

# dsh 挂 hook 兼容层：做法与实测结论（2026-09-27）

## 一、结论速览

| 环节 | 状态 |
|---|---|
| hook 脚本（cmd wrapper → bash.exe → 逻辑） | ✅ 端到端冒烟通过，exit 0 |
| `hooks.json` 配置 | ✅ 合法，由 Python 生成（手写 JSON 会被转义层吃掉反斜杠） |
| 两个 profile 挂载 `dsh-hooks-claude-code` | ✅ `--dump-config` 组合验证通过 |
| 插件**激活** | ✅ 实测（见三） |
| **headless 派发 hook 事件** | ❌ **三次实测全不触发**（含带 workspace 的一次） |
| web 模式派发 | ⏳ 未验证（需 UI 交互或 API） |

## 二、配置做法（可复制）

### hooks.json

```json
{
  "hooks": {
    "Stop": [
      { "hooks": [ { "type": "command", "command": "D:\daily-kit\hooks\dsh-stop.cmd" } ] }
    ]
  }
}
```

**关键**：`command` 用 **`.cmd` wrapper 的纯路径**，不要写内联命令。实测 `cmd /c "bash.exe \"script\""` 这种形式在 Windows 下引号会被吃掉（`'\"C:\Git\usr\bin\bash.exe\"' is not recognized`）。wrapper 内容：

```cmd
@echo off
"C:\Git\usr\bin\bash.exe" "D:/daily-kit/hooks/dsh-stop.sh"
exit /b %ERRORLEVEL%
```

### profile patch（两处：web + headless）

`~/.dsh/profiles/<name>/cordis.patch.yml` 末尾追加：

```yaml
- insert:
    - id: hooks-claude-code
      name: '@deepseek-ai/dsh-hooks-claude-code'
      config:
        configPath: D:/daily-kit/hooks/hooks.json
```

`configPath` 用**正斜杠的 Windows 绝对路径**（dsh 是 Node 程序）。插件 `inject = ["shell", "sessionProjections"]`，两个 profile 都满足。

### 插件的真实能力（README 实证）

支持事件：`SessionStart` / `UserPromptSubmit` / `PreToolUse` / `PostToolUse` / **`Stop`**（"when the run is about to stop"，能 **force another step with a reason**）/ `SubagentStart` / `SubagentStop`。

限制：**只有 command hooks 执行**，`http`/`mcp_tool`/`prompt`/`agent` handler 被跳过并 warning；`configPath` **进程启动时读一次**，改了必须重启；hook 在 **project directory（session workspace）** 运行；exit 2 = 阻塞，其它 = 非阻塞。

## 三、插件激活的验证方法（这次靠它定位）

**`--dump-config` 只做「组合」，不做 plugin startup 检查**——它的 schema `$comment` 自己写明："Expression results, service dependencies, **plugin startup checks** … still require runtime validation"。所以 **dump 通过 ≠ 插件能起来**。

真正的验证方式：**起一个隔离实例看启动日志**。

```bash
dsh --profile web --port 3099 --no-open > /tmp/dsh.log 2>&1 &
```

启动日志里的 **`dsh: warning: <N> entry did not activate`** 是关键信号——没被点名的插件就是激活成功的。实测 3099 实例只报了一个：

```
dsh: warning: 1 entry did not activate
typert-loader (...): 1 typert contributor(s) failed to register:
  - dsh-mimir invocation "dsh-mimir#research/addEvidenceEdge" parameter codec has no create() factory
```

→ **`hooks-claude-code` 未出现在警告里 = 激活成功**。

## 四、headless 不触发（本次未解决）

三次实测，全部无效：

| 测试 | 结果 |
|---|---|
| `dsh --profile headless "Reply with exactly: OK"` | 日志无新增 |
| `--json` 看事件流 | 只有 `status/session/text/thinking/tool_call/tool_result/final`，**无任何 hook 事件** |
| 4 个事件（SessionStart/PreToolUse/PostToolUse/Stop）全挂 | 事件流里 `tool_call` 有，`PreToolUse` 无 |
| 在 git 目录 `cd /d/00-Inbox/work` 里跑（补 workspace） | 仍不触发 |
| 把 configPath 指向不存在文件（二分诊断） | **连 README 承诺的 warning 都没有** |

最后一条最说明问题：README 说 "If the hook config cannot be read or parsed, the bridge logs a warning and no hooks run"——**warning 都没出现**，说明 headless 的 run 路径根本没走到 hook 派发。

**待验**：web 模式（重启 3080 后在 UI 里发一条消息，再看 `stop-hook.log`）。

## 五、顺带发现的两个原有故障（与本次改动无关）

1. **`dsh-mimir` typert 注册失败**：`invocation "dsh-mimir#research/addEvidenceEdge" parameter codec has no create() factory` → 每次启动都会 `1 entry did not activate`
2. **`[mimir] venue deadline refresh failed: UNABLE_TO_VERIFY_LEAF_SIGNATURE`** → Node 的 TLS 走系统根证书链失败，报错信息自己给了方案：`NODE_OPTIONS=--use-system-ca`

## 六、新教训

1. **手写 JSON 含 Windows 路径时，用 Python 的 `json.dumps` 生成**——经过 JSON 传输层 + heredoc 两层，反斜杠会被吃掉 1-2 层
2. `powershell -File` 在 Git Bash 里要用**正斜杠**路径（`C:/tmp/x.ps1`），反斜杠被 bash 当转义
3. **自省命令（`--dump-config` / `--dump-config-schema`）不等于运行时验证**——想要「插件真的起来了」的证据，就得起一个隔离实例看启动日志
4. 隔离实例的黄金组合：**`--port <闲置端口> --no-open`**，可以随便折腾不碰生产实例（用户提示的方法，非常有效）

---

# 附：三处发现的处理结果（2026-09-27 同日）

## ① 已解决：TLS 证书链（`UNABLE_TO_VERIFY_LEAF_SIGNATURE`）

**现象**：每次启动 dsh 都有
```
[mimir] venue deadline refresh failed: [TypeError: fetch failed]
  [cause]: Error: unable to verify the first certificate ... UNABLE_TO_VERIFY_LEAF_SIGNATURE
```

**根因**：Node 默认用自己的 CA bundle，不走系统根证书库；`dsh-mimir` 刷新 ccfddl 会议 deadline 时握手失败。

**修法与实测**（Node v24.15.0）：

| 实例 | mimir/TLS 错误数 |
|---|---|
| 带 `--use-system-ca`（3098） | **0** |
| 不带（3099） | 2 |

**落地**：`D:\daily-kit\dsh-launch.sh`（在启动前 `export NODE_OPTIONS="${NODE_OPTIONS:-} --use-system-ca"`）。

**通用性**：这是 Windows 上 Node 生态的通用坑，和 `curl` 的 `CRYPT_E_NO_REVOCATION_CHECK` 同源（都出在证书链/吊销检查上）。诊断口诀：**curl 失败试 `--ssl-no-revoke`，Node 失败试 `NODE_OPTIONS=--use-system-ca`**。

## ② 已解决（绕开）：headless 场景的「跑完自动存档」

headless 不派发 hook（见正文四），所以用外壳补：

`D:\daily-kit\dsh-run.sh` —— `dsh --profile headless "$@"` 跑完后接一次 `daily.sh snap`。实测输出：

```
WRAPOK
  Reason : dsh headless: Reply with exactly: WRAPOK
  Trigger: wrapper
  1 file changed, 1 insertion(+)
```

## ③ 假设被排除：hook 不触发**不是** turnBoundary 缺失

曾假设 headless 缺 `dsh-session-turn-outline` 导致 `sessionProjections.stateOf(session,"turnBoundary")` 失败。**实测排除**：

- `turnBoundary` 由 **`dsh-agent-loop` 自己注册**（代码注释原文：*"the loop registers its own turnBoundary unit, so the key is always present"*）
- 读取处有防御：`stateOf(session, "turnBoundary")?.lastTurn ?? 0`，**不会抛异常**
- headless 与 web **都有** `dsh-agent-loop`
- 启动日志里也没有 hooks-claude-code 的未激活警告

**剩下最可能的解释**：插件在 `ctx.on("agent/created")` 里建立 agent → 配置的映射，后续 `agent/turn-stopping` 时查表；headless 的 agent 创建路径可能不走该事件，导致查表落空后**静默 return**（这正好解释「零 warning」）。属上游实现细节，未继续深挖。

**另一条已排除的路径**：dsh web 的 HTTP API 用 4 种方式（`Authorization: Bearer` / `Cookie` / `X-DSH-Token` / `?token=`）全都 401，说明它走的是别的握手协议（可能是带 token 的 WebSocket / 浏览器 trust fence），不适合脚本驱动。因此 web 模式的 hook 只能靠浏览器交互验证。

## ④ 定性：dsh-mimir 的 typert codec（上游兼容性问题）

```
dsh: warning: 1 entry did not activate
typert-loader: dsh-mimir invocation "dsh-mimir#research/addEvidenceEdge"
               parameter codec has no create() factory
```

- `dsh-mimir@0.21.0` 位置：`~/.dsh/profiles/web/node_modules/dsh-mimir`，在 `~/.dsh/profiles/web/package.json` 里声明
- 它是**研究助理插件套件**（literature search / research wiki / LaTeX compile）——`venue_search`、`wiki_note`、`meeting_deck` 这些工具都来自它
- peerDependencies 要求 `>=0.1.2-rc.1`，实际 dsh 是 `0.1.7-rc.2` → **版本要求满足，不是版本不匹配**
- 结论：dsh-mimir 的 typert 声明与 dsh 0.1.7 的 typert-loader 校验之间存在**契约漂移**
- 影响面：`typert-loader` 这个 entry 不激活 → `research/addEvidenceEdge`（研究 wiki 加证据边）不可用；mimir 其他功能不受影响
- 处理选项：更新 dsh-mimir / 等上游 / 接受局部缺失 / 向上游报 issue

## ⑤ 隔离实例方法论（本次最大收获）

用户提议的「起一个其他端口的实例自己验证」极其有效，已成为标准手法：

```bash
dsh --profile web --port 3099 --no-open --trusted-host 127.0.0.1:3099
```

- **不碰生产实例**，随便折腾
- 启动日志直接暴露：`dsh web: http://127.0.0.1:3099/?token=<token>`（token 可用于浏览器访问）
- 启动日志里的 `dsh: warning: N entry did not activate` 是**判断插件是否真正激活的唯一可靠信号**
- 用完 `taskkill //F //PID <pid>` 清理，注意别误杀 3080

对照实验也靠它完成：同一份改动，一个实例带修复一个不带，错误数 0 vs 2，结论无可争议。
