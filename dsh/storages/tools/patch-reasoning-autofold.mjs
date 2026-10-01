#!/usr/bin/env node
/**
 * patch-reasoning-autofold.mjs
 *
 * 用户要求（2026-09-30）：
 *   「让 dsh 在思考的时候把思考链展开，思考完了再把思考链合起来」
 *
 * WHY 必须改产物、不能挂 slot
 *   1. ReasoningRow 的正文是【条件渲染】：
 *        content = useMemo(() => expanded ? <div className=thinkBody>… : void 0, [expanded,…])
 *      未展开时 DOM 里根本没有正文节点，所以纯 CSS 再怎么写都显示不出内容。
 *   2. dsh-client-ui-chat 暴露的 `disclosure` slot（lib/client.js:12168）只产出「一个 hook」：
 *        disclosure: (_standard, { disclosureReset }) => bindDisclosure(disclosureReset)
 *      hook 内部拿不到 `running`（那是 ReasoningRow 的 prop），所以 slot 层无法表达
 *      「运行中才展开」。
 *   ⇒ 唯一干净的最小切口：在 ReasoningRow 内部把 expanded 与 running 合并。
 *
 * 改动（1 处；变量名保持不变 ⇒ 下游 data-expanded / content 的 useMemo / DisclosureRow
 * 全部无需改动，hook 调用次数也不变）：
 *   - const { expanded, toggle } = useDisclosure();
 *   + const __dspDisclosure = useDisclosure();
 *   + const expanded = running || __dspDisclosure.expanded;
 *   + const toggle = __dspDisclosure.toggle;
 *
 * 行为
 *   running=true  → 强制展开（data-state="running" 的扫光动画照常）
 *   running=false → 自动收回（__dspDisclosure.expanded 默认为 false）
 *   running 期间手动 toggle 不改变视觉（expanded 恒真），结束后恢复用户控制
 *
 * 生效方式：dsh-client-modules 每次请求都 readFileSync 从磁盘读 client.js
 *   ⇒ 改完【刷新页面】即生效，无需重启 dsh 进程。
 *
 * 幂等 · 自动备份 · 可逆 · dsh 升级会覆盖 node_modules，重跑本脚本即可重新应用。
 *
 * 用法
 *   node patch-reasoning-autofold.mjs            # 应用（已应用则跳过）
 *   node patch-reasoning-autofold.mjs --check    # 只报告状态，不写入
 *   node patch-reasoning-autofold.mjs --revert   # 从备份还原
 */
import { copyFile, readFile, writeFile } from 'node:fs/promises'

const DEFAULT_TARGET =
  'C:/Users/27063/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-client-ui-chat/lib/client.js'
const TARGET = process.env.DSH_CHAT_CLIENT ?? DEFAULT_TARGET
const BACKUP = `${TARGET}.bak-pre-autofold`

const OLD = '\t\t\tconst { expanded, toggle } = useDisclosure();'
const NEW = [
  '\t\t\tconst __dspDisclosure = useDisclosure();',
  '\t\t\tconst expanded = running || __dspDisclosure.expanded;',
  '\t\t\tconst toggle = __dspDisclosure.toggle;',
].join('\n')

const mode = process.argv.includes('--revert')
  ? 'revert'
  : process.argv.includes('--check') ? 'check' : 'apply'

const source = await readFile(TARGET, 'utf8')
const applied = source.includes('__dspDisclosure')
const occurrences = source.split(OLD).length - 1

if (mode === 'check') {
  console.log(`target     : ${TARGET}`)
  console.log(`bytes      : ${Buffer.byteLength(source, 'utf8')}`)
  console.log(`patched    : ${applied}`)
  console.log(`anchor     : ${occurrences === 1 ? 'present (1)' : occurrences === 0 ? 'ABSENT' : `${occurrences} occurrences`}`)
  process.exit(applied ? 0 : 1)
}

if (mode === 'revert') {
  await copyFile(BACKUP, TARGET)
  const back = await readFile(TARGET, 'utf8')
  console.log(`reverted from ${BACKUP}`)
  console.log(`patched now: ${back.includes('__dspDisclosure')}`)
  process.exit(0)
}

if (applied) {
  console.log('already patched — nothing to do')
  process.exit(0)
}
if (occurrences !== 1) {
  console.error(`ANCHOR PROBLEM: found ${occurrences} occurrence(s), expected exactly 1.`)
  console.error('Upstream ReasoningRow may have changed. Patch aborted WITHOUT writing.')
  process.exit(1)
}

await copyFile(TARGET, BACKUP)
await writeFile(TARGET, source.replace(OLD, NEW), 'utf8')
console.log(`patched : ${TARGET}`)
console.log(`backup  : ${BACKUP}`)
console.log('refresh the browser page for it to take effect (no dsh restart needed).')
