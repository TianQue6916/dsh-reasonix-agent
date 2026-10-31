#!/bin/bash
# dsh_autocommit.sh —— ~/.dsh 的自动快照（Linux 侧，与 Windows 侧对等）
#
# 目的：让每一次手写的配置/脚本改动都有 commit 可回指。
# 设计：只在有变更时提交；message 格式与 Windows 侧一致：
#   auto: 2026-10-26 21:50  (3 files)
set -uo pipefail
cd "$HOME/.dsh" || exit 0
[ -d .git ] || exit 0

CHANGED=$(git status --porcelain 2>/dev/null | wc -l)
[ "$CHANGED" -eq 0 ] && exit 0

git add -A 2>/dev/null
STAGED=$(git diff --cached --name-only 2>/dev/null | wc -l)
[ "$STAGED" -eq 0 ] && exit 0

git -c user.name="TianQue6916" -c user.email="2706352190@qq.com" \
    commit -q -m "auto: $(date '+%F %H:%M')  ($STAGED files)" 2>/dev/null
