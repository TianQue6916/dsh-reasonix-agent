#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""skills-canonical.py — 技能真源维护（2026-10-01 用户拍板：真源独立，不复用任何 harness 目录）

真源（canonical，唯一可写处）：
  Windows  C:\Users\27063\ai-skills
  Linux    /home/tianque/ai-skills

入口（由真源派生，视为只读）：
  Windows  .dsh\skills        → junction → ai-skills   （dsh 读）
  Windows  .reasonix\skills   → junction → ai-skills   （Reasonix CLI / legacy 读）
  Linux    ~/.dsh/skills       → symlink  → ai-skills
  Linux    ~/.reasonix/skills  → symlink  → ai-skills
  Windows  AppData\Roaming\reasonix\skills = 真实目录（Reasonix Desktop 占用中、无法改名）
      → 由 --mirror 单向跟随真源

用法（在 Windows 侧运行；Linux 侧无需安装，由 --push/--pull 驱动）：
  --verify   只读：真源 vs 各入口 vs 对方机器，逐文件 sha256 + 完整性检查
  --mirror   真源 → Roaming 单向复制（只覆盖/新增，不删任何文件）
  --push     真源 → Linux 真源（tar 传输）
  --pull     Linux 真源 → 真源
  --prune-linux  把 Linux 真源里多余的文件移到 ~/ai-skills-pruned-<ts>/（移动，不删）

⚠️ 安全铁律（2026-10-01 事故教训）
  绝不对可能是 junction/symlink 的路径做递归删除：Windows 下 shutil.rmtree / rm -rf /
  Remove-Item -Recurse 会**穿透链接删掉目标目录内容**（本次差点删光 80 个技能）。
  删链接只用 `cmd /c rmdir <path>`。
"""
import hashlib
import os
import subprocess
import sys

HOME = os.path.expanduser('~')
CANON = os.path.join(HOME, 'ai-skills')
ROAMING = os.path.join(HOME, 'AppData', 'Roaming', 'reasonix', 'skills')
ENTRIES = [os.path.join(HOME, '.dsh', 'skills'), os.path.join(HOME, '.reasonix', 'skills')]
LINUX = 'tianque'
LINUX_CANON = '~/ai-skills'
NOISE = ('.bak', '.conflict.', '.old-')


def walk(root):
    out = {}
    for dp, dn, fn in os.walk(root):
        for f in fn:
            p = os.path.join(dp, f)
            rel = os.path.relpath(p, root).replace(os.sep, '/')
            try:
                out[rel] = hashlib.sha256(open(p, 'rb').read()).hexdigest()
            except OSError:
                pass
    return out


def integrity(root):
    bad = []
    for n in sorted(os.listdir(root)):
        d = os.path.join(root, n)
        if not os.path.isdir(d) or n.startswith('.'):
            continue
        sk = os.path.join(d, 'SKILL.md')
        if not os.path.exists(sk):
            disabled = [f for f in os.listdir(d) if f.startswith('SKILL.md.disabled')]
            if disabled:
                continue  # 有意停用（SKILL.md → SKILL.md.disabled-*）
            bad.append(n + ' (无 SKILL.md)')
        elif os.path.getsize(sk) < 50:
            bad.append(n + ' (SKILL.md 仅 ' + str(os.path.getsize(sk)) + 'B)')
    return bad


def linux_manifest():
    cmd = ("cd " + LINUX_CANON + " && find . -type f | sort | while read f; do "
           "printf '%s  %s\n' \"$(sha256sum \"$f\" | cut -d' ' -f1)\" \"${f#./}\"; done")
    r = subprocess.run(['ssh', '-o', 'BatchMode=yes', LINUX, cmd], capture_output=True, text=True, encoding='utf-8')
    out = {}
    for line in r.stdout.splitlines():
        h, _, n = line.partition('  ')
        if n:
            out[n] = h
    return out


def cmp_sets(name_a, a, name_b, b, limit=8):
    only_a = sorted(set(a) - set(b))
    only_b = sorted(set(b) - set(a))
    diff = sorted(n for n in set(a) & set(b) if a[n] != b[n])
    tag = '✅ 一致' if not (only_a or only_b or diff) else '⚠'
    print('  %-34s %-34s %s' % (name_a + '(' + str(len(a)) + ')', name_b + '(' + str(len(b)) + ')', tag))
    for lbl, lst in ((name_a + ' 独有', only_a), (name_b + ' 独有', only_b), ('内容不同', diff)):
        for x in lst[:limit]:
            print('      ' + lbl + ': ' + x)
        if len(lst) > limit:
            print('      ' + lbl + ': …共 ' + str(len(lst)))
    return not (only_a or only_b or diff)


def verify():
    a = walk(CANON)
    print('  真源 ' + CANON + ' : ' + str(len(a)) + ' 文件, ' + str(len(os.listdir(CANON))) + ' 顶层项')
    bad = integrity(CANON)
    print('  完整性: ' + ('✅ 每个技能目录都有可用 SKILL.md' if not bad else '⚠ ' + str(bad)))
    ok = not bad
    for e in ENTRIES:
        ok &= cmp_sets('真源', a, os.path.relpath(e, HOME), walk(e))
    ok &= cmp_sets('真源', a, 'Linux 真源', linux_manifest())
    # Roaming：真源必须是子集（Roaming 允许更多，如噪声归档）
    rb = walk(ROAMING)
    extra = sorted(set(a) - set(rb))
    diffr = sorted(n for n in set(a) & set(rb) if a[n] != rb[n])
    print('  %-34s %-34s %s' % ('真源', 'Roaming(' + str(len(rb)) + ')', '✅ 已镜像' if not (extra or diffr) else '⚠ 需 --mirror'))
    for x in (extra + diffr)[:8]:
        print('      待镜像: ' + x)
    ok &= not (extra or diffr)
    print('\n  ' + ('✅ 三方全部一致' if ok else '⚠ 存在差异（见上）'))
    return 0 if ok else 1


def mirror():
    n = 0
    for rel, _h in walk(CANON).items():
        s = os.path.join(CANON, rel.replace('/', os.sep))
        t = os.path.join(ROAMING, rel.replace('/', os.sep))
        os.makedirs(os.path.dirname(t), exist_ok=True)
        if os.path.exists(t) and open(s, 'rb').read() == open(t, 'rb').read():
            continue
        open(t, 'wb').write(open(s, 'rb').read())
        n += 1
    print('  --mirror: 真源 → Roaming 更新 ' + str(n) + ' 个文件（未删除任何文件）')


def transfer(direction):
    if direction == 'push':
        subprocess.run(['tar', '-czf', os.path.join(HOME, '_canon.tgz'), '-C', HOME, 'ai-skills'], check=True)
        subprocess.run(['scp', '-q', os.path.join(HOME, '_canon.tgz'), LINUX + ':/tmp/_canon.tgz'], check=True)
        subprocess.run(['ssh', LINUX, 'mkdir -p ~/ai-skills && tar -xzf /tmp/_canon.tgz -C ~ --strip-components=1 && rm -f /tmp/_canon.tgz'], check=True)
        os.remove(os.path.join(HOME, '_canon.tgz'))
        print('  --push: 真源 → Linux 真源 完成')
    else:
        subprocess.run(['ssh', LINUX, 'tar -czf /tmp/_canon.tgz -C ~ ai-skills'], check=True)
        subprocess.run(['scp', '-q', LINUX + ':/tmp/_canon.tgz', os.path.join(HOME, '_canon.tgz')], check=True)
        subprocess.run(['tar', '-xzf', os.path.join(HOME, '_canon.tgz'), '-C', HOME, '--strip-components=1'], check=True)
        subprocess.run(['ssh', LINUX, 'rm -f /tmp/_canon.tgz'], check=True)
        os.remove(os.path.join(HOME, '_canon.tgz'))
        print('  --pull: Linux 真源 → 真源 完成')


def prune_linux():
    """把 Linux 真源里「Windows 真源没有」的条目移到 ~/ai-skills-pruned-<ts>/（移动，不删除）。"""
    import datetime
    local = set(walk(CANON))
    remote = linux_manifest()
    extra = sorted(set(remote) - set(local))
    if not extra:
        print('  --prune-linux: Linux 真源无多余文件 ✅')
        return
    ts = datetime.datetime.now().strftime('%Y%m%d-%H%M')
    tops = sorted({r.split('/')[0] for r in extra})
    script = ('mkdir -p ~/ai-skills-pruned-' + ts + ' && cd ~/ai-skills && '
              + ' && '.join('mv "' + t + '" ~/ai-skills-pruned-' + ts + '/ 2>/dev/null || true' for t in tops)
              + ' ; echo moved')
    subprocess.run(['ssh', LINUX, script], check=False)
    print('  --prune-linux: 移出 ' + str(len(tops)) + ' 个顶层项（' + str(len(extra)) + ' 文件）→ ~/ai-skills-pruned-' + ts)
    for t in tops[:8]:
        print('      ' + t)


if __name__ == '__main__':
    arg = sys.argv[1] if len(sys.argv) > 1 else '--verify'
    if arg == '--verify':
        sys.exit(verify())
    elif arg == '--mirror':
        mirror()
    elif arg == '--push':
        transfer('push')
    elif arg == '--pull':
        transfer('pull')
    elif arg == '--prune-linux':
        prune_linux()
    else:
        print(__doc__)
