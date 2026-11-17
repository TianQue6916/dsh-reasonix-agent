#!/usr/bin/env bash
# install-linux-gui.sh — 给 Linux 装上与 Windows 等价的
#   computer use（AT-SPI 桌面通道）+ browser use（真实浏览器通道）
#
# 设计原则：幂等、每步自检、失败即停、可回滚。不猜、不静默重试、不改系统。
# 用法：
#   bash install-linux-gui.sh            # 全部阶段
#   bash install-linux-gui.sh deps       # 只查系统依赖（不装）
#   bash install-linux-gui.sh desktop    # 只装桌面通道插件
#   bash install-linux-gui.sh browser    # 只装浏览器通道插件
#   bash install-linux-gui.sh verify     # 只验收
#   bash install-linux-gui.sh rollback   # 按最近一次备份回滚
#
# 来源与依据：
#   desktop  @BruceZhang1993/dsh-computer-use-linux
#            https://github.com/BruceZhang1993/dsh-computer-use-linux
#            桥接上游 computer-use-linux MCP server，暴露 mcp__cul__* 共 18 个工具
#            （AT-SPI 无障碍树 / 合成器窗口定位 / 截图 / Wayland 与 X11 输入）
#   browser  @ricardochen1996/dsh-browser-use
#            https://github.com/ricardochen1996/dsh-browser-use
#            DSH 的 browser provider（真实 Chrome/Chromium，CDP），不是 MCP 工具集
#
# 注意：本脚本**没有**在 Linux 上实测过（写它的时候在 Windows 上）。
#      每阶段都是只读探测 + 一条可回滚的写操作，第一次请逐阶段跑。

set -uo pipefail

PROFILE="${DSH_PROFILE:-web}"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
PRESET_DIR="$DSH_HOME/.agent-presets/anchored-standard"
GUI_LIST="$PRESET_DIR/resident-gui-tools.linux.json"
PKG_DESKTOP="@brucezhang1993/dsh-computer-use-linux"
PKG_DESKTOP_GIT="github:BruceZhang1993/dsh-computer-use-linux"
PKG_BROWSER="@ricardochen1996/dsh-browser-use"

say() { printf '\n\033[1m== %s ==\033[0m\n' "$*"; }
ok()  { printf '  \033[32m✓\033[0m %s\n' "$*"; }
bad() { printf '  \033[31m✗\033[0m %s\n' "$*"; }
info(){ printf '    %s\n' "$*"; }
die() { bad "$*"; exit 1; }

timestamp() { date +%Y%m%d-%H%M%S; }
BACKUP_DIR=""

backup() {
  local ts; ts="$(timestamp)"
  BACKUP_DIR="$DSH_HOME/_repair-backup-linux-gui-$ts"
  mkdir -p "$BACKUP_DIR"
  local p="$DSH_HOME/profiles/$PROFILE"
  for f in package.json cordis.patch.yml cordis.yml compatibility.json pnpm-lock.yaml; do
    [ -f "$p/$f" ] && cp -p "$p/$f" "$BACKUP_DIR/" 2>/dev/null
  done
  [ -f "$GUI_LIST" ] && cp -p "$GUI_LIST" "$BACKUP_DIR/" 2>/dev/null
  ok "备份 → $BACKUP_DIR"
}

# ── 0. 环境自检 ──────────────────────────────────────────────────────────

phase_env() {
  say "0. 环境"
  [ "$(uname -s)" = "Linux" ] || die "这不是 Linux（uname -s = $(uname -s)）。Windows 用 dsh-computer-use-win，不要跑这个脚本。"
  ok "Linux $(uname -r)  $(uname -m)"

  local session; session="${XDG_SESSION_TYPE:-unknown}"
  local display="${DISPLAY:-<none>}" wayland="${WAYLAND_DISPLAY:-<none>}"
  info "会话类型 XDG_SESSION_TYPE = $session"
  info "DISPLAY = $display   WAYLAND_DISPLAY = $wayland"
  case "$session" in
    x11)      ok "X11 会话：输入走 xdotool，截图走 import/scrot" ;;
    wayland)  ok "Wayland 会话：输入走 ydotool/wtype，截图走 grim" ;;
    *)        bad "会话类型未知 —— 远程/无图形会话里电脑操控无法工作" ;;
  esac

  command -v node >/dev/null || die "node 不在 PATH 上"
  ok "node $(node -v)  （插件 launcher 要求 Node 20+）"

  command -v dsh >/dev/null || die "dsh 不在 PATH 上。已知坑：.bashrc 前置 node22 会让 dsh 落到旧版，见 ~/.dsh/_linux-dsh-fix/REPORT.md §12"
  ok "dsh → $(command -v dsh)"
  local ver; ver="$(dsh --version 2>/dev/null | head -1)"
  info "dsh 版本: ${ver:-<取不到>}"

  [ -d "$DSH_HOME/profiles/$PROFILE" ] || die "找不到 profile 目录 $DSH_HOME/profiles/$PROFILE"
  ok "profile = $PROFILE"

  # dsh plugin 子命令形态（旧版只转发 pnpm，没有 allow-version 等子命令）
  if dsh plugin --help 2>&1 | grep -qi "allow-version"; then
    info "dsh plugin: 新版（有 version-exemptions 系列子命令）"
  else
    info "dsh plugin: 旧版（只转发 pnpm）—— 兼容性豁免需要直接改 compatibility.json"
  fi
}

# ── 1. 系统依赖（只查不装）───────────────────────────────────────────────

need_pkg() {  # need_pkg <命令名> <apt 包名> <为何需要>
  if command -v "$1" >/dev/null; then ok "$1"; else
    MISSING+=("$2"); bad "$1 缺失 —— $3"
  fi
}

MISSING=()
phase_deps() {
  say "1. 桌面通道的系统依赖（只检查）"
  MISSING=()

  # 无障碍总线：AT-SPI2，对应 Windows 的 UI Automation
  if command -v gdbus >/dev/null; then ok "gdbus"; else MISSING+=("libglib2.0-bin"); bad "gdbus 缺失 —— AT-SPI 走 D-Bus"; fi
  if [ -e /usr/libexec/at-spi-bus-launcher ] || [ -e /usr/lib/at-spi2-core/at-spi-bus-launcher ]; then
    ok "at-spi bus launcher"
  else
    MISSING+=("at-spi2-core"); bad "at-spi2-core 缺失 —— 没有它读不到任何控件树"
  fi

  case "${XDG_SESSION_TYPE:-}" in
    x11)
      need_pkg xdotool   xdotool   "X11 键鼠注入"
      need_pkg wmctrl    wmctrl    "X11 窗口列表/激活"
      need_pkg xprop     x11-utils "窗口属性"
      need_pkg import    imagemagick "截图（或装 scrot）"
      ;;
    wayland)
      need_pkg ydotool   ydotool   "Wayland 键鼠注入（需要 /dev/uinput 权限）"
      need_pkg grim      grim      "Wayland 截图"
      info "Wayland 下 wtype 也可作输入后端：apt install wtype"
      ;;
  esac

  need_pkg tesseract tesseract-ocr "OCR（读图里的字、定位按钮文字）"

  if [ ${#MISSING[@]} -eq 0 ]; then
    ok "依赖齐全"
  else
    say "缺这些包，自己跑（脚本不替你 sudo）："
    info "sudo apt update && sudo apt install -y $(printf '%s ' "${MISSING[@]}" | tr ' ' '\n' | sort -u | tr '\n' ' ')"
    if [ "${XDG_SESSION_TYPE:-}" = "wayland" ]; then
      info "Wayland 还要给 ydotool 开 uinput 权限（否则注入被拒）："
      info "  sudo usermod -aG input \$USER   # 重新登录后生效"
    fi
  fi
}

# ── 2. 桌面通道 ─────────────────────────────────────────────────────────

phase_desktop() {
  say "2. 桌面通道：$PKG_DESKTOP"
  backup
  say "安装（先 registry，失败回退 git 源码）"
  if dsh plugin --profile "$PROFILE" add "$PKG_DESKTOP"; then
    ok "registry 安装成功"
  else
    bad "registry 失败（GitHub Packages 常要认证），回退 git 源码"
    dsh plugin --profile "$PROFILE" add "$PKG_DESKTOP_GIT" || die "git 安装也失败 —— 把上面的报错原文留下，别继续"
  fi
  ok "已装 $PKG_DESKTOP"
}

# ── 3. 浏览器通道 ───────────────────────────────────────────────────────

phase_browser() {
  say "3. 浏览器通道：$PKG_BROWSER"
  [ -n "$BACKUP_DIR" ] || backup
  say "安装（首次加载会自建 Python 引擎环境，可能要几分钟）"
  dsh plugin --profile "$PROFILE" add "$PKG_BROWSER" || {
    bad "安装失败。备选方案（官方实验包，CDP 路线，需要手动挂载）："
    info "  @deepseek-ai/dsh-experimental-browser-use-chrome-devtools-mcp"
    info "  文档: https://github.com/deepseek-ai/deepseek-harness/tree/main/packages/experimental"
    return 1
  }
  ok "已装 $PKG_BROWSER"
}

# ── 4. 让 GUI 工具在新会话里默认可见 ────────────────────────────────────

phase_preset() {
  say "4. 预设常驻清单"
  [ -d "$PRESET_DIR" ] || die "找不到 $PRESET_DIR —— preset 未同步过来？"
  [ -n "$BACKUP_DIR" ] || backup
  cat > "$GUI_LIST" <<'JSON'
[
  "mcp__cul__*"
]
JSON
  ok "写入 $GUI_LIST"
  info "含义：mcp__cul__* 全部常驻（tool-bootstrap.mjs 的 GUI_RESIDENT_RULES 已内置同一条，"
  info "      这个文件是留给以后换插件时的扩展点，不改共享 preset 也能加工具）"
}

# ── 5. 验收 ─────────────────────────────────────────────────────────────

phase_verify() {
  say "5. 验收（不需要重启，只看配置层）"
  local dump; dump="$(dsh --profile "$PROFILE" --dump-config 2>/dev/null)"
  [ -n "$dump" ] || { bad "dsh --dump-config 无输出"; return 1; }

  echo "$dump" | grep -qi "cul\|computer-use-linux" && ok "配置里有 Linux 桌面通道" || bad "配置里没有 Linux 桌面通道"
  echo "$dump" | grep -qi "browser-use" && ok "配置里有浏览器通道" || bad "配置里没有浏览器通道"

  local incompat; incompat="$(echo "$dump" | grep -ci "incompatible" || true)"
  [ "$incompat" = "0" ] && ok "无 incompatible 告警" || {
    bad "$incompat 条 incompatible 告警 —— 先跑 ~/.dsh/_linux-dsh-fix/dsh-linux-fix.sh（DRY-RUN）"
  }

  say "重启 DSH 后，开一个新会话，工具列表里应直接出现："
  info "mcp__cul__*  （18 个：accessibility_tree / snapshot / click / type_text / window_list / screenshot …）"
  info "browser_*    （browser_goal / browser_act / browser_console / browser_doctor — 由 provider 注册，名字以插件实际为准）"
  info "判据：不需要先 dev_tool_search 就能看到它们。看不到＝tool-bootstrap 没生效，"
  info "      检查 preset 里 GUI_RESIDENT_RULES 是否存在，以及 profile 是否引用同一份 tool-bootstrap.mjs。"
}

# ── 6. 回滚 ─────────────────────────────────────────────────────────────

phase_rollback() {
  say "回滚"
  local latest; latest="$(ls -dt "$DSH_HOME"/_repair-backup-linux-gui-* 2>/dev/null | head -1)"
  [ -n "$latest" ] || die "没有备份可回滚"
  info "备份目录: $latest"
  local p="$DSH_HOME/profiles/$PROFILE"
  for f in package.json cordis.patch.yml cordis.yml compatibility.json pnpm-lock.yaml; do
    [ -f "$latest/$f" ] && cp -p "$latest/$f" "$p/$f" && ok "还原 $f"
  done
  if [ -f "$latest/resident-gui-tools.linux.json" ]; then
    cp -p "$latest/resident-gui-tools.linux.json" "$GUI_LIST" && ok "还原 resident-gui-tools.linux.json"
  else
    rm -f "$GUI_LIST" && ok "删除 resident-gui-tools.linux.json（原本不存在）"
  fi
  info "插件本身没卸载（dsh plugin remove 需要知道准确包名）；配置已还原，重启即回到改动前。"
}

# ── 入口 ────────────────────────────────────────────────────────────────

case "${1:-all}" in
  deps)     phase_env; phase_deps ;;
  desktop)  phase_env; phase_desktop ;;
  browser)  phase_env; phase_browser ;;
  verify)   phase_env; phase_verify ;;
  rollback) phase_rollback ;;
  all)
    phase_env
    phase_deps
    phase_desktop || exit 1
    phase_browser || echo "  （浏览器通道失败，桌面通道不受影响）"
    phase_preset
    phase_verify
    say "完成。重启 DSH 后按第 5 阶段给的判据验收。"
    ;;
  *) die "未知阶段: $1（可用：deps desktop browser verify rollback all）" ;;
esac
