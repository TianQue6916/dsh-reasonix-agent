import { apply } from 'file:///C:/Users/27063/.dsh/.agent-presets/anchored-standard/skill-search.mjs'

// 两个技能名都含 "pdf" → 对 query "pdf" 的 match 完全相同（=1），
// 所以两者的排序差异只可能来自 usage 加权。
const SKILLS = [
  { name: 'alpha-pdf', description: 'alpha one' },
  { name: 'zeta-pdf',  description: 'zeta one'  },
]

const registered = []
const ctx = {
  tools: { register: (t) => registered.push(t) },
  skills: { list: async () => SKILLS },
}
apply(ctx)
const tool = registered.find((t) => t.name === 'skill_search')
const out = (await tool.execute({ query: 'pdf' }, {})).text

console.log('--- RAW ---')
console.log(out)
console.log('--- END ---')
