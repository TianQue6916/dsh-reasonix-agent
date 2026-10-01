"""一次性修复 backup-to-github.ps1 的私钥误判 + 会话缓存入库问题。

根因（2026-09-28 第三次复发）：
  $Scrub（脱敏）用的是【完整块】判据：
      (?s)-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----
  而 $Detect（提交前二次全量扫描）用的是【裸字符串】：
      -----BEGIN [A-Z ]*PRIVATE KEY-----
  → 任何"提及"该字面量的文件（写警示性文档的 fact、被 feed 进 mnemon 的副本）
    都会被判为泄漏并中止推送，而 $Scrub 的正确判据根本不匹配它们（没有 END）。

  这是个自指陷阱：每写一条"我修好了 PRIVATE KEY 泄漏"的 fact，就再生一个触发源。
  实测证据：该 fact 正文 BEGIN=2 / END=0，长 base64 行 = 0（纯属提及）。

修法：$Detect 的私钥判据改为「BEGIN + 真实密钥体」——要求后续跟 >=40 字符的 base64，
      这才区分得了"提及"与"真密钥"，也不再和 $Scrub 的语义打架。
"""
import shutil
import time

BS = chr(92)  # 反斜杠，避免源码里出现转义地狱

P = r'C:\Users\27063\Desktop\工具箱\reasonix-ops\backup-to-github.ps1'
raw = open(P, 'rb').read()
bom = raw[:3] if raw[:3] == b'\xef\xbb\xbf' else b''
print('BOM:', '有' if bom else '无')
txt = raw.decode('utf-8-sig')

edits = [
    (
        '私钥判据：裸字符串 → BEGIN+真实密钥体',
        "'-----BEGIN [A-Z ]*PRIVATE KEY-----'",
        "'(?s)-----BEGIN [A-Z ]*PRIVATE KEY-----[" + BS + "r" + BS + "n]{1,2}"
        "[A-Za-z0-9+/=]{40,}'",
    ),
    (
        'dsh: 排除会话投影缓存 (21MB/1254 JSON)',
        "XD=@('gate','_backup-20260920-upgrade','node_modules','.git')",
        "XD=@('gate','_backup-20260920-upgrade','node_modules','.git','session_projcache')",
    ),
    (
        'dsh: 排除 mnemon 数据草稿 (808KB)',
        "XF=@('*.lock','*.log','credentials.json','*.sqlite','*.db','*.zstd','*.jsonl')",
        "XF=@('*.lock','*.log','credentials.json','*.sqlite','*.db','*.zstd','*.jsonl','mnemon-draft.json')",
    ),
]

bak = P + '.bak-' + time.strftime('%Y%m%d%H%M%S') + '-pre-keydetect-fix'
shutil.copy2(P, bak)
print('备份 ->', bak)
print()

ok = True
for i, (label, a, b) in enumerate(edits, 1):
    n = txt.count(a)
    flag = 'ok' if n == 1 else '!! 期望恰好 1 次'
    print(f'  edit{i} {flag} (命中 {n}) : {label}')
    if n != 1:
        ok = False
        continue
    txt = txt.replace(a, b)

if not ok:
    print()
    print('有锚点未唯一命中，未写入。')
    raise SystemExit(1)

open(P, 'wb').write(bom + txt.encode('utf-8'))
print()
print('已写入（BOM 保留）')
