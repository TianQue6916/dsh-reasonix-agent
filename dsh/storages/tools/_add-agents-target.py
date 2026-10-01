"""给 backup-to-github.ps1 增加 agents target —— ~/.agents 下的技能本体。

为什么需要：~/.agents/skills/ 是 dsh/reasonix 共享的 agent 标准技能目录
（deja-history / deja-search / hindsight-coding-agent / microsoft-foundry，共 1.7MB），
原先 8 个 target 里没有任何一个覆盖它 → 双机不同步。

注意 reasonix 侧技能（%APPDATA%\\reasonix\\skills，97 个）已在 reasonix / reasonix-home
两个 target 覆盖范围内，不用重复加。
"""
import shutil
import time

BS = chr(92)  # 反斜杠

P = r'C:\Users\27063\Desktop\工具箱\reasonix-ops\backup-to-github.ps1'
raw = open(P, 'rb').read()
bom = raw[:3] if raw[:3] == b'\xef\xbb\xbf' else b''
NL = '\r\n' if b'\r\n' in raw[:4000] else '\n'
print('BOM:', '有' if bom else '无', '| 行尾:', repr(NL))
txt = raw.decode('utf-8-sig')

# reasonix-home 是列表最后一项（以 `})` 结尾，无逗号），锚点不含反斜杠
anchor = ("XF=@('config.json','config.json.backup','*.lock','*.log','*.bak','*.bak-*',"
          "'*.conflict.*.bak','*.jsonl','*.zstd') })")
n = txt.count(anchor)
print('锚点命中:', n)
if n != 1:
    raise SystemExit('锚点未唯一命中，放弃')

new_block = (
    anchor[:-2]  # 去掉 ` })`，只留到 `)`
    + ' },'
    + NL
    + "  @{ Name='agents';        Src=\"$User" + BS + ".agents\"" + NL
    + "     XD=@('.git')" + NL
    + "     XF=@('*.lock','*.log','*.tmp') })"
)
txt = txt.replace(anchor, new_block)

bak = P + '.bak-' + time.strftime('%Y%m%d%H%M%S') + '-pre-agents-target'
shutil.copy2(P, bak)
print('备份 ->', bak)
open(P, 'wb').write(bom + txt.encode('utf-8'))
print('已写入')

# 回读确认
chk = open(P, 'rb').read().decode('utf-8-sig')
print()
print('target 列表现在包含:')
for line in chk.splitlines():
    if 'Name=' in line and 'Src=' in line:
        print('   ' + line.strip())
