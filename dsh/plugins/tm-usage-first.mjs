// tm-usage-first — make the runtime token ledger read provider-reported usage.
//
// WHY THIS EXISTS
// Auto-compaction decides to fire from `ctx.tokenMeter.measure(session).totalTokens`.
// Upstream dsh-token-meter builds that number from a char-based surface estimate
// (CHARS_PER_TOKEN = 4) and only trusts provider usage when
// `usageTokens(usage) >= estimatedAnchorTokens` — i.e. it treats the estimate as a
// LOWER bound. Per-step snapshot injection (plan-anchor / git-context /
// thinking-anchor) inflates that estimate several-fold, so in long sessions real
// usage never qualifies, the ledger stays ~3.4x too high, and compaction fires at
// ~10-16% of true window occupancy — wiping conversation that is nowhere near the
// limit. Measured on session-a0d5fbf8: ledger 320,310 vs real prompt 94,691.
//
// HOW
// Two profiles resolve dsh-token-meter from different roots:
//   * web / headless  -> ~/.dsh/profiles/node_modules/... (CLI copy, already patched
//                        on disk by patch-token-meter-usage-first.py)
//   * desktop (Electron App) -> resources/app.asar/dsh/node_modules/...
//                        (asar copy, NOT patchable without closing the App)
// This plugin sidesteps both roots: it wraps the live `ctx.tokenMeter` service
// instance, so it applies to whichever copy the running profile loaded. On an
// already-patched copy the fast path is a no-op (baseline.kind is already "usage").
//
// CORRECTNESS NOTES
// * `meter._sync(session)` is the meter's own incremental replay cache
//   (`states: WeakMap`, `consumedEvents` watermark) -> O(1) amortised, not a scan.
//   If it is ever renamed/removed the wrapper degrades to upstream behaviour
//   instead of throwing.
// * `anchor.usage` is exactly the field upstream refuses to use; it is populated by
//   `_foldEvent` from the last `assistant/message` that carried a usage report.
// * The returned object is a fresh plain object; upstream's deepFreeze is not
//   reapplied, which is fine (measure() results are read-only by contract).

export const name = 'tm-usage-first';
export const inject = ['tokenMeter'];

const WRAPPED = Symbol.for('tm-usage-first.wrapped');

/** Mirrors upstream usageTokens(): input + cacheRead + cacheWrite + output. */
function usageTokens(u) {
  return (u.inputTokens ?? 0)
    + (u.cacheReadTokens ?? 0)
    + (u.cacheWriteTokens ?? 0)
    + (u.outputTokens ?? 0);
}

function log(ctx, msg) {
  try { ctx.logger?.info?.(`[tm-usage-first] ${msg}`); } catch {}
}

export function apply(ctx, config = {}) {
  const verbose = config.verbose !== false;
  const meter = ctx.tokenMeter;
  if (meter === void 0 || typeof meter.measure !== 'function') {
    log(ctx, 'no tokenMeter service found — nothing to do');
    return;
  }
  if (meter[WRAPPED] === true) return;
  Object.defineProperty(meter, WRAPPED, { value: true, enumerable: false });

  const original = meter.measure.bind(meter);
  let corrected = 0;
  let passthrough = 0;
  let unavailable = 0;

  meter.measure = function measure(session, requestHeader) {
    const m = original(session, requestHeader);
    if (m === void 0 || m === null || m.baseline?.kind !== 'estimated') {
      passthrough += 1;
      return m;
    }
    let usage;
    try {
      usage = meter._sync(session)?.anchor?.usage;
    } catch {
      usage = void 0;
    }
    if (usage === void 0) {
      unavailable += 1;
      return m;
    }
    const tokens = usageTokens(usage);
    corrected += 1;
    if (verbose && corrected <= 5) {
      log(ctx, `corrected ledger ${m.baseline.tokens} -> ${tokens} (estimated -> usage)`);
    }
    return {
      ...m,
      baseline: { kind: 'usage', tokens, usage },
      totalTokens: Math.max(0, tokens + (m.surfaceDeltaTokens ?? 0)),
    };
  };

  // Exposed for probing from a session; harmless in production.
  meter.tmUsageFirstStats = () => ({ corrected, passthrough, unavailable });

  log(ctx, `installed (patched copy = fast path; verbose=${verbose})`);
}
