> 来源：本技能原 `SKILL.md` 第一～四节（2026-10-01 重排时逐字保留，未作压缩）。第三、四节含首轮锚定机制与 anchored-standard preset。

## 一、Profile 模式（三种启动形态）

| Profile | 命令 | 用途 | 会话形态 |
|---|---|---|---|
| headless | `dsh --profile headless "任务"` | 单发任务，打印结果退出 | 一次性，无端口 |
| web | `dsh web`（或 `--profile web`） | 浏览器 UI + Web API（http://127.0.0.1:3080） | 常驻服务，可建多会话 |
| tui | `dsh --profile tui` | 终端 UI（本机未装） | — |
| sdk | `dsh --profile sdk` | JSON-RPC stdio，供 SDK client 用（0.1.5 新增） | 常驻进程 |
| sdk-minimal | `dsh --profile sdk-minimal` | 独立极简配置树的 SDK（0.1.5 新增） | 常驻进程 |
| acp | `dsh --profile acp` | ACP stdio，供自动化 client 用（0.1.5 新增） | 常驻进程 |

**dsh-gate 默认走 headless**（轻量、无端口、适合 Reasonix 调用）。web 模式用于 GUI 会话或需要选 preset 的场景。

## 二、工具呈现模式（Tool Presentation Mode）

`DSH_TOOLS_MODE` 环境变量（headless/web profile 的 `tools` 行均读取）：

| 值 | 含义 | 适用 |
|---|---|---|
| native（默认） | 工具以 function calling 呈现，模型直接调用 | 常规 |
| **code** | **创造模式**：只暴露 `run_code` 传输 + 生成 TypeScript/Python SDK，模型写程序驱动所有工具（SDK 绑定精确类型），只有 run_code 可直接调用 | 复杂编码/多步流水线任务，强制收敛到「执行者」路径 |
| both | 两种形式都有，native 调用也可执行 | 混合 |

启用方式：
```bash
# 命令行
DSH_TOOLS_MODE=code dsh --profile headless "任务"
# 或通过 dsh-gate
dsh-gate --mode code "任务"
dsh-gate --mode code --pro "创造模式深度任务"
```

## 三、首轮锚定极简机制（2026-08-16 启用；2026-09-20 适配 0.1.5）

headless profile 已打锚定 patch（`~/.dsh/profiles/headless/cordis.patch.yml`）：

- **首轮**只暴露 Minimal 工具对，persona = `You are a helpful software engineer assistant.`（与官方 Minimal 逐字节一致）
  - Windows（主力机 headless patch）：`pwsh` + `str_replace_editor`
  - Linux / web preset（anchored-standard）：`bash` + `str_replace_editor`（Windows 上该 `bash` 由 `custom-bash.mjs` 以 Git Bash 承载）
- 会话出现首次持久晋升信号（tool/call 或 assistant/message，先到者）后按 **resident set** 收敛：bootstrap 对 + 3 个发现工具（dev_tool_search / skill_search / skill_load）+ 模型显式解锁的工具。headless profile 未挂发现工具，故晋升后仍是 bootstrap 对（实测：首轮 2 → 晋升后 2；web preset 为 2 → 5）
- 首轮自动剥离技能目录提醒 + 工作区指令摘要（True Minimal 不挂载）
- 原理：V4 Pro 对首轮 API 可见工具目录强条件化——Minimal schema 5/5 锚定 "We need" 轨迹（let me≈0），Standard 25 工具 schema 11/11 落入 standard-like（"Let me" 漫游）。来源：xiaobright/dsh-anchored-standard（Project2 实测 98/99 vs Standard 91）

> ⚠️ **0.1.5 起必须显式挂载 `str_replace_editor`**：官方把默认文件工具换成 `read`/`write`/`edit`，`dsh-base` 不再挂载 `@deepseek-ai/dsh-tool-str-replace-editor`。若锚定首轮的工具名缺失，`tool-bootstrap.mjs` 会 `warnOnce` 后**降级为全量工具目录**（锚定静默失效）。headless patch 已补挂载；preset 的 `agent.cordis.yml` 本来就有该行。
> ⚠️ **0.1.5 的另一个必改点（更严重）**：preset 里 `@deepseek-ai/dsh-persona` 的 config 字段由 `text` 改名为 **`prefix`（必填）**。写旧名会让**整个 preset 挂载失败**，web 侧选该 preset 直接 `SessionCreateError`（会话建不出来）。已修，详见第十一节。
> 判定是否退化：跑一次 headless，解压会话看首个 `request/header` 的 tools 数——**2 = 锚定生效，26 = 已退化**。

**验证锚定是否生效**：
```bash
# 0.1.5 起会话文件为 session.v3.jsonl.zstd（旧版为 session.jsonl.zstd，两者并存）
zstd -dc ~/.dsh/sessions/*/session-*/session.v3.jsonl.zstd | python3 ~/.reasonix/global-workspace/scripts/dsh-analysis/analyze-session.py -
# 首个 request/header 的 tools 应为 ['pwsh', 'str_replace_editor']（Linux/preset 为 bash）
```

## 四、anchored-standard 预设（web 用）

已安装到 `~/.dsh/.agent-presets/anchored-standard`（目录复制，无编译）。
用法：`dsh web` 启动 → 新建会话 → 选择 **Anchored Standard (experimental)**。
特性：首轮 Minimal 工具对 + minimal persona；晋升后 resident 集 = bootstrap 对 + 3 个发现工具（dev_tool_search / skill_search / skill_load），重型工具按需解锁；压缩后回到受控阶段。
