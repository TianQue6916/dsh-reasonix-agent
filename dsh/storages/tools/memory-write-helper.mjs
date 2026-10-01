import { readFile, writeFile, rename, access, copyFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { homedir } from 'node:os'

const MEMORY_ROOT = join(homedir(), '.reasonix', 'memory')
const INDEX_SECTION = '## 十一、dsh 侧新增（自动维护）'
const q = (v) => JSON.stringify(String(v ?? ''))
const renderFact = ({ id, revision, createdAt, updatedAt, name, description, factType, scope, body }) => [
  '---', `id: ${id}`, `revision: ${revision}`, `created_at: ${q(createdAt)}`, `updated_at: ${q(updatedAt)}`,
  `name: ${name}`, `description: ${q(description)}`, 'metadata:', '  type: user', `  fact_type: ${factType}`,
  `  scope: ${scope}`, '---', '', body, '',
].join('\n')

async function upsertIndexEntry(name, description) {
  const index = join(MEMORY_ROOT, 'global', 'MEMORY.md')
  const text = await readFile(index, 'utf8')
  const backup = `${index}.bak-pre-dsh-write`
  try { await access(backup) } catch { try { await copyFile(index, backup) } catch {} }
  const nl = text.includes('\r\n') ? '\r\n' : '\n'
  const line = `- [${name}](${name}.md) — ${description}`
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const existing = new RegExp(`^- \\[${escaped}\\]\\(${escaped}\\.md\\) — .*$`, 'm')
  let next, verb
  if (existing.test(text)) { next = text.replace(existing, line); verb = 'line updated' }
  else if (text.includes(INDEX_SECTION)) {
    const after = text.indexOf('\n## ', text.indexOf(INDEX_SECTION) + INDEX_SECTION.length)
    const insertAt = after === -1 ? text.length : after + 1
    next = `${text.slice(0, insertAt)}${line}${nl}${text.slice(insertAt)}`
    verb = 'line appended to the dsh section'
  } else {
    const block = `${INDEX_SECTION}${nl}${line}${nl}${nl}`
    const anchor = text.indexOf(`${nl}## 归档说明`)
    next = anchor === -1 ? `${text}${nl}${block}` : `${text.slice(0, anchor + 1)}${block}${text.slice(anchor + 1)}`
    verb = 'section created'
  }
  const tmp = `${index}.tmp-${Date.now()}`
  await writeFile(tmp, next, 'utf8'); await rename(tmp, index)
  return verb
}

export async function remember({ name, description, factType = 'reference', scope = 'global', body }) {
  const dir = join(MEMORY_ROOT, scope)
  const file = join(dir, `${name}.md`)
  let prior = null
  try { prior = await readFile(file, 'utf8') } catch {}
  let revision = 1, id = `mem-${randomBytes(16).toString('hex')}`, createdAt = new Date().toISOString()
  if (prior) {
    const m = prior.match(/^---\n([\s\S]*?)\n---/)
    if (m) {
      const fm = m[1]
      const g = (k) => {
        for (const line of fm.split('\n')) {
          if (line.startsWith(k + ':')) {
            let v = line.slice(k.length + 1).trim()
            if (v.length > 1 && v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
            return v
          }
        }
        return null
      }
      revision = Number(g('revision') || 1) + 1
      id = g('id') || id
      createdAt = g('created_at') || createdAt
    }
  }
  const text = renderFact({ id, revision, createdAt, updatedAt: new Date().toISOString(), name, description, factType, scope, body })
  const tmp = `${file}.tmp-${Date.now()}`
  await writeFile(tmp, text, 'utf8'); await rename(tmp, file)
  const idx = await upsertIndexEntry(name, description)
  return `${prior ? 'Updated' : 'Saved'} "${name}" (rev ${revision}) index: ${idx}`
}
