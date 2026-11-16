"""收紧 backup-to-github.ps1 的 dsh target。

2026-09-28 实测 repo 已跟踪 4416 个文件，其中不该入库的：
  dsh/sessions      1424 个（源目录 291MB / 1448 个 .zstd，**含完整对话内容**，而 repo 是 public）
  dsh/_backup*       619 个（历史升级备份）
  *.bak*             556 个（本机回滚副本）
  *.conflict.*.bak   377 个（本机冲突副本）
  dsh/cache          108 个（1.6MB 缓存）
  dsh/attachments      1 个（4.9MB 附件）

注意：robocopy 用的是 /E（不删目标多余文件），所以收紧 /XD、/XF 只防未来，
历史入库的文件必须另行 `git rm -r --cached` 清理。
"""
import shutil
import time

P = r'C:\Users\27063\Desktop\工具箱\reasonix-ops\backup-to-github.ps1'
raw = open(P, 'rb').read()
bom = raw[:3] if raw[:3] == b'\xef\xbb\xbf' else b''
txt = raw.decode('utf-8-sig')

edits = [
    (
        'dsh /XD：排除会话、缓存、附件、历史备份目录',
        "XD=@('gate','_backup-20260920-upgrade','node_modules','.git','session_projcache')",
        "XD=@('gate','_backup*','_archived*','_dropped*','node_modules','.git','session_projcache',"
        "'sessions','cache','attachments')",
    ),
    (
        'dsh /XF：排除本机回滚/冲突副本',
        "XF=@('*.lock','*.log','credentials.json','*.sqlite','*.db','*.zstd','*.jsonl','mnemon-draft.json')",
        "XF=@('*.lock','*.log','credentials.json','*.sqlite','*.db','*.zstd','*.jsonl','mnemon-draft.json',"
        "'*.bak','*.bak-*','*.conflict.*.bak')",
    ),
]

ok = True
for i, (label, a, b) in enumerate(edits, 1):
    n = txt.count(a)
    print(f'  edit{i} {"ok" if n == 1 else "!! 期望 1"} (命中 {n}) : {label}')
    if n != 1:
        ok = False
        continue
    txt = txt.replace(a, b)

if not ok:
    raise SystemExit('有锚点未唯一命中，放弃')

bak = P + '.bak-' + time.strftime('%Y%m%d%H%M%S') + '-pre-scope-tighten'
shutil.copy2(P, bak)
open(P, 'wb').write(bom + txt.encode('utf-8'))
print('备份 ->', bak)
print('已写入')

chk = open(P, 'rb').read().decode('utf-8-sig')
print()
for line in chk.splitlines():
    if line.strip().startswith('XD=@') or line.strip().startswith('XF=@'):
        print('   ' + line.strip()[:150])
