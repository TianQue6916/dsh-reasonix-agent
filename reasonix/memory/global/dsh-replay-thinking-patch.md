---
id: mem-aeb169767a4c6c475a4deceab55e9518
revision: 1
created_at: "2026-09-28T04:17:13.662Z"
updated_at: "2026-09-28T04:17:13.662Z"
name: dsh-replay-thinking-patch
description: "把 dsh-replay 的鲸小深加载动画换成 thinking 指示器：改动范围、脚本、3 个踩坑、验证手段"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 用户要求（2026-09-28 原话）

「这个replay的这个显示鲸小深的加载动画，太幼稚我不喜欢，加载动画换成一个thinking就行吧」

## 改动范围（只有 loading 会变）

- **变**：`ReplayApp.tsx` / `SessionPicker.tsx` 的 `<MascotState mood="idle" text={t('app.loadingText')} />`
- **不变**：`AuditView`/`ForkTreeView`（mood="happy" 空状态）、error（mood="alert"）、`ReplayModal` 的 30px 小图标
- 判据：`mood === 'idle'` 即 loading（三处 MascotState 调用里只有两处是 idle + loadingText）

## 要改两个 bundle（同一个 UI，两种打包风格）

| 文件 | 风格 | CSS 载体 | 谁 serve |
|---|---|---|---|
| `lib/client.js` | 未压缩（esbuild，保留 `// src/...` 注释） | **JS 字符串**，规则间是**字面 `\n`** | dsh client module loader → `/plugins/??<id>/client.js&rev=<rev>` |
| `lib/viewer.js` | 已 minify（单行） | **模板字符串**，规则间是**真换行** | 插件 host half `readFile(new URL('./viewer.js'))` |

`client.js` 的 serve 机制：`dsh-client-modules/lib/index.js` 用 `readFileSync(clientPath)` 读，rev 由 mtime/ctime/size 组成；文件一改 → rev 变 → 新 URL → 重读。**结论：改完刷新页面即生效，无需重启 web 进程。**

## 脚本

`~/.dsh/storages/tools/patch-replay-thinking.mjs`（幂等，`--verify` 只检查不写）
改 2 个产物 + `src/client/{mascot.tsx,styles.css,i18n.ts}`。备份 `<file>.bak-pre-thinking`，**只在不存在时创建**（覆盖过就再也拿不到原始状态）。

## 踩过的三个坑（都属「判据写错会伪装成产品缺陷」）

1. **`cssJoin` 复用**：client 的 CSS 要**字面 `\n`**，viewer 要**真换行**，但**注入 JS 代码必须恒定用真换行**。我拿同一个 `cssJoin` 干两件事 → client.js 产出 `...};<字面\n>function MascotState({` 挤在一行 → `SyntaxError: Invalid or unexpected token`（client.js:1102）。viewer 恰好两种情况都要真换行，把 bug 掩盖了。
2. **i18n 幂等判据**：en/zh 两条的**新值完全相同**。拿"新值存在"当 guard，则 en 替换后 zh 被判为"已应用"而漏改（产物里 zh 仍是「鲸小深正在倒带日志…」）。正确判据 = **原锚点是否还在**。
3. **insert 型 edit 的幂等**：插入**不消耗锚点**（`export function MascotState({` 替换后仍在），必须用 guard；用 anchor 判断会每跑一次再插一份（实测 mascot.tsx 变 3 份、styles.css 变 12 行）。**规则：insert 用 guard，replace 用 anchor。**

## 验证手段（可复用）

- **`vm.Script` 比 `node --check` 可靠**：`node --check` 对非 `.js` 扩展名（如 `.bak-xxx`）会走 ESM 格式探测，报无关的 `getFileProtocolModuleFormat` 错误，误导判断；`new vm.Script(readFileSync(p,'utf8'))` 按内容解析，不看扩展名。
- **`cmp -s` 对"已验证正确版"做字节对比**：流程 = 留一份正确产物 → 从原始重跑脚本 → `cmp`。
- **端到端**：`curl http://127.0.0.1:3080/replay/api/viewer.js` → 200 / 2157131 bytes / `dshr-thinking` 5 处 / 旧文案 0 处。
- **幂等回归**：连续 apply 3 次，`grep -c 'export function ThinkingDots'` 恒为 1。

## 顺带发现（非本次改动引起）

`GET /replay/api/sessions` **30 秒无响应**（同 plugin 的 `viewer.js` 返 200、未知路径返 404，说明 handler 正常）。host half 对每个 session 调 `readTitleSnapshots`/`readTitle`，session 一多就极慢。**dsh-replay 的会话列表实际不可用。**
