#!/usr/bin/env python3
"""md 图片引用转换器。默认把图 base64 内嵌（B 方案，用户 2026-11-12 拍板）。

用法:
    python mdimg.py <md文件> [--mode embed|absolute] [--base <assets 的父目录>] [--out <输出>]

    embed    : ![](assets/x.svg) -> ![](data:image/svg+xml;base64,...)   自包含，移动/改名/单发都不坏
    absolute : ![](assets/x.svg) -> ![](/abs/path/assets/x.svg)          只在本机该路径下有效

不给 --out 时原地改，原文件先备份为 <name>.bak。
image/svg+xml 与 image/png 按扩展名自动判 MIME。
"""
import base64
import os
import shutil
import sys

MIME = {'.svg': 'image/svg+xml', '.png': 'image/png',
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif'}


def transform(s, fn):
    out, i = [], 0
    while True:
        k = s.find('](assets/', i)
        if k < 0:
            out.append(s[i:])
            break
        j = s.find(')', k)
        out.append(s[i:k + 2])
        out.append(fn(s[k + 2:j]))
        out.append(')')
        i = j + 1
    return ''.join(out)


def main():
    a = sys.argv[1:]
    if not a:
        print(__doc__)
        return
    src = a[0]
    mode, base, dst = 'embed', None, None
    i = 1
    while i < len(a):
        if a[i] == '--mode':
            mode = a[i + 1]; i += 2
        elif a[i] == '--base':
            base = a[i + 1]; i += 2
        elif a[i] == '--out':
            dst = a[i + 1]; i += 2
        else:
            i += 1
    if mode not in ('embed', 'absolute'):
        sys.exit('mode 只能是 embed 或 absolute')
    base = (base or os.path.dirname(os.path.abspath(src))).rstrip('/')
    dst = dst or src
    s = open(src, encoding='utf-8').read()

    if mode == 'embed':
        def fn(rel):
            full = os.path.join(base, rel)
            ext = os.path.splitext(full)[1].lower()
            if not os.path.exists(full):
                raise SystemExit('缺图: ' + full)
            data = base64.b64encode(open(full, 'rb').read()).decode()
            return 'data:' + MIME.get(ext, 'application/octet-stream') + ';base64,' + data
    else:
        def fn(rel):
            return base + '/' + rel

    out = transform(s, fn)
    if dst == src:
        shutil.copy2(src, src + '.bak')
    open(dst, 'w', encoding='utf-8').write(out)
    n = out.count('](' + ('data:' if mode == 'embed' else base))
    longest = max(len(x) for x in out.split('\n'))
    print('mode=%s  写入 %s  %d bytes  图片 %d 处  最长行 %d' % (
        mode, dst, len(out.encode()), n, longest))


if __name__ == '__main__':
    main()
