// 从 agent-jobs.mjs 摘出的 validate 逻辑做单元测试
function validate(value, schema, path) {
  path = path || '$'
  const errs = []
  if (!schema || typeof schema !== 'object') return errs
  const isArr = Array.isArray(value)
  const actual = value === null ? 'null' : isArr ? 'array' : typeof value
  if (schema.type) {
    const wanted = Array.isArray(schema.type) ? schema.type : [schema.type]
    const ok = wanted.some(w => w === 'integer' ? Number.isInteger(value) : w === 'number' ? typeof value === 'number' : w === actual)
    if (!ok) errs.push(path + ': expect ' + wanted.join('|') + ', got ' + actual)
  }
  if (actual === 'object') {
    for (const r of schema.required || []) if (!(r in value)) errs.push(path + '.' + r + ': missing(required)')
    for (const key of Object.keys(schema.properties || {})) {
      if (key in value) errs.push.apply(errs, validate(value[key], schema.properties[key], path + '.' + key))
    }
  }
  if (actual === 'array' && schema.items) {
    value.forEach((v, i) => errs.push.apply(errs, validate(v, schema.items, path + '[' + i + ']')))
  }
  return errs
}
const S = { type: 'object', properties: { a: { type: 'integer' }, t: { type: 'string' } }, required: ['a', 't'] }
const cases = [
  ['缺 required t', { a: 1 }],
  ['a 类型错', { a: 'x', t: 'ok' }],
  ['a 是浮点(非 integer)', { a: 1.5, t: 'ok' }],
  ['全对', { a: 1, t: 'ok' }],
]
let pass = 0
for (const [name, v] of cases) {
  const e = validate(v, S)
  console.log(`  ${e.length ? 'FAIL' : 'PASS'}  ${name}  ->  ${e.length ? JSON.stringify(e) : '无错误'}`)
  pass++
}
// 嵌套 + 数组
const S2 = { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { n: { type: 'integer' } }, required: ['n'] } } }, required: ['items'] }
console.log('  嵌套数组缺 n ->', JSON.stringify(validate({ items: [{ n: 1 }, {}] }, S2)))
console.log('  顶层类型错 ->', JSON.stringify(validate('not-an-object', S2)))
console.log(`\n共跑 ${pass} 个基础用例`)
