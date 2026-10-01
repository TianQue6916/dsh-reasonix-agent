import { readFileSync, writeFileSync } from 'node:fs'
const home = process.env.USERPROFILE
const dir = `${home}/.dsh/.agent-presets/anchored-standard`
const preset = readFileSync(`${dir}/agent.cordis.yml`, 'utf8').replace(/\r\n/g, '\n')
const body = preset
  .split('\n')
  .map((l) => (l.trim() === '' ? '' : '            ' + l))
  .join('\n')
  .replace(/name: \.\//g, 'name: ../../.agent-presets/anchored-standard/')
const header = [
  '# dsh web profile patch — 2026-09-25 迁移到 0.1.7 的 declaration preset 机制',
  '# 旧机制（$DSH_HOME/.agent-presets/<id>/ 目录 + dsh-agent-presets 插件）在 0.1.7 已废除：',
  '# 目录不再被扫描，preset 必须由 @deepseek-ai/dsh-agent-preset 声明行携带 plugins 列表。',
  '# 下面 plugins 逐字来自 .agent-presets/anchored-standard/agent.cordis.yml（mjs 路径改为相对本 profile 目录），',
  '# 仅删除了 0.1.7 已移除的 @deepseek-ai/dsh-workflow-worker-thread 行。',
  '# 旧目录仍被 headless patch 引用，未删除。',
  '',
  '- id: agent-preset-registry',
  '  config:',
  '    default: anchored-standard',
  '',
  '- insert:',
  '    - id: preset-anchored-standard',
  "      name: '@deepseek-ai/dsh-agent-preset'",
  '      config:',
  '        id: anchored-standard',
  '        name: "Anchored Standard (experimental)"',
  '        description: "Bootstrap with the Minimal preset\'s real tool pair (persistent bash + str_replace_editor) and no auto-injected workspace or skill context, then expose the Standard catalog after the first durable tool call or reply."',
  '        order: 5',
  '        plugins:',
  ''
].join('\n')
const footer = [
  '',
  '    - id: mcp-goatquota',
  "      name: '@deepseek-ai/dsh-mcp-client'",
  '      config:',
  '        serverName: goatquota',
  '        transport: stdio',
  '        command: node',
  "        args: ['D:/Toolbox/goat-gateway/mcp-goat-quota.mjs']",
  ''
].join('\n')
writeFileSync(`${home}/.dsh/profiles/web/cordis.patch.yml`, header + body + footer, 'utf8')
console.log('written')
