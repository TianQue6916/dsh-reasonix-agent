// Loads the plugin's built client half in a vm sandbox, then runs apply(ctx)
// against fake DSH services. Purpose: prove the PR #7 change makes activation
// succeed when navigation lives on uiWorkspace (DSH 0.2) and sessions has no
// .open(), and that a missing uiWorkspace still fails loudly with the NEW message.
const fs = require('fs'), vm = require('vm'), path = require('path');

const React = {
  createElement: () => null, Fragment: 'Fragment', memo: (x) => x, forwardRef: (x) => x,
  useState: () => [undefined, () => {}], useEffect: () => {}, useLayoutEffect: () => {},
  useInsertionEffect: () => {}, useRef: () => ({ current: null }), useMemo: (f) => f(),
  useCallback: (f) => f, useSyncExternalStore: () => undefined, useContext: () => undefined,
  createContext: () => ({ Provider: 'P' }), Children: { map: () => [] }, cloneElement: (x) => x,
};

function loadPlugin(pkgDir) {
  const src = fs.readFileSync(path.join(pkgDir, 'lib', 'client.js'), 'utf8');
  let captured = null;
  const sandbox = {
    console, setTimeout, clearTimeout, Promise, JSON, Math, Date, Error, Map, Set, WeakMap,
  };
  sandbox.window = { __ModuleLoader__: { load: (o) => { captured = o; } } };
  sandbox.window.document = {
    documentElement: { setAttribute() {}, removeAttribute() {}, getAttribute: () => null },
    head: { appendChild() {} }, body: { appendChild() {} },
    querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ setAttribute() {}, style: {}, appendChild() {}, classList: { add() {}, remove() {} } }),
    addEventListener() {}, removeEventListener() {},
  };
  sandbox.window.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  sandbox.document = sandbox.window.document;
  sandbox.localStorage = sandbox.window.localStorage;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: pkgDir + '/lib/client.js' });
  if (!captured) throw new Error('__ModuleLoader__.load was never called');
  const req = (n) => {
    if (n === 'react' || n === 'react/jsx-runtime') return React;
    throw new Error('unexpected require("' + n + '") — not in the renderer builtin table');
  };
  const ret = captured.factory(req);
  const mod = typeof ret === 'function' ? { apply: ret } : ret;
  return { id: captured.id, mod, sandbox };
}

function fakeCtx(services) {
  const seen = { registered: [], injected: [] };
  const table = Object.assign({
    slots: {
      inject: (name, fn) => { seen.injected.push(name); return fn; },
      register: (def) => { seen.registered.push(def); return () => {}; },
    },
    locale: { t: (k) => k, get: (k) => k, format: (k) => k, current: 'zh-CN', onChange: () => () => {} },
  }, services);
  const ctx = new Proxy({
    get: (name) => table[name],
    effect: (fn) => { try { return fn(); } catch (e) { seen.effectError = e; } },
    inject: () => {},
    on: () => () => {},
    emit: () => {},
    seen,
  }, {
    get(t, p) {
      if (p in t) return t[p];
      if (p === 'then') return undefined;
      return () => undefined;
    },
  });
  return ctx;
}

const NAV_ONLY_SESSIONS = { list: { byId: {} }, byId: {} };          // no .open()
const UI_WORKSPACE = { openSession() {}, list: {} };

function run(label, pkgDir, services) {
  const { mod } = loadPlugin(pkgDir);
  const ctx = fakeCtx(services);
  let err = null;
  try { mod.apply(ctx); } catch (e) { err = e; }
  const inject = Array.isArray(mod.inject) ? mod.inject.join(',') : String(mod.inject);
  console.log('--- ' + label);
  console.log('    inject = ' + inject);
  if (err) console.log('    apply() THREW: ' + err.message);
  else console.log('    apply() ok — slots.inject calls: [' + ctx.seen.injected.join(', ') + ']');
  return err;
}

const patched = path.resolve(process.argv[2]);
const pristine = path.resolve(process.argv[3]);

console.log('patched pkg  = ' + patched);
console.log('pristine pkg = ' + pristine + '\n');

const a = run('AFTER patch: sessions without .open() + uiWorkspace', patched, { sessions: NAV_ONLY_SESSIONS, uiWorkspace: UI_WORKSPACE });
const b = run('AFTER patch: uiWorkspace MISSING (should fail loudly, NEW message)', patched, { sessions: NAV_ONLY_SESSIONS });
const c = run('BEFORE patch (pristine): sessions without .open() + uiWorkspace', pristine, { sessions: NAV_ONLY_SESSIONS, uiWorkspace: UI_WORKSPACE });
const d = run('BEFORE patch (pristine): with legacy sessions.open() (should pass)', pristine, { sessions: { list: {}, open() {}, byId: {} }, uiWorkspace: UI_WORKSPACE });

let bad = 0;
function check(name, ok) { console.log((ok ? '  PASS  ' : '  FAIL  ') + name); if (!ok) bad++; }
console.log('\nassertions:');
check('patched apply() does not throw when navigation is on uiWorkspace', a === null);
check('patched apply() throws NEW "uiWorkspace navigation service" error when uiWorkspace absent', b !== null && /uiWorkspace navigation service/.test(b.message));
check('pristine apply() DOES throw when sessions lacks .open() (reproduces the crash)', c !== null);
check('pristine apply() passes only with legacy sessions.open()', d === null);
process.exit(bad === 0 ? 0 : 1);
