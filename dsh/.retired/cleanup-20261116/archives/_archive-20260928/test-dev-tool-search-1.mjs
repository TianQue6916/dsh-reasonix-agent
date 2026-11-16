import { apply } from 'file:///C:/Users/27063/.dsh/.agent-presets/anchored-standard/dev-tool-search.mjs'

const CATALOG = [
  { name: 'bash', description: 'Run commands in a bash shell' },
  { name: 'web_search', description: 'Search the web' },
  { name: 'subagent', description: 'Delegate to a sub-agent' },
  { name: 'read_image', description: 'Read an image file' },
]

const registered = []
const ctx = { tools: { register: (t) => registered.push(t), schemas: () => CATALOG } }
apply(ctx)
const tool = registered[0]
console.log('registered tool:', tool.name)

const call = async (args) => (await tool.execute(args, {})).text

console.log('\n[1] fake name only')
console.log(await call({ toolNames: ['definitely_not_a_real_tool_xyz'] }))

console.log('\n[2] real name only')
console.log(await call({ toolNames: ['web_search'] }))

console.log('\n[3] mixed real + fake')
console.log(await call({ toolNames: ['web_search', 'memory_profile'] }))

console.log('\n[4] keyword search + unlock in one call')
console.log(await call({ query: 'image', toolNames: ['read_image'] }))

console.log('\n[5] empty args')
console.log(await call({}))
