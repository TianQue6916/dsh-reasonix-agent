import io

P = r'C:/Users/27063/Documents/修复产出/prob_chunk03_p101-150.bilingual.md'
lines = io.open(P, encoding='utf-8', newline='').read().split('\r\n')

patches = [
(699, '# <span style="color:#c0392b;">Sec. 2.6 Conditioning</span>',
 '# <span style="color:#c0392b;">Sec. 2.6 Conditioning（条件化）</span>'),

(1606, '# <span style="color:#c0392b;">Problems</span>',
 '# <span style="color:#c0392b;">Problems（习题）</span>'),

(1824, '<span style="color:#c0392b;">**Problem 23.**</span>',
 '<span style="color:#c0392b;">**Problem 23.**</span>'),

(2183, '最后，利用初始距离 $D$ 的给定 PMF 与全期望定理，可以求出 $T$ 的期望值：',
 '最后，$T$ 的期望值可以利用'),

(2184, 'initial distance $D$ and the total expectation theorem:',
 '初始距离 $D$ 的给定 PMF 与全期望定理求出：'),

(2198, '这里利用的是「单个随机变量的函数」的期望值法则。然后，把该法则用于线性函数这一特殊情形，验证公式',
 '这里用到的是「单个随机变量的函数」的期望值法则。然后把该法则用于线性函数这一特殊情形，以验证公式'),

(2199, 'rule for the special case of a linear function, to verify the formula',
 '（即线性函数这一特殊情形下的期望值法则），从而验证公式'),

(2210, '**解.** 我们用全期望定理把问题化归为单个随机变量的情形。具体地，有',
 '**解.** 我们用全期望定理把问题化归为'),

(2211, 'a single random variable. In particular, we have',
 '单个随机变量的情形。具体地，有'),

(2256, '(b) 如何把这个公式解释为第 1.3 节所给乘法规则的特例？',
 '(b) 如何把这个公式解释为第 1.3 节所给的乘法规则的'),

(2257, 'given in Section 1.3?',
 '一个特例？'),
]

bad = 0
for ln, pref, new in patches:
    old = lines[ln - 1]
    if not old.startswith(pref):
        print('MISMATCH', ln, repr(old[:70]))
        bad += 1
        continue
    lines[ln - 1] = new

print('patched', len(patches) - bad, 'of', len(patches))
if bad == 0:
    io.open(P, 'w', encoding='utf-8', newline='').write('\r\n'.join(lines))
    print('written')
