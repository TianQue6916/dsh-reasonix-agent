# -*- coding: utf-8 -*-
"""goat-gateway：给 key 加 pathPrefixes（path 独家认领）。
每组替换断言命中恰好 1 次，不符则整体不落盘。文件是 CRLF，写回时统一转 CRLF。"""
import io, sys

P = 'gateway.mjs'
raw = io.open(P, encoding='utf-8', newline='').read()
crlf = '\r\n' in raw
conv = lambda s: s.replace('\r\n', '\n').replace('\n', '\r\n') if crlf else s

groups = []

# ── P1 loadKeys()：保留 pathPrefixes ────────────────────────────────────────
groups.append((
"      quotaAccount: typeof k.quotaAccount === 'string' && k.quotaAccount ? k.quotaAccount : (k.name || ''),\n    }));\n",
"""      quotaAccount: typeof k.quotaAccount === 'string' && k.quotaAccount ? k.quotaAccount : (k.name || ''),
      // pathPrefixes（2026-10-02 加）：该 key 独家认领的客户端 path 前缀，语义见 pathAllowed()。
      // 不写/空数组 = 不认领（在未被认领的 path 上照常参与，行为与改动前一致）。
      pathPrefixes: Array.isArray(k.pathPrefixes)
        ? k.pathPrefixes.filter((x) => typeof x === 'string' && x.length > 0)
        : null,
    }));
"""))

# ── P2 在 modelSupported() 前插入 pathClaimed / pathAllowed ─────────────────
groups.append((
"function modelSupported(keyEntry, model) {\n",
"""// ── path 独家认领（2026-10-02 加）────────────────────────────────────────
//
// WHY：多上游改造后 selectKey 只看 model，但各上游的**路由空间并不相同**。
//   实测（2026-10-02 14:42）：POST /anthropic/v1/messages（官方 DeepSeek 的
//   Anthropic 兼容端点，dsh 的 web_search 走这条）其 model 是
//   deepseek/deepseek-v4.1-flash —— GOAT 与官方都声明支持，于是被分给
//   priority 100 的 GOAT key，转发成
//     POST https://api.commandcode.ai/provider/v1/anthropic/v1/messages → 404
//   GOAT 压根没有 anthropic 路由。这类请求必须由「认识该 path 的上游」服务。
//
// 设计：显式认领制（不是黑名单）。
//   · 没有任何 key 认领该 path → 全部 enabled key 照常参与（/v1/* 聊天路径逐位不变）
//   · 有 key 认领 → 该 path 上只保留认领者；未声明 pathPrefixes 的 key 一律出局
// 好处：GOAT 那两个 key 无需写任何配置就能自动让开，也不存在
//       「忘了给谁加配置 = 静默把请求送去错上游」的坑。
function pathClaimed(keys, pathname) {
  if (!pathname) return false;
  return keys.some(
    (k) => Array.isArray(k.pathPrefixes) && k.pathPrefixes.some((x) => pathname.startsWith(x)),
  );
}

function pathAllowed(keyEntry, pathname) {
  const pfx = keyEntry && keyEntry.pathPrefixes;
  if (!Array.isArray(pfx) || !pfx.length) return true;
  return pathname ? pfx.some((x) => pathname.startsWith(x)) : true;
}

function modelSupported(keyEntry, model) {
"""))

# ── P3 meta 加 path ────────────────────────────────────────────────────────
groups.append((
"    prefixFp: prefixFingerprint(parsed),\n  };\n",
"""    prefixFp: prefixFingerprint(parsed),
    // path（2026-10-02 加）：path 独家认领的判定依据，见 pathClaimed()。
    path: url.pathname,
  };
"""))

# ── P4 候选集过滤加 path 条件 ──────────────────────────────────────────────
groups.append((
"  const all = enabledKeys.filter((k) => modelSupported(k, meta.model));\n",
"""  const pathOwned = pathClaimed(enabledKeys, meta.path);
  const all = enabledKeys.filter(
    (k) => modelSupported(k, meta.model) && (!pathOwned || pathAllowed(k, meta.path)),
  );
"""))

# ── P5 400 诊断带上 path ───────────────────────────────────────────────────
groups.append((
"""            `goat-gateway: 没有 key 能服务 model '${meta.model}'` +
            `（${enabledKeys.length} 个 enabled key 均声明不支持它）`,
          type: 'gateway_no_key_for_model',
          model: meta.model,
""",
"""            `goat-gateway: 没有 key 能服务 model '${meta.model}'` +
            (meta.path ? ` @ path '${meta.path}'` : '') +
            `（${enabledKeys.length} 个 enabled key 均不支持它或未认领该 path）`,
          type: 'gateway_no_key_for_model',
          model: meta.model,
          path: meta.path,
"""))

fail = False
for i, (old, new) in enumerate(groups, 1):
    o2, n2 = conv(old), conv(new)
    c = raw.count(o2)
    if c != 1:
        print(f'P{i}: FAIL count={c}')
        fail = True
    else:
        raw = raw.replace(o2, n2)
        print(f'P{i}: ok')
if fail:
    print('ABORTED, 未落盘')
    sys.exit(1)
io.open(P, 'w', encoding='utf-8', newline='').write(raw)
print('WROTE', P)
