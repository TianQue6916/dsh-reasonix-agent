/**
 * Offline smoke test: register the tool against a stub registry, run one small
 * download, and print the canonical value plus the model-facing render.
 */
import { apply } from './lib/index.js'

const tools = []
apply({ tools: { register: (d) => tools.push(d) } })
const t = tools[0]
console.log('registered:', t.name, '| params:', Object.keys(t.parameters.properties).join(','))
const value = await t.execute(
  { url: 'https://hf-mirror.com/chopratejas/kompress-v2-base/resolve/main/config.json', out: 'C:/Users/27063/AppData/Local/Temp/ff-probe.json' },
  {},
)
console.log('value:', JSON.stringify(value))
console.log('render:', t.output.render({}, value)[0].text)
