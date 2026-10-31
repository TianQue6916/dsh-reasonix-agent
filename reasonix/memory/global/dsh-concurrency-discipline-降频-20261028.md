---
id: mem-4cae091ad9d53ff8ac242d09a2696068
revision: 1
created_at: "2026-10-28T11:22:13.888Z"
updated_at: "2026-10-28T11:22:13.888Z"
name: dsh-concurrency-discipline-降频-20261028
description: "concurrency-discipline 注入降频 cooldownSteps 12→40（两 profile patch），附注入的真实成本是破坏 prefix cache 而非 token"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 结论（2026-10-28 用户拍板「可以降频」）

两个 profile patch 的 `concurrency-discipline` 配置：

```yaml
- id: concurrency-discipline
  config:
    concurrencyDiscipline:
      enabled: true
      cooldownSteps: 40      # 原 12
      firstAfterSteps: 3
      skipSubagents: true
```

文件：`profiles/desktop/cordis.patch.yml:180`、`profiles/web/cordis.patch.yml:162`。

## 为什么降

实测本会话（`session-3315a426`）16:24→19:21 之间注入了 **23 次**，每次约 300 token、内容固定不变，几乎不推进任务。原 `cooldownSteps: 12` 在小步数快节奏的会话里 1–4 分钟就触发一次。

40 步约等于原来 3 倍间隔。

## 注入本身的代价结构（判断要不要继续降的依据）

630 字 ≈ 300 token。它插在 transcript **尾部**（pre-step 的 decision.messages 末尾），所以会**破坏 prefix cache** —— 每次注入都让这一轮从注入点开始的 cache 失效。这才是真成本，不是那 300 token。

同一份纪律若改成「第一条消息里给一次 + 派发 subagent 前给一次」，可以把 23 次降到 2 次。

## 生效条件

`cordis.patch.yml` 参与 `patchReload: live`，改 config 会触发插件重建 ⇒ **理论上开新会话即生效，不必重启**。但 `concurrency-discipline.mjs` 本体（`.mjs`）不参与 HMR —— 只改 config 时没问题，改 mjs 必须重启。

## 尚未验证

改完之后本会话没有再出现新的注入点，**降频是否真的生效还没观察到**。下次长会话里数 `user/message` 里 `source.kind === 'concurrency-discipline'` 的出现频率即可验证。
