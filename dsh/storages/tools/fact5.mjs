import { readFile } from 'node:fs/promises'
import { remember } from 'file:///C:/Users/27063/.dsh/storages/tools/memory-write-helper.mjs'

const FILE = 'C:/Users/27063/.reasonix/memory/global/dev-tool-search-false-unlock-fix-and-preset-reload-boundary-20260927.md'
const raw = await readFile(FILE, 'utf8')
const m = raw.match(/^---\n[\s\S]*?\n---\n\n?([\s\S]*)$/)
const oldBody = m[1].trimEnd()

const extra = `

## 八、端到端验证（真机、真进程，2026-09-27 10:32）

单元测试只能证明逻辑对，不能证明**在 harness 里真的生效**。补了一次真机验证：

**手法**：\`--patch\` 叠加层（**非破坏性**，不碰真实 profile）+ \`dsh headless\` 一次性跑。
把 \`dev-tool-search.mjs / skill-search.mjs / memory.mjs\` 三条 row 通过 overlay 插进
\`headless\` profile 跑一个全新进程。

**踩到的坑（可复用）**：
1. **overlay 里的相对路径是相对 overlay 文件所在目录解析的，不是相对 profile 目录**。
   我一开始把 overlay 放在 \`~/.dsh/scratch/\`，里面的 \`../../.agent-presets/...\`
   就解析成了 \`~/agent-presets/...\`（少了 \`.dsh\` 这一层），三个插件全部
   \`failed to import\`。**放回 profile 目录里就对了。**
2. **\`promoteOn: either\` 下第一轮请求只看得到 bootstrap catalog**。
   我第一次让 agent「调 dev_tool_search」，它说「没有这个工具」——**它没错，是我错**：
   那时还没晋升。必须让它**先做一次 tool call**，下一轮才会出现 discovery 工具。
   （progression 实测：req#1 = bootstrap 3 个 → req#2 = 晋升后 6 个 → req#3 = 解锁后 7 个）

**判据（关键）**：不信工具的自我报告，**读下一轮 \`request/header\` 的 \`tools[]\` 数组**。

\`\`\`
request #1 (3 tools): ['mcp__goatquota__goat_quota', 'pwsh', 'str_replace_editor']
request #2 (6 tools): ['dev_tool_search', 'mcp__goatquota__goat_quota', 'pwsh',
                       'skill_load', 'skill_search', 'str_replace_editor']
request #3 (7 tools): ['dev_tool_search', 'mcp__goatquota__goat_quota', 'memory_profile',
                       'pwsh', 'skill_load', 'skill_search', 'str_replace_editor']
\`\`\`

**这就是完整闭环**：
- 假名字 → 返回 \`NOT unlocked — absent from this session's catalog: totally_fake_tool_abc\` ✅
- 真名字 → 返回 \`Unlocked for the next request: memory_profile\` ✅
- **而且 \`memory_profile\` 真的出现在 req#3 的 \`tools[]\` 里** ✅
  —— 既证明修复有效，也证明解锁机制本身是好的（坏的只是那条谎报）

证据留档：\`~/.dsh/storages/tools/verify-unlock-evidence.txt\`
用例脚本：\`~/.dsh/storages/tools/test-dev-tool-search-{1,2}.mjs\`
overlay：\`~/.dsh/storages/tools/verify-overlay-headless.yml\`

## 九、顺带发现：headless 线是「半套」配置（未改，待决策）

\`~/.dsh/profiles/headless/cordis.patch.yml\` 是**手抄**的一份锚定配置，和
web 侧的 \`preset-anchored-standard\` **已经分叉**：

| | web（anchored-standard） | headless |
|---|---|---|
| persona | 语言契约（中文为主 + 术语保留 + 思考链） | ⚠️ **还是旧的 \`You are a helpful software engineer assistant.\`** |
| memory.mjs | ✅ | ❌ **没有** |
| skill-search.mjs | ✅ | ❌ **没有** |
| dev-tool-search.mjs | ✅ | ❌ **没有** |
| context-gate / instruction-hint | ✅ | ❌ 没有 |
| bootstrapTools | bash + str_replace_editor | **pwsh** + str_replace_editor + mcp__goatquota__goat_quota |

**影响**：40 个最近 session 里 **36 个是 headless 线**（preset=None，cwd=\`C:\Windows\System32\`）。
也就是说**用户做批处理任务时，没有语言契约、没有记忆、没有技能**。
用户在 2026-09-26 明确要求语言契约是**系统级**的——那这条线现在是漏的。

**没动它的原因**：这是用户正在用的批处理线，改 persona 是明确符合用户意图的，
但**改工具面（加 memory/skill/dev-tool-search）会改变 batch 行为**，属于该问一句的改动。
先把差异摆出来。
`

console.log(await remember({
  name: 'dev-tool-search-false-unlock-fix-and-preset-reload-boundary-20260927',
  description: 'dev_tool_search 谎报解锁的 bug（无条件回显入参、零校验）已修，10 个单元用例 + 真机 headless 端到端双验证（假名 NOT unlocked / 真名解锁且 memory_profile 真的进了下一轮 request header）；实测 preset 热重载边界（新 row 对新 session 即时生效、改文件内容不进已有 session）；memory_* 已写进 UNLOCKABLE_INDEX；顺带查出 headless 线是半套配置（旧 persona、无 memory/skill），未改待决策',
  factType: 'reference',
  body: oldBody + extra,
}))
