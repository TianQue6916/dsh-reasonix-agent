#!/usr/bin/env node
/**
 * replay-all-patches.mjs — 一次把所有「打在 node_modules 产物上」的补丁重放一遍。
 *
 * WHY THIS EXISTS（2026-09-30 事故）
 *   `pnpm install` 会重装 profile 的 node_modules，**把手工 patch 过的产物还原**。
 *   今天移植 desktop profile 时跑了 install，于是 `@mingozhou/dsh-replay` 的
 *   「鲸小深 → thinking」补丁被冲掉，用户看到看板娘又回来了。
 *   同类风险还有：dsh 升级（`npm i -g`）、profile 重建、插件升级。
 *   ⇒ 不要靠记忆，**把重放做成一个命令**，并在这些时机后都跑一遍。
 *
 * 覆盖的补丁
 *   1. replay-thinking     profiles/<p>/node_modules/@mingozhou/dsh-replay   （鲸小深 → thinking）
 *   1b. replay-pricing     profiles/<p>/node_modules/@mingozhou/dsh-replay   （DEFAULT_PRICING 补全：
 *                          muse/Kimi/GLM/MiniMax/MiMo/Qwen/LongCat/StepFun/Hunyuan/Nemotron/
 *                          Inkling/Stealth/Laguna/Ling/Grok + Other fallback，否则 cost tile 静默消失）
 *   2. reasoning-autofold  <全局 dsh>/node_modules/@deepseek-ai/dsh-client-ui-chat
 *                          （思考链运行中自动展开、结束后收合）
 *
 * 重要边界：**桌面端（Electron）的前端资源打包在 `resources/app.asar` 内**，
 *   不读 node_modules。app.asar 里的 reasoning-autofold 无法由此脚本修复，
 *   它也不会被 `pnpm install` 影响（但会被官方自动更新覆盖）。
 *
 * 用法
 *   node replay-all-patches.mjs            # 全部重放 + 校验
 *   node replay-all-patches.mjs --check    # 只报告状态，不写
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const TOOLS = join(homedir(), '.dsh', 'storages', 'tools')
const CHECK = process.argv.includes('--check')
const DSH_GLOBAL = join(homedir(), 'AppData', 'Roaming', 'npm', 'node_modules', '@deepseek-ai', 'dsh')

const run = (script, ...args) => {
  const out = execFileSync(process.execPath, [join(TOOLS, script), ...args], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  })
  return out
}

let failures = 0

// ── 1) replay-thinking：每个 profile 各一份 node_modules ────────────────────────────────
const REPLAY_REL = join('node_modules', '@mingozhou', 'dsh-replay')
for (const profile of ['web', 'desktop']) {
  const pkg = join(homedir(), '.dsh', 'profiles', profile, REPLAY_REL)
  if (!existsSync(pkg)) {
    console.log(`SKIP  replay-thinking @ ${profile}  (未安装)`)
    continue
  }
  // ⚠️ 一个 profile 里要跑两个补丁 —— 这两个块都必须是「if/else if/else」而不是
  //    「if (CHECK) { ...; continue }」：早期版本在 thinking 的 CHECK 分支里 continue，
  //    整段 pricing 检查被静默跳过，--check 永远报 ALL OK。实测踩过。
  const jobs = [
    { tag: 'replay-thinking', script: 'patch-replay-thinking.mjs', probe: join(pkg, 'lib', 'client.js'), needle: 'dshr-thinking' },
    { tag: 'replay-pricing', script: 'patch-replay-pricing.mjs', probe: join(pkg, 'lib', 'core.js'), needle: 'Muse Spark' },
  ]
  for (const job of jobs) {
    const done = existsSync(job.probe) && readFileSync(job.probe, 'utf8').includes(job.needle)
    if (CHECK) {
      console.log(`${done ? 'OK  ' : 'MISS'}  ${job.tag} @ ${profile}`)
      if (!done) failures += 1
    } else if (done) {
      console.log(`OK    ${job.tag} @ ${profile}  (已是目标状态)`)
    } else {
      try {
        const out = run(job.script, pkg)
        const changed = /changed=(\d+)/.exec(out)?.[1] ?? '?'
        console.log(`OK    ${job.tag} @ ${profile}  (changed=${changed})`)
      } catch (e) {
        console.log(`FAIL  ${job.tag} @ ${profile}  ${String(e.message).slice(0, 120)}`)
        failures += 1
      }
    }
  }
}

// ── 2) reasoning-autofold：全局 npm 的 dsh（web profile 用它）───────────────────────────
const UI_CHAT = join(DSH_GLOBAL, 'node_modules', '@deepseek-ai', 'dsh-client-ui-chat', 'lib', 'client.js')
if (!existsSync(UI_CHAT)) {
  console.log('SKIP  reasoning-autofold  (找不到全局 dsh-client-ui-chat)')
} else {
  const patched = readFileSync(UI_CHAT, 'utf8').includes('__dspDisclosure')
  if (CHECK) {
    console.log(`${patched ? 'OK  ' : 'MISS'}  reasoning-autofold @ npm-global`)
    if (!patched) failures += 1
  } else if (patched) {
    console.log('OK    reasoning-autofold @ npm-global  (已是目标状态)')
  } else {
    try {
      const out = run('patch-reasoning-autofold.mjs')
      console.log(`OK    reasoning-autofold @ npm-global  ${out.trim().split('\n')[0]}`)
    } catch (e) {
      console.log(`FAIL  reasoning-autofold @ npm-global  ${String(e.message).slice(0, 120)}`)
      failures += 1
    }
  }
}

console.log()
console.log('注意：桌面端(Electron)前端在 resources/app.asar 内，本脚本无法覆盖；')
console.log('      app.asar 不受 pnpm install 影响，但会被官方自动更新覆盖。')
console.log(failures === 0 ? '\nALL OK' : `\n${failures} 项未达成`)
process.exit(failures === 0 ? 0 : 1)
