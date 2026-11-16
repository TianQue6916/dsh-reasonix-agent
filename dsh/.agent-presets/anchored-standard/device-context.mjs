/**
 * Device context — the model's working scope spans BOTH of the user's machines.
 *
 * WHY THIS EXISTS (2026-11-08)
 *
 * dsh injects no device identity: the only DSH_* env vars are paths, and the
 * runtime-context sections registered by dsh-harness-dev-context carry only the
 * implementation checkout and the Web GUI URL. `hostname` is unusable on the Linux
 * box (it reports the default string "Linux").
 *
 * The user's stance (2026-11-08, verbatim): "我是一个全知全能的、不受限于机器的人，
 * 并且我可达所有的机器，只不过方式略有不同罢了，本质就是不要让模型记忆受限于机器。"
 *
 * So this row does NOT partition memory by machine. It states that both machines are
 * the same person's, that both are reachable from either side, and that what differs
 * is only ADDRESSING (paths, shells, service managers) — never KNOWLEDGE OWNERSHIP.
 * Written this way on purpose: an earlier "this fact only applies to machine X"
 * framing was rejected because it turns reach into a wall.
 *
 * Like the sibling subagent-language / tool-bootstrap rows this file may import ONLY
 * node builtins -- the preset directory has no node_modules.
 */
import os from 'node:os'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'anchored-device-context'

// One line per module load, so a session's startup log proves the row mounted.
// It fires when a NEW session imports the preset, not on every assemble.
console.error(`[device-context] loaded platform=${process.platform} node=${process.version}`)

/** The persona section the preset's persona row owns. */
const PERSONA_PREFIX_SECTION = 'deployment:persona-prefix'

/** Idempotence marker: the block is appended at most once per assemble. */
const MARKER = '## 你的工作范围'

/** Measure this machine. Never throws. */
const detect = () => {
  const isWin = process.platform === 'win32'
  const safe = (fn, fallback = '?') => { try { return fn() } catch { return fallback } }
  return [
    `- 设备：${isWin ? 'Windows 天阙九泉' : 'Linux TianQue'}（id: ${isWin ? 'win-jiuquan' : 'linux-tianque'}）`,
    `- OS：${process.platform} ${safe(() => os.release())}`,
    `- 主机名：${safe(() => os.hostname())}`,
    `- 路径：${isWin ? 'Windows 反斜杠分隔，盘符形如 C:/Users/27063 的反斜杠写法' : 'POSIX 正斜杠，形如 /home/tianque'}`,
    `- Shell：${isWin ? 'pwsh（PowerShell 7）；没有 /bin/bash' : 'bash'}`,
    `- DSH_HOME：${process.env.DSH_HOME ?? (isWin ? process.env.USERPROFILE : process.env.HOME) ?? '?'}`,
    `- Node：${process.version}`,
  ].join('\n')
}

/**
 * The other machine, and how to reach it from here. Both directions were verified
 * on 2026-11-08 (`ssh tianque` from Windows and `ssh tqjq` from Linux both return).
 */
const peer = () => {
  const isWin = process.platform === 'win32'
  return isWin
    ? [
        '- Linux TianQue（id: linux-tianque）@ tianque@100.79.96.82',
        '  - 从本机：`ssh tianque "<command>"`（Tailscale，已免密）；备用 `ssh tianque-lan`（192.168.0.106，网线直连）',
        '  - 对端路径：POSIX（/home/tianque/...）；对端 shell：bash',
      ].join('\n')
    : [
        '- Windows 天阙九泉（id: win-jiuquan）@ 27063@100.84.67.49',
        '  - 从本机：`ssh tqjq "<command>"`（Tailscale，已免密）；别名 `ssh 天阙九泉` 等价',
        '  - 对端路径：Windows 反斜杠分隔（形如 C:/Users/27063）；对端 shell：pwsh',
      ].join('\n')
}

/** Append the scope block to the persona prefix, once per assemble. */
/** Log the first successful injection once, so a fresh session leaves proof in the log. */
let loggedFirstInjection = false

export function apply(ctx) {
  ctx.on('system-prompt/assemble', async (assembly, context, next) => {
    const assembled = await next()
    try {
      const sections = assembled?.sections
      if (!Array.isArray(sections)) return assembled
      const index = sections.findIndex((section) => section?.name === PERSONA_PREFIX_SECTION)
      // No persona prefix section means no persona row in this preset; appending at
      // a guessed order would be worse than doing nothing.
      if (index < 0) return assembled
      const section = sections[index]
      const text = String(section?.text ?? '')
      if (text.includes(MARKER)) return assembled
      const block = [
        '',
        '',
        '## 你的工作范围',
        '',
        '用户拥有两台机器，**都是他的**。你在哪一台被唤醒，只决定默认执行面，不决定能力边界。',
        '不要把自己理解成「一台机器上的助手」——你是他跨机器的同一个执行体。',
        '',
        '### 当前工作台（本轮实测）',
        detect(),
        '',
        '### 另一个工作台（同一个人的另一只手，可直达）',
        peer(),
        '',
        '### 记忆怎么读',
        '记忆属于用户这个人，不属于任何一台机器。读到带机器语境的经验时：',
        '- **不要**读成「只有那台机器才有的知识」，也**不要**因为当前在另一台就否定它；',
        '- 读成「用户的世界里有这个东西，访问它的方式是这样」；',
        '- 需要区分的是**寻址方式**，不是**知识归属**：同一个文件在两边路径不同，同一个动作在两边命令不同（systemctl vs sc、chmod vs icacls、bash rc vs pwsh profile）；',
        '- 用户问「能不能做 X」时，先想「在另一台上怎么做」，**不要**回答「我在 Windows 上做不了」或者「那是 Linux 的事」；',
        '- 执行要落在真实存在的那一台：跨机动手前先 `ssh <alias> true` 确认可达，做完说清改的是哪一台。',
        '',
        '### 唯一的真实约束',
        '两台机器上的同名路径是**两份独立副本**，不是同一个文件；同步由用户的脚本负责，不是自动的。',
        '不要假设「在 A 改了 B 就有了」，也不要把对端的状态当成已经验证过。',
      ].join('\n')
      if (!loggedFirstInjection) {
        loggedFirstInjection = true
        console.error(`[device-context] injected block (${block.length} chars) into a session`)
      }
      const nextSections = sections.slice()
      // Literal prose: never let it be taken for a prompt template.
      nextSections[index] = { ...section, text: `${text}${block}`, interpolate: false }
      return { ...assembled, sections: nextSections }
    } catch {
      // A transform bug must never brick a session.
      return assembled
    }
  })
}
