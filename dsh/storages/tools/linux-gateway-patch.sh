#!/usr/bin/env bash
# linux-gateway-patch.sh -- 在 TianQue Linux 上补齐 goat-gateway 的两个补丁。
#
# 背景（2026-10-04 在 Windows 会话内做的准备）
#   Windows 侧 gateway.mjs 已打 4 个补丁：reasoning-echo-filter / finish-log / hb / bodylog。
#   Linux 侧是另一个 1642 行的 build，只有 tail 补丁（行 1101），
#   **reasoning-echo-filter 与 finish-log 都还没打**，而 reasoning-echo-filter
#   正是「思考链锁英文」的修复本体。
#
# 为什么要先诊断再打
#   patch-gateway-reasoning-filter.py 的两个插入锚点是
#     helper: "function forward(clientReq, clientRes, keyEntry, body, meta) {"
#     call  : "  // bodylog-end"
#   第二个锚点**只因为 Windows 版已打 bodylog 补丁才存在**；Linux 版没有 bodylog
#   => count == 0 => 脚本会直接退出。本脚本先量出锚点是否存在，不存在时打印候选行，
#   再用 --call-anchor 显式传入（该选项是 2026-10-04 为此新增的）。
#
# 用法
#   bash linux-gateway-patch.sh                 # 诊断（不改任何文件）
#   bash linux-gateway-patch.sh --apply         # 锚点齐全时直接打
#   bash linux-gateway-patch.sh --apply --call-anchor '  SOME ANCHOR LINE'
#
# 打完必须重启服务：systemctl --user restart goat-gateway
set -uo pipefail

GW="${GW:-$HOME/goat-gateway/gateway.mjs}"
TOOLS="${TOOLS:-$HOME/.dsh/storages/tools}"
RF="$TOOLS/patch-gateway-reasoning-filter.py"
FL="$TOOLS/patch-gateway-finish-log.py"

if command -v python3 >/dev/null 2>&1; then PY=python3; else PY=python; fi

APPLY=0
CALL_ANCHOR=""
HELPER_ANCHOR=""
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1 ;;
    --call-anchor) shift; CALL_ANCHOR="${1:-}" ;;
    --helper-anchor) shift; HELPER_ANCHOR="${1:-}" ;;
    *) echo "unknown arg: $1"; exit 2 ;;
  esac
  shift
done

echo "== environment =="
echo "  python : $PY"
echo "  gateway: $GW"
[ -f "$GW" ] || { echo "  !! gateway.mjs not found -- set GW=/path/to/gateway.mjs"; exit 1; }
echo "  bytes  : $(wc -c < "$GW")   lines: $(wc -l < "$GW")"
[ -f "$RF" ] || { echo "  !! missing $RF"; exit 1; }

echo
echo "== anchor probe =="
printf "  'function forward(' occurrences : %s\n" "$(grep -c 'function forward(' "$GW" || true)"
printf "  '// bodylog-end' occurrences    : %s\n" "$(grep -c '// bodylog-end' "$GW" || true)"
printf "  echo-filter already applied     : %s\n" "$(grep -c 'function filterReasoningEcho(' "$GW" || true)"
printf "  finish= logging already applied : %s\n" "$(grep -c 'finish=' "$GW" || true)"

if [ "$(grep -c '// bodylog-end' "$GW" || true)" = "0" ]; then
  echo
  echo "  !! call anchor '  // bodylog-end' is ABSENT on this build."
  echo "     Candidate anchors -- pick a line inside the request handler where"
  echo "     a parsed body object is in scope, then pass it verbatim:"
  grep -n 'parsed' "$GW" | head -20 | sed 's/^/       /'
  echo
  echo "     Then: bash $0 --apply --call-anchor '<that exact line>'"
fi

echo
echo "== reasoning-echo-filter --check =="
set -- --file "$GW"
[ -n "$HELPER_ANCHOR" ] && set -- "$@" --helper-anchor "$HELPER_ANCHOR"
[ -n "$CALL_ANCHOR" ] && set -- "$@" --call-anchor "$CALL_ANCHOR"
"$PY" "$RF" --check "$@" || true

echo
echo "== finish-log --check =="
[ -f "$FL" ] && "$PY" "$FL" --file "$GW" --check 2>&1 | head -20 || echo "  (script missing)"

if [ "$APPLY" = "1" ]; then
  echo
  echo "== APPLY =="
  "$PY" "$RF" --apply "$@" || { echo "reasoning-filter apply failed"; exit 1; }
  [ -f "$FL" ] && { "$PY" "$FL" --file "$GW" --apply || echo "finish-log apply failed"; }
  echo
  echo "== syntax gate =="
  if command -v node >/dev/null 2>&1; then
    node --check "$GW" && echo "  node --check: OK"
  else
    echo "  node not found; skipping syntax gate"
  fi
  echo
  echo "NEXT: systemctl --user restart goat-gateway"
  echo "      then: curl -sS localhost:8788/health | head"
fi
