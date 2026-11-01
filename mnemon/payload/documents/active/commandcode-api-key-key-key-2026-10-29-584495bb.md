---
id: "584495bb-785a-4ab3-9a15-50367bd1fe64"
title: "commandcode API key 频繁失效真因（官方整批吊销）与 key 健康探活 / 换 key 工具落地（2026-10-29）"
description: "2026-10-29 排查「key 自己消失 / 经常过期」：真因是 Command Code 官方因 distillation 安全事件整批吊销全部 API key，而非「每次登录顶掉上一个 token」；实测无 refresh 端点、额度按账号不按 key；落地 key-health-watch.mjs（探活 + 告警）与 key-set.mjs（探测后原子写入），并记录 process.exit() 与 undici 的 UV assertion 崩溃坑。"
status: "active"
created_at: "2026-10-29T05:04:23.892Z"
updated_at: "2026-10-29T05:04:23.892Z"
content_hash: "f25d6cca6d01efe0940aa99e424bce1708186446769d24575c774db0a6e9ed9b"
source_paths:
  - "key-health-watch.mjs"
  - "key-set.mjs"
  - "keys.json"
  - "gateway.mjs"
  - "quota-http.mjs"
session_ids:
  - "73259eec-2c12-4c8c-925f-c6aa7759a0fe"
memory_body_ids:
  []
---

# commandcode API key 失效真因与 key 健康探活工具（2026-10-29）

**性质**：根因调查（带官方公告与社区证据）+ 两个运维脚本的落地交接。
**工作目录**：`D:\Toolbox\goat-gateway\`（Windows 侧）。

## 用户问题

用户反复遇到 API key「自己消失 / 经常过期」，「昨天刚换的」今天又 401。另一个 AI 给出的结论是「平台每次新登录会顶掉上一个 token，只有最新的有效」，并建议做自动抓取最新 token 写回 `keys.json`。

**这个结论是错的，也不是可实施的。**

## 真因：官方整批吊销

Command Code 官方在 2026-10-29 早上（约 07:16，1.3 万查看）发布公告：检测并阻止了一起针对 Anthropic / OpenAI 模型的大规模 **distillation attack** 安全事件，**作为预防措施 revoke 了全部 API key**，用户需重新登录 Studio 生成新 key。

社区现象与之吻合：「一觉醒来 Command code 的所有 api 都为空」「api key 全部被清空，重新建了一个」。
用户截图里 `mykey` 显示「已过期」而 `goat` 没有，即该事件的残留。

**判定法则**：看到一批 key 在很短时间内集中失效，先怀疑**上游事件**，不要用两分钟窗口内的两次观察去推「平台机制」。

## 为什么「每次登录顶掉上一个 token」是伪结论

那个 AI 的观察是：

| token | 03:15 | 03:17 |
|---|---|---|
| `user_2w8a…` | chat 200 ✅ | **401 ❌** |
| `user_3Nwd…` | — | chat 200 ✅ |

窗口只有 2 分钟，**正好落在吊销事件的余波里**，而不是稳态行为。它没查官方公告，把一次事故当成了平台机制。
（结论：诊断顺序应是「官方状态/公告 → 社区同期现象 → 自身端点实测」，而不是先自己归纳机制。）

## 「自动抓最新 token」技术上不存在

实测所有可能的端点，全部不可用：

```
GET /alpha/keys          -> 404
GET /alpha/api-keys      -> 404
GET /internal/keys       -> 404
GET /alpha/auth/refresh  -> 404
```

本机也不存在 CLI 登录凭据文件（均不存在）：
`~/.commandcode/auth.json`、`~/.pi/agent/auth.json`、`~/.local/share/opencode/auth.json`。

⇒ Command Code 的 key 是 Studio 手动生成的**静态凭据**，**没有 OAuth access/refresh 二元组，没有 refresh API**。
社区里所有「自动轮换」类项目做的都是**多账号 key 池 + 401/429 轮换**，没有一个在做「自动刷新」。

**关键前提（社区提醒）**：5 小时额度按**账号**限制，不是按 key。同一账号生成 10 个 key 也只能共用那一份额度 —— 换 key 无意义，只有换账号才有意义。

## 落地实现（两个脚本，均在 `D:\Toolbox\goat-gateway\`）

### `key-health-watch.mjs`（5993 B，实测通过）

```bash
node key-health-watch.mjs                        # 常驻，每 10 分钟探测
node key-health-watch.mjs --once                 # 探一次，exit 1 = 有 key 失效
node key-health-watch.mjs --once --auto-disable  # 失效的自动置 enabled:false
node key-health-watch.mjs --interval 300         # 自定义间隔（秒）
```

- 探活端点：`GET https://api.commandcode.ai/provider/v1/models`
- **401/403 → 判定失效**：写 `key-health.log`、生成 `KEY-ALERT.md`、弹 Windows 气泡通知
- 网络抖动 / 5xx → 只 WARN，**不判吊销**（避免把临时故障误报成缺 key）
- 恢复后自动把 `KEY-ALERT.md` 改回「全部正常」

实测输出：`[2026-10-29T04:58:15.124Z] [OK] key "qq" 健康（HTTP 200）`，exit=0。

### `key-set.mjs`（3128 B）

```bash
node key-set.mjs --list              # 看条目（脱敏）
node key-set.mjs --test user_xxx…    # 只验不写
node key-set.mjs user_xxx…           # 替换 qq 的 key
node key-set.mjs user_xxx… --add work
```

- **写入前先探测**，无效 key 直接拒写（防手抖打错）
- 用 `renameSync` 原子替换；`gateway.mjs` 按 mtime 热加载，不会读到半个文件
- `keys.json` 结构：`{ keys: [{ name, key, enabled, note, weight }] }`；网关对 401/403 有 `cooldownMs.unauthorized = 1800000`（30 分钟）冷却，所以死 key 长期留在池里会持续拖慢路由

## 踩到的坑：`process.exit()` + undici

第一版 `--once` 用 `process.exit()` 收尾，在 Node 22 上直接崩：

```
Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 76
```

原因是 Node 22 的 `fetch`（undici）连接池与 `process.exit()` 竞态。
**修法**：改成 `process.exitCode = ...`，让事件循环自然排空。

## 当前状态（脱敏）

```
v qq     user_3Nwd…  weight=3     ← 在用
x 163    user_4iXn…  weight=1     ← enabled:false
```

`.env` 里那个 `user_4iXn…` 直连 `/provider/v1/models` 返回 200，说明它本身仍有效，只是被 disable。
**注意**：`keys.json` 内是明文 key，任何记录/文档都不得复制 key 全文，只保留前缀。

## 建议

把 `key-health-watch.mjs` 设为开机自启；以后遇到 401，先跑 `node key-health-watch.mjs --once`，即可区分「key 被吊销」和「网关本身故障」。

## 同会话另一处修复（交叉引用）

`~/.dsh/.agent-presets/anchored-standard/custom-bash.mjs` 的 `timeoutMs` 曾被读入变量但**从未使用**（等于 bash 工具一直没有超时，命令可无限挂住）。已改为 `schema` 暴露 `timeout`（秒）参数，`execute` 内用 `AbortController` + `AbortSignal.any` 与外部 signal 合并，并 `Math.min` 夹紧到插件上限；单测 4 条通过。源码内留注释：**不要对定时器 `unref()`** —— 事件循环一空它就永不触发，超时形同虚设（实测表现为 unsettled top-level await）。

## 相关文档

- `bad9c4a5-21ee-4a4c-94bf-1312f166299d`：goat-gateway 首字节超时阈值与 TTFT 长尾实测基线（含 `keys.json` 手改事故与热重载流程）
- `63920537-afab-454b-b365-0c70e74a206d`：goat-gateway path 独家认领机制（pathPrefixes / pathAllowed 语义 bug）

参考的外部资料：`steipete/CodexBar`（`/alpha/billing/*` 端点来源）、`ninehills/pi-commandcode-provider`（`auth.json` 优先级链）、`wjf1/dsh-commandcode`（多 key 轮换设计）。
