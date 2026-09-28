#!/usr/bin/env bash
set -euo pipefail
DIRECT='https://ball46-production.mccarey-supon.workers.dev'
WWW='https://www.ball46.com'
ROOT='/tmp/b46-leagues-reset'; BEFORE="$ROOT/before"; AFTER="$ROOT/after"; VERIFY="$ROOT/verify"; RUNTIME="$ROOT/runtime"; CLEAN='/tmp/b46-leagues-reset-clean'
PATH_MAP='.github/scripts/ball46_current217_live_paths_20260928.txt'
rm -rf "$ROOT" "$CLEAN"; mkdir -p "$BEFORE" "$AFTER" "$VERIFY" "$RUNTIME" "$CLEAN"

python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
r=pathlib.Path('/tmp/b46-leagues-reset'); a=os.environ['CLOUDFLARE_ACCOUNT_ID']; t=os.environ['CLOUDFLARE_API_TOKEN']; h={'Authorization':f'Bearer {t}','Accept':'application/json'}; api=f'https://api.cloudflare.com/client/v4/accounts/{a}'; script='ball46-production'
def get(u):
  with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as x:return json.load(x)
d=get(f'{api}/workers/scripts/{script}/deployments')['result']['deployments'][0]; vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100: raise SystemExit('MIXED_DEPLOYMENT')
vid=vs[0]['version_id']; r.joinpath('pre-version.txt').write_text(vid)
v=get(f'{api}/workers/workers/{script}/versions/{vid}?include=modules')['result']; mods=v.get('modules') or []; main=[m for m in mods if m.get('name')=='index.js' and m.get('content_base64')]
if len(main)!=1: raise SystemExit('INDEX_MODULE_MISSING')
runtime=base64.b64decode(main[0]['content_base64']); sha=hashlib.sha256(runtime).hexdigest(); r.joinpath('runtime/index.js').write_bytes(runtime); r.joinpath('runtime.sha').write_text(sha)
expect=[('ASSETS','assets',None,None),('ENGINE','service','nomadtips3-engine-343','production'),('FULL_MARKET','service','nomadtips3-full-market-343-ball46','production'),('HUB','service','nomadtips3-5usd-hub-343','production')]
got=sorted((b.get('name'),b.get('type'),b.get('service'),b.get('environment')) for b in (v.get('bindings') or []))
if got!=sorted(expect): raise SystemExit('BINDINGS_CHANGED:'+repr(got))
if v.get('compatibility_date')!='2026-09-09' or (v.get('compatibility_flags') or []): raise SystemExit('COMPAT_CHANGED')
ac=(v.get('assets') or {}).get('config') or {}; exp={'base_path':'/','html_handling':'none','not_found_handling':'none','run_worker_first':True}
if {k:ac.get(k) for k in exp}!=exp: raise SystemExit('ASSET_CONFIG_CHANGED:'+repr(ac))
s=get(f'{api}/workers/scripts/{script}/schedules')['result']; ss=s.get('schedules',[]) if isinstance(s,dict) else (s or [])
if [x.get('cron') for x in ss if isinstance(x,dict) and x.get('cron')]!=['* * * * *']: raise SystemExit('CRON_CHANGED')
print('CURRENT_LOCK_OK',vid,'modules=',[m.get('name') for m in mods],'main_sha=',sha)
PY

python3 - <<'PY'
from pathlib import Path
xs=[x.strip() for x in Path('.github/scripts/ball46_current217_live_paths_20260928.txt').read_text().splitlines() if x.strip()]
if len(xs)!=79 or len(set(xs))!=79: raise SystemExit('PATH_MAP_NOT_79')
need={'index.html','dashboard-v2-stage3.js','singlepage-workspace-343.js','signal.js','statistics.js','full-market-bookmaker-343.js','odds-format-343.js'}
if not need.issubset(xs): raise SystemExit('REQUIRED_MISSING:'+repr(sorted(need-set(xs))))
Path('/tmp/b46-leagues-reset/live-paths.txt').write_text('\n'.join(xs)+'\n'); print('PATH_MAP_OK=79')
PY

nonce="${GITHUB_RUN_ID}-$(date +%s%N)"
while IFS= read -r rel; do
  [ -n "$rel" ] || continue; mkdir -p "$BEFORE/$(dirname "$rel")"
  code=$(curl -sS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' -o "$BEFORE/$rel" -w '%{http_code}' "$DIRECT/$rel?b46league=$nonce-${RANDOM}") || true
  [ "$code" = 200 ] || { echo "FETCH_FAILED:$code:$rel"; exit 1; }; [ -s "$BEFORE/$rel" ] || { echo "EMPTY:$rel"; exit 1; }
done < "$ROOT/live-paths.txt"
cp -a "$BEFORE/." "$AFTER/"

nonce="${GITHUB_RUN_ID}-pre-$(date +%s%N)"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/board?b46league=$nonce" -o "$ROOT/board-before.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/signals?b46league=$nonce" -o "$ROOT/signals-before.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/statistics?b46league=$nonce" -o "$ROOT/stats-before.json"
node - <<'NODE'
const fs=require('fs');const b=JSON.parse(fs.readFileSync('/tmp/b46-leagues-reset/board-before.json')),s=JSON.parse(fs.readFileSync('/tmp/b46-leagues-reset/signals-before.json')),t=JSON.parse(fs.readFileSync('/tmp/b46-leagues-reset/stats-before.json'));if(b?.ok!==true||!Array.isArray(b.fixtures)||!Array.isArray(s.signals)||t?.ok!==true||!Array.isArray(t.rows))throw Error('PRE_FLOW_BAD');console.log('PRE_FLOW_OK',{fixtures:b.fixtures.length,signals:s.signals.length,stats:t.rows.length});
NODE

grep -Fq "let leagueFilter='all';" "$BEFORE/dashboard-v2-stage3.js"
grep -Fq "leagueFilter=leagueFilter===btn.dataset.leagueFilter?'all':btn.dataset.leagueFilter" "$BEFORE/dashboard-v2-stage3.js"
grep -Fq "document.addEventListener('ball46:workspace-view',rerenderWorkspaceMode)" "$BEFORE/dashboard-v2-stage3.js"
grep -Fq "document.addEventListener('ball46:signal-market',rerenderWorkspaceMode)" "$BEFORE/dashboard-v2-stage3.js"
grep -Fq "statusFilter=btn.dataset.statusFilter" "$BEFORE/dashboard-v2-stage3.js"
grep -Fq "setView('live',{push:false});writeRoute({status:b.dataset.statusFilter||'all'})" "$BEFORE/singlepage-workspace-343.js"

python3 - <<'PY'
from pathlib import Path
p=Path('/tmp/b46-leagues-reset/after/dashboard-v2-stage3.js'); s=p.read_text()
old="""function initControls(){const tz=$('[data-timezone]');if(tz)tz.textContent=timeZone;const stored=(()=>{try{return localStorage.getItem(THEME_KEY)}catch{return null}})();setTheme(stored==='dark'?'dark':'light');$('[data-theme-toggle]')?.addEventListener('click',()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark'));$$('[data-status-filter]').forEach(btn=>btn.addEventListener('click',()=>{statusFilter=btn.dataset.statusFilter;$$('[data-status-filter]').forEach(x=>x.classList.toggle('active',x===btn));renderBoard()}));$('[data-search]')?.addEventListener('input',e=>{query=String(e.target.value||'').trim().toLowerCase();renderBoard()});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')load()})}
"""
new="""function initControls(){const tz=$('[data-timezone]');if(tz)tz.textContent=timeZone;const stored=(()=>{try{return localStorage.getItem(THEME_KEY)}catch{return null}})();setTheme(stored==='dark'?'dark':'light');$('[data-theme-toggle]')?.addEventListener('click',()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark'));$$('[data-status-filter]').forEach(btn=>btn.addEventListener('click',()=>{leagueFilter='all';statusFilter=btn.dataset.statusFilter;$$('[data-status-filter]').forEach(x=>x.classList.toggle('active',x===btn));renderLeagueFilters();renderBoard()}));$('[data-search]')?.addEventListener('input',e=>{query=String(e.target.value||'').trim().toLowerCase();renderBoard()});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')load()})}
"""
if s.count(old)!=1: raise SystemExit('INIT_CONTROLS_SIGNATURE_COUNT_'+str(s.count(old)))
s=s.replace(old,new,1)
old2="""function rerenderWorkspaceMode(){syncWorkspaceMode();if(selectedId&&!visibleRows().some(f=>fixtureKey(f)===selectedId))selectedId=null;renderLeagueFilters();renderBoard();renderFeatured()}
function start(){initControls();document.addEventListener('ball46:workspace-view',rerenderWorkspaceMode);document.addEventListener('ball46:signal-market',rerenderWorkspaceMode);syncWorkspaceMode();"""
new2="""function rerenderWorkspaceMode(){syncWorkspaceMode();if(selectedId&&!visibleRows().some(f=>fixtureKey(f)===selectedId))selectedId=null;renderLeagueFilters();renderBoard();renderFeatured()}
function resetLeagueOnWorkspaceView(){leagueFilter='all';rerenderWorkspaceMode()}
function start(){initControls();document.addEventListener('ball46:workspace-view',resetLeagueOnWorkspaceView);document.addEventListener('ball46:signal-market',rerenderWorkspaceMode);syncWorkspaceMode();"""
if s.count(old2)!=1: raise SystemExit('WORKSPACE_LISTENER_SIGNATURE_COUNT_'+str(s.count(old2)))
s=s.replace(old2,new2,1); p.write_text(s)
PY

node --check "$AFTER/dashboard-v2-stage3.js"
grep -Fq "leagueFilter='all';statusFilter=btn.dataset.statusFilter" "$AFTER/dashboard-v2-stage3.js"
grep -Fq "function resetLeagueOnWorkspaceView(){leagueFilter='all';rerenderWorkspaceMode()}" "$AFTER/dashboard-v2-stage3.js"
grep -Fq "document.addEventListener('ball46:workspace-view',resetLeagueOnWorkspaceView)" "$AFTER/dashboard-v2-stage3.js"
grep -Fq "document.addEventListener('ball46:signal-market',rerenderWorkspaceMode)" "$AFTER/dashboard-v2-stage3.js"
cmp -s "$BEFORE/singlepage-workspace-343.js" "$AFTER/singlepage-workspace-343.js"
cmp -s "$BEFORE/signal.js" "$AFTER/signal.js"
cmp -s "$BEFORE/statistics.js" "$AFTER/statistics.js"
cmp -s "$BEFORE/full-market-bookmaker-343.js" "$AFTER/full-market-bookmaker-343.js"
cmp -s "$BEFORE/odds-format-343.js" "$AFTER/odds-format-343.js"
echo STATIC_LEAGUE_RESET_INVARIANTS_OK

python3 - <<'PY'
from pathlib import Path
import hashlib
r=Path('/tmp/b46-leagues-reset'); changed=[]
for rel in r.joinpath('live-paths.txt').read_text().splitlines():
  if hashlib.sha256((r/'before'/rel).read_bytes()).digest()!=hashlib.sha256((r/'after'/rel).read_bytes()).digest(): changed.append(rel)
print('CHANGED_ASSETS=',changed)
if changed!=['dashboard-v2-stage3.js']: raise SystemExit('ONE_FILE_DIFF_FAILED:'+repr(changed))
PY
echo ONE_FILE_DIFF_GATE_PASS

cp "$RUNTIME/index.js" "$CLEAN/index.js"
cat > "$CLEAN/wrangler.jsonc" <<EOF
{"name":"ball46-production","main":"./index.js","compatibility_date":"2026-09-09","no_bundle":true,"services":[{"binding":"ENGINE","service":"nomadtips3-engine-343","environment":"production"},{"binding":"FULL_MARKET","service":"nomadtips3-full-market-343-ball46","environment":"production"},{"binding":"HUB","service":"nomadtips3-5usd-hub-343","environment":"production"}],"assets":{"directory":"$AFTER","binding":"ASSETS","html_handling":"none","not_found_handling":"none","run_worker_first":true},"triggers":{"crons":["* * * * *"]}}
EOF
npx -y wrangler@4.92.0 deploy --config "$CLEAN/wrangler.jsonc" --dry-run

python3 - <<'PY'
import json,os,pathlib,urllib.request
pre=pathlib.Path('/tmp/b46-leagues-reset/pre-version.txt').read_text().strip(); a=os.environ['CLOUDFLARE_ACCOUNT_ID']; t=os.environ['CLOUDFLARE_API_TOKEN']; h={'Authorization':f'Bearer {t}','Accept':'application/json'}; u=f'https://api.cloudflare.com/client/v4/accounts/{a}/workers/scripts/ball46-production/deployments'
with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as x:j=json.load(x)
vs=j['result']['deployments'][0].get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100: raise SystemExit('RACE_MIXED_DEPLOYMENT')
cur=vs[0]['version_id']; print('RACE_VERSION',pre,cur)
if cur!=pre: raise SystemExit('RACE_GUARD_ABORT_PRODUCTION_MOVED')
print('RACE_GUARD_PASS')
PY

npx -y wrangler@4.92.0 deploy --config "$CLEAN/wrangler.jsonc"

python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
r=pathlib.Path('/tmp/b46-leagues-reset'); old=r.joinpath('runtime.sha').read_text().strip(); a=os.environ['CLOUDFLARE_ACCOUNT_ID']; t=os.environ['CLOUDFLARE_API_TOKEN']; h={'Authorization':f'Bearer {t}','Accept':'application/json'}; api=f'https://api.cloudflare.com/client/v4/accounts/{a}'; script='ball46-production'
def get(u):
  with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as x:return json.load(x)
d=get(f'{api}/workers/scripts/{script}/deployments')['result']['deployments'][0]; vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100: raise SystemExit('POST_MIXED_DEPLOYMENT')
vid=vs[0]['version_id']; v=get(f'{api}/workers/workers/{script}/versions/{vid}?include=modules')['result']; mods=v.get('modules') or []; main=[m for m in mods if m.get('name')=='index.js' and m.get('content_base64')]
if len(main)!=1: raise SystemExit('POST_INDEX_MODULE_MISSING')
sha=hashlib.sha256(base64.b64decode(main[0]['content_base64'])).hexdigest()
if sha!=old: raise SystemExit('POST_RUNTIME_SHA_CHANGED:'+sha)
print('POST_RUNTIME_CLEAN',vid,sha); r.joinpath('post-version.txt').write_text(vid)
PY

nonce="${GITHUB_RUN_ID}-post-$(date +%s%N)"
while IFS= read -r rel; do
  [ -n "$rel" ] || continue; mkdir -p "$VERIFY/$(dirname "$rel")"
  code=$(curl -sS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' -o "$VERIFY/$rel" -w '%{http_code}' "$DIRECT/$rel?b46leaguepost=$nonce-${RANDOM}") || true
  [ "$code" = 200 ] || { echo "POST_FETCH_FAILED:$code:$rel"; exit 1; }; cmp -s "$AFTER/$rel" "$VERIFY/$rel" || { echo "POST_ASSET_MISMATCH:$rel"; exit 1; }
done < "$ROOT/live-paths.txt"
echo POST_79_ASSETS_MATCH_TARGET
grep -Fq "function resetLeagueOnWorkspaceView(){leagueFilter='all';rerenderWorkspaceMode()}" "$VERIFY/dashboard-v2-stage3.js"

nonce="${GITHUB_RUN_ID}-flow-$(date +%s%N)"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/board?b46league=$nonce" -o "$ROOT/board-after.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/signals?b46league=$nonce" -o "$ROOT/signals-after.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/statistics?b46league=$nonce" -o "$ROOT/stats-after.json"
node - <<'NODE'
const fs=require('fs');const b=JSON.parse(fs.readFileSync('/tmp/b46-leagues-reset/board-after.json')),s=JSON.parse(fs.readFileSync('/tmp/b46-leagues-reset/signals-after.json')),t=JSON.parse(fs.readFileSync('/tmp/b46-leagues-reset/stats-after.json'));if(b?.ok!==true||!Array.isArray(b.fixtures)||!Array.isArray(s.signals)||t?.ok!==true||!Array.isArray(t.rows))throw Error('POST_FLOW_BAD');console.log('POST_FLOW_OK',{fixtures:b.fixtures.length,signals:s.signals.length,stats:t.rows.length});
NODE
echo BALL46_LEAGUES_RESET_VERIFIED
