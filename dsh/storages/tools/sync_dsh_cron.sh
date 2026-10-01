#!/bin/bash
# ============================================================
# sync_dsh_cron.sh — ~/.dsh 双机同步的定时入口（供 cron 调用）
#
# 替代关系（2026-09-30 用户拍板）
#   原来的 reasonix 双机同步（~/.reasonix/global-workspace/sync/sync_cron.sh）
#   已停用；主力转到 dsh，同步根目录跟着换成 ~/.dsh。
#
# 调度：08:30 / 12:30 / 21:30（沿用原来的时间，避开使用高峰）
# 日志：~/.dsh/logs/sync_dsh.log
# 停用：crontab -l | sed 's|^\(.*sync_dsh_cron.sh\)|# \1|' | crontab -
# ============================================================
set -uo pipefail
export PATH="/usr/bin:/bin:/home/tianque/.local/bin:$PATH"

TOOLS="/home/tianque/.dsh/storages/tools"
LOG="/home/tianque/.dsh/logs/sync_dsh.log"
mkdir -p "$(dirname "$LOG")"

echo "===== $(date '+%F %T') dsh 同步开始 =====" >> "$LOG"

# 活跃检测：本机 dsh 会话在 10 分钟内有写入 → 用户正在用，跳过本次
# （避免同步 walk 与运行中的会话写文件撞车）
if find /home/tianque/.dsh/sessions -name '*.zstd' -mmin -10 2>/dev/null | grep -q .; then
    echo "[$(date '+%T')] ⏭ 本机 dsh 活跃中（会话 10 分钟内写入），跳过本次同步" >> "$LOG"
    echo "===== $(date '+%T') 结束（跳过）=====" >> "$LOG"
    exit 0
fi

/usr/bin/python3 "$TOOLS/sync_dsh.py" --sync >> "$LOG" 2>&1
RC=$?
if [ $RC -ne 0 ]; then
    echo "[$(date '+%T')] ⚠ 同步失败（退出码 $RC），可能主力机未开机" >> "$LOG"
else
    echo "[$(date '+%T')] ✅ 同步完成" >> "$LOG"
fi
echo "===== $(date '+%T') 结束（退出码 $RC）=====" >> "$LOG"
exit $RC
