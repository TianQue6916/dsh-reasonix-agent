#!/usr/bin/env bash
# =============================================================================
#  dsh Linux 启动修复工具  (diagnose -> 可逆修复 -> 验收)
#  用法:
#     bash dsh-linux-fix.sh              # DRY-RUN: 只诊断 + 打印将要做的改动
#     bash dsh-linux-fix.sh --apply      # APPLY: 真改（自动备份，可回滚）
#     DSH_PROFILE=headless bash dsh-linux-fix.sh
#
#  设计原则:
#   1. 不依赖 dsh 能否启动 —— 兼容性判定用内嵌 JS 复刻官方 unmetRequirements()，
#      再用 dsh 自带 app-boot 交叉验证；两者不一致会显式报出。
#   2. 每处改动先备份到 $DSH_HOME/_repair-backup-<ts>/，回滚命令打印在最后。
#   3. 只做两类可逆修复:
#        R1  compatibility.json 补当前 dsh 精确版本  (官方 exemption 开关)
#        R2  bundles 里剔除 Linux 上不可能加载的项   (win-only / D: 盘路径)
#      不自动删包、不自动降级 dsh —— 那些留给人工决定。
# =============================================================================
set -uo pipefail

APPLY=0
[ "${1:-}" = "--apply" ] && APPLY=1
PROFILE="${DSH_PROFILE:-web}"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
PDIR="$DSH_HOME/profiles/$PROFILE"
TS="$(date +%Y%m%d-%H%M%S)"
BK="$DSH_HOME/_repair-backup-$TS"

say(){ printf '%s\n' "$*"; }
hr(){  printf '%s\n' "============================================================================"; }
die(){ printf 'FATAL: %s\n' "$*" >&2; exit 2; }

hr
if [ "$APPLY" = 1 ]; then say " dsh Linux fix  | APPLY (会写文件)"; else say " dsh Linux fix  | DRY-RUN (只读)"; fi
say " profile=$PROFILE   DSH_HOME=$DSH_HOME"
hr

# ---------------------------------------------------------------- Phase 0 环境
[ -d "$PDIR" ] || die "找不到 profile 目录: $PDIR"
command -v node >/dev/null 2>&1 || die "PATH 里没有 node"

DVER="$(dsh --version 2>/dev/null | tr -d '\r' | tail -n1)"
ROOT="$(npm root -g 2>/dev/null)"

# dsh 自己的安装目录 = 官方 resolveBundleDir 的 installAnchor
# （in-box bundle 永远从与运行中 dsh 同一处解析，绝不来自 profile 本地副本）
DSH_PKG=""
DSH_BIN="$(command -v dsh 2>/dev/null || true)"
if [ -n "$DSH_BIN" ]; then
  REAL="$(readlink -f "$DSH_BIN" 2>/dev/null || echo "$DSH_BIN")"
  case "$REAL" in
    */@deepseek-ai/dsh/lib/bin.js) DSH_PKG="$(dirname "$(dirname "$REAL")")" ;;
  esac
  if [ -z "$DSH_PKG" ]; then
    GUESS="$(grep -oE '[A-Za-z]:[^"]*@deepseek-ai/dsh/lib/bin[.]js|/[^" ]*@deepseek-ai/dsh/lib/bin[.]js' "$DSH_BIN" 2>/dev/null | head -1)"
    [ -n "$GUESS" ] && DSH_PKG="$(dirname "$(dirname "$GUESS")")"
  fi
fi
if [ -z "$DSH_PKG" ] && [ -n "$ROOT" ] && [ -d "$ROOT/@deepseek-ai/dsh" ]; then DSH_PKG="$ROOT/@deepseek-ai/dsh"; fi
if [ -z "$DVER" ] && [ -n "$ROOT" ] && [ -f "$ROOT/@deepseek-ai/dsh/package.json" ]; then
  DVER="$(node -p "require('$ROOT/@deepseek-ai/dsh/package.json').version" 2>/dev/null)"
fi
[ -n "$DVER" ] || die "取不到 dsh 版本（dsh 命令与 npm 全局包都失败）"

say "[0] 环境"
say "    dsh 运行版本 : $DVER"
say "    node         : $(node -v)"
say "    dsh 安装目录 : ${DSH_PKG:-<未识别，bundle 解析可能不准>}"
say "    npm root -g  : ${ROOT:-<无>}"
say "    profile 目录 : $PDIR"
say "    package.json : $([ -f "$PDIR/package.json" ] && echo 有 || echo 缺)"
say "    compatibility: $([ -f "$PDIR/compatibility.json" ] && echo 有 || echo '缺(等于没有任何豁免)')"
say ""

# ---------------------------------------------------------------- Phase 1 备份
if [ "$APPLY" = 1 ]; then
  mkdir -p "$BK" || die "无法创建备份目录 $BK"
  for f in package.json compatibility.json cordis.patch.yml cordis.yml pnpm-lock.yaml; do
    [ -f "$PDIR/$f" ] && cp -p "$PDIR/$f" "$BK/$f"
  done
  say "[1] 已备份到 $BK"
else
  say "[1] DRY-RUN: 不写备份（APPLY 时才备份）"
fi
say ""
# ---------------------------------------------------------------- Phase 2 判定
say "[2] 兼容性判定（复刻官方 unmetRequirements + 与 app-boot 交叉验证）"
say ""
export DSH_PROFILE_DIR="$PDIR"
export DSH_RT_VERSION="$DVER"
export DSH_DRYRUN="$([ "$APPLY" = 1 ] && echo 0 || echo 1)"
export DSH_NODE_ROOT="$ROOT"
export DSH_PKG_DIR="$DSH_PKG"

node - <<'NODE'
const fs=require('fs'),path=require('path');
const pd=process.env.DSH_PROFILE_DIR, rt=process.env.DSH_RT_VERSION;
const dryrun=process.env.DSH_DRYRUN==='1', root=process.env.DSH_NODE_ROOT||'';
const dshPkg=process.env.DSH_PKG_DIR||'';
const has=Object.prototype.hasOwnProperty;

function loadSemver(){
  const cands=[
    root&&path.join(root,'@deepseek-ai/dsh/node_modules/semver'),
    root&&path.join(root,'@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-app-boot/node_modules/semver'),
    'semver'
  ].filter(Boolean);
  for(const c of cands){ try{ return require(c); }catch(e){} }
  return null;
}
const semver=loadSemver();
if(!semver){ console.log('  !! 找不到 semver，无法判定'); process.exit(3); }

function unmet(fields, runtime){
  const eng=(fields.engines&&typeof fields.engines==='object'&&!Array.isArray(fields.engines))?fields.engines:{};
  if(has.call(eng,'dsh')){
    const r=eng.dsh;
    if(typeof r!=='string') return {'engines.dsh':'<non-string>'};
    return semver.satisfies(runtime,r,{includePrerelease:true})?{}:{'engines.dsh':r};
  }
  if(!has.call(fields,'peerDependencies')) return {};
  const out={};
  for(const [n,r] of Object.entries(fields.peerDependencies||{})){
    if(!(n==='@deepseek-ai/dsh'||n.startsWith('@deepseek-ai/dsh-'))) continue;
    if(typeof r!=='string'){ out[n]='<non-string>'; continue; }
    const rng=['workspace:^','workspace:~','workspace:*'].includes(r)?runtime:r;
    if(!semver.satisfies(runtime,rng,{includePrerelease:true})) out[n]=r;
  }
  return out;
}
function readJson(f){ try{ return JSON.parse(fs.readFileSync(f,'utf8')); }catch(e){ return null; } }
function readCompat(dir){
  const j=readJson(path.join(dir,'compatibility.json'));
  return (j&&typeof j==='object'&&!Array.isArray(j))?j:{};
}
function winPath(spec){ return typeof spec==='string' && /^(link|file):[A-Za-z]:[\\/]/.test(spec); }

let official=null;
(async()=>{
  const cands=[
    root&&path.join(root,'@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js'),
    root&&path.join(root,'@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-app-boot/lib/index.mjs')
  ].filter(Boolean);
  for(const c of cands){
    if(!fs.existsSync(c)) continue;
    try{ const m=await import('file://'+c.replace(/\\/g,'/')); if(m&&m.evaluatePluginCompatibility){ official=m; break; } }catch(e){}
  }

  const pj=readJson(path.join(pd,'package.json'));
  if(!pj){ console.log('  !! profile 没有可读的 package.json'); process.exit(3); }
  const bundles=((pj.dsh||{}).profile||{}).bundles||[];
  const deps=pj.dependencies||{};
  const compat=readCompat(pd);

  console.log('  bundle 总数: '+bundles.length+'   dsh 运行时: '+rt);
  console.log('  现有豁免: '+JSON.stringify(compat));
  console.log('  官方实现交叉验证: '+(official?'可用':'不可用(仅用复刻)'));
  console.log('');
  console.log('  '+'状态'.padEnd(10)+'包'.padEnd(48)+'版本'.padEnd(13)+'依据');
  console.log('  '+'-'.repeat(104));

  const rows=[], needExempt=[], badBundles=[];

  // 解析顺序必须与官方 resolveBundleDir 一致：installAnchor(dsh 安装包) 优先，其次 profile。
  // 官方注释：in-box bundle 永远来自与运行中 dsh 同一安装，绝不来自 profile 本地副本。
  function manifestOf(b){
    const dirs=[];
    if(dshPkg) dirs.push(path.join(dshPkg,'node_modules',b));
    dirs.push(path.join(path.dirname(pd),'node_modules',b));   // profiles/node_modules
    dirs.push(path.join(pd,'node_modules',b));                 // profile 本地
    for(const d of dirs){ const m=readJson(path.join(d,'package.json')); if(m) return {m,d}; }
    return null;
  }
  for(const b of bundles){
    const hit=manifestOf(b);
    const mf=hit?hit.m:null;
    const from=hit?path.basename(path.dirname(hit.d)):null;
    if(!mf){
      const spec=deps[b];
      let why=spec?('依赖声明 '+spec+' ，但三处 node_modules 都找不到'):'既无依赖声明也找不到安装';
      rows.push({b,ver:'?',st:'MISSING',why});
      if(winPath(spec)) badBundles.push({b,why:'Windows 盘符路径 '+spec});
      continue;
    }
    const name=mf.name||b, ver=mf.version||'?';
    const osf=mf.os;
    if(Array.isArray(osf)&&osf.length&&!osf.includes('linux')&&!osf.some(o=>String(o).startsWith('!'))){
      rows.push({b,ver,st:'WINONLY',why:'package.json os='+JSON.stringify(osf)});
      badBundles.push({b,why:'os='+JSON.stringify(osf)});
      continue;
    }
    const u=unmet(mf,rt);
    const key=name+'@'+ver;
    const exempted=has.call(compat,key)&&Array.isArray(compat[key])&&compat[key].includes(rt);
    let cross='';
    if(official){
      try{
        const iss=official.evaluatePluginCompatibility(mf,compat,rt);
        const mine=(Object.keys(u).length===0)?'ok':'fail';
        const theirs=iss?'fail':'ok';
        if(mine!==theirs) cross='  [!] 交叉验证不一致 复刻='+mine+' 官方='+theirs;
      }catch(e){ cross='  [!] 官方校验抛错: '+e.message; }
    }
    if(Object.keys(u).length===0) rows.push({b,ver,st:'OK',why:'无未满足要求'+cross});
    else if(exempted) rows.push({b,ver,st:'EXEMPTED',why:'已豁免 '+JSON.stringify(u)+cross});
    else{
      rows.push({b,ver,st:'FAIL',why:'不满足 '+JSON.stringify(u)+cross});
      needExempt.push({key,ver,name,req:u});
    }
  }
  for(const r of rows) console.log('  '+r.st.padEnd(10)+String(r.b).slice(0,46).padEnd(48)+String(r.ver).padEnd(13)+r.why);

  const failN=rows.filter(r=>r.st==='FAIL').length;
  const missN=rows.filter(r=>r.st==='MISSING').length;
  const winN =rows.filter(r=>r.st==='WINONLY').length;
  console.log('');
  console.log('  ---- 摘要: FAIL='+failN+'  MISSING='+missN+'  WINONLY='+winN+' ----');
  if(needExempt.length){
    console.log('');
    console.log('  待写入 compatibility.json 的精确键:');
    for(const n of needExempt) console.log('    '+JSON.stringify(n.key)+': ["'+rt+'"]');
  }

  // ---------------- R1: 写 compatibility.json（原子写）
  if(needExempt.length){
    const target=path.join(pd,'compatibility.json');
    if(dryrun){
      console.log('');
      console.log('  [R1 DRY-RUN] 将把上面 '+needExempt.length+' 个键写进 '+target);
    }else{
      const next={...compat};
      for(const n of needExempt){
        const cur=Array.isArray(next[n.key])?next[n.key]:[];
        next[n.key]=Array.from(new Set([...cur,rt]));
      }
      const tmp=target+'.tmp-'+Date.now();
      fs.writeFileSync(tmp,JSON.stringify(next,null,2)+'\n',{mode:0o600});
      fs.renameSync(tmp,target);
      console.log('');
      console.log('  [R1 APPLIED] 已写入 '+target+'  (+'+needExempt.length+' 条豁免, dsh '+rt+')');
    }
  }else{
    console.log('');
    console.log('  [R1] 跳过：没有未豁免的不兼容 bundle');
  }

  // ---------------- R2: 剔除 Linux 不可能加载的 bundle
  if(badBundles.length){
    console.log('');
    console.log('  [R2] 这些条目在 Linux 上不可能加载:');
    for(const x of badBundles) console.log('       - '+x.b+'   ('+x.why+')');
    if(dryrun){
      console.log('  [R2 DRY-RUN] 将从 dsh.profile.bundles 移除上述 '+badBundles.length+' 项（dependencies 保留）');
    }else{
      const bad=new Set(badBundles.map(x=>x.b));
      const kept=bundles.filter(b=>!bad.has(b));
      const profiler=Object.assign({},(pj.dsh||{}).profile||{},{bundles:kept});
      const out=Object.assign({},pj,{dsh:Object.assign({},pj.dsh||{},{profile:profiler})});
      const target=path.join(pd,'package.json');
      const tmp=target+'.tmp-'+Date.now();
      fs.writeFileSync(tmp,JSON.stringify(out,null,2)+'\n');
      fs.renameSync(tmp,target);
      console.log('  [R2 APPLIED] bundles: '+bundles.length+' -> '+kept.length+'  （dependencies 未改，随时可加回）');
    }
  }else{
    console.log('');
    console.log('  [R2] 跳过：没有 Linux 不可能加载的 bundle');
  }
})().catch(e=>{ console.error('  判定脚本崩溃: '+((e&&e.stack)||e)); process.exit(3); });
NODE
JUDGE_RC=$?
say ""
[ "$JUDGE_RC" = 0 ] || say "  !! 判定脚本返回非 0 ($JUDGE_RC)，后续验收可能不准"

# ---------------------------------------------------------------- Phase 3 树校验
say "[3] 启动树校验（dsh --dump-config，零副作用）"
if [ "$APPLY" = 1 ]; then DUMPERR="$BK/dump-after.err"; DUMPSUM="$BK/dump-after.yml"
else DUMPERR="/tmp/dsh-dump-$$.err"; DUMPSUM="/tmp/dsh-dump-$$.yml"; fi
if dsh --profile "$PROFILE" --dump-config >"$DUMPSUM" 2>"$DUMPERR"; then
  say "    exit=0  (树合成成功)"
else
  say "    exit!=0 (树合成失败，日志: $DUMPERR)"
fi
INC=$(grep -c "is incompatible with dsh" "$DUMPERR" 2>/dev/null); INC=${INC:-0}
SKP=$(grep -c "skipping profile bundle" "$DUMPERR" 2>/dev/null); SKP=${SKP:-0}
DUP=$(grep -c "duplicate loader entry id" "$DUMPERR" 2>/dev/null); DUP=${DUP:-0}
ENT=$(grep -c "^ *- id: " "$DUMPSUM" 2>/dev/null); ENT=${ENT:-0}
if command -v ss >/dev/null 2>&1; then PORT=$(ss -ltn 2>/dev/null | grep -c ':3080')
elif command -v netstat >/dev/null 2>&1; then PORT=$(netstat -ltn 2>/dev/null | grep -c ':3080')
else PORT='?'; fi
PORT=${PORT:-0}
say "    incompatible 告警=$INC   skipping bundle=$SKP   duplicate entry=$DUP"
say "    合成后 entry 数=$ENT   3080 已监听=$PORT"
if [ "$DUP" != 0 ]; then
  say "    !! duplicate loader entry id = 另一类故障（聚合包与子包重复列出），本工具不自动改，见 REPORT §5"
fi
if [ "$PORT" != 0 ]; then
  OWNER=$(ss -ltnp 2>/dev/null | grep ':3080' | head -1 | sed -n 's/.*users:(("\{0,1\}\([^",]*\).*//p')
  say "    !! 3080 已被占用，占用者: ${OWNER:-未知}"
  case "$OWNER" in
    ssh*)
      say "    !! 占用者是 ssh 隧道（如 dsh-tunnel.service 的 -L 3080:...）。"
      say "       这就是最常见的假"插件问题"：dsh web 的 webserver 是 required 插件，bind 失败 ⇒"
      say "       startup failed: N required plugins did not activate ⇒ 进程 exit 1。改端口即可，别动插件。"
      ;;
    node*|MainThread*)
      say "    !! 占用者是 node：多半是一个孤儿 dsh web 进程。先 systemctl --user stop / kill 它。"
      ;;
  esac
fi
say ""

# ---------------------------------------------------------------- Phase 4 验收
say "[4] 收尾"
if [ "$APPLY" = 1 ]; then
  {
    hr; date -Is
    echo "PROFILE=$PROFILE DSH_VERSION=$DVER INC=$INC SKP=$SKP DUP=$DUP ENTRIES=$ENT PORT3080=$PORT"
  } > "$BK/report.txt" 2>/dev/null
  say "    备份目录 : $BK"
  say "    回滚     : cp -p $BK/package.json $PDIR/ && cp -p $BK/compatibility.json $PDIR/ 2>/dev/null; echo rolled-back"
  say "    冒烟测试 : pkill -f 'dsh web' ; timeout 90 dsh web 2>&1 | head -40"
  say "    判定: 输出里没有 'is incompatible with dsh' 且浏览器能开 3080 = 修好了"
else
  say "    这是 DRY-RUN，什么都没写。确认上面判定无误后，加 --apply 重跑。"
fi
say ""
say "把 [0]~[3] 的整段输出贴回来即可复核。"
hr
