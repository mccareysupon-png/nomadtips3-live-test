#!/usr/bin/env bash
set -euo pipefail
WORKER='ball46-production'
DIRECT='https://ball46-production.mccarey-supon.workers.dev'
WWW='https://www.ball46.com'
SRC='/tmp/b46-divider-predeploy'
BASE="$SRC/live"; CAND="$SRC/candidate"; SAVED_RUNTIME="$SRC/runtime/index.js"; LOCK="$SRC/production-lock.json"
ROOT='/tmp/b46-divider-deploy'; RUNTIME="$ROOT/runtime"; VERIFY="$ROOT/verify"; POST="$ROOT/post"
rm -rf "$ROOT"; mkdir -p "$RUNTIME" "$VERIFY" "$POST"

[ -d "$BASE" ] && [ -d "$CAND" ] && [ -f "$SAVED_RUNTIME" ] && [ -f "$LOCK" ] || { echo PREDEPLOY_ARTIFACT_MISSING; exit 1; }
[ "$(find "$BASE" -type f | wc -l | tr -d ' ')" = '83' ] || { echo BASE_NOT_83; exit 1; }
[ "$(find "$CAND" -type f | wc -l | tr -d ' ')" = '83' ] || { echo CAND_NOT_83; exit 1; }

python3 - <<'PY'
from pathlib import Path
import hashlib,json
src=Path('/tmp/b46-divider-predeploy'); base=src/'live'; cand=src/'candidate'
paths=sorted(p.relative_to(base).as_posix() for p in base.rglob('*') if p.is_file())
changed=[r for r in paths if hashlib.sha256((base/r).read_bytes()).digest()!=hashlib.sha256((cand/r).read_bytes()).digest()]
print('DEPLOY_CHANGED_ASSETS',changed)
if changed!=['dashboard-v2-tune.css','index.html']: raise SystemExit('DEPLOY_DIFF_BAD')
css=(cand/'dashboard-v2-tune.css').read_text(); idx=(cand/'index.html').read_text()
if css.count('BALL46_SCOREBAR_DIVIDER_CAMOUFLAGE_20260929')!=1: raise SystemExit('DIVIDER_MARKER_BAD')
if 'border-right-color:transparent!important' not in css: raise SystemExit('DIVIDER_RULE_MISSING')
if 'dashboard-v2-tune.css?v=343-scorebar-divider-camo-20260929a' not in idx: raise SystemExit('CACHE_MARKER_MISSING')
for f in ['scorebar-win-20260929a.webp','scorebar-loss-20260929a.webp','scorebar-draw-20260929a.webp','scorebar-pending-20260929a.webp']:
 if hashlib.sha256((base/f).read_bytes()).digest()!=hashlib.sha256((cand/f).read_bytes()).digest(): raise SystemExit('IMAGE_CHANGED:'+f)
print('DEPLOY_ARTIFACT_GATE_PASS')
PY

# Confirm exact current Worker runtime/config still matches the predeploy lock.
python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
src=pathlib.Path('/tmp/b46-divider-predeploy'); lock=json.loads((src/'production-lock.json').read_text()); A=os.environ['CLOUDFLARE_ACCOUNT_ID']; T=os.environ['CLOUDFLARE_API_TOKEN']; h={'Authorization':f'Bearer {T}','Accept':'application/json'}; api=f'https://api.cloudflare.com/client/v4/accounts/{A}'; s='ball46-production'
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
print('PRE_PRODUCTION_LOCK_PASS',vid,sha)
PY

# Asset race guard: all current 83 Production assets must still equal the captured baseline.
nonce="${GITHUB_RUN_ID:-manual}-dividerrace83-$(date +%s%N)"
mkdir -p "$ROOT/race"
while IFS= read -r rel; do
 [ -n "$rel" ] || continue
 mkdir -p "$ROOT/race/$(dirname "$rel")"
 code=$(curl -sS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' -o "$ROOT/race/$rel" -w '%{http_code}' "$DIRECT/$rel?dividerrace=$nonce-${RANDOM}") || true
 [ "$code" = 200 ] || { echo "RACE_FETCH_FAILED:$code:$rel"; exit 1; }
 cmp -s "$ROOT/race/$rel" "$BASE/$rel" || { echo "PRODUCTION_ASSET_MOVED:$rel"; exit 1; }
done < <(cd "$BASE" && find . -type f -printf '%P\n' | sort)
echo RACE_83_ASSETS_PASS

nonce="${GITHUB_RUN_ID:-manual}-dividerprehealth-$(date +%s%N)"
for ep in board signals statistics; do curl -fsS -L --retry 3 --retry-all-errors --max-time 30 "$WWW/api/engine/$ep?dividerpre=$nonce" -o "$VERIFY/$ep-before.json"; done
python3 - <<'PY'
import json,pathlib
r=pathlib.Path('/tmp/b46-divider-deploy/verify')
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
grep -Fq 'Read 83 files from the assets directory' "$VERIFY/dry-run.log" || { echo DRY_NOT_83; exit 1; }
! grep -Fq 'Attaching additional modules:' "$VERIFY/dry-run.log" || { echo DRY_EXTRA_MODULES; exit 1; }
echo DEPLOY_DRY_RUN_PASS

# Final Worker-version race gate immediately before mutation.
python3 - <<'PY'
import json,os,urllib.request
lock=json.load(open('/tmp/b46-divider-predeploy/production-lock.json')); A=os.environ['CLOUDFLARE_ACCOUNT_ID']; T=os.environ['CLOUDFLARE_API_TOKEN']; h={'Authorization':f'Bearer {T}','Accept':'application/json'}; u=f'https://api.cloudflare.com/client/v4/accounts/{A}/workers/scripts/ball46-production/deployments'
with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:j=json.load(r)
vs=j['result']['deployments'][0].get('versions') or []; cur=vs[0]['version_id'] if len(vs)==1 and float(vs[0].get('percentage',0))==100 else 'MIXED'
print('FINAL_RACE_VERSION',cur)
if cur!=lock['version']: raise SystemExit('FINAL_RACE_MOVED:'+cur)
PY

npx --yes wrangler@4.92.0 deploy --config wrangler.jsonc 2>&1 | tee "$VERIFY/deploy.log"
! grep -Fq 'Attaching additional modules:' "$VERIFY/deploy.log" || { echo DEPLOY_EXTRA_MODULES; exit 1; }

# Immediately capture ownership of the Worker version created by this run before any later validation.
python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request,time
root=pathlib.Path('/tmp/b46-divider-deploy'); lock=json.load(open('/tmp/b46-divider-predeploy/production-lock.json')); A=os.environ['CLOUDFLARE_ACCOUNT_ID']; T=os.environ['CLOUDFLARE_API_TOKEN']; h={'Authorization':f'Bearer {T}','Accept':'application/json'}; api=f'https://api.cloudflare.com/client/v4/accounts/{A}'; s='ball46-production'
def get(u):
 with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:return json.load(r)
vid=None
for _ in range(15):
 d=get(f'{api}/workers/scripts/{s}/deployments')['result']['deployments'][0]; vs=d.get('versions') or []
 if len(vs)==1 and float(vs[0].get('percentage',0))==100 and vs[0]['version_id']!=lock['version']:
  vid=vs[0]['version_id']; break
 time.sleep(2)
if not vid: raise SystemExit('POST_NEW_VERSION_NOT_VISIBLE')
root.joinpath('deployed-version.txt').write_text(vid)
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

# Require every public asset to converge to the candidate byte-for-byte.
for attempt in $(seq 1 15); do
 rm -rf "$POST"; mkdir -p "$POST"; ok=1; nonce="${GITHUB_RUN_ID:-manual}-dividerpost${attempt}-$(date +%s%N)"
 while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  mkdir -p "$POST/$(dirname "$rel")"
  code=$(curl -sS -L --retry 2 --retry-all-errors --max-time 20 -H 'Cache-Control: no-cache' -o "$POST/$rel" -w '%{http_code}' "$DIRECT/$rel?dividerpost=$nonce-${RANDOM}") || true
  if [ "$code" != 200 ] || ! cmp -s "$POST/$rel" "$CAND/$rel"; then ok=0; break; fi
 done < <(cd "$CAND" && find . -type f -printf '%P\n' | sort)
 [ "$ok" = 1 ] && { echo POST_83_MATCH_CANDIDATE; break; }
 [ "$attempt" = 15 ] && { echo POST_PROPAGATION_NOT_CONVERGED; exit 1; }
 sleep 2
done

nonce="${GITHUB_RUN_ID:-manual}-dividerposthealth-$(date +%s%N)"
for ep in board signals statistics; do curl -fsS -L --retry 3 --retry-all-errors --max-time 30 "$WWW/api/engine/$ep?dividerpost=$nonce" -o "$VERIFY/$ep-after.json"; done
python3 - <<'PY'
import json,pathlib
r=pathlib.Path('/tmp/b46-divider-deploy/verify')
for n in ['board','signals','statistics']:
 if json.load(open(r/f'{n}-after.json')).get('ok') is not True: raise SystemExit('POST_API_BAD:'+n)
print('POST_API_HEALTH_PASS')
PY

curl -fsSL --retry 3 --retry-all-errors --max-time 30 "$WWW/?dividerverify=$(date +%s%N)" -o "$VERIFY/www-index.html"
grep -Fq 'dashboard-v2-tune.css?v=343-scorebar-divider-camo-20260929a' "$VERIFY/www-index.html" || { echo WWW_CACHE_MARKER_MISSING; exit 1; }
echo WWW_MARKER_PASS

touch "$ROOT/deploy-core-pass"
echo BALL46_SCOREBAR_DIVIDER_DEPLOY_CORE_PASS
