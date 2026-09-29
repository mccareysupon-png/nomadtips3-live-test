#!/usr/bin/env bash
set -euo pipefail
WORKER='ball46-production'
DIRECT='https://ball46-production.mccarey-supon.workers.dev'
WWW='https://www.ball46.com'
ROOT='/tmp/b46-topcard-predeploy'
SEED='/tmp/b46-seed/candidate'
REPO_CAND='ball46-topcard-candidate-20260929'
LIVE="$ROOT/live"; CAND="$ROOT/candidate"; RUNTIME="$ROOT/runtime"; VERIFY="$ROOT/verify"
rm -rf "$ROOT"; mkdir -p "$LIVE" "$CAND" "$RUNTIME" "$VERIFY"

[ -d "$SEED" ] || { echo SEED_CANDIDATE_MISSING; exit 1; }
[ "$(find "$SEED" -type f | wc -l | tr -d ' ')" = '79' ] || { echo SEED_NOT_79; exit 1; }
for f in dashboard-v2-stage3.js dashboard-v2-tune.css index.html; do [ -f "$REPO_CAND/$f" ] || { echo "REPO_CANDIDATE_MISSING:$f"; exit 1; }; done

git ls-remote origin refs/heads/main | awk '{print $1}' > "$ROOT/main-sha.txt"
echo "MAIN_SHA=$(cat "$ROOT/main-sha.txt")"

python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
root=pathlib.Path('/tmp/b46-topcard-predeploy'); a=os.environ['CLOUDFLARE_ACCOUNT_ID']; t=os.environ['CLOUDFLARE_API_TOKEN']; h={'Authorization':f'Bearer {t}','Accept':'application/json'}; api=f'https://api.cloudflare.com/client/v4/accounts/{a}'; s='ball46-production'
def get(u):
  with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:return json.load(r)
dep=get(f'{api}/workers/scripts/{s}/deployments')['result']['deployments'][0]; vs=dep.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100: raise SystemExit('MIXED_DEPLOYMENT')
vid=vs[0]['version_id']
v=get(f'{api}/workers/workers/{s}/versions/{vid}?include=modules')['result']; mods=v.get('modules') or []
if len(mods)!=1 or mods[0].get('name')!='index.js' or not mods[0].get('content_base64'): raise SystemExit('MODULE_SHAPE_BAD')
runtime=base64.b64decode(mods[0]['content_base64']); sha=hashlib.sha256(runtime).hexdigest()
expect=[('ASSETS','assets',None,None),('ENGINE','service','nomadtips3-engine-343','production'),('FULL_MARKET','service','nomadtips3-full-market-343-ball46','production'),('HUB','service','nomadtips3-5usd-hub-343','production')]
got=sorted((b.get('name'),b.get('type'),b.get('service'),b.get('environment')) for b in (v.get('bindings') or []))
if got!=sorted(expect): raise SystemExit('BINDINGS_CHANGED:'+repr(got))
if v.get('compatibility_date')!='2026-09-09' or (v.get('compatibility_flags') or []): raise SystemExit('COMPAT_CHANGED')
ac=(v.get('assets') or {}).get('config') or {}; ex={'base_path':'/','html_handling':'none','not_found_handling':'none','run_worker_first':True}
if {k:ac.get(k) for k in ex}!=ex: raise SystemExit('ASSET_CONFIG_CHANGED:'+repr(ac))
sched=get(f'{api}/workers/scripts/{s}/schedules')['result']; ss=sched.get('schedules',[]) if isinstance(sched,dict) else (sched or [])
crons=[x.get('cron') for x in ss if isinstance(x,dict) and x.get('cron')]
if crons!=['* * * * *']: raise SystemExit('CRON_CHANGED:'+repr(crons))
root.joinpath('runtime/index.js').write_bytes(runtime)
lock={'version':vid,'runtime_sha256':sha,'bindings':got,'compatibility_date':v.get('compatibility_date'),'compatibility_flags':v.get('compatibility_flags') or [],'assets_config':ac,'crons':crons,'deployment_id':dep.get('id'),'deployment_created_on':dep.get('created_on'),'deployment_annotations':dep.get('annotations')}
root.joinpath('production-lock.json').write_text(json.dumps(lock,indent=2,sort_keys=True))
print('PRODUCTION_LOCK_PASS',vid,sha)
PY

nonce="${GITHUB_RUN_ID:-manual}-fresh79-$(date +%s%N)"
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  mkdir -p "$LIVE/$(dirname "$rel")"
  code=$(curl -sS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' -o "$LIVE/$rel" -w '%{http_code}' "$DIRECT/$rel?topcardpre=$nonce-${RANDOM}") || true
  [ "$code" = 200 ] || { echo "LIVE_FETCH_FAILED:$code:$rel"; exit 1; }
done < <(cd "$SEED" && find . -type f -printf '%P\n' | sort)
[ "$(find "$LIVE" -type f | wc -l | tr -d ' ')" = '79' ] || { echo LIVE_NOT_79; exit 1; }
echo FRESH_79_FETCH_PASS

cp -a "$LIVE/." "$CAND/"
for f in dashboard-v2-stage3.js dashboard-v2-tune.css index.html; do cp "$REPO_CAND/$f" "$CAND/$f"; done
node --check "$CAND/dashboard-v2-stage3.js"

python3 - <<'PY'
from pathlib import Path
import hashlib
root=Path('/tmp/b46-topcard-predeploy'); live=root/'live'; cand=root/'candidate'
paths=sorted(p.relative_to(live).as_posix() for p in live.rglob('*') if p.is_file())
if paths!=sorted(p.relative_to(cand).as_posix() for p in cand.rglob('*') if p.is_file()): raise SystemExit('FILESET_CHANGED')
changed=[r for r in paths if hashlib.sha256((live/r).read_bytes()).digest()!=hashlib.sha256((cand/r).read_bytes()).digest()]
print('CHANGED_ASSETS',changed)
if changed!=['dashboard-v2-stage3.js','dashboard-v2-tune.css','index.html']: raise SystemExit('EXACT_THREE_GATE_BAD:'+repr(changed))

def span(src,name):
  needle=f'function {name}('; s=src.find(needle)
  if s<0: raise SystemExit('FUNCTION_MISSING:'+name)
  b=src.find('{',s); depth=0; quote=None; esc=False
  for i in range(b,len(src)):
    c=src[i]
    if quote:
      if esc: esc=False
      elif c=='\\': esc=True
      elif c==quote: quote=None
    else:
      if c in "'\"`": quote=c
      elif c=='{': depth+=1
      elif c=='}':
        depth-=1
        if depth==0:return s,i+1
  raise SystemExit('FUNCTION_UNBALANCED:'+name)
lj=(live/'dashboard-v2-stage3.js').read_text(); cj=(cand/'dashboard-v2-stage3.js').read_text(); ls,le=span(lj,'renderWorkspaceScorebar'); cs,ce=span(cj,'renderWorkspaceScorebar')
if lj[:ls]!=cj[:cs] or lj[le:]!=cj[ce:]: raise SystemExit('JS_DIFF_OUTSIDE_SCOREBAR_RENDERER')
if 'BALL46_SCOREBAR_DETAILS_20260929' not in cj[cs:ce]: raise SystemExit('JS_MARKER_MISSING')
for token in ['/api/engine/','ENGINE','FULL_MARKET','HUB','workers.dev']:
  if lj.count(token)!=cj.count(token): raise SystemExit('PROTECTED_WIRING_CHANGED:'+token)
print('JS_SCOPE_GATE_PASS')

lc=(live/'dashboard-v2-tune.css').read_text(); cc=(cand/'dashboard-v2-tune.css').read_text(); marker='/* BALL46_SCOREBAR_DETAILS_20260929'
if cc.count(marker)!=1: raise SystemExit('CSS_MARKER_COUNT_BAD')
pos=cc.index(marker)
if cc[:pos].rstrip()!=lc.rstrip(): raise SystemExit('CSS_NOT_LIVE_PLUS_APPEND')
if '.workspace-scorebar-slot{height:120px!important;min-height:120px!important;max-height:120px!important}' not in cc: raise SystemExit('CSS_SLOT_HEIGHT_MISSING')
if '.workspace-scorebar-cell{height:118px!important}' not in cc: raise SystemExit('CSS_CARD_HEIGHT_MISSING')
print('CSS_SCOPE_GATE_PASS')

li=(live/'index.html').read_text(); ci=(cand/'index.html').read_text()
new_js='dashboard-v2-stage3.js?v=343-scorebar-details-20260929a'; old_js='dashboard-v2-stage3.js?v=343-scorebar-bg-pending-20260928a'
new_css='dashboard-v2-tune.css?v=343-scorebar-details-20260929a'; old_css='dashboard-v2-tune.css?v=343-horizontal-card-20260928a'
if ci.count(new_js)!=1 or ci.count(new_css)!=1: raise SystemExit('NEW_CACHE_BUSTERS_BAD')
restored=ci.replace(new_js,old_js).replace(new_css,old_css)
if restored!=li: raise SystemExit('INDEX_DIFF_NOT_TWO_CACHE_BUSTERS')
if 'singlepage-workspace-343.css?v=343-scorebar-player-right-20260928a' not in ci: raise SystemExit('WORKSPACE_CSS_REF_CHANGED')
print('INDEX_SCOPE_GATE_PASS')
for r in changed: print('CAND_SHA',r,hashlib.sha256((cand/r).read_bytes()).hexdigest())
PY

nonce="${GITHUB_RUN_ID:-manual}-health-$(date +%s%N)"
for ep in board signals statistics; do curl -fsS -L --retry 3 --retry-all-errors --max-time 30 "$WWW/api/engine/$ep?topcardpre=$nonce" -o "$VERIFY/$ep.json"; done
python3 - <<'PY'
import json,pathlib
r=pathlib.Path('/tmp/b46-topcard-predeploy/verify')
for n in ['board','signals','statistics']:
 j=json.load(open(r/f'{n}.json'))
 if j.get('ok') is not True: raise SystemExit('API_HEALTH_BAD:'+n)
print('API_HEALTH_PASS')
PY

cat > "$RUNTIME/wrangler.jsonc" <<EOF
{"name":"ball46-production","main":"./index.js","compatibility_date":"2026-09-09","no_bundle":true,"services":[{"binding":"ENGINE","service":"nomadtips3-engine-343","environment":"production"},{"binding":"FULL_MARKET","service":"nomadtips3-full-market-343-ball46","environment":"production"},{"binding":"HUB","service":"nomadtips3-5usd-hub-343","environment":"production"}],"assets":{"directory":"$CAND","binding":"ASSETS","html_handling":"none","not_found_handling":"none","run_worker_first":true},"triggers":{"crons":["* * * * *"]}}
EOF
cd "$RUNTIME"
npx --yes wrangler@4.92.0 deploy --dry-run --config wrangler.jsonc 2>&1 | tee "$VERIFY/dry-run.log"
grep -Fq 'Read 79 files from the assets directory' "$VERIFY/dry-run.log" || { echo DRY_NOT_79; exit 1; }
! grep -Fq 'Attaching additional modules:' "$VERIFY/dry-run.log" || { echo DRY_EXTRA_MODULES; exit 1; }
echo PREDEPLOY_DRY_RUN_PASS

echo BALL46_TOPCARD_PREDEPLOY_PASS
