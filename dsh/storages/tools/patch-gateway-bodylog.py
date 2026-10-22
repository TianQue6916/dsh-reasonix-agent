# -*- coding: utf-8 -*-
"""给 goat-gateway 加一个「受控的请求体落盘」开关（诊断用，默认完全不生效）。

为什么需要：要回答「思考链为什么是英文」，必须拿到**真实请求体**（messages 顺序 + system +
tools 数组），靠 session 事件重建会有偏差（tools 不在 session 里）。

设计（刻意保守）：
  * 只有 `logs/.bodylog-on` 这个哨兵文件存在时才写盘；文件删掉即彻底静默。
  * 每个进程最多写 8 个文件（`have < 8`），避免无限增长。
  * 落盘的是**原始 body Buffer**，逐字节原样，不经 JSON 往返。
  * 纯插入：只加一段 try/catch；`node --check` 必过；`--restore` 按标记整段删除。
  * 哨兵存在时会用现有的 log() 记一行 `BODYLOG id=… bytes=… n=…`，便于对时间轴。

用法：
  python patch-gateway-bodylog.py --check
  python patch-gateway-bodylog.py            # apply
  python patch-gateway-bodylog.py --verify
  python patch-gateway-bodylog.py --restore
"""
import io, os, re, subprocess, sys, time

GW = r"D:\Toolbox\goat-gateway\gateway.mjs"
CRLF = "\r\n"

MARK_B = "  // bodylog-start"
MARK_E = "  // bodylog-end"

ANCHOR = CRLF.join([
    "  const meta = {",
    "    model: parsed && typeof parsed.model === 'string' ? parsed.model : '',",
]) + CRLF

BLOCK = CRLF.join([
    MARK_B + " (2026-10-03 诊断：真实请求体落盘；见 ~/.dsh/storages/tools/patch-gateway-bodylog.py)",
    "  try {",
    "    if (parsed && fs.existsSync(p('logs', '.bodylog-on'))) {",
    "      const bd = p('logs', 'bodies');",
    "      fs.mkdirSync(bd, { recursive: true });",
    "      const have = fs.readdirSync(bd).filter((f) => f.endsWith('.json')).length;",
    "      if (have < 8) {",
    "        const stamp = new Date().toISOString().replace(/[:.]/g, '-');",
    "        fs.writeFileSync(path.join(bd, stamp + '-' + have + '.json'), body);",
    "        log(`BODYLOG id=${req._reqId} bytes=${body.length} n=${have}`);",
    "      }",
    "    }",
    "  } catch {}",
    MARK_E,
]) + CRLF


def read():
    with io.open(GW, 'rb') as fh:
        return fh.read().decode('utf-8', 'replace')


def once(text, old, new, label):
    n = text.count(old)
    if n != 1:
        raise SystemExit('ABORT: %s 锚点 count=%d (需要 1)' % (label, n))
    return text.replace(old, new, 1)


def cmd_check():
    t = read()
    print('gateway.mjs %d bytes' % len(t.encode('utf-8')))
    print('已打补丁 =', MARK_B in t and MARK_E in t)
    print('ANCHOR count =', t.count(ANCHOR))
    return 0


def cmd_apply():
    t = read()
    if MARK_B in t and MARK_E in t:
        print('已是补丁状态，幂等跳过。')
        return 0
    new = once(t, ANCHOR, BLOCK + ANCHOR, 'gateway meta')
    bak = GW + '.bak-%s-pre-bodylog' % time.strftime('%Y%m%d-%H%M%S')
    with io.open(bak, 'wb') as fh:
        fh.write(t.encode('utf-8'))
    with io.open(GW, 'wb') as fh:
        fh.write(new.encode('utf-8'))
    print('apply OK: %d -> %d bytes (+%d)' % (len(t.encode('utf-8')), len(new.encode('utf-8')),
                                              len(new.encode('utf-8')) - len(t.encode('utf-8'))))
    print('backup:', bak)
    with io.open(GW + '.bodylog-anchor.txt', 'w', encoding='utf-8') as fh:
        fh.write(ANCHOR)
    return 0


def cmd_verify():
    t = read()
    ok = (MARK_B in t) and (MARK_E in t) and (t.count(MARK_B) == 1)
    print('bodylog 标记 1/1 =', ok)
    print('ANCHOR count =', t.count(ANCHOR))
    rc = subprocess.call(['node', '--check', GW])
    print('node --check:', 'OK' if rc == 0 else 'FAIL(%d)' % rc)
    if not ok:
        return 1
    # 哨兵关闭时行为必须与改前完全一致（不写盘、不报错）
    print('RESULT:', 'PASS' if rc == 0 else 'FAIL')
    return 0 if rc == 0 else 1


def cmd_restore():
    t = read()
    i = t.find(MARK_B)
    j = t.find(MARK_E)
    if i < 0 or j < 0:
        print('没有补丁标记，无需还原。')
        return 0
    j = t.index('\n', j) + 1
    new = t[:i] + t[j:]
    with io.open(GW, 'wb') as fh:
        fh.write(new.encode('utf-8'))
    print('restore OK: %d -> %d bytes' % (len(t.encode('utf-8')), len(new.encode('utf-8'))))
    return 0


if __name__ == '__main__':
    arg = sys.argv[1] if len(sys.argv) > 1 else '--apply'
    fn = {'--check': cmd_check, '--verify': cmd_verify, '--restore': cmd_restore}.get(arg, cmd_apply)
    sys.exit(fn())
