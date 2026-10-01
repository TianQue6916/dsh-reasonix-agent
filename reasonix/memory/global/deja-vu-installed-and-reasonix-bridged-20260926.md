---
id: mem-80422fab5bfb5227d27b33cc5b439bc4
revision: 2
created_at: "2026-09-26T16:12:22.078Z"
updated_at: "2026-09-26T16:20:20.417Z"
name: deja-vu-installed-and-reasonix-bridged-20260926
description: "deja-vu 0.21.2 落地 + 零开发桥接 reasonix（49 会话）；issue #4053 已提交；session-index.mjs 已退役；新配置经 3081 验证通过，3080 待用户择时重启"
metadata:
  type: user
  fact_type: reference
  scope: global
---

# deja-vu 落地 + 零开发桥接 reasonix（2026-09-26）

## 一、装了什么
- **deja binary**：`~/.dsh/profiles/web/node_modules/@vshulcz/deja-vu-windows-amd64/bin/deja.exe`（v0.21.2，随 npm 包自带，**不需要手工下载** —— GitHub release 在国内太慢，4MB 下 5 分钟没完）
- **dsh 插件**：`dsh plugin --profile web add dsh-deja` → 4.7s 装好，bundles 里已有 `dsh-deja`，`dsh --profile web --dump-config` **exit=0**，组合树里出现 `- id: deja`
- **索引**：`~/.cache/deja/index.db`（34MB）；首次索引 9.4 秒扫 802 个会话（deepseek/dsh 574 + zcode 222 + continue/copilot 等 9）
- 备份：`profiles/web/package.json.bak-20260926-pre-dsh-deja`

## 二、核心成果：**零开发把 reasonix 接进 deja**
### 原理（两条线索拼出来的）
1. reasonix 有**两套文件**：`<name>.jsonl`（主会话 = **标准 OpenAI chat 格式**，每行一条消息 `{"role","content"}`）+ `<name>.events.jsonl`（它自己的事件流，带 ts/usage/costUsd）
2. deja 的 `flatrole.go` 注释：*"Command Code and ZCode both write that shape under a Claude-Code-style `projects/<encoded-cwd>/<session>.jsonl` layout"* → **消息形状与 reasonix 完全一致**
3. `CommandCodeSessionFiles()` 用的是 **`walkFiles()` 递归遍历**（不限层数），`commandCodeIsTranscript` 只要求 `.jsonl` 后缀

→ 所以**不用建目录、不用写 Go**，直接把环境变量指向 reasonix 的会话目录即可：

```powershell
[Environment]::SetEnvironmentVariable('DEJA_COMMANDCODE_ROOT', 'C:\Users\27063\.reasonix\sessions', 'User')
```

实测：`deja last 6 --harness commandcode` → **49 个 reasonix 会话**进来（总 802 → 851），搜「方舟计划」命中 36 个会话。`.events.jsonl` 因每行无 `role` 字段被安全跳过（不产生垃圾会话）。

### 已知瑕疵（用 workaround 的代价）
- **无时间戳**：主 jsonl 没有时间字段 → 显示 `· - ·`，`--since` 过滤失效
- **无 project**：store 是扁平的，不是 `projects/<encoded-cwd>/`
- **harness 名显示为 `commandcode`**（误导）

## 三、deja 的能力（远超我写的 session-index）
`deja <query>` 全文检索带片段 · `deja resume <id>` 恢复会话 · `deja handoff --to <agent>` 跨 agent 交接 · `deja blame <path>:<line>` 哪行代码来自哪个会话 · `deja files <topic>` · `deja restore <path>` · `deja fix "<error>"` 这错误以前怎么修的 · `deja how <what>` 这项目实际跑过什么命令 · `deja recap --since 7d` · `deja secrets [--scrub]` 凭据泄漏清理 · `deja view` 本地 HTML 浏览器 · `deja sync ssh <host>` 双机同步 · MCP server（一个 tool，七种 mode，含 **remember**）。

## 四、待办
1. **重启 dsh web** 才能让 `dsh-deja` 插件在会话内生效（当前实例是旧配置）
2. **issue 草稿已备**：`~/.dsh/storages/community-readmes/deja-issue-draft-reasonix.md`（3054 bytes，英文，含 store 布局/消息形状/四项缺失/建议的 reasonix.go 形状）→ 待用户确认后提交
3. 归档：`token-budget.mjs` 已移到 `~/.dsh/_dropped-20260926/`（未挂载，可随时恢复）

## 五、教训
「先查社区再自写」再次被验证：deja 一个工具就覆盖了我 `session-index.mjs` 的全部功能，且多出恢复/交接/blame/凭据清理/双机同步。我写的 `session-index.mjs`（827 会话索引 + digest）现在是冗余的，可考虑退役。

## 六、后续进展（2026-09-27）

- **issue 已提交**：<https://github.com/vshulcz/deja-vu/issues/4053> —— 标题按项目约定写成 `harness: Reasonix — flat role/content JSONL in a flat sessions/ store (today only reachable via the Command Code ROOT)`（先查重：唯一命中是无关的 Kilo Code #3643）
- **session-index.mjs 已退役**：从 `cordis.patch.yml` 移除挂载（原地留退役说明注释，指向 deja 与归档路径），文件 + 613KB 索引缓存移入 `~/.dsh/_dropped-20260926/`；`--dump-config` exit=0，diff 只少两行
- **新配置已验证**：起 throwaway 实例 3081 → `LISTENING`（新配置能正常启动）→ 立即停掉，未影响任何运行中的进程
- **3080 未重启**（判断时机不对）：当时另有一个会话在跑 `dsh plugin --profile web add link:D:/Toolbox/goat-gateway/dsh-plugin-local-search`（改同一个 profile），还有 headless 批量校对任务在跑（`--patch ... 100b/p003/repair`）
- **待用户**：挑空闲时机重启 `dsh web --no-open`，`dsh-deja` 才会在会话内生效（CLI 侧现在已可用：`deja "关键词"` / `deja blame <path>` / `deja last`）
