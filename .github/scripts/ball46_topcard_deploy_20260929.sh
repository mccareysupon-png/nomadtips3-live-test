#!/usr/bin/env bash
set -euo pipefail
WORKER='ball46-production'
DIRECT='https://ball46-production.mccarey-supon.workers.dev'
WWW='https://www.ball46.com'
SRC='/tmp/b46-predeploy'
BASE="$SRC/live"; CAND="$SRC/candidate"; SAVED_RUNTIME="$SRC/runtime/index.js"; LOCK="$SRC/production-lock.json"
ROOT='/tmp/b46-topcard-deploy'; RUNTIME="$ROOT/runtime"; VERIFY="$ROOT/verify"; POST="$ROOT/post"
rm -rf "$ROOT"; mkdir -p "$RUNTIME" "$VERIFY" "$POST"

[ -d "$BASE" ] && [ -d "$CAND" ] && [ -f "$SAVED_RUNTIME" ] && [ -f "$LOCK" ] || { echo PREDEPLOY_ARTIFACT_MISSING; exit 1; }
[ "$(find "$BASE" -type f | wc -l | tr -d ' ')" = '79' ] || { echo BASE_NOT_79; exit 1; }
[ "$(find "$CAND" -type f | wc -l | tr -d ' ')" = '79' ] || { echo CAND_NOT_79; exit 1; }

python3 - <<'PY'
from pathlib import Path
import hashlib,json
src=Path('/tmp/b46-predeploy'); base=src/'live'; cand=src/'candidate'; lock=json.loads((src/'production-lock.json').read_text())
paths=sorted(p.relative_to(base).as_posix() for p in base.rglob('*') if p.is_file())
changed=[r for r in paths if hashlib.sha256((base/r).read_bytes()).digest()!=hashlib.sha256((cand/r).read_bytes()).digest()]
print('DEPLOY_CHANGED_ASSETS',changed)
if changed!=['dashboard-v2-stage3.js','dashboard-v2-tune.css','index.html']: raise SystemExit('DEPLOY_DIFF_BAD')
if 'BALL46_SCOREBAR_DETAILS_20260929' not in (cand/'dashboard-v2-stage3.js').read_text(): raise SystemExit('JS_MARKER_MISSING')
if 'BALL46_SCOREBAR_DETAILS_20260929' not in (cand/'dashboard-v2-tune.css').read_text(): raise SystemExit('CSS_MARKER_MISSING')
idx=(cand/'index.html').read_text()
for x in ['dashboard-v2-stage3.js?v=343-scorebar-details-20260929a','dashboard-v2-tune.css?v=343-scorebar-details-20260929a','singlepage-workspace-343.css?v=343-scorebar-player-right-20260928a']:
 if x not in idx: raise SystemExit('INDEX_MARKER_MISSING:'+x)
if lock.get('bindings')!=[['ASSETS','assets',None,None],['ENGINE','service','nomadtips3-engine-343','production'],['FULL_MARKET','service','nomadtips3-full-market-343-ball46','production'],['HUB','service','nomadtips3-5usd-hub-343','production']]: raise SystemExit('LOCK_BINDINGS_UNEXPECTED')
print('DEPLOY_ARTIFACT_GATE_PASS')
PY
node --check "$CAND/dashboard-v2-stage3.js"

# Lock the exact current Worker version/runtime/config against the predeploy snapshot.
python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
src=pathlib.Path('/tmp/b46-predeploy'); out=pathlib.Path('/tmp/b46-topcard-deploy'); lock=json.loads((src/'production-lock.json').read_text()); A=os.environ['CLOUDFLARE_ACCOUNT_ID']; T=os.environ['CLOUDFLARE_API_TOKEN']; h={'Authorization':f'Bearer {T}','Accept':'application/json'}; api=f'https://api.cloudflare.com/client/v4/accounts/{A}'; s='ball46-production'
def get(u):
 with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:return json.load(r)
d=get(f'{api}/workers/scripts/{s}/deployments')['result']['deployments'][0]; vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100: raise SystemExit('PRE_MIXED')
vid=vs[0]['version_id']
if vid!=lock['version']: raise SystemExit('PRODUCTION_MOVED:'+vid+' expected '+lock['version'])
v=get(f'{api}/workers/workers/{s}/versions/{vid}?include=modules')['result']; mods=v.get('modules') or []
if len(mods)!=1 or mods[0].get('name')!='index.js': raise SystemExit('PRE_MODULE_SHAPE_BAD')
sha=hashlib.sha256(base64.b64decode(mods[0]['content_base64'])).hexdigest()
if sha!=lock['runtime_sha256']: raise SystemExit('PRE_RUNTIME_MOVED:'+sha)
got=sorted((b.get('name'),b.get('type'),b.get('service'),b.get('environment')) for b in (v.get('bindings') or []))
if got!=[tuple(x) for x in lock['bindings']]: raise SystemExit('PRE_BINDINGS_MOVED:'+repr(got))
ac=(v.get('assets') or {}).get('config') or {}
for k,val in lock['assets_config'].items():
 if ac.get(k)!=val: raise SystemExit('PRE_ASSET_CONFIG_MOVED:'+k)
sched=get(f'{api}/workers/scripts/{s}/schedules')['result']; ss=sched.get('schedules',[]) if isinstance(sched,dict) else (sched or []); crons=[x.get('cron') for x in ss if isinstance(x,dict) and x.get('cron')]
if crons!=lock['crons']: raise SystemExit('PRE_CRON_MOVED:'+repr(crons))
out.joinpath('preflight-lock-confirmed.json').write_text(json.dumps({'version':vid,'runtime_sha256':sha,'bindings':got,'crons':crons},indent=2))
print('PRE_PRODUCTION_LOCK_PASS',vid,sha)
PY

# Race guard: all 79 public assets must still equal the freshly captured baseline.
nonce="${GITHUB_RUN_ID:-manual}-race79-$(date +%s%N)"
while IFS= read -r rel; do
 [ -n "$rel" ] || continue
 mkdir -p "$ROOT/race/$(dirname "$rel")"
 code=$(curl -sS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' -o "$ROOT/race/$rel" -w '%{http_code}' "$DIRECT/$rel?topcardrace=$nonce-${RANDOM}") || true
 [ "$code" = 200 ] || { echo "RACE_FETCH_FAILED:$code:$rel"; exit 1; }
 cmp -s "$ROOT/race/$rel" "$BASE/$rel" || { echo "PRODUCTION_ASSET_MOVED:$rel"; exit 1; }
done < <(cd "$BASE" && find . -type f -printf '%P\n' | sort)
echo RACE_79_ASSETS_PASS

nonce="${GITHUB_RUN_ID:-manual}-prehealth-$(date +%s%N)"
for ep in board signals statistics; do curl -fsS -L --retry 3 --retry-all-errors --max-time 30 "$WWW/api/engine/$ep?topcardpre=$nonce" -o "$VERIFY/$ep-before.json"; done
python3 - <<'PY'
import json,pathlib
r=pathlib.Path('/tmp/b46-topcard-deploy/verify')
for n in ['board','signals','statistics']:
 if json.load(open(r/f'{n}-before.json')).get('ok') is not True: raise SystemExit('PRE_API_BAD:'+n)
print('PRE_API_HEALTH_PASS')
PY

cp "$SAVED_RUNTIME" "$RUNTIME/index.js"
cat > "$RUNTIME/wrangler.jsonc" <<EOF
{"name":"ball46-production","main":"./index.js","compatibility_date":"2026-09-09","no_bundle":true,"services":[{"binding":"ENGINE","service":"nomadtips3-engine-343","environment":"production"},{"binding":"FULL_MARKET","service":"nomadtips3-full-market-343-ball46","environment":"production"},{"binding":"HUB","service":"nomadtips3-5usd-hub-343","environment":"production"}],"assets":{"directory":"$CAND","binding":"ASSETS","html_handling":"none","not_found_handling":"none","run_worker_first":true},"triggers":{"crons":["* * * * *"]}}
EOF
cd "$RUNTIME"
npx --yes wrangler@4.92.0 deploy --dry-run --config wrangler.jsonc 2>&1 | tee "$VERIFY/dry-run.log"
grep -Fq 'Read 79 files from the assets directory' "$VERIFY/dry-run.log" || { echo DRY_NOT_79; exit 1; }
! grep -Fq 'Attaching additional modules:' "$VERIFY/dry-run.log" || { echo DRY_EXTRA_MODULES; exit 1; }
echo DEPLOY_DRY_RUN_PASS

# Final Worker-version race gate immediately before mutation.
python3 - <<'PY'
import json,os,urllib.request
lock=json.load(open('/tmp/b46-predeploy/production-lock.json')); A=os.environ['CLOUDFLARE_ACCOUNT_ID']; T=os.environ['CLOUDFLARE_API_TOKEN']; h={'Authorization':f'Bearer {T}','Accept':'application/json'}; u=f'https://api.cloudflare.com/client/v4/accounts/{A}/workers/scripts/ball46-production/deployments'
with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:j=json.load(r)
vs=j['result']['deployments'][0].get('versions') or []; cur=vs[0]['version_id'] if len(vs)==1 and float(vs[0].get('percentage',0))==100 else 'MIXED'
print('FINAL_RACE_VERSION',cur)
if cur!=lock['version']: raise SystemExit('FINAL_RACE_MOVED:'+cur)
PY

npx --yes wrangler@4.92.0 deploy --config wrangler.jsonc 2>&1 | tee "$VERIFY/deploy.log"
! grep -Fq 'Attaching additional modules:' "$VERIFY/deploy.log" || { echo DEPLOY_EXTRA_MODULES; exit 1; }
grep -Fq 'Found 3 new or modified static assets to upload' "$VERIFY/deploy.log" || { echo DEPLOY_NOT_THREE_ASSETS; exit 1; }
for p in dashboard-v2-stage3.js dashboard-v2-tune.css index.html; do grep -Fq "+ /$p" "$VERIFY/deploy.log" || { echo "EXPECTED_UPLOAD_MISSING:$p"; exit 1; }; done
[ "$(grep -c '^+ /' "$VERIFY/deploy.log" || true)" = '3' ] || { echo DEPLOY_MORE_THAN_THREE; exit 1; }
echo DEPLOY_EXACT_THREE_ASSETS_PASS

# Capture the version created by this run, then enforce unchanged runtime/bindings/config/cron.
python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request,time,re
root=pathlib.Path('/tmp/b46-topcard-deploy'); lock=json.load(open('/tmp/b46-predeploy/production-lock.json')); A=os.environ['CLOUDFLARE_ACCOUNT_ID']; T=os.environ['CLOUDFLARE_API_TOKEN']; h={'Authorization':f'Bearer {T}','Accept':'application/json'}; api=f'https://api.cloudflare.com/client/v4/accounts/{A}'; s='ball46-production'
def get(u):
 with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:return json.load(r)
last=None
for _ in range(12):
 d=get(f'{api}/workers/scripts/{s}/deployments')['result']['deployments'][0]; vs=d.get('versions') or []
 if len(vs)==1 and float(vs[0].get('percentage',0))==100 and vs[0]['version_id']!=lock['version']:
  last=(d,vs[0]['version_id']); break
 time.sleep(2)
if not last: raise SystemExit('POST_NEW_VERSION_NOT_VISIBLE')
d,vid=last; root.joinpath('deployed-version.txt').write_text(vid)
v=get(f'{api}/workers/workers/{s}/versions/{vid}?include=modules')['result']; mods=v.get('modules') or []
if len(mods)!=1 or mods[0].get('name')!='index.js': raise SystemExit('POST_MODULE_SHAPE_BAD')
sha=hashlib.sha256(base64.b64decode(mods[0]['content_base64'])).hexdigest()
if sha!=lock['runtime_sha256']: raise SystemExit('POST_RUNTIME_CHANGED:'+sha)
got=sorted((b.get('name'),b.get('type'),b.get('service'),b.get('environment')) for b in (v.get('bindings') or []))
if got!=[tuple(x) for x in lock['bindings']]: raise SystemExit('POST_BINDINGS_CHANGED:'+repr(got))
ac=(v.get('assets') or {}).get('config') or {}
for k,val in lock['assets_config'].items():
 if ac.get(k)!=val: raise SystemExit('POST_ASSET_CONFIG_CHANGED:'+k)
sched=get(f'{api}/workers/scripts/{s}/schedules')['result']; ss=sched.get('schedules',[]) if isinstance(sched,dict) else (sched or []); crons=[x.get('cron') for x in ss if isinstance(x,dict) and x.get('cron')]
if crons!=lock['crons']: raise SystemExit('POST_CRON_CHANGED:'+repr(crons))
root.joinpath('post-lock.json').write_text(json.dumps({'previous_version':lock['version'],'deployed_version':vid,'runtime_sha256':sha,'bindings':got,'assets_config':ac,'crons':crons},indent=2))
print('POST_RUNTIME_LOCK_PASS',vid,sha)
PY

# Wait for asset propagation, then require all 79 assets to match the candidate byte-for-byte.
for attempt in $(seq 1 12); do
 rm -rf "$POST"; mkdir -p "$POST"; ok=1; nonce="${GITHUB_RUN_ID:-manual}-post${attempt}-$(date +%s%N)"
 while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  mkdir -p "$POST/$(dirname "$rel")"
  code=$(curl -sS -L --retry 2 --retry-all-errors --max-time 20 -H 'Cache-Control: no-cache' -o "$POST/$rel" -w '%{http_code}' "$DIRECT/$rel?topcardpost=$nonce-${RANDOM}") || true
  if [ "$code" != 200 ] || ! cmp -s "$POST/$rel" "$CAND/$rel"; then ok=0; break; fi
 done < <(cd "$CAND" && find . -type f -printf '%P\n' | sort)
 [ "$ok" = 1 ] && { echo POST_79_MATCH_CANDIDATE; break; }
 [ "$attempt" = 12 ] && { echo POST_PROPAGATION_NOT_CONVERGED; exit 1; }
 sleep 2
done

nonce="${GITHUB_RUN_ID:-manual}-posthealth-$(date +%s%N)"
for ep in board signals statistics; do curl -fsS -L --retry 3 --retry-all-errors --max-time 30 "$WWW/api/engine/$ep?topcardpost=$nonce" -o "$VERIFY/$ep-after.json"; done
python3 - <<'PY'
import json,pathlib
r=pathlib.Path('/tmp/b46-topcard-deploy/verify')
for n in ['board','signals','statistics']:
 if json.load(open(r/f'{n}-after.json')).get('ok') is not True: raise SystemExit('POST_API_BAD:'+n)
print('POST_API_HEALTH_PASS')
PY

curl -fsSL --retry 3 --retry-all-errors --max-time 30 "$WWW/?topcardverify=$(date +%s%N)" -o "$VERIFY/www-index.html"
grep -Fq 'dashboard-v2-stage3.js?v=343-scorebar-details-20260929a' "$VERIFY/www-index.html" || { echo WWW_JS_CACHE_MISSING; exit 1; }
grep -Fq 'dashboard-v2-tune.css?v=343-scorebar-details-20260929a' "$VERIFY/www-index.html" || { echo WWW_CSS_CACHE_MISSING; exit 1; }
echo WWW_MARKERS_PASS

touch "$ROOT/deploy-core-pass"
echo BALL46_TOPCARD_DEPLOY_CORE_PASS
