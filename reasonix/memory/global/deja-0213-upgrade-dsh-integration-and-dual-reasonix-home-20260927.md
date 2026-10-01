---
id: mem-66718fec2a4b7c155299d82ead494a05
revision: 1
created_at: "2026-09-27T10:09:19.449Z"
updated_at: "2026-09-27T10:09:19.449Z"
name: deja-0213-upgrade-dsh-integration-and-dual-reasonix-home-20260927
description: "deja 定位与升级到 0.21.3（reasonix 成一等 harness、索引 851→1294 sessions）、dsh 侧集成安装与启动验证；并记录本机双 reasonix home 导致的 memory 双份漂移这一结构性坑"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 一、deja 从未安装失败 —— 它一直在，只是不在 PATH

**二进制位置**（`dsh-deja` 插件的依赖，随 profile 安装）：
```
~/.dsh/profiles/web/node_modules/@vshulcz/deja-vu-windows-amd64/bin/deja.exe
```

## 二、升级到 0.21.3（2026-09-27）

`dsh-deja` 声明 `"dsh-deja": "^0.21.2"`，npm 上 latest 已是 **0.21.3**。`pnpm update dsh-deja` **静默失败**（仍 0.21.2），必须显式：
```bash
cd ~/.dsh/profiles/web && pnpm add dsh-deja@0.21.3
```
升级后：`package.json` → `^0.21.3`；`node_modules/@vshulcz/deja-vu` → 0.21.3。
备份：`package.json.bak-<ts>-pre-deja-0213`、`pnpm-lock.yaml.bak-<ts>-pre-deja-0213`。
注意 `pnpm` 会报 `Packages: +1 -101`（prune 掉多平台二进制变体），**属正常**，dsh 不受影响。

## 三、0.21.3 的核心收益：reasonix 成为一等 harness

`deja sources` 升级前后对比：

| 升级前 | 升级后 |
|---|---|
| `commandcode  ~\.reasonix\sessions  49 sessions  5945 msgs` | `commandcode  ~\.reasonix\sessions  49 sessions`（legacy 保留） |
| — | **`reasonix  C:\Users\27063  447 sessions  81254 messages  288.6 MB`** |
| `deepseek  ~\.dsh\sessions  572 sessions` | 同左 |

重建索引：`deja index` → `updated 523 files (81185 new messages)`。
`deja stats` 最终：**1294 sessions / 83456 messages**，范围 2025-10-01 → **2026-09-27**，`[reasonix] 443 sessions 69878 messages`。
不再需要 `DEJA_COMMANDCODE_ROOT`。

## 四、dsh 侧集成已装（`deja install deepseek-auto --no-index`）

生成并验证生效：
- **`~/.dsh/cordis.patch.yml`** ← **dsh 会读取它**（`dsh --profile web --dump-config` 里能看到 `mcp-deja` / `deja-command` / `deja-auto` 三条，位置在 2205–2217 行）
- `~/.dsh/plugins/deja/{auto.js, command.js, package.json}`
- `~/.agents/skills/deja-history/SKILL.md`、`~/.agents/skills/deja-search/SKILL.md`

**兼容性警示**：`dsh-deja@0.21.3` 自报 `"compatibility": {"dsh": "0.1.1-rc.2"}`，而本机是 **0.1.7-rc.2**（领先 6 个 minor）。实测**无问题**：
- 起临时实例 `dsh --profile web --port 3099 --no-open` → 正常启动（无 `did not activate`），验证后已杀（PID 67624），3080 的 52540 未动
- `deja mcp` 做 `initialize` 握手成功，返回完整 capabilities + instructions

备份：`~/.dsh/settings.yaml.bak-<ts>-pre-deja`。

## 五、0.21.3 release 与 issue 状态（用户被点名）

- Issue **#4053** 维护者回复（2026-09-27T09:58:10Z）：Landed in 0.21.3 via #4067；用户给的 `code-scripts-202606200404` 例子已进 `internal/sources/reasonix_test.go` 作 fixture
- Discussion **#4075**：`Reasonix, the thirty-fifth harness deja reads (#4053, requested by @TianQue6916)`
- **deja 的 root chain**：`REASONIX_STATE_HOME` → `REASONIX_HOME` → `config.toml` 的 `[storage] state` → `~/.reasonix` → Windows 上 `%APPDATA%\reasonix`

## 六、⚠️ 结构性发现：两个 reasonix home 并存，memory 双份漂移

本机**同时存在两个 reasonix home**，且都活跃：

| home | 谁在读写 | 证据 |
|---|---|---|
| `C:\Users\27063\.reasonix\` | **dsh 侧的 memory 工具**（`memory_remember`/`memory_search` 写这里） | `memory/global/MEMORY.md` mtime 随每次写入更新；338 个条目 |
| `C:\Users\27063\AppData\Roaming\reasonix\` | **reasonix 桌面版**（config.toml 就在这，09-27 10:22 改过） | 其 `memory/global/MEMORY.md` 停在 09-26 21:08；321 个条目 |

**两处 memory 只在 G1 有的 28 个、只在 G2 有的 11 个** → 不是同步关系，而是**各自独立演化**。
**后果：用户在这两处的记忆不互通。**

**同类坑（今天误判 3 次都是它）**：
- `reasonix.toml`：`%APPDATA%` 那份是**已修复版**（6002 B / mtime 09-20 14:54 / 0 明文密码 / 11 条 allow / 有横幅 / Windows 绝对路径），`~/.reasonix` 那份是 **07-31 旧版**（4154 B / 7 条 / **含明文 SSH 密码**）
- `global-workspace`：`%APPDATA%` 那份是 git 仓库（master，`.git/info/exclude` 被 `rx-doctor` 于 09-23 重建为 22 行），`~/.reasonix` 那份无 `.git`

**已做**：清理 `~/.reasonix/global-workspace/reasonix.toml` 的明文密码（`allow` 7 → 5 条，TOML 复解析通过），备份 `reasonix.toml.bak-<ts>-pre-redact-pw`。

**待决策**：memory 归一策略（要么让两端指向同一目录，要么加同步；否则记忆永远分裂）。

## 七、判定规则（血泪版）

**在这台机器上，任何涉及 reasonix 路径的结论，必须先确认是 `~/.reasonix` 还是 `%APPDATA%\reasonix`。** 两个 home 都真实存在、都在被写、内容不同。今天的 3 次误判（cron 时间、`global-workspace` 大小、`reasonix.toml` 修复状态）全部源于此。
