/**
 * Epoch-aware promotion tracker shared by the bootstrap and baseline-gate
 * plugins of the anchored presets.
 *
 * A compaction rewrites the model-visible surface: the pre-compaction
 * conversation collapses into one synthetic summary message, and the
 * workspace-instruction baseline is re-injected from scratch. The first
 * post-compaction request is therefore a "second first request" — the same
 * first-token conditions the anchored presets exist to control. Promotion is
 * epoch-aware: only a durable promotion signal (`tool/call` and/or
 * `assistant/message`, per the caller's `promoteEvents`) recorded AFTER the
 * last `compaction/end` boundary counts as promoted. Before any compaction
 * the boundary is -1, which preserves the original one-shot semantics.
 *
 * State is memoized per session id and maintained incrementally through
 * `observe()`; a cold session scans its durable log once (so resume and
 * reload reconstruct the same phase), then O(1).
 *
 * By default subagents (`delegationDepth > 0`) are treated as already
 * promoted so their first request can use tools. Set `includeSubagents: true`
 * to make subagents follow the same bootstrap/anchor phase as top-level
 * sessions.
 */

/**
 * Durable events of one session, across harness versions.
 *
 * dsh 0.1.5 replaced the plain `session.events` array with a lazily frozen
 * `snapshotEvents(fromSeq, toSeqExclusive)` accessor over the session `log`;
 * `session.events` is now `undefined`, so a bare `for (const event of
 * session.events)` throws and every caller that guards with try/catch silently
 * degrades (measured: the tool bootstrap falls back to the FULL tool catalog,
 * which defeats the whole anchored preset). Read events through this helper:
 * it prefers the 0.1.5 accessor, then the legacy array, then an iterable log.
 *
 * @param session - the agent's session, or undefined outside an agent.
 * @returns the durable event array, or an empty array when unavailable.
 */
export function sessionEvents(session) {
  if (session === undefined || session === null) return []
  if (typeof session.snapshotEvents === 'function') {
    try {
      const snapshot = session.snapshotEvents()
      if (Array.isArray(snapshot)) return snapshot
    } catch {
      // Fall through to the legacy shapes below.
    }
  }
  if (Array.isArray(session.events)) return session.events
  const log = session.log
  if (log !== undefined && log !== null && typeof log[Symbol.iterator] === 'function') {
    try {
      return [...log]
    } catch {
      return []
    }
  }
  return []
}

/** Build one epoch-aware promotion tracker. */
export function createEpochPromotion(promoteEvents, options = {}) {
  const includeSubagents = options.includeSubagents === true
  const promote = new Set(promoteEvents)
  /** sessionId -> { boundary, promoted } */
  const state = new Map()

  /** Scan a session's durable log from scratch (cold start / resume). */
  const scan = (session) => {
    let boundary = -1
    let promoted = false
    for (const event of sessionEvents(session)) {
      const seq = event.seq ?? 0 // events without a seq are treated as post-boundary
      if (event.type === 'compaction/end') {
        boundary = seq
        promoted = false
        continue
      }
      if (promote.has(event.type) && seq > boundary) promoted = true
    }
    const entry = { boundary, promoted }
    state.set(session.id, entry)
    return entry
  }

  return {
    /**
     * Current phase of the agent's session.
     * @param agent - the assembly/pre-step agent, or undefined outside an agent.
     * @returns { boundary, promoted } — `boundary` is the last compaction/end
     *   seq (-1 before any compaction); `promoted` is true when a durable
     *   promotion signal exists after that boundary.
     */
    status(agent) {
      if (agent === undefined) return { boundary: -1, promoted: true }
      const session = agent.session
      if (session === undefined) return { boundary: -1, promoted: true }
      // By default subagents keep the full catalog from their very first
      // request; includeSubagents makes them follow the normal bootstrap phase.
      if (!includeSubagents && (session.header?.delegationDepth ?? 0) > 0) return { boundary: -1, promoted: true }
      return state.get(session.id) ?? scan(session)
    },
    /** Incremental feed: call on every `session/event`. */
    observe(session, event) {
      const entry = state.get(session.id)
      if (entry === undefined) return
      const seq = event.seq ?? 0
      if (event.type === 'compaction/end') {
        state.set(session.id, { boundary: seq, promoted: false })
        return
      }
      if (promote.has(event.type) && seq > entry.boundary && !entry.promoted) {
        state.set(session.id, { ...entry, promoted: true })
      }
    },
  }
}
