// Wiring probe: proves the tm-usage-first wrapper is live inside a real dsh process.
// Writes to a file so it does not depend on log levels. Remove after verification.
import fs from 'node:fs';
import { apply as applyUsageFirst } from './tm-usage-first.mjs';

export const name = 'tm-verify';
export const inject = ['tokenMeter'];

const OUT = 'C:/Users/27063/.dsh/logs/tm-verify.log';

function note(obj) {
  try { fs.appendFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), ...obj }) + '\n'); } catch {}
}

export function apply(ctx) {
  const meter = ctx.tokenMeter;
  note({ ev: 'loaded', ctor: meter?.constructor?.name ?? null, hasMeasure: typeof meter?.measure === 'function' });
  if (typeof meter?.measure === 'function') {
    applyUsageFirst(ctx, { verbose: true });
    note({ ev: 'wrapped', stats: meter.tmUsageFirstStats?.() ?? null });
  }
  ctx.on('agent/pre-step', async (_payload, next) => {
    note({ ev: 'pre-step', stats: meter?.tmUsageFirstStats?.() ?? null });
    return next();
  });
}
