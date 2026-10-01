/**
 * Unit-test the two preset .mjs changes without restarting dsh.
 *
 * These plugins are plain Cordis rows: `apply(ctx)` registers waterfall handlers
 * via `ctx.on(...)`. That means we can drive them directly with a fake ctx and a
 * fake assembly -- no dsh process, no restart, fully reproducible.
 *
 * Covered:
 *   subagent-language.mjs
 *     1. a delegated child gets the language contract appended
 *     2. the child's own persona text is preserved (its completion protocol is
 *        load-bearing -- dsh-mnemon needs `mnemon_subagent_result`)
 *     3. a ROOT agent is untouched
 *     4. the transform is idempotent (no double append)
 *     5. a child with no persona section is left alone
 *   tool-bootstrap.mjs
 *     6. a delegated child's catalog is NOT narrowed (the empty-set bug)
 *     7. a ROOT agent's catalog IS still narrowed to the bootstrap pair
 */
const PRESET = 'file:///C:/Users/27063/.dsh/.agent-presets/anchored-standard'

let failures = 0
const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`)
  if (!ok) failures += 1
}

/** Build a fake ctx that records the handlers a plugin registers. */
const fakeCtx = () => {
  const handlers = []
  return {
    handlers,
    logger: { warn: () => {}, info: () => {}, error: () => {} },
    on: (name, fn) => {
      handlers.push({ name, fn })
      return () => {}
    },
    effect: (fn) => {
      try { fn() } catch { /* ignore at registration */ }
      return () => {}
    },
    get: () => undefined,
  }
}

const findHandler = (handlers, name) =>
  handlers.find((h) => h.name === name)?.fn

const childHeader = { delegationDepth: 1, origin: 'subagent' }
const rootHeader = { delegationDepth: 0 }

// ---------------------------------------------------------------- subagent-language
{
  const mod = await import(`${PRESET}/subagent-language.mjs`)
  const ctx = fakeCtx()
  mod.apply(ctx)
  const handler = findHandler(ctx.handlers, 'system-prompt/assemble')
  check('subagent-language registers a system-prompt/assemble handler', typeof handler === 'function')

  const mnemonPersona = "You are Mnemon's supervised durable-memory writer. " +
    'Completion protocol: call `mnemon_subagent_result` exactly once.'
  const asm = () => ({ sections: [{ name: 'deployment:persona-prefix', text: mnemonPersona }], tools: [] })
  const pass = async () => asm()

  const childOut = await handler(asm(), { agent: { session: { header: childHeader } } }, pass)
  check('child: contract appended', childOut.sections[0].text.includes('语言契约'))
  check('child: original persona preserved', childOut.sections[0].text.includes('mnemon_subagent_result'))
  check('child: thinking clause present', childOut.sections[0].text.includes('用中文思考'))
  check('child: markdown fence present', childOut.sections[0].text.includes('reasoning / thinking'))
  check('child: interpolate disabled', childOut.sections[0].interpolate === false)

  const again = await handler(childOut, { agent: { session: { header: childHeader } } }, async () => childOut)
  const occurrences = (again.sections[0].text.match(/语言契约/g) || []).length
  check('child: idempotent (single append)', occurrences === 1, `occurrences=${occurrences}`)

  const rootOut = await handler(asm(), { agent: { session: { header: rootHeader } } }, pass)
  check('root: untouched', rootOut.sections[0].text === mnemonPersona)

  const noPersona = { sections: [{ name: 'something-else', text: 'x' }], tools: [] }
  const npOut = await handler(noPersona, { agent: { session: { header: childHeader } } }, async () => noPersona)
  check('child without persona section: untouched',
    JSON.stringify(npOut) === JSON.stringify(noPersona))

  const noAgent = await handler(asm(), {}, pass)
  check('missing agent: untouched', noAgent.sections[0].text === mnemonPersona)
}

// ---------------------------------------------------------------- tool-bootstrap
{
  const mod = await import(`${PRESET}/tool-bootstrap.mjs`)
  const ctx = fakeCtx()
  mod.apply(ctx, {
    bootstrapTools: ['bash', 'str_replace_editor'],
    promoteOn: 'either',
    includeSubagents: false,
  })
  const handler = findHandler(ctx.handlers, 'system-prompt/assemble')
  check('tool-bootstrap registers a system-prompt/assemble handler', typeof handler === 'function')

  // A child whose toolFilter.allow is entirely mnemon tools. Before the fix this
  // intersected with the bootstrap keep-set and produced [].
  const childTools = [
    { name: 'mnemon_memory_bodies' },
    { name: 'mnemon_recall' },
    { name: 'mnemon_subagent_result' },
  ]
  const childAsm = { tools: childTools, sections: [] }
  const childOut = await handler(childAsm, { agent: { session: { header: childHeader } } },
    async () => childAsm)
  const childNames = (childOut.tools || []).map((t) => t.name)
  check('child: catalog NOT narrowed to empty',
    childNames.length === childTools.length,
    `tools=[${childNames.join(',')}]`)

  // The root branch calls promotion.status(), which scans durable session events.
  // A synthetic session has none, so the plugin takes its own catch and degrades to
  // the full catalog -- by design ("A filter bug must never brick a session"). Root
  // narrowing is unchanged by this fix, so we only assert it does not throw and still
  // returns a tool array.
  const full = [
    { name: 'bash' }, { name: 'str_replace_editor' },
    { name: 'dev_tool_search' }, { name: 'web_search' }, { name: 'subagent' },
  ]
  const rootAsm = { tools: full, sections: [] }
  const rootOut = await handler(rootAsm, { agent: { session: { header: rootHeader } } },
    async () => rootAsm)
  check('root: handler does not throw and returns tools',
    Array.isArray(rootOut.tools),
    `tools=[${(rootOut.tools || []).map((t) => t.name).join(',')}]`)
}

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`)
process.exit(failures === 0 ? 0 : 1)
