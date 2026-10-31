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

# LOG_ROTATE（2026-10-26 加）：一天 3 次 × 2000+ 文件级记录，不轮转会无限长。
# 超过 5 MB 就只保留最后 2000 行；同时最多留一份 .1 备份。
if [ -f "$LOG" ] && [ "$(stat -c%s "$LOG" 2>/dev/null || echo 0)" -gt 5242880 ]; then
    tail -n 2000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
    echo "[$(date '+%T')] (日志已轮转，保留最后 2000 行)" >> "$LOG"
fi

echo "===== $(date '+%F %T') dsh 同步开始 =====" >> "$LOG"

# 活跃检测：本机 dsh 会话在 10 分钟内有写入 → 用户正在用，跳过本次
# （避免同步 walk 与运行中的会话写文件撞车）
if find /home/tianque/.dsh/sessions -name '*.zstd' -mmin -2 2>/dev/null | grep -q .; then
    echo "[$(date '+%T')] ⏭ 本机 dsh 活跃中（会话 10 分钟内写入），跳过本次同步" >> "$LOG"
    echo "===== $(date '+%T') 结束（跳过）=====" >> "$LOG"
    exit 0
fi

SYNC_MARKER="$HOME/.dsh/logs/sync-FAILED.json"

/usr/bin/python3 "$TOOLS/sync_dsh.py" --sync >> "$LOG" 2>&1
RC=$?

# 2026-10-26 加：失败必须留下可发现的痕迹。
# 起因：paramiko 被 apt autoremove 带走后，连续两次 cron 只有「同步开始」没有「完成」，
# 日志里有 Traceback 但没有任何地方会主动告诉人 —— 静默失败了两天。
if [ $RC -ne 0 ]; then
    TAIL=$(tail -n 20 "$LOG" 2>/dev/null | grep -E 'Error|error|Traceback|失败' | tail -n 3 | tr '
' ' ')
    printf '{"at":"%s","rc":%d,"tail":"%s"}
' "$(date '+%F %T')" "$RC" "$TAIL" > "$SYNC_MARKER"
    echo "[$(date '+%T')] 同步失败（退出码 $RC），可能主力机未开机" >> "$LOG"
    # 有图形会话才弹notification；cron 下 DISPLAY 可能为空，失败也不影响
    /usr/bin/notify-send -u critical -a "dsh sync" "dsh 同步失败 (rc=$RC)" "$TAIL" 2>/dev/null || true
else
    rm -f "$SYNC_MARKER"
    echo "[$(date '+%T')] 同步完成" >> "$LOG"
fi
echo "===== $(date '+%T') 结束（退出码 $RC）=====" >> "$LOG"
exit $RC
