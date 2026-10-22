// Unit test for ~/.dsh/plugins/tm-usage-first.mjs
// Run: node ~/.dsh/storages/tools/test-tm-usage-first.mjs
//
// Scope: verifies the WRAPPER's decision logic against mock meters. It does not
// verify cordis wiring (that is the headless integration probe's job).

import { apply } from '../../plugins/tm-usage-first.mjs';

let pass = 0;
let fail = 0;
const failures = [];

function check(label, cond, detail = '') {
  if (cond) { pass += 1; console.log(`  ok   ${label}`); }
  else { fail += 1; failures.push(label); console.log(`  FAIL ${label} ${detail}`); }
}

function makeCtx(meter) {
  const logs = [];
  return {
    tokenMeter: meter,
    logger: { info: (m) => logs.push(m), warn: (m) => logs.push(m) },
    logs,
  };
}

// A meter whose upstream `measure` returns an inflated estimated baseline,
// exactly the production symptom (ledger 320,310 vs real 94,691).
function makeMeter({ baselineKind = 'estimated', usage, estimatedTokens = 320310, delta = 0 }) {
  const meter = {
    measure(session) {
      return {
        logRevision: 1,
        baseline: baselineKind === 'usage'
          ? { kind: 'usage', tokens: 94691, usage }
          : { kind: 'estimated', tokens: estimatedTokens },
        surfaceDeltaTokens: delta,
        totalTokens: (baselineKind === 'usage' ? 94691 : estimatedTokens) + delta,
        surfaceTokens: 0,
        nodes: [],
      };
    },
    _sync() { return { anchor: { usage } }; },
  };
  return meter;
}

const USAGE = { inputTokens: 1763, outputTokens: 3578, cacheReadTokens: 92928, cacheWriteTokens: 0 };

console.log('# tm-usage-first wrapper');

// 1. estimated + usage available -> corrected
{
  const meter = makeMeter({ usage: USAGE });
  const ctx = makeCtx(meter);
  apply(ctx, {});
  const m = meter.measure({});
  check('estimated baseline is replaced by usage', m.baseline.kind === 'usage', JSON.stringify(m.baseline));
  check('tokens = input+cacheRead+cacheWrite+output', m.baseline.tokens === 98269, String(m.baseline.tokens));
  check('totalTokens recomputed', m.totalTokens === 98269, String(m.totalTokens));
  check('usage object preserved', m.baseline.usage === USAGE);
}

// 2. estimated + surfaceDelta preserved
{
  const meter = makeMeter({ usage: USAGE, delta: 500 });
  const ctx = makeCtx(meter);
  apply(ctx, {});
  const m = meter.measure({});
  check('totalTokens keeps surfaceDeltaTokens', m.totalTokens === 98769, String(m.totalTokens));
}

// 3. estimated + NO usage -> untouched (degrade, never throw)
{
  const meter = makeMeter({ usage: void 0 });
  const ctx = makeCtx(meter);
  apply(ctx, {});
  const m = meter.measure({});
  check('no usage leaves baseline estimated', m.baseline.kind === 'estimated');
  check('no usage leaves totalTokens', m.totalTokens === 320310);
  check('stats.unavailable incremented', meter.tmUsageFirstStats().unavailable === 1);
}

// 4. already usage (patched copy) -> fast path, values untouched
{
  const meter = makeMeter({ baselineKind: 'usage', usage: USAGE });
  const ctx = makeCtx(meter);
  apply(ctx, {});
  const m = meter.measure({});
  check('usage baseline passes through', m.baseline.kind === 'usage' && m.totalTokens === 94691);
  check('stats.passthrough incremented', meter.tmUsageFirstStats().passthrough === 1);
  check('stats.corrected stayed 0', meter.tmUsageFirstStats().corrected === 0);
}

// 5. _sync throws -> degrade, do not propagate
{
  const meter = makeMeter({ usage: USAGE });
  meter._sync = () => { throw new Error('simulated'); };
  const ctx = makeCtx(meter);
  apply(ctx, {});
  let threw = false;
  let m;
  try { m = meter.measure({}); } catch { threw = true; }
  check('_sync throwing does not propagate', threw === false);
  check('_sync throwing keeps estimated', m?.baseline?.kind === 'estimated');
}

// 6. _sync missing entirely -> degrade
{
  const meter = makeMeter({ usage: USAGE });
  delete meter._sync;
  const ctx = makeCtx(meter);
  apply(ctx, {});
  const m = meter.measure({});
  check('missing _sync keeps estimated', m.baseline.kind === 'estimated');
}

// 7. double apply is idempotent (two patch rows / live reload)
{
  const meter = makeMeter({ usage: USAGE });
  const ctx = makeCtx(meter);
  apply(ctx, {});
  const afterFirst = meter.measure;
  apply(ctx, {});
  check('second apply is a no-op', meter.measure === afterFirst);
}

// 8. no tokenMeter service -> silent no-op
{
  const ctx = makeCtx(void 0);
  let threw = false;
  try { apply(ctx, {}); } catch { threw = true; }
  check('missing service does not throw', threw === false);
  check('missing service logs', ctx.logs.some((l) => l.includes('no tokenMeter service')));
}

// 9. counters exposed for probing
{
  const meter = makeMeter({ usage: USAGE });
  apply(makeCtx(meter), {});
  meter.measure({});
  meter.measure({});
  check('tmUsageFirstStats reports 2 corrections', meter.tmUsageFirstStats().corrected === 2);
}

console.log(`\n${pass} passed / ${fail} failed`);
if (fail > 0) { console.log('failed:', failures.join(', ')); process.exit(1); }
process.exit(0);
