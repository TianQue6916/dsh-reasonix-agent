#!/usr/bin/env node
/**
 * asar-core-guard.mjs — rebuild app.asar with null-safe guards on the core client bundles.
 *
 * WHY
 *   The desktop App's renderer loads the core client bundles from INSIDE app.asar
 *   (`resources/app.asar/dsh/node_modules/@deepseek-ai/*`), NOT from the global npm tree.
 *   Proven 2026-10-07 19:2x: GET http://127.0.0.1:19387/plugins/??@deepseek-ai/dsh-client-ui-chat/client.js
 *   served bytes whose `source.kind` counts (7 raw / 1 guarded) match the asar copy exactly,
 *   while the patched on-disk copy (`%APPDATA%/npm/node_modules/@deepseek-ai/dsh/node_modules/...`)
 *   sits at 0 raw / 8 guarded and is never served. So patch-dsh-null-source-guard.mjs alone
 *   cannot fix the App; the asar must be rebuilt.
 *
 * WHAT
 *   Rewrites `source.kind` -> `source?.kind` (same textual rule as patch-dsh-null-source-guard.mjs)
 *   inside the four core bundles, then writes a NEW asar. Nothing else is touched:
 *   the original data region is copied verbatim, patched entries are appended at the end,
 *   and only those four directory nodes get a new (offset, size).
 *
 * ASAR LAYOUT (verified against Electron 44 / dsh-desktop 0.2.0-rc.2, fileSize 121348951)
 *   [0..3]   u32 = 4                    (pickle payload size of the size pickle)
 *   [4..7]   u32 = headerBuf.length     -> dataStart = 8 + this
 *   [8..11]  u32 = jsonLen + 4
 *   [12..15] u32 = jsonLen
 *   [16..]   JSON {"files":{...}} + zero padding to 4 bytes
 *   [dataStart..] raw file data, each node addressed by (offset is RELATIVE to dataStart)
 *
 * USAGE
 *   node asar-core-guard.mjs --check
 *   node asar-core-guard.mjs --build <out.asar>
 *   node asar-core-guard.mjs --install            # backup + swap (App MUST be closed)
 *   node asar-core-guard.mjs --verify <asar>
 */
import fs from 'node:fs';
import path from 'node:path';

const RE = /source\.kind/g;
const GUARD = 'source?.kind';
const TARGETS = [
  'dsh/node_modules/@deepseek-ai/dsh-client-ui-chat/lib/client.js',
  'dsh/node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js',
  'dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/client.js',
  'dsh/node_modules/@deepseek-ai/dsh-client-ui-trajectory/lib/client.js',
];
const DEFAULT_ASAR = 'C:/Users/27063/AppData/Local/Programs/DeepSeek Harness/resources/app.asar';

const count = (s, needle) => s.split(needle).length - 1;

function parseHeader(buf) {
  const headerSize = buf.readUInt32LE(4);
  const jsonLen = buf.readUInt32LE(12);
  const jsonStart = 16;
  const dataStart = 8 + headerSize;
  const json = JSON.parse(buf.toString('utf8', jsonStart, jsonStart + jsonLen));
  return { headerSize, jsonLen, jsonStart, dataStart, json };
}

function nodeAt(header, entry) {
  let cur = header.files;
  let node = null;
  for (const seg of entry.split('/')) {
    node = cur?.[seg];
    if (!node) return null;
    cur = node.files;
  }
  return node;
}

const entryBytes = (buf, dataStart, node) =>
  buf.subarray(dataStart + Number(node.offset), dataStart + Number(node.offset) + Number(node.size));

function build(srcBuf, patches) {
  const { dataStart, json } = parseHeader(srcBuf);
  const oldData = srcBuf.subarray(dataStart);
  let cursor = oldData.length;
  const appended = [];
  const changed = [];
  for (const [entry, content] of patches) {
    const node = nodeAt(json, entry);
    if (!node) throw new Error('entry not found in asar: ' + entry);
    const before = { offset: node.offset, size: node.size };
    node.offset = String(cursor);
    node.size = content.length;
    cursor += content.length;
    appended.push(content);
    changed.push({ entry, before, after: { offset: node.offset, size: node.size } });
  }
  const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  const pad = (4 - (jsonBuf.length % 4)) % 4;
  const headerBuf = Buffer.alloc(8 + jsonBuf.length + pad);
  headerBuf.writeUInt32LE(jsonBuf.length + 4, 0);
  headerBuf.writeUInt32LE(jsonBuf.length, 4);
  jsonBuf.copy(headerBuf, 8);
  const sizeBuf = Buffer.alloc(8);
  sizeBuf.writeUInt32LE(4, 0);
  sizeBuf.writeUInt32LE(headerBuf.length, 4);
  const out = Buffer.concat([sizeBuf, headerBuf, oldData, ...appended], 8 + headerBuf.length + cursor);
  return { out, changed, oldDataLen: oldData.length };
}

function report(asarPath, buf) {
  const { dataStart } = parseHeader(buf);
  let ok = true;
  for (const entry of TARGETS) {
    const node = nodeAt(parseHeader(buf).json, entry);
    if (!node) { console.log(`  MISSING  ${entry}`); ok = false; continue; }
    const text = entryBytes(buf, dataStart, node).toString('utf8');
    const raw = count(text, 'source.kind');
    const guarded = count(text, 'source?.kind');
    const tag = raw === 0 && guarded > 0 ? 'PATCHED ' : (raw > 0 ? 'RAW     ' : 'EMPTY   ');
    if (raw > 0) ok = false;
    console.log(`  ${tag} raw=${String(raw).padEnd(3)} guarded=${String(guarded).padEnd(3)} size=${node.size} ${entry.split('/').slice(-3).join('/')}`);
  }
  return ok;
}

const argv = process.argv.slice(2);
const cmd = argv[0] ?? '--check';
const isBuild = argv[0] === '--build';
const argAsar = isBuild
  ? (argv[2] && argv[2].endsWith('.asar') ? argv[2] : DEFAULT_ASAR)
  : (argv.find((a) => a.endsWith('.asar')) ?? DEFAULT_ASAR);

if (cmd === '--check' || cmd === '--verify') {
  const buf = fs.readFileSync(argAsar);
  const { headerSize, jsonLen, dataStart, json } = parseHeader(buf);
  console.log(`asar      : ${argAsar}`);
  console.log(`fileSize  : ${buf.length}`);
  console.log(`headerSize: ${headerSize}  jsonLen: ${jsonLen}  dataStart: ${dataStart}  dataLen: ${buf.length - dataStart}`);
  console.log(`rootFiles : ${Object.keys(json.files).join(' ')}`);
  const ok = report(argAsar, buf);
  console.log(ok ? 'RESULT: ok=true (all four bundles carry the null guard)' : 'RESULT: ok=false (at least one bundle is still raw)');
  process.exit(ok ? 0 : 1);
}

if (cmd === '--build') {
  const outPath = argv[1];
  if (!outPath || !outPath.endsWith('.asar')) { console.error('usage: --build <out.asar>'); process.exit(2); }
  const src = fs.readFileSync(argAsar);
  const { dataStart } = parseHeader(src);
  const patches = new Map();
  for (const entry of TARGETS) {
    const node = nodeAt(parseHeader(src).json, entry);
    if (!node) { console.error('entry not found: ' + entry); process.exit(3); }
    const text = entryBytes(src, dataStart, node).toString('utf8');
    const raw = count(text, 'source.kind');
    const next = text.replace(RE, GUARD);
    console.log(`  patch ${entry.split('/').slice(-3).join('/')}  raw=${raw} -> guarded=${count(next, 'source?.kind')}`);
    patches.set(entry, Buffer.from(next, 'utf8'));
  }
  const { out, changed, oldDataLen } = build(src, patches);
  fs.writeFileSync(outPath, out);
  console.log(`built   : ${outPath}`);
  console.log(`size    : ${src.length} -> ${out.length} (data ${oldDataLen} + appended ${out.length - (8 + parseHeader(out).headerSize) - oldDataLen})`);
  for (const c of changed) console.log(`  node ${c.entry.split('/').slice(-3).join('/')}  (${c.before.offset},${c.before.size}) -> (${c.after.offset},${c.after.size})`);
  process.exit(0);
}

if (cmd === '--install') {
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const bak = `${argAsar}.bak-${stamp}`;
  const tmp = `${argAsar}.new-${stamp}`;
  const src = fs.readFileSync(argAsar);
  const { dataStart } = parseHeader(src);
  const patches = new Map();
  for (const entry of TARGETS) {
    const node = nodeAt(parseHeader(src).json, entry);
    if (!node) { console.error('entry not found: ' + entry); process.exit(3); }
    const text = entryBytes(src, dataStart, node).toString('utf8');
    patches.set(entry, Buffer.from(text.replace(RE, GUARD), 'utf8'));
  }
  const { out } = build(src, patches);
  try {
    fs.renameSync(argAsar, bak);
  } catch (e) {
    console.error('cannot rename the live asar (App still running?): ' + e.message);
    process.exit(4);
  }
  fs.writeFileSync(tmp, out);
  fs.renameSync(tmp, argAsar);
  console.log(`backup  : ${bak}`);
  console.log(`installed: ${argAsar} (${out.length} bytes)`);
  process.exit(0);
}

console.error('unknown command: ' + cmd);
process.exit(2);
