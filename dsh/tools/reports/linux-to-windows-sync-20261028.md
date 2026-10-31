# Linux → Windows 配置同步清单（2026-10-28）

> 来源：Linux 端已在 0.2.1-rc.4 上验证通过的完整配置。
> 目标：把这套配置原样搬到 Windows 的 `desktop` / `web` / `headless` 三个 profile。
> **本清单只做「配置同步」，不含 dsh 版本升级** —— 版本升级是独立步骤，风险更高，另行执行。

---

## 一、四处需要同步的配置

### ① `thinking-guard` 配置块

**Linux 现值**（`~/.dsh/profiles/web/cordis.patch.yml`）：

```yaml
- id: thinking-guard
  config:
    enabled: true
    thinkingOnlyMs: 300000
    maxThinkingChars: 200000
    repeatThreshold: 3
    sparseWindow: 0
    sparseMinCount: 30
    noveltyWindow: 4096
    noveltyThreshold: 0.2
    gramDensity: 2.7
    autoContinue: false
    notify: true
    verbose: true
```

**Windows 现值**：`enabled: false`，其余相同（`sparseWindow: 0` / `novelty*` 已在，因为 index.js 是同 md5 的新版）。

**唯一要改的一行**：`enabled: false` → `enabled: true`

**依据**：
- `thinking-guard@1.0.2` 的 `enabled` 确实被读取（`lib/index.js:404` `if (!cfg.enabled) return;` 在 `onStream` 首行）
- 日志「已启用」是无条件打印的（`:499`），所以「enabled:false 却打已启用」是日志撒谎，不是配置失效
- `sparseWindow: 0` 关掉误报 9.2% 的档，只留 `novelty`（误报 0.6%，作者源码注释里的 benchmark：40 条真实退化 + 163 条正常 reasoning）
- `autoContinue: false` 防止「熔断 → 注入继续 → 新 attempt → 再熔断」自激
- `notify: true` 现在安全，因为 `kind: 'plugin'` 已改成 `plugin:thinking-guard`（v4 合法形式）

### ② `subagent.maxActiveSubagents: 32`

三端都要有（Linux 与 Windows 已都有 ✓，此处仅记录）：

```yaml
- id: subagent
  config:
    maxActiveSubagents: 32
```

依据：`@deepseek-ai/dsh-subagent` 的 `static Config` 里 `maxActiveSubagents` 默认 8、上限 `Number.MAX_SAFE_INTEGER`；`.volatile()` 意味着每次新建/冷恢复现读，改完即时生效。

### ③ `concurrency-discipline` 注入插件

**三处缺一不可**：

```yaml
# a) 插件定义（放在 insert: 块内，缩进 10 空格，紧跟 plan-anchor 之前）
          - id: concurrency-discipline
            name: ../../.agent-presets/anchored-standard/concurrency-discipline.mjs
            config:
              concurrencyDiscipline:
                enabled: true
                cooldownSteps: 12
                firstAfterSteps: 3
                skipSubagents: true
```

```yaml
# b) context-gate 的 allowKinds 必须包含它，否则被剥掉
              allowKinds: [ skill-invocation, thinking-anchor, plan-anchor, concurrency-discipline ]
```

```bash
# c) preset 文件本体（三端共享同一份）
~/.dsh/.agent-presets/anchored-standard/concurrency-discipline.mjs
```

### ④ `compatibility.json` 含 `0.2.1-rc.4`

```json
{
  "dsh-headroom@0.3.0": ["0.2.0-rc.2", "0.2.1-rc.2", "0.2.1-rc.4"],
  "@lanbaolu/dsh-wechat-bridge@0.9.1": ["0.2.0-rc.2", "0.2.1-rc.2", "0.2.1-rc.4"]
}
```

依据：豁免是 per-exact-version 的，`dsh-app-boot/README.md:71` 原文「Neither plugin upgrades nor DSH upgrades inherit permission」。**每次升 dsh 都要手动加一个 runtime 版本号**，这是既有惯例。

---

## 二、验证方法

```bash
dsh --profile web --dump-config | grep -A6 'allowKinds'      # 必须看到 concurrency-discipline
dsh --profile web --dump-config | grep -A14 'id: thinking-guard'  # 必须看到 enabled: true
dsh --profile web --dump-config | grep -A3 'id: subagent'    # 必须看到 maxActiveSubagents: 32
```

**注意 `grep -A3` 会截断列表** —— 验证 `allowKinds` 这类必须 `-A6` 以上（这个坑已踩过）。

---

## 三、生效条件

| 改动类型 | 生效方式 |
|---|---|
| `cordis.patch.yml` | `patchReload: live` ⇒ **开新会话即生效**，不必重启 |
| `.agent-presets/*.mjs` | **必须重启 dsh 进程**（不参与 HMR） |
| `node_modules` 内的 bundle | **必须重启 dsh 进程** |
| `compatibility.json` | 启动时读取 ⇒ **必须重启** |

---

## 四、回滚

每处改动都有 `.bak-<ts>-pre-*` 备份。回滚 = `cp <bak> <file>` + 重启。

---

## 五、不在本清单内的（需要单独决策）

- **dsh 0.2.1-rc.2 → rc.4 升级**：桌面端必须整目录换（`DeepSeek Harness.exe` + `app.asar` 一起），只换 asar 会崩；NSIS 安装器在这台机器上永远 rc=2（穷举过），走 7z 切包 + rename
- **`dsh-headroom` 是否需要**：它 requirements 只到 `<0.2.0-0`，靠 `compatibility.json` 豁免运行；bili 不能替代它（bili 压已消费对话段，headroom 压单条 tool output 进 prompt 之前）
- **是否换 `@mrweicodes/dsh-loop-guard`**：它有 `escalate: 'warn'|'steer'|'cancel'`，比 thinking-guard 的 hard cancel 更优雅，且 10-23 仍在更新
