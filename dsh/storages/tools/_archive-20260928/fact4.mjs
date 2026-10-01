import { remember } from 'file:///C:/Users/27063/.dsh/storages/tools/memory-write-helper.mjs'

const body = `# dev_tool_search 谎报解锁的 bug（已修）+ preset 热重载边界 —— 2026-09-27

## 一、Bug：解锁报成功，实际被静默丢弃

\`dev-tool-search.mjs\` 里原先是这样：

\`\`\`js
const unlock = Array.isArray(args.toolNames) ? args.toolNames.filter(...) : []
const lines = []
if (unlock.length > 0) {
  lines.push(\`Unlocked for the next request: \${unlock.join(', ')}\`)   // ← 无条件回显输入
}
\`\`\`

**这句话只是把入参原样回显，零校验。** 真正的解锁发生在
\`tool-bootstrap.mjs\` 的 keep-set filter：它从 durable 的 \`tool/call\` 事件里
读 \`dev_tool_search\` 的 \`toolNames\` 参数，然后与 \`assembled.tools\` 求交集。
**交集里没有的名字就被静默丢掉，两处都不报错。**

实测危害：我调用 \`dev_tool_search({"toolNames":["memory_profile","memory_search","memory_remember","memory_read"]})\`
得到回复「Unlocked for the next request: memory_profile, memory_search, memory_remember, memory_read」，
但**下一轮 request header 的 tool 列表里一个都没有**。我据此以为记忆工具已上线，
实际是工具告诉我它做了一件没做的事。

对比佐证：同一批里 \`create_goal / job_list / read_image / subagent / workflow\` 五个
harness 原生工具**全部成功进入** tool surface。所以解锁机制本身是好的，
坏的只是**对不存在的名字谎报成功**。

## 二、修法

\`dev-tool-search.mjs\` 改成：**先把 catalog 解析一次**（\`ctx.tools.schemas(exec?.agent)\`），
再把 \`toolNames\` 分成 \`known\` / \`absent\`：

- \`known\` → 照旧报「Unlocked for the next request: ...」
- \`absent\` → 报「**NOT unlocked — absent from this session's catalog: ...**」，
  并说明「unlock 只能暴露**已注册**的工具；名字不存在要么是拼错，
  要么是这个 session 从未挂载过的 plugin —— **session 创建之后才加的 preset row
  不会回溯进这个 session**，要新开 session」
- \`schemas()\` 抛错时提前返回 \`catalog unavailable: ...\`，不再落进搜索的 catch

顺带两处小改：
- \`toolNames\` 去重（\`[...new Set(...)]\`），原先传重复名字会重复回显
- **把 \`memory_*\` 加进 \`UNLOCKABLE_INDEX\`**（见第四节）

**验证**：写了 10 个隔离用例（mock tools registry）全部通过 ——
假名字、真名字、真假混合、search+unlock 同调、空参、\`schemas()\` 抛错、
search 无命中、\`exec.agent\` 转发、重复名、非字符串入参。
（用例在 \`~/.dsh/scratch/test-dts.mjs\` 与 \`test-dts2.mjs\`。）

**成本**：description 从 1416 → **1538 chars**（+122，约 35 token）常驻。
这是把 \`memory_*\` 写进 index 的代价，值得——见第四节。

备份：\`dev-tool-search.mjs.bak-20260927-pre-unlock-validate\`（md5 \`9f52401b1fa90e7b5581e36f6129b5ce\`）。

## 三、preset 热重载边界（这次实测出来的，很重要）

**改 preset-local \`.mjs\` 的文件内容不会热重载。**

证据链：
1. dsh web 启动于 **09-26 20:44:26**，之后一直没重启
2. \`memory-reasonix\` 这一 row 于 **22:47** 加进 \`cordis.patch.yml\`
3. **23:58 创建的 session 有了 memory 工具**（真实调用 \`memory_search\` ×3、\`memory_read\` ×1）
   → 所以**新增 preset row 对新 session 是即时生效的，不需要重启**
4. 但 **22:38 创建的 session 没有** → row 不回溯进已存在的 session
5. 我改完 \`dev-tool-search.mjs\` 后立刻调用它，**返回的还是旧文案**
   → **文件内容变更不进已有 session**，要新 session / 重启 host

**推论（可复用）**：
- 判断一个 preset 改动是否生效，**判据是「新建一个 session 试」**，不是「重启了没有」
- 调试 preset plugin 时，**在旧 session 里测等于测旧代码**——我今天差点被这个骗过去
- 反过来：\`patchReload: live\` 对 **bundle**（\`package.json\` 的 \`bundles\`）是生效的，
  headroom 就是这么在跑着的（见第五节）
- 所以「preset 改动要重启」这句话**不准确**，准确说法是
  **「新 row → 新 session 即可；改文件内容 → 需要新 session」**

## 四、这条 bug 真正吃掉的是什么：\`use-user-persona-before-tasks\` 空转

standing rule 是「**实质任务前先调 \`memory_profile\`** 校准讲法与深度」。
但 \`memory_profile\` 既不在 resident set 里，过去又无法通过 \`dev_tool_search\` 解锁，
**模型根本不知道它存在** —— 一条工具看不见的规则等于一条永远不会触发的规则。

（我第一次跑 \`dev_tool_search({query:"memory persona profile"})\` 时，
返回的是 \`ralph\` 和 \`skill_search\`，**memory_\* 一个都没匹配到**，
因为那个 session 的 catalog 里本来就没有它们。）

**修法**：把 \`memory_*\` 写进 \`UNLOCKABLE_INDEX\`（那 10 行的 capability index，
直接进 description）。这样模型在**每一个** request 都能看到它存在，
规则才可能触发。**没有改 resident set**，所以零驻留哲学没破——
只是 index 多了一行。

## 五、headroom 的实测边界（顺带订正我上一轮的说法）

我说过「headroom 装了但要重启才生效」—— **错**。它**当场就活了**：
我这一轮 session 的 420 个 \`tool/result\` frame 里，**28 个**带 headroom marker
（\`search-fold 4499→3679 chars\` 之类）。bundle 层是热加载的。

**副作用要记住**：headroom 会把长输出折叠掉——我今天读
\`dev-tool-search.mjs\` 时，它一次性折掉了 **77 行**（\`77 rows omitted\`），
而那正是我要取证的目标文件。**做审计/取证时别整文件 cat，按 \`sed -n\` 分段读**，
否则你看到的 ≠ 文件里有的，而且**没有任何提示告诉你少了什么**。

## 六、我上一轮的三个错误结论（订正）

| 我说过 | 实际 |
|---|---|
| 「\`memory_*\` 从未被真实调用」 | ❌ 错。**23:58 那个 session 调了 4 次**（memory_search ×3 + memory_read ×1）。我第一次是用 \`grep\` 直接搜 \`.zstd\` —— **压缩文件怎么可能 grep 得到明文**，那是无效判据 |
| 「memory 工具进不了 tool surface」 | ⚠️ 半对。**是我这个 session 进不去**（22:38 创建，早于 22:47 的 row）；新 session 是好的 |
| 「preset/插件改动要重启 dsh web」 | ❌ 不准确。新 row 对新 session 即时生效；bundle 热加载；只有**已存在 session 的模块改动**不回溯 |

## 七、教训（元层面）

**「工具报告成功」不等于「事情做成了」。** 这次是一个工具**把自己的入参当成结果回显**。
以后凡是「工具说它做了什么」的场合，**都要找一个独立的、能落到磁盘或能进下一轮 request 的判据去印证**：
这次正确的判据是 **下一轮 \`request/header\` 的 \`tools[]\` 数组**，
而不是工具的返回文本。**自证不算证。**
`
console.log(await remember({
  name: 'dev-tool-search-false-unlock-fix-and-preset-reload-boundary-20260927',
  description: 'dev_tool_search 谎报解锁的 bug（无条件回显入参、零校验，被 tool-bootstrap 静默丢弃）已修并 10 用例验证；实测出 preset 热重载边界：新 row 对新 session 即时生效、改文件内容不进已有 session；memory_* 已写进 UNLOCKABLE_INDEX 以让 use-user-persona-before-tasks 可触发；订正「memory_* 从未被调用」「要重启才生效」两个错误结论',
  factType: 'reference',
  body,
}))
