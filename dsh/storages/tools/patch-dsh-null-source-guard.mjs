#!/usr/bin/env node
/**
 * patch-dsh-null-source-guard.mjs — make the core client bundles null-safe on `source.kind`.
 *
 * WHY (ROOT CAUSE, 2026-10-07)
 *   The desktop renderer died with:
 *     slot entry crashed in 'conversation.view': TypeError: Cannot read properties of null (reading 'kind')
 *     [session-controller] event feed subscriber failed: TypeError: Cannot read properties of null (reading 'kind')
 *   (crash-2026-10-06T16-14-06-734Z-renderer.log, 3x each).
 *   Mechanism: dsh-client-ui-renderer's SlotErrorBoundary isolates a crashing slot entry and
 *   renders an empty <div data-slot-error="conversation.view"> — the user sees an all-black
 *   conversation pane, and it is permanent for that session because the bad message stays in
 *   the inbox projection. ChatView (dsh-client-ui-chat) reads `message.source.kind` inside a
 *   render-phase useMemo with no null guard, so ONE message whose `source` is null takes down
 *   the whole view.
 *   Community precedent, same shape: yjh051108/dsh-agi-harness#16 — a plugin injected messages
 *   without `id`/`source`, and the harness read `message.source.kind` unguarded.
 *
 * WHAT
 *   Rewrites `source.kind` -> `source?.kind` (a plain textual substitution) in the four core
 *   client bundles that dereference it. Null then takes the existing "not a user message"
 *   branch instead of throwing, which is the intended semantics for a malformed message.
 *   Every call site already guards the *following* dereference with either `||` short-circuit
 *   (`!("rpcId" in source)` etc.) or `&&`, so no new null deref is introduced.
 *
 * IDEMPOTENT
 *   `source?.kind` does not contain the substring `source.kind`, so re-running is a no-op.
 *
 * NOTE
 *   This is CONTAINMENT, not the upstream fix: some plugin injects a message with `source: null`
 *   into the session inbox. The guard keeps the conversation pane alive until that is found.
 *   The plugins are loaded from node_modules at runtime (dsh-app://app/plugins/...), NOT bundled
 *   into app.asar, so a desktop App restart picks the patch up (the bundle `rev=` hash changes).
 *
 * USAGE
 *   node patch-dsh-null-source-guard.mjs --check     # report what would change
 *   node patch-dsh-null-source-guard.mjs --apply     # backup, patch, re-read verify
 *   node patch-dsh-null-source-guard.mjs --verify    # assert patched state
 *   node patch-dsh-null-source-guard.mjs --restore   # restore newest backup
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const STAMP = "20261007-pre-null-source-guard";
const DSH_GLOBAL = path.join(os.homedir(), "AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai");
const TARGETS = [
  "dsh-client-ui-chat/lib/client.js",
  "dsh-client-ui-conversation/lib/client.js",
  "dsh-api-session-controller/lib/client.js",
  "dsh-client-ui-trajectory/lib/client.js",
];
const NEEDLE = "source.kind";
const RE = /source\.kind/g;

const mode = process.argv[2] ?? "--check";
const files = TARGETS.map((rel) => ({ rel, abs: path.join(DSH_GLOBAL, rel) }));

function count(src) {
  return (src.match(RE) ?? []).length;
}

let changed = 0;
let errors = 0;

for (const { rel, abs } of files) {
  if (!fs.existsSync(abs)) {
    console.error(`MISS   ${rel}`);
    errors++;
    continue;
  }
  const src = fs.readFileSync(abs, "utf8");
  // skip matches sitting inside a string literal (error text, not code)
  const inString = (src.match(/"source\.kind"|'source\.kind'/g) ?? []).length;
  const n = count(src) - inString;
  const bak = `${abs}.bak-${STAMP}`;

  if (mode === "--check") {
    console.log(`${n === 0 ? "OK    " : "TODO  "} ${rel}  unguarded=${n} (literal-in-string=${inString}) backup=${fs.existsSync(bak) ? "yes" : "no"}`);
    changed += n;
    continue;
  }

  if (mode === "--verify") {
    const ok = n === 0;
    console.log(`${ok ? "PASS" : "FAIL"} ${rel} unguarded=${n}`);
    if (!ok) errors++;
    continue;
  }

  if (mode === "--restore") {
    if (!fs.existsSync(bak)) {
      console.error(`NOBAK  ${rel}`);
      errors++;
      continue;
    }
    fs.copyFileSync(bak, abs);
    console.log(`RESTORE ${rel}`);
    continue;
  }

  if (mode === "--apply") {
    if (n === 0) {
      console.log(`SKIP   ${rel} (already guarded)`);
      continue;
    }
    if (!fs.existsSync(bak)) fs.copyFileSync(abs, bak);
    const out = src.replace(RE, "source?.kind");
    fs.writeFileSync(abs, out, "utf8");
    const back = fs.readFileSync(abs, "utf8");
    if (back !== out || count(back) !== inString) {
      console.error(`FAIL   ${rel} verification mismatch`);
      errors++;
      continue;
    }
    console.log(`PATCH  ${rel} guards=${n} -> re-read OK`);
    changed += n;
    continue;
  }

  console.error(`unknown mode: ${mode}`);
  process.exit(2);
}

if (mode === "--apply" || mode === "--verify") {
  console.log(`\nRESULT ok=${errors === 0} guards_applied=${changed}`);
  if (errors) process.exit(1);
}
