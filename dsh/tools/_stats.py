import io, os, re

pairs = [
 (r'C:/Users/27063/Desktop/课程文件/未学课程/概率导论/book/prob_chunk03_p101-150.bilingual.md',
  r'C:/Users/27063/Documents/修复产出/prob_chunk03_p101-150.bilingual.md'),
 (r'C:/Users/27063/Desktop/课程文件/100b实分析/01-讲义笔记  准备打印/L13.bilingual.md',
  r'C:/Users/27063/Documents/修复产出/L13.bilingual.md'),
 (r'C:/Users/27063/Desktop/课程文件/未学课程/概率导论/lecture最终版/Lec01.bilingual.md',
  r'C:/Users/27063/Documents/修复产出/Lec01.bilingual.md'),
 (r'C:/Users/27063/Desktop/课程文件/100b实分析/split/TBB-AllChapters-Portrait_part005_p201-250.bilingual.md',
  r'C:/Users/27063/Documents/修复产出/TBB-AllChapters-Portrait_part005_p201-250.bilingual.md'),
]

cjk = re.compile('[\u4e00-\u9fff]')

for a, b in pairs:
    A = [l.rstrip('\r') for l in io.open(a, encoding='utf-8', newline='').read().split('\n')]
    B = [l.rstrip('\r') for l in io.open(b, encoding='utf-8', newline='').read().split('\n')]
    n = max(len(A), len(B))
    changed = sum(1 for i in range(min(len(A), len(B))) if A[i] != B[i])
    print(os.path.basename(b))
    print('  lines before/after: %d / %d  changed lines: %d' % (len(A), len(B), changed))
    print('  bytes before/after: %d / %d' % (os.path.getsize(a), os.path.getsize(b)))
    print('  cjk chars before/after: %d / %d' % (
        sum(len(cjk.findall(x)) for x in A), sum(len(cjk.findall(x)) for x in B)))
