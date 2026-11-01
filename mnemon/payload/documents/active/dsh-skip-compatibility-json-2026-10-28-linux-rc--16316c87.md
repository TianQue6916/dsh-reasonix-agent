---
id: "16316c87-2d8b-46b8-842e-92e897a3ede8"
title: "DSH 升级后的插件 skip / 假状态排查：compatibility.json 精确版本豁免 + 三例「日志撒谎」取证（2026-10-28 Linux rc.4）"
description: "DSH runtime 升到 0.2.1-rc.4 后，插件被 skip 的真因是 profile 自己的 compatibility.json 缺少精确新版本号（dsh-headroom 不在 npm、上游 peer <0.2.0-0，拉最新无用）；含 allow-version 对 desktop 不可用、thinking-guard 旧构建与 enabled 假日志、mnemon profileContext stale-service 空跑、EADDRINUSE 放大 warn 的取证方法与结论。"
status: "active"
created_at: "2026-10-27T20:58:01.046Z"
updated_at: "2026-10-27T20:58:01.046Z"
content_hash: "18b48d58cf3c69389c0efb0477007a6ae99926465eed1a207abc754906bdb684"
source_paths:
  - "profiles/desktop/compatibility.json"
  - "profiles/web/compatibility.json"
  - "profiles/web/node_modules/@ethanwong-hk/dsh-thinking-guard/lib/index.js"
  - "tools/reports/issue-thinking-guard-2.md"
  - "PLAN.md"
session_ids:
  - "45653da3-ab2e-4cb5-9d64-4a8a52c4b0db"
memory_body_ids:
  []
---

# DSH 升级后的插件 skip 与「假状态」排查（2026-10-28，Linux 0.2.1-rc.4 实验田）

关联文档：`63b4b573-fc37-4f02-b0a7-dab235ce4e22`（thinking-guard session format v4 拒绝裸 `kind:'plugin'` 的渲染崩溃取证，同一插件的另一支问题）、`c81e9fe7-b108-4f68-a8b2-326a2b26935c`（patch entry 的 `name` 必须是真实包名）。

## 1. 插件被 skip 的真因：`compatibility.json` 是**精确版本白名单**，不继承

`dsh-app-boot/README.md:71` 原文要点：

> 豁免是「`package@version` → 精确 DSH runtime 版本列表」，写在 profile 自己的 `compatibility.json` 里……**Neither plugin upgrades nor DSH upgrades inherit permission.**

即：
- 升级 DSH runtime 后，**每个受控插件都要手动追加新版本号**，否则启动时 `skipping profile bundle "<name>"`。
- 升级插件版本也不会继承旧条目的授权（键是 `package@version`，版本一变键就变）。
- 只能写文件；`dsh plugin --profile desktop allow-version` 会直接报
  `profile "desktop" is managed exclusively by the Electron application`。
- `headless` profile 没有 `compatibility.json` 时无需处理。

实际修复写法（`profiles/{desktop,web}/compatibility.json`）：

```json
{
  "dsh-headroom@0.3.0": ["0.2.0-rc.2", "0.2.1-rc.2", "0.2.1-rc.3", "0.2.1-rc.4"],
  "@lanbaolu/dsh-wechat-bridge@0.9.1": ["0.2.1-rc.4"]
}
```

验证：重启后日志里 `skipping profile bundle "dsh-headroom"` 计数从 N 变 **0**，且 `storages/dsh-headroom-ccr.json` 仍在写入（说明插件真的活着，不是被静默丢弃）。

### 反例：不要把这类 skip 误判成「没有适配版、需要升级插件」

`dsh-headroom` 的事实：`npm view dsh-headroom` → **404**（根本不在 npm 上，只以 `git+github.com/giter00/dsh-headroom.git` 分发）；上游最新 commit `ca5de630` 停在 2026-08-23，peer 范围仍是 `>=0.1.0-rc.1 <0.2.0-0`。**拉上游最新也解决不了**。所以正解不是升级插件，而是本地补版本豁免。

### 卸载也不是正解
`bili`（billion-context）压的是**已消费的对话段**，`headroom` 压的是**单条 tool output 进 prompt 之前**（本会话里表现为 `[headroom: hr:…]` 标记）且可逆。卸掉 headroom 会直接丢掉这一层上下文压缩。

## 2. 插件二进制在不同机器上可能不是同一构建

Linux 的 `@ethanwong-hk/dsh-thinking-guard/lib/index.js` 一度是 **18286 B / md5 `b038d877`** 的旧构建，**完全没有 novelty 逻辑** —— 于是 `noveltyWindow` / `noveltyThreshold` / `sparseWindow` 全是**死配置**（配了但不被读）。

判据（不靠版本号字符串，靠内容）：
- 大小 / md5 与另一端比对
- `grep -c noveltyWindow` 的命中数（新构建 8 处，旧构建 0）
- `grep -c` 某次具体修复的标记（如 v4 修复 2 处）
- `node --check lib/index.js` 确认语法

同步方式：从正常端 `scp` 覆盖，**先备份** `lib/index.js.bak-<ts>-<why>`，重启后看启动日志是否出现新参数名（`noveltyWindow=4096 noveltyThreshold=0.2`）才算生效。

## 3. 日志会撒谎：`enabled: false` 仍然打印「已启用」

`dsh-thinking-guard` 的实际情况：
- `lib/index.js:404` 的 `if (!cfg.enabled) return;` 在 `onStream()` 首行 ⇒ **`enabled` 确实被读取、确实生效**。全文件只有 4 处涉及 `enabled`（`:30` DEFAULTS、`:120` 环境变量、`:404` 唯一读取点）。
- `lib/index.js:499` 的 `log('已启用：…')` **不判 `enabled`**，只要 `verbose: true` 就无条件打印。

结论：**「配置 false 却打印已启用」是日志缺陷，不是配置失效。** 一个 profile 若每次 turn/scope 重建都 `apply()`，这条会以约「每 31 行一次」的密度刷屏（某次日志统计 716 次）。

排查范式：**先找配置项的读取点（谁 `if (!cfg.x) return`），再判断日志语句是否与读取点同条件。** 不要用日志文本推断配置是否生效。

## 4. 一个反复出现的刷屏数字，往往是循环放大而不是根因

`dsh-web.log` 里 `profileContext` 相关 warn 出现 **465 次**，看起来像 mnemon 在刷屏；但紧邻的 `startup failed: 2 required plugins did not activate` 实际是
`webserver (required) @deepseek-ai/dsh-host-webserver — Error: listen EADDRINUSE: address already in use 127.0.0.1:3080`。
**465 次是「端口占用 → supervisor 重启 → 又占用」的循环放大的结果**，mnemon 只是每次都恰好跟着打一行。

判据：同一 warn 的次数 ≈ supervisor 重启次数时，先查 `EADDRINUSE` / 进程重复，再查该 warn 本身。清理到单实例后重跑，`EADDRINUSE` 计数应为 0。

## 5. `dsh-mnemon` 的 `profileContext` 报错：stale service reference + 空迁移源 = 双重空跑

- **写盘路径压根没执行**：真正的 `await this.editor.edit(...)` 在 dist 的 `:17904`，异常在 `:17874` 就抛了。
- **抛错真因是 stale service reference**：`ProfileMnemonSettings` 构造期（`:17692`）缓存了 `this.editor = ctx.get("configEditor")`；`loader.await()` 落地后 configEditor 被 reconcile 重建，旧实例的 `ownerContext` fiber 已 inactive ⇒ `dsh-config-editor/lib/index.js:40` 才抛。**不是服务缺失，也不是 rc.4 改名。**
- **即使不抛也什么都不做**：迁移源 `~/.dsh/settings.yaml.imported` 里 `grep -c mnemon` = **0**，top-level keys 只有 `agent-default-model / agent-loop / fallbacks / llm-pi-ai / permission / shell / …`，没有任何 mnemon section；`planLegacySettingsImport`（`:17594-17603`）会因 `!relevant.some(...)` 直接返回空 patch。

⇒ 可安全忽略。判定一个「迁移期报错」是否危险，两步：**① 写操作在哪一行、是否在抛错点之后；② 迁移源里到底有没有相关内容。**

## 6. 方法论（本次三次自我纠错换来的）

同一轮里三次误判，共同点是**都拿日志当证据**：

| 误判 | 实际 |
|---|---|
| thinking-guard `enabled:false` 是插件 bug | 配置生效，`verbose` 日志不判 `enabled` |
| dsh-headroom 缺适配版 | 包不在 npm，本机早已用手写 `compatibility.json` 豁免，只是漏了一个版本号 |
| 465 次 mnemon warn 是刷屏 | EADDRINUSE 重启循环放大 |

**结论：日志不能单独当证据。要读代码（找读取点/写入点行号）+ 读配置文件真实内容 + 对齐时间线与进程数。**问题定性为「某模块刷屏 / 某配置不生效」之前，先排除循环重启与「日志语句本身缺条件」这两类假状态。反之，**假关闭（以为关了其实没关）与假启用（日志说启用实际没读配置）比明确 bug 更危险**，应优先排查。

## 7. 本次落地清单（可复用为升级 checklist）

DSH runtime 升一个新版本号后，按序执行：

1. 备份 `~/.dsh` 与安装目录
2. 升级后跑 `dsh --version`、`dsh plugin ls`，抓 `skipping profile bundle` 与 `EADDRINUSE` 计数
3. 为 profile 的 `compatibility.json` 中**每个**受控 `package@version` 追加新 runtime 版本
4. 重启（先 `kill` 掉全部 `dsh web` 与 `billion-context` 进程，确认只剩目标实例），确认 `EADDRINUSE` = 0
5. 交叉检查各端插件文件是否同一构建（大小 / md5 / 特征字符串）
6. 确认关键插件真的在工作（看其产物文件在写、日志出现新参数名），而不是只看「没报错」

**注意**：`.agent-presets/**/*.mjs` 不参与 HMR —— `patchReload: live` 只 watch `cordis.patch.yml` 本身；新增/改动 preset 脚本必须重启进程才生效。改完 `cordis.patch.yml` 必须用 `dsh --profile <p> --dump-config` 验证（YAML 缩进错位会让插入块静默丢弃、命中 0；`insert:` 块内子行需按 12/14 递增缩进，不是统一 10 空格）。
