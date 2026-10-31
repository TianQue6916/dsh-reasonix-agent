import io

P = r'C:/Users/27063/Documents/修复产出/L13.bilingual.md'
raw = io.open(P, encoding='utf-8', newline='').read()
crlf = '\r\n' in raw
lines = [l.rstrip('\r') for l in raw.split('\n')]

i = 116  # 0-based for line 117
old = lines[i]
assert old.startswith('> <span style="color:#1e8449;">**[note] Note（译者注，镜像规则）:**</span>'), repr(old[:80])
assert r'\bigcup_{k \in \mathbb{N}} \{\tfrac{1}{k}\} = (0, 1]' in old

new = (
 '> <span style="color:#1e8449;">**[note] Note（译者注，镜像规则）:**</span> '
 '把本定理与 L12 的开集定理并排读：开集"任意并、有限交"；闭集恰好反过来"任意交、有限并"。'
 'Colding 亲自点题：🎥 *"And so here, it\'s exactly the opposite thing as for open sets."*（翻译：这里的规则与开集恰好完全相反。）'
 '原因也已写进证明：闭性的验证要走补集，而补集把 $\\cap$ 与 $\\cup$ 互换（De Morgan 律），于是"任意"与"有限"的角色随之对调。'
 '反例（正文只给了警告没给例子，此处按同一套路补齐，两个方向各一个）：\n'
 '>\n'
 '> **① 无穷多闭集之并，未必闭。** 令 $A_k = \\{\\tfrac{1}{k}\\}$（$k = 1, 2, \\ldots$），每个 $A_k$ 是单点集，因此在 $\\mathbb{R}$ 中是闭集；'
 '但并集 $\\bigcup_{k \\ge 1} A_k = \\{\\tfrac{1}{k} : k \\ge 1\\}$ 是一个**可数点集**（注意：它绝不是区间 $(0, 1]$，$(0,1]$ 是不可数的），'
 '它**不是**闭集 —— 因为 $0$ 是它的极限点（$\\tfrac{1}{k} \\to 0$）却不在其中。'
 '同一件事用递减闭区间讲更直观：$\\bigcap_{k \\ge 1} [\\tfrac{1}{k}, 1] = (0, 1]$，每个 $[\\tfrac{1}{k}, 1]$ 都是闭集，交却不是闭集，同样因为极限点 $0$ 被丢掉。\n'
 '>\n'
 '> **② 无穷多开集之交，未必开**（这正是开集侧"有限交"不可省的原因）：'
 '$\\bigcap_{k \\ge 1} (-\\tfrac{1}{k}, \\tfrac{1}{k}) = \\{0\\}$，每个 $(-\\tfrac{1}{k}, \\tfrac{1}{k})$ 都是开集，交却只剩单点集 $\\{0\\}$，'
 '不含任何邻域，故不是开集。\n'
 '>\n'
 '> 此外注意：源文本此处定理的 bullet 标签与证明公式因 PDF 提取伪影而错位（并/交互换、补集公式张冠李戴），'
 '上面已按讲义本意与视频内容（"任意交闭、有限并闭"）正确还原。'
)

lines[i] = new
out = '\r\n'.join(lines) if crlf else '\n'.join(lines)
io.open(P, 'w', encoding='utf-8', newline='').write(out)
print('ok, lines =', len(lines))
