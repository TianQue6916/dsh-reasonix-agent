---
id: mem-c56ea2720fb8e505cc407def839dfc57
revision: 1
created_at: "2026-09-30T01:50:09.233Z"
updated_at: "2026-09-30T01:50:09.233Z"
name: dsh-reasoning-row-autofold-20260930
description: "reasoning row 思考中自动展开/结束后收合：改 dsh-client-ui-chat:5719，含可重放 patch 脚本与生效机制"
metadata:
  type: user
  fact_type: reference
  scope: global
---

# reasoning row 自动展开/收合（2026-09-30）

用户要求：「让 dsh 在思考的时候把思考链展开，思考完了再把思考链合起来」

## 为什么必须改产物、不能挂 slot
1. `ReasoningRow` 的正文是**条件渲染**：
   `content = useMemo(() => expanded ? <div className={thinkBody}>… : void 0, [expanded,…])`
   未展开时 DOM 里没有正文节点 ⇒ **纯 CSS 不可能显示它**（2026-09-28 的调研结论再次确认）。
2. `dsh-client-ui-chat` 暴露的 `disclosure` slot（`lib/client.js:12168`）只产出「一个 hook」：
   `disclosure: (_standard, { disclosureReset }) => bindDisclosure(disclosureReset)`
   hook 内部拿不到 `running`（那是 ReasoningRow 的 prop）⇒ slot 层无法表达「运行中才展开」。

## 改动（1 处，`lib/client.js:5719`）
```js
- const { expanded, toggle } = useDisclosure();
+ const __dspDisclosure = useDisclosure();
+ const expanded = running || __dspDisclosure.expanded;
+ const toggle = __dspDisclosure.toggle;
```
变量名保持不变 ⇒ 下游 `data-expanded` / `content` 的 useMemo / `DisclosureRow` 全部无需改动，
hook 调用次数与顺序也不变（`README` 里 `const {expanded,toggle}` 唯一出现 1 次）。

行为：`running=true` 强制展开（`data-state="running"` 扫光动画照常）；`running=false` 自动收回；
running 期间手动 toggle 不改变视觉，结束后恢复用户控制。

## 生效与维护
- `dsh-client-modules/lib/index.js:815/946` 是 `readFileSync(clientPath)`（每次请求读盘）
  ⇒ **改完刷新页面即生效，无需重启 dsh**。
- 脚本：`~/.dsh/storages/tools/patch-reasoning-autofold.mjs`
  `--check` / `--revert` / 幂等 / 自动备份（`.bak-pre-autofold`）/ 锚点缺失时**拒绝写入**
- `node --check` 通过；改后 530793 bytes（原 530699）
- ⚠️ **dsh 升级会覆盖 node_modules**，重跑该脚本即可重新应用。

## 环境事实
`dsh-client-ui-chat` 的产物的绝对路径：
`C:/Users/27063/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-client-ui-chat/lib/client.js`
（可用 `DSH_CHAT_CLIENT` 覆盖）。同目录下 `patch-replay-thinking.mjs` 是另一个先例
（鲸小深动画 → thinking，其 `MascotState` 用 `mood === "idle" ? ThinkingDots : Mascot` 内部分派）。
