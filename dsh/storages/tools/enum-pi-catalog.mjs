/**
 * Enumerate the installed pi-ai builtin catalog and report the real reasoning
 * metadata for every model id our route declares.
 *
 * Why: our route key `commandcode-goat` is NOT shipped by pi-ai, so
 * resolveRouteModels() finds no `base` entry and `entry.reasoningEfforts` must be
 * declared by hand (dsh-llm-pi-ai/lib/index.js:565 -> { reasoning: false }).
 * But pi-ai's own catalog very likely describes the same models under other
 * provider routes; that metadata is the authoritative "what does this model
 * actually support" answer.
 */
const PI_ALL = 'file:///C:/Users/27063/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@earendil-works/pi-ai/dist/providers/all.js'

const mod = await import(PI_ALL)
const { builtinProviders, getBuiltinModels, getBuiltinProviders } = mod

const providers = (typeof builtinProviders === 'function' ? builtinProviders() : builtinProviders) ?? []
console.log('exported keys:', Object.keys(mod).join(', '))
console.log('provider count:', providers.length)
console.log('provider ids:', providers.map((p) => (typeof p === 'string' ? p : p.id)).slice(0, 60).join(', '))

const gbp = typeof getBuiltinProviders === 'function' ? getBuiltinProviders() : null
if (gbp) console.log('getBuiltinProviders():', (Array.isArray(gbp) ? gbp : []).slice(0, 60).join(', '))

// One sample model to learn the field shape.
const firstPid = (Array.isArray(gbp) ? gbp[0] : null) ?? (providers[0] && (providers[0].id ?? providers[0]))
if (firstPid) {
  const ms = getBuiltinModels(firstPid) ?? []
  console.log('\nsample provider', firstPid, 'models', ms.length)
  if (ms[0]) console.log('sample model fields:', JSON.stringify(ms[0], null, 1).slice(0, 1200))
}
