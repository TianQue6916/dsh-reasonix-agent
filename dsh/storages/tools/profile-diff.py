#!/usr/bin/env python3
# -*- coding: utf-8 -*-
'''跨机 dsh profile 差异对比。

为什么需要它：Windows 与 Linux 的 ~/.dsh/profiles/web 从 2026-09 起各自演化，
靠人工比对漏过三次（ds-harness-remote 装了不启用、dsh-reconnect 只装一边、
goat-panel 的 client.js 两侧差 864 字节）。一条命令给出五张表。

用法:
    python profile-diff.py                     # 本地(Windows) vs 远端(ssh tianque)
    python profile-diff.py --remote tqjq       # 指定远端别名
    python profile-diff.py --json              # 机器可读

输出:
    A. bundles 仅本地 / 仅远端
    B. dependencies 仅本地 / 仅远端
    C. 装了但没进 bundles（能跑但不加载）
    D. 进了 bundles 但没装（加载时被跳过）
    E. 共同 bundle 的版本差异
'''
import argparse
import json
import subprocess
import sys
from pathlib import Path

PROFILE = Path.home() / '.dsh' / 'profiles' / 'web'

PROBE_LOCAL = r'''
import json, pathlib
base = pathlib.Path.home() / ".dsh" / "profiles" / "web"
pkg = json.loads((base / "package.json").read_text(encoding="utf-8"))
prof = (pkg.get("dsh") or {}).get("profile") or {}
deps = sorted(pkg.get("dependencies") or {})
bundles = prof.get("bundles") or []
installed = {}
for name in sorted(set(deps) | set(bundles)):
    mf = base / "node_modules" / name / "package.json"
    if mf.exists():
        try:
            installed[name] = json.loads(mf.read_text(encoding="utf-8")).get("version", "?")
        except Exception:
            installed[name] = "?"
    else:
        installed[name] = None
print(json.dumps({"dependencies": deps, "bundles": bundles, "installed": installed}))
'''

PROBE_REMOTE = PROBE_LOCAL


def _ssh_exe():
    """Prefer the native Windows OpenSSH binary.

    Why: the Git-Bash ssh.exe under C:/Git/usr/bin is an MSYS2 build. Launched by
    Python it dies with
        fatal error - NtCreateDirectoryObject(/BaseNamedObjects/msys-...): 0xC0000022
    because the MSYS shared-memory namespace needs the MSYS shell's environment.
    The native C:/Windows/System32/OpenSSH/ssh.exe has no such dependency.
    """
    if sys.platform == 'win32':
        native = Path('C:/Windows/System32/OpenSSH/ssh.exe')
        if native.exists():
            return str(native)
    return 'ssh'


def run_probe(alias=None):
    if alias is None:
        import subprocess as sp
        r = sp.run([sys.executable, '-c', PROBE_LOCAL], capture_output=True, text=True, encoding='utf-8', timeout=60)
    else:
        r = subprocess.run([_ssh_exe(), '-o', 'BatchMode=yes', alias, 'python3 -'],
                               input=PROBE_REMOTE, capture_output=True, text=True, encoding='utf-8', timeout=90)
    if r.returncode != 0:
        return {'error': 'probe failed (rc=%d): %s' % (r.returncode, (r.stderr or '').strip()[:300])}
    line = (r.stdout or '').strip().split('\n')[-1]
    try:
        return json.loads(line)
    except Exception:
        return {'error': 'unparsable output: %s' % line[:300]}


def report(local, remote, ll, rl):
    if 'error' in local:
        print('[local] %s' % local['error']); return 1
    if 'error' in remote:
        print('[remote] %s' % remote['error']); return 1
    lb, rb = set(local['bundles']), set(remote['bundles'])
    ld, rd = set(local['dependencies']), set(remote['dependencies'])
    hr = '-' * 66

    print('A. bundles（真正被加载的一层）')
    print(hr)
    print('  仅 %s: %s' % (ll, sorted(lb - rb) or '（无）'))
    print('  仅 %s: %s' % (rl, sorted(rb - lb) or '（无）'))
    print('  共同 %d 个' % len(lb & rb))

    print()
    print('B. dependencies（声明层）')
    print(hr)
    print('  仅 %s: %s' % (ll, sorted(ld - rd) or '（无）'))
    print('  仅 %s: %s' % (rl, sorted(rd - ld) or '（无）'))

    print()
    print('C. 装了但没进 bundles（能跑但不加载）')
    print(hr)
    for label, d in ((ll, local), (rl, remote)):
        inst = d['installed']
        idle = sorted(n for n in (set(d['dependencies']) | set(d['bundles']))
                      if inst.get(n) and n not in set(d['bundles']))
        print('  %s: %s' % (label, idle or '（无）'))

    print()
    print('D. 进了 bundles 但没装（加载时被跳过）')
    print(hr)
    for label, d in ((ll, local), (rl, remote)):
        # @deepseek-ai/* are shipped inside the dsh install, not the profile's node_modules
        missing = sorted(n for n in d['bundles']
                         if not d['installed'].get(n) and not n.startswith('@deepseek-ai/'))
        print('  %s: %s' % (label, missing or '（无）'))

    print()
    print('E. 共同 bundle 的版本差异')
    print(hr)
    diff = 0
    for name in sorted(lb & rb):
        lv, rv = local['installed'].get(name), remote['installed'].get(name)
        if lv != rv:
            diff += 1
            print('  %-44s %s=%s  %s=%s' % (name, ll, lv, rl, rv))
    if not diff:
        print('  （无）')
    return 0


def main():
    ap = argparse.ArgumentParser(description='dsh profile diff across machines')
    ap.add_argument('--remote', default='tianque', help='ssh alias (default: tianque)')
    ap.add_argument('--local-only', action='store_true', help='only inspect this machine')
    ap.add_argument('--json', action='store_true')
    args = ap.parse_args()

    local = run_probe(None)
    remote = {'error': 'skipped (--local-only)'} if args.local_only else run_probe(args.remote)

    if args.json:
        print(json.dumps({'local': local, 'remote': remote}, ensure_ascii=False, indent=1))
        return 0
    ll = 'Windows' if sys.platform == 'win32' else 'local'
    return report(local, remote, ll, 'remote(%s)' % args.remote)


if __name__ == '__main__':
    sys.exit(main())
