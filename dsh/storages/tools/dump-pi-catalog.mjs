/**
 * Dump the installed pi-ai builtin catalog to JSON: one row per (provider, model)
 * with its real reasoning metadata (reasoning flag + thinkingLevelMap).
 *
 * Usage: node dump-pi-catalog.mjs <output.json>
 */
import { writeFileSync } from 'node:fs'

const PI_ALL = 'file:///C:/Users/27063/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@earendil-works/pi-ai/dist/providers/all.js'
const { builtinProviders, getBuiltinModels, getBuiltinProviders, getBuiltinModelDataGeneratedAt } = await import(PI_ALL)

try {
  const gen = getBuiltinModelDataGeneratedAt?.()
  if (gen) console.log('catalog data generated at:', typeof gen === 'function' ? gen() : gen)
} catch { /* optional */ }

const rows = []
const providerIds = (typeof getBuiltinProviders === 'function' ? getBuiltinProviders() : []) ?? []
console.log('providers:', providerIds.length)

for (const pid of providerIds) {
  let models = []
  try { models = getBuiltinModels(pid) ?? [] } catch { continue }
  for (const m of models) {
    rows.push({
      provider: pid,
      id: m.id,
      name: m.name,
      api: m.api,
      reasoning: m.reasoning === true,
      thinkingLevelMap: m.thinkingLevelMap ?? null,
      contextWindow: m.contextWindow ?? null,
      maxTokens: m.maxTokens ?? null,
      input: m.input ?? null,
    })
  }
}

const out = process.argv[2] || 'pi-catalog.json'
writeFileSync(out, JSON.stringify(rows, null, 0), 'utf8')
const withReason = rows.filter((r) => r.reasoning).length
const withMap = rows.filter((r) => r.thinkingLevelMap).length
console.log('models total:', rows.length, ' reasoning=true:', withReason, ' with thinkingLevelMap:', withMap)
console.log('wrote', out)
