import { apply } from 'file:///C:/Users/27063/.dsh/.agent-presets/anchored-standard/dev-tool-search.mjs'

const CATALOG = [{ name: 'web_search', description: 'Search the web' }]
const mk = (schemasFn) => { const r=[]; apply({ tools: { register: (t)=>r.push(t), schemas: schemasFn } }); return r[0] }
const call = async (t,a) => (await t.execute(a,{})).text

console.log('[6] schemas() throws -> must not crash')
const t6 = mk(() => { throw new Error('registry gone') })
console.log(await call(t6, { toolNames: ['web_search'] }))

console.log('\n[7] search with no match')
const t7 = mk(() => CATALOG)
console.log(await call(t7, { query: 'zzzz' }))

console.log('\n[8] scoped lookup: exec.agent must be forwarded')
let gotAgent = null
const t8 = mk((agent) => { gotAgent = agent; return CATALOG })
await call(t8, { query: 'web' })
console.log('   forwarded agent =', gotAgent)

console.log('\n[9] duplicate names in toolNames')
const t9 = mk(() => CATALOG)
console.log(await call(t9, { toolNames: ['web_search','web_search'] }))

console.log('\n[10] non-string entries filtered')
const t10 = mk(() => CATALOG)
console.log(await call(t10, { toolNames: ['web_search', 123, null, ''] }))
