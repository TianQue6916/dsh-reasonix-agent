---
id: "5e75d1d8-8be2-42ac-b68a-81d376563f0f"
title: "thinking-guard 参数语义陷阱与三端配置同步：sparseWindow:0 必触发、apply() 只跑一次、dsh headless 验证法（2026-10-28）"
description: "2026-10-28 重新启用 @ethanwong-hk/dsh-thinking-guard 后的调查闭环：sparseWindow:0 使 share 恒为 1.0 而必然熔断、正确「禁用」写法、apply() 只 mergeConfig 一次导致 patch 热重载不生效、dsh headless --patch 无需网页的真实验证法及 overlay name 必须指向 lib/index.js、YAML 列表 grep -A6 判据，以及三端（Win desktop / Win web / Linux）对齐现状与 rc.4 vs rc.2 唯一差异。补充文档 63b4b573 的启用侧后续。"
status: "active"
created_at: "2026-10-28T08:23:25.103Z"
updated_at: "2026-10-28T08:23:25.103Z"
content_hash: "f3d0fef7b1f68c29d558fc819befb1c61edefa9c5a700062cf6718cce8fde3e4"
source_paths:
  - ".dsh/PLAN.md"
  - ".dsh/profiles/desktop/cordis.patch.yml"
  - ".dsh/profiles/web/cordis.patch.yml"
  - ".dsh/profiles/web/node_modules/@ethanwong-hk/dsh-thinking-guard/lib/index.js"
  - "tools/reports/linux-to-windows-sync-20261028.md"
session_ids:
  - "8e1054e1-ed1b-445a-b2a8-501b8f6e449f"
memory_body_ids:
  []
---

# thinking-guard 参数语义陷阱与三端配置同步（2026-10-28）

承接 `63b4b573`（误熔断 → 渲染崩溃链条取证 + 三端 `enabled: false` 回滚）。本轮是**重新启用侧**的闭环：先对齐 Linux/Windows 配置、打开 `enabled`，随后连续四次被熔断打断，最终定位到三个彼此独立的缺陷。

## 缺陷一：`sparseWindow: 0` 不是「关闭」，而是「必然触发」

原以为把 sparse-repeat 那一档的窗口设为 0 等于禁用，实际相反。判据在插件源码 `lib/index.js`（约 177 行）：

```js
if (peak >= cfg.sparseMinCount && share >= cfg.sparseMinRatio) { … }
```

`share` = 重复次数 / 窗口内总句数。`sparseWindow: 0` 使分母退化为 0 ⇒ **`share` 恒为 1.0** ⇒ 只要 `peak >= sparseMinCount`（当时设 30）就必定熔断。

熔断日志样例（三端同源，count 依次 35 / 68 / 56）：

```
[thinking-guard] 已中止当前活动：检测到纯思考空转。
原因：思考内容陷入重复循环（短句「好。」在最近 0 字内出现 35 次（稀疏复读））
      （本回合 reasoning 1024 字符，text 0 字符，工具调用 0 次）
```

**正确写法 —— 用不可达阈值禁用，而非 0：**

```yaml
sparseWindow: 4000        # 恢复默认窗口
sparseMinCount: 999999    # 闸门抬到永不可达，才是真正的「关掉」
```

通用教训：**窗口/阈值型参数的「禁用」应使用 Infinity-like 大值，`0` 往往意味着判据恒真。** 当时的诱因是长思考里习惯用「好。」分段，一次 reasoning 里几十个 —— 熔断器本身没冤枉，是配置把它放大成必触发。

## 缺陷二：`apply()` 只 mergeConfig 一次，`patchReload: live` 不保证重跑

`cfg = mergeConfig(config)` 在 `apply()` 内计算一次，之后每个 stream 事件都读闭包里那个 `cfg`。patch 文件被 watch 到并重载只会重新合成 config，**不保证已 apply 的插件重跑 `apply()`**。

后果：文件已改、`dump-config` 已显示新值，但**当前会话进程仍持旧 `cfg`**（`enabled: true` + `sparseWindow: 0`），于是修完之后仍被打断。唯一 100% 生效的手段是**开新会话 / 重启**。

**判据分层**：`dump-config` 只能证明配置合成正确，不能证明运行时行为；二者的差距必须用真实 turn 的日志来闭合。

## 缺陷三：验证 YAML 列表时 `grep -A3` 会骗人

`dump-config | grep -A3 'allowKinds'` 只显示 3 项，把第 4 项 `concurrency-discipline` 截掉，导致误判「Linux 没补上」；实际第 151 行是完整的：

```yaml
allowKinds: [ skill-invocation, thinking-anchor, plan-anchor, concurrency-discipline ]
```

**验证 YAML 列表必须 `-A6` 以上。**

## 无需网页的真实验证法：`dsh headless` + `--patch` overlay

`dsh headless "任务"` 会跑一个真实 agent turn 然后退出，工具调用与插件加载链路都在，适合在没有浏览器/不想重启用例时验证插件。

```bash
dsh headless --patch /tmp/tg.yml "只执行一条 bash：echo OK2；把输出原样返回"
```

overlay 里挂插件时，**`name` 必须指向入口文件，不能指向包目录**：

```
Error [ERR_UNSUPPORTED_DIR_IMPORT]: Directory import
  '.../node_modules/@ethanwong-hk/dsh-thinking-guard' is not supported resolving ES modules
→ 改为 .../dsh-thinking-guard/lib/index.js
```

成功判据（Linux 实测，三次 turn 均正常退出）：

- 启动日志含 `noveltyWindow=4096 noveltyThreshold=0.2` ⇒ 是含 novelty 的新版而非旧构建
- `[thinking-guard] 消息工厂 已就绪` ⇒ `createUserMessage` 解析成功，注入路径前提满足
- 真实 turn 产出 `HELLO_FROM_LINUX` / `OK2` / `FINAL_CHECK` ⇒ dsh 在 Linux 端完整可用

边界：**真实熔断无法用 prompt 构造** —— 要求模型「长时间内部推理且禁止输出」时它老实回答了，说明不空转。熔断只在自然长思考中出现，本身是健康信号。

## 熔断实测反证 v4 source kind 修复有效

三次熔断日志均**无 `注入说明失败`、无 `unreachable variant`、会话未崩、可继续对话**。对比修复前 Windows 每次都报 `unreachable variant`，说明把注入消息的 `kind` 改为 `plugin:thinking-guard`（v4 合法形式）确实解决了 row admission 拒绝问题 —— 从推论变为实测。

## 三端对齐现状（同步清单：`tools/reports/linux-to-windows-sync-20261028.md`）

| 项 | Win desktop | Win web | Linux |
|---|---|---|---|
| `thinking-guard.enabled` | 曾 true，后紧急 false | 同 | 曾 true，后紧急 false |
| `sparseWindow` / `sparseMinCount` | 4000 / 999999 | 同 | 同 |
| `noveltyWindow` / `noveltyThreshold` | 4096 / 0.2 | 同 | 同 |
| `maxActiveSubagents` | 32 | 32 | 32 |
| `maxParallelToolCalls` | 100 | 100 | 100 |
| `concurrency-discipline` 定义 + 在 allowKinds 内 | ✓ | ✓ | ✓ |
| `compatibility.json` 含 rc.4 | ✓ | ✓ | ✓ |
| thinking-guard 版本 | 与 Linux 同 md5 `52bcedc190f5` | — | 含 novelty 新版 |
| dsh 版本 | **0.2.1-rc.2** | 同 | **0.2.1-rc.4** |

**唯一剩余差异是 dsh 版本号**，需整目录替换 Electron（Windows NSIS 安装包解包有坑，宜 `npm pack` + 解包 + rename）。其余配置面已完全对齐。

## 恢复启用的前置条件与建议顺序

1. 先只做**配置同步**、不动版本 —— 出问题可只回滚配置，不必回滚整个 Electron 目录
2. 启用前确认三件事：`plugin:thinking-guard` 已修（不被 row admission 拒）、索引已含 novelty 新版、`autoContinue: false`（避免「注入继续 → 新 attempt → 再熔断」自激）
3. 启用后必须**开新会话**才拿到新 `cfg`（见缺陷二）
4. 观察面：`~/.dsh/logs/dsh-web.log` 出现熔断条目且无 `注入说明失败`、网页不空白 = PASS
5. 回滚：`cp ~/.dsh/profiles/web/cordis.patch.yml.bak-*-pre-enable ~/.dsh/profiles/web/cordis.patch.yml`

本轮最终结论：因连续打断用户体验不可接受，三端已回到 `enabled: false` 并保留 `.bak-*-pre-emergency-off`；`sparseWindow` / `sparseMinCount` 的正确值已就位，待新会话验证后可再启。

## 参考

- 前置文档（崩溃链条与 v4 kind 取证）：`63b4b573`
- 插件源码：`.dsh/profiles/web/node_modules/@ethanwong-hk/dsh-thinking-guard/lib/index.js`
- 三端 patch：`.dsh/profiles/desktop/cordis.patch.yml`、`.dsh/profiles/web/cordis.patch.yml`、Linux `~/.dsh/profiles/web/cordis.patch.yml`
- 跨机同步清单：`tools/reports/linux-to-windows-sync-20261028.md`
- issue 草稿：`tools/reports/issue-thinking-guard-2.md`
