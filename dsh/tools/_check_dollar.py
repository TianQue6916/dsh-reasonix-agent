# 铁律 32 附加检查：逐行 $ 奇偶 + \[ / $$ 残留
import io, os, re, sys

root = r'C:/Users/27063/Documents/修复产出'
files = [f for f in os.listdir(root) if f.endswith('.bilingual.md')]
BS = chr(92)
bad = 0
for f in sorted(files):
    p = os.path.join(root, f)
    lines = io.open(p, encoding='utf-8', newline='').read().split('\n')
    inmath = False
    for i, l in enumerate(lines, 1):
        l = l.rstrip('\r')
        if l.strip().startswith('```'):
            inmath = not inmath
            continue
        if inmath:
            continue
        s = l.replace(BS + '$', '')          # 去掉转义 \$（金额）
        s = re.sub('`[^`]*`', '', s)         # 去掉行内 code
        n = s.count('$')
        if n % 2:
            print('[ODD $] %s:%d  %s' % (f, i, l[:120]))
            bad += 1
        if '$$' in s:
            print('[DANGER $$] %s:%d  %s' % (f, i, l[:120]))
            bad += 1
        if BS + '[' in s:
            print('[DANGER \\[] %s:%d  %s' % (f, i, l[:120]))
            bad += 1
print('problems:', bad)
