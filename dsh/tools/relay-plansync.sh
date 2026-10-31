#!/bin/bash
# relay plansync 双向刷新（cron */20）：把未读状态写进两端 PLAN.md 的 RELAY 块。
# 为什么需要定时：块里带未读计数与 id，不刷新就会过期，对端 agent 看到的可能是旧状态。
set -uo pipefail
export PATH="/usr/bin:/bin:/home/tianque/.local/bin:$PATH"
LOG=/home/tianque/.dsh/logs/relay-plansync.log
mkdir -p "$(dirname "$LOG")"
exec 9>/tmp/.relay-plansync.lock
flock -n 9 || exit 0
{
  /home/tianque/.local/bin/relay plansync 2>&1
  RELAY_PLAN_ROOT=/home/tianque/.dsh /home/tianque/.local/bin/relay plansync 2>&1
} | grep -v '^plansync unchanged' >> "$LOG"
# 日志每次 3 行会无限长，超 200 KB 只留最后 200 行
if [ -f "$LOG" ] && [ "$(stat -c%s "$LOG")" -gt 204800 ]; then
  tail -n 200 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi
exit 0
