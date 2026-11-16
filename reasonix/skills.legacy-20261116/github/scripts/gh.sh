#!/usr/bin/env bash
# gh.sh — TianQue6916 的 GitHub 操作封装（Windows Git Bash 实测）
# 依赖：git、curl、python（仅用于 JSON 解析，PYTHONIOENCODING 已固定 utf-8）
# 设计约束：token 只在进程内存在，绝不写盘；git 传输优先 SSH（不受 insteadOf 改写影响）。
set -uo pipefail
export PYTHONIOENCODING=utf-8

USER_LOGIN="TianQue6916"
MIRROR_HOST_DEFAULT='gh-proxy.com'

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "缺少依赖：$1"; }

# ---------- token ----------
# 顺序：GCM → ~/.dsh/.credentials.yaml；任何一步失败返回空串
get_token() {
  local tok=""
  tok=$(timeout 10 git credential fill 2>/dev/null <<<'protocol=https
host=github.com

' | sed -n 's/^password=//p')
  if [ -z "$tok" ]; then
    tok=$(python - <<'PY' 2>/dev/null
import re, pathlib, os
p = pathlib.Path(os.path.expanduser('~')) / '.dsh/.credentials.yaml'
try:
    t = p.read_text(encoding='utf-8')
except Exception:
    raise SystemExit(0)
m = re.search(r'dsh-mnemon/github:.*?accessToken:\s*(\S+)', t, re.S)
print(m.group(1) if m else '')
PY
)
  fi
  printf '%s' "$tok"
}

require_token() {
  local t; t=$(get_token)
  [ -n "$t" ] || die "取不到 token（GCM 与 .credentials.yaml 都空）。先看 reference/auth.md 第 1 节"
  printf '%s' "$t"
}

# ---------- API ----------
api() {
  local method="${1:-GET}" path="${2:-/user}" body="${3:-}"
  local tok; tok=$(require_token)
  [ "${path#/}" = "$path" ] && path="/$path"
  local args=(-sS -X "$method" -H "Authorization: Bearer $tok"
              -H "Accept: application/vnd.github+json"
              -H "X-GitHub-Api-Version: 2022-11-28"
              "https://api.github.com${path}")
  [ -n "$body" ] && args+=(-H 'Content-Type: application/json' -d "$body")
  local out; out=$(curl "${args[@]}")
  printf '%s\n' "$out" | python -m json.tool 2>/dev/null || printf '%s\n' "$out"
}

# ---------- 子命令 ----------
cmd_doctor() {
  echo "== git =="; git --version
  echo "== ssh(443) =="
  timeout 20 ssh -T -o StrictHostKeyChecking=accept-new -o ConnectTimeout=12 git@github.com 2>&1 | head -2
  echo "== token =="
  local t; t=$(get_token)
  if [ -n "$t" ]; then
    echo "ok  len=${#t}  prefix=${t:0:4}…"
  else
    echo "FAIL 取不到 token"
  fi
  echo "== api 速率 =="
  if [ -n "$t" ]; then
    curl -s -H "Authorization: Bearer $t" https://api.github.com/rate_limit \
      | python -c "import json,sys;d=json.load(sys.stdin)['resources']['core'];print(f\"core {d['remaining']}/{d['limit']}\")" 2>/dev/null
  fi
  echo "== insteadOf 改写 =="
  if git config --get 'url.https://gitproxy.mrhjx.cn/https://github.com/.insteadOf' >/dev/null 2>&1; then
    echo "WARN  存在【全站】insteadOf 改写 → 所有 https://github.com 请求被送进镜像（见 SKILL.md 第 6 节）"
  fi
  local rules; rules=$(git config --get-regexp '^url\..*\.insteadOf$' 2>/dev/null)
  if [ -z "$rules" ]; then
    echo "ok   无改写，全部直连 github.com"
  else
    echo "白名单改写（只读 owner）："
    echo "$rules" | sed 's|^url\.||' | sed 's|\.insteadOf |  <-  |' | sed 's|^|  |'
    local mir; mir=$(echo "$rules" | head -1 | cut -d' ' -f1 | sed 's|^url\.||' | cut -d'/' -f1-3)
    if ! git config --get-all "credential.$mir.helper" >/dev/null 2>&1; then
      echo "  WARN  $mir 未禁用 credential helper → 可能触发 GCM 弹窗"
    else
      echo "  ok    $mir 已禁用 credential helper（镜像永远拿不到 token）"
    fi
  fi
  echo "== gh CLI =="; command -v gh >/dev/null && gh --version | head -1 || echo "未安装（不需要，本脚本用 git+curl+curl API）"
}

cmd_repos() {
  local tok; tok=$(require_token)
  curl -s -H "Authorization: Bearer $tok" \
    "https://api.github.com/user/repos?per_page=100&affiliation=owner&sort=full_name" \
    | python -c "
import json,sys
d=json.load(sys.stdin)
print(f'{\"name\":45} {\"vis\":7} {\"branch\":8} {\"lang\":12} {\"KB\":>8}  pushed')
for r in sorted(d,key=lambda x:x['name'].lower()):
    print(f\"{r['name']:45} {'private' if r['private'] else 'public':7} {r['default_branch']:8} {(r['language'] or '-'):12} {r['size']:>8}  {r['pushed_at'][:10]}\")
print(f'-- {len(d)} repos')
"
}

cmd_clone() {
  local spec="" dir="" depth=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --depth) depth="${2:-}"; shift 2 ;;
      *) if [ -z "$spec" ]; then spec="$1"; elif [ -z "$dir" ]; then dir="$1"; fi; shift ;;
    esac
  done
  [ -n "$spec" ] || die "用法: gh.sh clone <repo|owner/repo> [dir] [--depth N]"
  case "$spec" in */*) ;; *) spec="$USER_LOGIN/$spec" ;; esac
  [ -n "$dir" ] || dir="$HOME/repos/${spec##*/}"
  local args=(clone "git@github.com:${spec}.git" "$dir")
  [ -n "$depth" ] && args=(clone --depth "$depth" "git@github.com:${spec}.git" "$dir")
  echo "+ git ${args[*]}"
  git "${args[@]}"
}

cmd_mirror() {
  local spec="" dir="" depth="" host="gh-proxy.com"
  while [ $# -gt 0 ]; do
    case "$1" in
      --host) host="${2:-}"; shift 2 ;;
      --depth) depth="${2:-}"; shift 2 ;;
      *) if [ -z "$spec" ]; then spec="$1"; elif [ -z "$dir" ]; then dir="$1"; fi; shift ;;
    esac
  done
  [ -n "$spec" ] || die "用法: gh.sh mirror <owner/repo> [dir] [--depth N] [--host gh-proxy.com]"
  case "$spec" in */*) ;; *) die "mirror 需要 owner/repo 形式" ;; esac
  [ -n "$dir" ] || dir="$HOME/repos/${spec##*/}"
  local url="https://${host}/https://github.com/${spec}.git"
  echo "+ git clone $url $dir"
  if [ -n "$depth" ]; then git clone --depth "$depth" "$url" "$dir"; else git clone "$url" "$dir"; fi
}

cmd_newrepo() {
  local name="" private=false desc="" pushfrom="" defbranch="main"
  while [ $# -gt 0 ]; do
    case "$1" in
      --private) private=true; shift ;;
      --desc) desc="${2:-}"; shift 2 ;;
      --push-from) pushfrom="${2:-}"; shift 2 ;;
      --branch) defbranch="${2:-}"; shift 2 ;;
      *) [ -z "$name" ] && name="$1"; shift ;;
    esac
  done
  [ -n "$name" ] || die "用法: gh.sh newrepo <name> [--private] [--desc D] [--push-from DIR] [--branch B]"
  local body; body=$(python -c "
import json,sys
print(json.dumps({'name':sys.argv[1],'private':sys.argv[2]=='true','description':sys.argv[3]},ensure_ascii=False))
" "$name" "$private" "$desc")
  local tok; tok=$(require_token)
  local code; code=$(curl -sS -o /tmp/gh_newrepo.json -w '%{http_code}' -X POST \
    -H "Authorization: Bearer $tok" -H 'Accept: application/vnd.github+json' \
    -H 'X-GitHub-Api-Version: 2022-11-28' \
    -H 'Content-Type: application/json' -d "$body" https://api.github.com/user/repos)
  python -m json.tool </tmp/gh_newrepo.json | head -20
  case "$code" in 201) echo "OK 仓库已建";; 422) die "422：同名仓库已存在或无权限";; *) die "HTTP $code";; esac
  if [ -n "$pushfrom" ]; then
    cd "$pushfrom" || die "目录不存在: $pushfrom"
    git rev-parse --git-dir >/dev/null 2>&1 || { git init -q; echo "+ git init"; }
    git remote get-url origin >/dev/null 2>&1 && git remote set-url origin "git@github.com:${USER_LOGIN}/${name}.git" \
                                              || git remote add origin "git@github.com:${USER_LOGIN}/${name}.git"
    echo "+ git push -u origin HEAD"
    git push -u origin HEAD
  fi
}

cmd_push() {
  git rev-parse --git-dir >/dev/null 2>&1 || die "当前目录不是 git 仓库"
  local url; url=$(git remote get-url origin 2>/dev/null) || die "没有 origin，先跑: gh.sh newrepo <name> --push-from ."
  case "$url" in
    *gitproxy*|https://*) echo "WARN origin 是 https(${url})：会被 insteadOf 改写并把 PAT 交给第三方镜像" ;;
  esac
  git push "$@"
}

cmd_scan() {
  local dir="${1:-.}"
  echo "== 疑似 secret（已暂存+工作区，排除 .git）=="
  grep -rInE 'ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|AKIA[0-9A-Z]{16}' \
    --exclude-dir=.git "$dir" 2>/dev/null | head -20 || echo "none"
  echo "== 将被提交的大文件（>5 MB）=="
  ( cd "$dir" && git ls-files -z 2>/dev/null | xargs -0 -r ls -l 2>/dev/null | awk '$5>5000000{printf "%8.1f MB  %s\n",$5/1048576,$9}' | head -20 )
}

usage() {
  cat <<'TXT'
gh.sh <command> [args]
  doctor                          自检（git / SSH443 / token / 速率 / insteadOf / gh）
  whoami                          打印 API 身份与 scopes
  tok                             打印 token（会进 stdout，慎用）
  api <METHOD> <PATH> [JSON]      任意 API 调用，如: api PATCH /repos/TianQue6916/inbox '{"description":"x"}'
  repos                           列出全部仓库（名称/可见性/分支/语言/KB/最后推送）
  clone <repo|owner/repo> [dir] [--depth N]        走 SSH（默认）
  mirror <owner/repo> [dir] [--depth N] [--host H]  走镜像 clone（第三方公开仓加速，不带凭据）
  newrepo <name> [--private] [--desc D] [--push-from DIR] [--branch B]
  push [git push args]            在仓库目录内安全推送（先检查 origin 是否被改写）
  scan [dir]                      扫描 secret 与大文件
TXT
}

main() {
  need git; need curl; need python
  local cmd="${1:-usage}"; shift || true
  case "$cmd" in
    doctor) cmd_doctor "$@" ;;
    whoami) api GET /user | head -30 ;;
    tok) require_token; echo ;;
    api) api "$@" ;;
    repos) cmd_repos "$@" ;;
    clone) cmd_clone "$@" ;;
    mirror) cmd_mirror "$@" ;;
    newrepo) cmd_newrepo "$@" ;;
    push) cmd_push "$@" ;;
    scan) cmd_scan "$@" ;;
    *) usage ;;
  esac
}
main "$@"
