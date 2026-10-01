import sys
path, provider, model, effort = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
with open(path, encoding='utf-8') as f:
    lines = f.read().splitlines()
out = []
in_default = False
patched_provider = False
for ln in lines:
    s = ln.strip()
    if s == 'agent-default-model:':
        in_default = True
        out.append(ln)
        # 若下一段没有 provider 行，在 agent-default-model 块开头补一行
        continue
    if in_default:
        if s.startswith('provider:'):
            out.append('  provider: ' + provider)
            patched_provider = True
            continue
        if s.startswith('model:'):
            cur = s[len('model:'):].strip()
            if not patched_provider:
                out.append('  provider: ' + provider)
                patched_provider = True
            out.append('  model: ' + (cur if cur.startswith('deepseek/') else 'deepseek/' + cur))
            continue
        if s.startswith('reasoningEffort:'):
            out.append('  reasoningEffort: ' + effort)
            continue
        if s and not s.startswith('#'):
            # 离开 agent-default-model 块
            in_default = False
    out.append(ln)
with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write('\n'.join(out) + '\n')
print('settings updated: provider=%s model=%s effort=%s' % (provider, model, effort))
