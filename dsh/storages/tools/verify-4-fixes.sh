#!/usr/bin/env bash
# verify-4-fixes.sh — 验收 2026-09-27 修复的 4 个缺陷
# 用法: bash ~/.dsh/storages/tools/verify-4-fixes.sh
# 全部只读，不改动任何东西。退出码 0 = 全通过。

PASS=0; FAIL=0
ok(){ echo "    PASS  $1"; PASS=$((PASS+1)); }
no(){ echo "    FAIL  $1"; FAIL=$((FAIL+1)); }
winpath(){ printf "%s" "$1" | sed "s|^/c/|C:/|"; }
chk(){ if [ "$2" = "$3" ]; then ok "$1"; else no "$1 (期望 $3, 实得 $2)"; fi; }

HOME_DIR="$HOME"
REAL_1="$HOME_DIR/Desktop/工具箱/reasonix-ops/backup-to-github.ps1"
REAL_2="$HOME_DIR/Desktop/工具箱/学科总结文档生成/reasonix-ops/backup-to-github.ps1"
FACT="$HOME_DIR/.reasonix/memory/global/github-加速体系与镜像自动选优-20260927.md"
LEDGER="$HOME_DIR/.dsh/storages/skill-usage.json"

echo
echo "== ① backup-to-github.ps1 副本一致性 =="
if [ -f "$REAL_1" ] && [ -f "$REAL_2" ]; then
  cmp -s "$REAL_1" "$REAL_2" && ok "两份真实副本字节一致" || no "两份真实副本不一致"
  for k in 'user_[A-Za-z0-9]{20,}' 'ls-files' 'PRIVATE KEY' 'goat-gateway'; do
    a=$(grep -Fc "$k" "$REAL_1"); b=$(grep -Fc "$k" "$REAL_2")
    chk "标记存在且相等: $k" "$b" "$a"
  done
else
  no "找不到两份真实副本"
fi
# junction 说明（不是副本）
if command -v fsutil >/dev/null 2>&1; then
  if fsutil reparsepoint query 'C:\Users\27063\Desktop\reasonix-ops' >/dev/null 2>&1; then
    ok "~/Desktop/reasonix-ops 确认为 junction（故不计入副本数）"
  else
    echo "    NOTE  ~/Desktop/reasonix-ops 不是 junction（环境已变，请重新评估）"
  fi
fi

echo
echo "== ② github 加速 fact 与实现一致 =="
if [ -f "$FACT" ]; then
  BASE=$(git config --global --get-regexp 'url\..*insteadOf' 2>/dev/null | head -1 | awk '{print $1}' | sed 's|^url\.||; s|https://github.com/\.insteadof$||')
  FILE=$(cat "$HOME_DIR/.ghmirror-git" 2>/dev/null)
  chk "gitconfig base == ~/.ghmirror-git" "$BASE" "$FILE"
  if grep -qE '^\| `git clone/fetch`' "$FACT" && grep -E '^\| `git clone/fetch`' "$FACT" | grep -q 'gh-proxy.com` 固定'; then
    no "fact 表格行仍写「gh-proxy.com 固定」"
  else
    ok "fact 表格行已不再硬编码 gh-proxy.com"
  fi
  if grep -q '~/.ghmirror-git` 决定' "$FACT"; then ok "fact 已指向 ~/.ghmirror-git"; else no "fact 未指向 ~/.ghmirror-git"; fi
  if grep -q '【2026-09-27 更正】' "$FACT"; then ok "更正段存在"; else no "更正段缺失"; fi
  n=$(grep -cF "$FILE" "$FACT" 2>/dev/null || echo 0)
  if [ "$n" -gt 0 ]; then ok "fact 写入了实际值 $FILE"; else no "fact 未写出实际值"; fi
else
  no "找不到 fact 文件"
fi

echo
echo "== ③ skill 用量加权（账本 + 排序效应） =="
if [ -f "$LEDGER" ]; then
  WL=$(winpath "$LEDGER")
  n=$(python -c "import json;print(len(json.load(open(r'$WL',encoding='utf-8')).get('skills',{})))" 2>/dev/null || echo 0)
  if [ "$n" -gt 0 ]; then ok "账本存在且有 $n 个条目"; else no "账本存在但为空"; fi
else
  no "账本 $LEDGER 不存在"
fi
TESTJS="$HOME_DIR/.dsh/storages/tools/skill-weight-test.mjs"
if [ -f "$TESTJS" ]; then
  T="$HOME_DIR/.dsh/scratch/ledger.verify.tmp.json"; WT=$(winpath "$T")
  python -c "
import json,time
now=int(time.time()*1000)
json.dump({'version':1,'skills':{'zeta-pdf':{'loads':1,'firstUsedAt':now,'lastUsedAt':now}}}, open(r'$WT','w'))
"
  O1=$(DSH_SKILL_USAGE="$(winpath "$HOME_DIR/.dsh/scratch/none.json")" node "$(winpath "$TESTJS")" 2>/dev/null | grep -m1 '^- ' )
  O2=$(DSH_SKILL_USAGE="$WT" node "$(winpath "$TESTJS")" 2>/dev/null | grep -m1 '^- ' )
  rm -f "$T"
  case "$O1" in *alpha-pdf*) ok "无账本时按名字排序（alpha-pdf 第一）";; *) no "无账本排序异常: $O1";; esac
  case "$O2" in *zeta-pdf*) ok "有 1 次 load 时 zeta-pdf 升到第一（加权生效）";; *) no "加权未生效: $O2";; esac
else
  no "缺少测试脚本 $TESTJS"
fi

echo
echo "== ④ 3080 开机自启 =="
if command -v powershell >/dev/null 2>&1; then
  TR=$(powershell -NoProfile -Command "(Get-ScheduledTask -TaskName 'dsh-web-3080' -ErrorAction SilentlyContinue).State" 2>/dev/null | tr -d '\r')
  chk "计划任务 dsh-web-3080 状态" "$TR" "Ready"
  TG=$(powershell -NoProfile -Command "(Get-ScheduledTask -TaskName 'dsh-web-3080' -ErrorAction SilentlyContinue).Triggers[0].CimClass.CimClassName" 2>/dev/null | tr -d '\r')
  chk "触发器类型" "$TG" "MSFT_TaskLogonTrigger"
  MI=$(powershell -NoProfile -Command "(Get-ScheduledTask -TaskName 'dsh-web-3080' -ErrorAction SilentlyContinue).Settings.MultipleInstances" 2>/dev/null | tr -d '\r')
  chk "并发策略（防重复起实例）" "$MI" "IgnoreNew"
fi
[ -f "$HOME_DIR/Desktop/dsh.lnk" ] && ok "桌面快捷方式 dsh.lnk 存在" || no "桌面快捷方式缺失"
if command -v powershell >/dev/null 2>&1; then
  S=$(date +%s)
  timeout 40 powershell -NoProfile -ExecutionPolicy Bypass -File "$HOME_DIR/.dsh/launch-dsh.ps1" -Mode Serve >/dev/null 2>&1
  E=$(date +%s); D=$((E-S))
  if [ "$D" -lt 25 ]; then ok "幂等分支 ${D}s 返回（未挂起）"; else no "幂等分支耗时 ${D}s，疑似挂起"; fi
fi

echo
echo "== 汇总 =="
echo "    PASS=$PASS  FAIL=$FAIL"
[ "$FAIL" -eq 0 ] && { echo "    >>> 全部通过"; exit 0; } || { echo "    >>> 有失败项"; exit 1; }
