#!/usr/bin/env python3
"""把 dsh-plugin-message-edit 1.2.0 修到能在 DSH 0.2.0-rc.2 上 boot。

根因（上游 issue #6 comment / PR #7，作者 pariseed）：
  1.2.0 在 client half 的 apply() 里用 ctx.sessions.open() 做导航，
  而 DSH 0.2.0-rc.2 把导航搬到了 uiWorkspace.openSession()（sessions 只剩 catalog 数据）。
  apply() 抛异常 -> fiber state FAILED -> desktop boot 的 all-or-nothing 检查抛
  `web boot: 1 entry did not activate / dsh-plugin-message-edit: failed`。

本脚本等价应用 PR #7 的改动（lib/client.js 与源码 plugin.client.js 各一份 + package.json）。

用法: python apply-pr7-message-edit.py <package-dir>
幂等：已打过补丁的目录会被识别并跳过。
"""
import io
import os
import re
import sys

TARGETS = ('lib/client.js', 'plugin.client.js')

REPL = [
    ("async function openVersionTarget(sessions, v) {",
     "async function openVersionTarget(navigation, v) {", 1),
    ("  if (!v || v.deleted || !sessions) return;",
     "  if (!v || v.deleted || !navigation) return;", 1),
    ("  openWhenListed(sessions, v.sessionId);",
     "  openWhenListed(navigation, v.sessionId);", 1),
    ("function openWhenListed(sessions, sessionId) {",
     "function openWhenListed(navigation, sessionId) {", 1),
    ("  const list = sessions.list;\n"
     "  if (!list || typeof list.getSnapshot !== 'function') { sessions.open(sessionId); return; }\n"
     "  if (list.getSnapshot().byId[sessionId] !== undefined) { sessions.open(sessionId); return; }",
     "  const list = navigation.list;\n"
     "  const open = navigation.openVersion;\n"
     "  if (!list || typeof list.getSnapshot !== 'function') { open(sessionId); return; }\n"
     "  if (list.getSnapshot().byId[sessionId] !== undefined) { open(sessionId); return; }", 1),
    ("openVersionTarget(sessions,", "openVersionTarget(navigation,", 3),
    ("if (sessions) openWhenListed(sessions, result.sessionId);",
     "openWhenListed(navigation, result.sessionId);", 2),
    ("}, [versions, sessionId, sessions, prefs.rememberPath]);",
     "}, [versions, sessionId, navigation, prefs.rememberPath]);", 1),
    ("inject: ['slots', 'sessions', 'locale'],",
     "inject: ['slots', 'sessions', 'locale', 'uiWorkspace'],", 1),
    ("    const sessions = ctx.get('sessions');\n"
     "    if (!sessions || typeof sessions.open !== 'function') {\n"
     "      throw new Error('[dsh-plugin-message-edit] Missing DSH session navigation service. Check client dependencies and restart DSH.');\n"
     "    }",
     "    const sessions = ctx.get('sessions');\n"
     "    const uiWorkspace = ctx.get('uiWorkspace');\n"
     "    if (!sessions || !sessions.list || !uiWorkspace || typeof uiWorkspace.openSession !== 'function') {\n"
     "      throw new Error('[dsh-plugin-message-edit] Missing DSH sessions or uiWorkspace navigation service. Check client dependencies and restart DSH.');\n"
     "    }\n"
     "    // DSH 0.2 keeps catalog data in sessions and navigation in uiWorkspace.\n"
     "    const navigation = { list: sessions.list, openVersion: function (id) { return uiWorkspace.openSession(id); } };", 1),
]

# openWhenListed 的 subscribe 回调里剩余那一处 sessions.open(sessionId)
RESIDUAL_RE = re.compile(r'^([ \t]+)sessions\.open\(sessionId\);', re.M)
RESIDUAL_REPL = r'\1open(sessionId);'


def patch_text(text, label, problems):
    eol = '\r\n' if '\r\n' in text else '\n'
    for old, new, want in REPL:
        old_e = old.replace('\n', eol)
        new_e = new.replace('\n', eol)
        got = text.count(old_e)
        if got != want:
            problems.append('%s: expected %d occurrence(s) of %r, found %d' % (label, want, old[:60], got))
            continue
        text = text.replace(old_e, new_e)
    text, n = RESIDUAL_RE.subn(RESIDUAL_REPL, text)
    if n != 1:
        problems.append('%s: residual sessions.open(sessionId) count = %d (expected 1)' % (label, n))
    return text


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else '.'
    problems = []
    for rel in TARGETS:
        path = os.path.join(root, rel)
        text = io.open(path, encoding='utf8', newline='').read()
        if 'uiWorkspace.openSession' in text:
            print(rel + ': already patched, skip')
            continue
        new = patch_text(text, rel, problems)
        if new != text:
            io.open(path, 'w', encoding='utf8', newline='').write(new)
            print(rel + ': patched')
    pj = os.path.join(root, 'package.json')
    txt = io.open(pj, encoding='utf8', newline='').read()
    if 'dsh-client-ui-workspace' not in txt:
        old = '        "@deepseek-ai/dsh-client-ui-conversation",\n        "@deepseek-ai/dsh-client-modules"'
        new = '        "@deepseek-ai/dsh-client-ui-conversation",\n        "@deepseek-ai/dsh-client-ui-workspace",\n        "@deepseek-ai/dsh-client-modules"'
        eol = '\r\n' if '\r\n' in txt else '\n'
        old, new = old.replace('\n', eol), new.replace('\n', eol)
        if txt.count(old) != 1:
            problems.append('package.json: inject block not found verbatim (count=%d)' % txt.count(old))
        else:
            io.open(pj, 'w', encoding='utf8', newline='').write(txt.replace(old, new))
            print('package.json: patched')
    else:
        print('package.json: already patched, skip')
    if problems:
        print('\nPROBLEMS:')
        for p in problems:
            print('  ' + p)
        return 1
    print('OK')
    return 0


if __name__ == '__main__':
    sys.exit(main())
