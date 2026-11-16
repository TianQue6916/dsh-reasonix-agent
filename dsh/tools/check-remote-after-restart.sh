#!/bin/bash
echo "=== 1) 补丁是否生效（有无堆栈）==="
if [ -f ~/.dsh/logs/remote-safe-error.log ]; then
  echo "命中！真实异常："
  tail -40 ~/.dsh/logs/remote-safe-error.log
else
  echo "还没有记录（未触发或补丁未生效）"
fi
echo
echo "=== 2) 最近 session/control 结果 ==="
grep "session/control" ~/.dsh/logs/host-stdio.log 2>/dev/null | tail -5
echo
echo "=== 3) transport 分布（卡不卡的指标）==="
grep -oE '"transport":"[A-Za-z]+"' ~/.dsh/logs/host-stdio.log 2>/dev/null | sort | uniq -c
echo
echo "=== 4) 插件版本 + 完整性 ==="
python -c "import json;print('version:',json.load(open(r'C:\Users\27063\.dsh\profiles\desktop\node_modules\ds-harness-remote\package.json',encoding='utf-8'))['version'])" 2>/dev/null
du -sh ~/.dsh/profiles/desktop/node_modules/ds-harness-remote 2>/dev/null
