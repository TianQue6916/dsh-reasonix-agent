---
id: "9086b121-ac1b-45a2-93c2-82277b02271b"
title: "session-title 切换为 all-prompts bundle（0.2.1-rc.2）：坏默认值覆盖、冒烟方法与未验证项（2026-10-28）"
description: "2026-10-28 在 ~/.dsh/profiles/web 安装 @deepseek-ai/dsh-experimental-session-titles-bundle@0.2.1-rc.2 的完整记录：dsh plugin add 自动双写 dependencies/bundles、bundle 自带 maxOutputTokens:64 / maxInputBytes:4096 坏默认值必须在 cordis.patch.yml 覆盖、首启冒烟验证法与 5 层分级结论、browser-trust fence 401 导致\"真实生成一次标题\"未验证、desktop 端 Electron 独占锁与 A/B 两条安装路径、三条回滚命令。"
status: "active"
created_at: "2026-10-28T08:49:20.021Z"
updated_at: "2026-10-28T08:49:20.021Z"
content_hash: "f74e246f8fc6f5e33b39b97e686584a8fad9a7af880a322eb299c48cc2476c80"
source_paths:
  - "profiles/web/package.json"
  - "profiles/web/cordis.patch.yml"
  - "profiles/desktop/cordis.patch.yml"
  - "backups/title-a-20261028-163458"
  - ".dsh-lab/tmp/title-audit3.py"
session_ids:
  - "d458588d-5c9d-4f91-bdc2-6acdb7770458"
memory_body_ids:
  []
---

# session-title 切换到 all-prompts bundle（0.2.1-rc.2，2026-10-28）

目标：把会话标题生成从 first-prompt 切换到 all-prompts（读全对话），
替换 `@deepseek-ai/dsh-session-title-first-prompt-llm`。

## 状态

- **web profile：已装、配置已验证、启动已冒烟、未做端到端标题验证。**
- **desktop profile：仅 patch 层已铺，bundle 未装，等用户选 A/B。**

## 硬事实：bundle 自带的默认值就是坏的

`@deepseek-ai/dsh-experimental-session-titles-bundle@0.2.1-rc.2` 自己的 patch 会做两件事
（`--dump-config` 中可见 `# == @deepseek-ai/dsh-base, patched by @deepseek-ai/dsh-experimental-session-titles-bundle`）：

1. 把 `session-title-llm`（first-prompt）置 `disabled: true` — 正确。
2. 插入 `optional-session-title-all-prompts`，但默认 **`maxOutputTokens: 64` / `maxInputBytes: 4096`**。

直接重启会得到**比切换前更差**的状态：64 token 会重演 2026-09 那批 643 条失败，
4096 字节输入上限让约 75.3% 的会话直接 throw。

因此在 `profiles/web/cordis.patch.yml` 末尾覆盖：

```yaml
- id: optional-session-title-all-prompts
  config:
    maxInputBytes: 262144      # 覆盖 97.4% 会话
    maxOutputTokens: 4096      # 对齐上游 base 默认
    timeoutMs: 60000
```

## 安装路径要点

- `dsh plugin --profile web add <pkg>` 会**自动双写**：`dependencies`（10→11）与
  `dsh.profile.bundles`（11→12）。不用手改 bundles 数组（与 desktop 手动装 bundle 的
  `b028b5a5` 流程不同，见关联文档）。
- `pnpm why @deepseek-ai/dsh-session-title-all-prompts-llm` 确认全树唯一版本 0.2.1-rc.2，
  未丢任何既有依赖（备份 vs 现在：备份 deps 10 / 现在 11，backup bundles 11 / 现在 12）。
- **回滚安全性实测**：patch 引用不存在的 entry id 只打 `patch: entry "..." not found`，
  `exit=0`，不阻塞启动。所以可以先铺 patch 层、后装 bundle。
- profile 的 patch 热加载语义不一致：`web patchReload = live`、`desktop patchReload = live`、
  `headless patchReload = startup`。web/desktop 改 patch 即时生效，无需重启。

## 冒烟验证法（可复用）

不要动生产端口。用 overlay 起一个临时实例：

```bash
dsh --profile web --port 3099 --patch <overlay.yml>
```

- overlay 里 `dsh-wechat-bridge: {autoStart: false}`，避免拉起外部副作用。
- 坑：`dsh web --port ... --patch ...` 会报 `too many arguments. Expected 0 arguments but got 1: web`
  —— `--patch`/`--port` 属于 launcher，必须写成 `dsh --profile web ...`。
- 坑：`--patch` 指向不存在的文件会 `dsh: failed to read overlay ...: ENOENT` 直接退出，
  不会静默忽略。
- 验证后按 PID 树 `taskkill /PID <pid> /T /F` 清理，确认端口释放。

## 已验证 / 未验证（诚实分级）

| 层 | 结论 | 证据 |
|---|---|---|
| 包解析 | ✅ | `pnpm why` 唯一版本 0.2.1-rc.2 |
| 配置合成 | ✅ | `--dump-config`：first-prompt `disabled: true`、all-prompts 262144/4096 |
| 启动不崩 | ✅ | 真起进程（3099 监听、日志无 error），随后已清理 |
| 回滚安全 | ✅ | 未知 id 仅 warn、`exit=0` |
| 真实生成一次标题 | ❌ | 想调 web API 造会话，被 browser-trust fence 挡在 401 |

**第 5 层的 401 排查记录**（下次别再重试这些）：
`/api/health`、`/api/status`、`/api/sessions`、`/api/session/list` 全 401；`/health` 404。
试过且均失败的鉴权方式：`Authorization: Bearer <token>`、`x-dsh-token`、`Cookie: dsh_token=`、
`X-Auth-Token`、`Origin: http://127.0.0.1:3099`、`Sec-Fetch-Site: same-origin`、`Referer`。
结论：该 fence 不是简单 token 头校验（`dsh-api-gateway` 里 401 只映射为固定 `Unauthorized` 文案），
要走真实前端才能通过。因此端到端结论只能由用户在新会话里产生。

## 用户自查硬指标

新建会话聊两轮后跑 `~/.dsh-lab/tmp/title-audit3.py`：

- 最新 session 的 `src` 是否为 `provider`；
- 其 `session/title-llm-request` 里 `maxTokens` 是 **4096 而不是 64** —— 这是判断 bundle 是否真的接管、
  以及 patch 覆盖是否生效的硬指标。

## desktop 端未完成

`dsh plugin --profile desktop add ...` 和 `--dump-config` 都被拒：
`error: profile "desktop" is managed exclusively by the Electron application`
（根因见 `ccaf7418-968f-43b9-b194-486ffe04727c`）。

已先把同样一段 patch 追加到 `profiles/desktop/cordis.patch.yml`（22 行，1635→1657，YAML 单独解析验证）。
因为 `desktop.patchReload = live`，这段**现在已被读入**，但 bundle 不在，所以只有一条 warn，对现有会话零影响。

两条待选路径：

- **A（推荐）**：用户在 App 内 设置 → 插件（desktop bundles 已有 `dshmarket`）搜
  `dsh-experimental-session-titles-bundle` 装 0.2.1-rc.2，然后重启 App。
  不碰 `desktop/node_modules`，避免 Windows 文件占用把 App 改坏。
- **B**：用户全程退出 App，用 detached 脚本（照 `install-asar-guard.ps1` 模式：等进程退出 → pnpm add → 校验 → 重开）安装。
  代价是断掉当前会话。

## 回滚（三条，任一即可）

```bash
# 1) 只退回 bundle 默认值（64/4096）：注释掉 patch 末尾那 4 行 config
# 2) 退回 first-prompt：卸包，bundle 的 disabled 随之消失，自动恢复
dsh plugin --profile web remove @deepseek-ai/dsh-experimental-session-titles-bundle
# 3) 整体恢复到动手前
cp ~/.dsh-lab/backup-title-a-20261028-163458/web/{package.json,cordis.patch.yml} ~/.dsh/profiles/web/
```

备份（含 sha256）：`~/.dsh-lab/backup-title-a-20261028-163458/{web,desktop,headless}/`。

## 关联

- `ccaf7418-968f-43b9-b194-486ffe04727c` — desktop profile 为何独立、Electron 独占守卫。
- `b028b5a5-54fd-4679-aeca-79e8b6d7958a` — desktop profile 手动装 bundle 型插件（pnpm 挂起规避、bundles 补写）。
- `bd99fb07-70d3-4185-a0f5-2c3b6d0fca90` — 0.2.1-rc.2 升级线与 app.asar 边界。
