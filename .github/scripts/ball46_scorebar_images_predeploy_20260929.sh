#!/usr/bin/env bash
set -euo pipefail
WORKER='ball46-production'
DIRECT='https://ball46-production.mccarey-supon.workers.dev'
WWW='https://www.ball46.com'
ROOT='/tmp/b46-scorebar-images-predeploy'
SEED='/tmp/b46-seed/b46-topcard-deploy/post'
REPO_CAND='ball46-scorebar-images-candidate-20260929'
LIVE="$ROOT/live"; CAND="$ROOT/candidate"; RUNTIME="$ROOT/runtime"; VERIFY="$ROOT/verify"
rm -rf "$ROOT"; mkdir -p "$LIVE" "$CAND" "$RUNTIME" "$VERIFY"

[ -d "$SEED" ] || { echo SEED_PATHLIST_MISSING; exit 1; }
[ "$(find "$SEED" -type f | wc -l | tr -d ' ')" = '79' ] || { echo SEED_PATHLIST_NOT_79; exit 1; }
for f in scorebar-win-20260929a.webp scorebar-loss-20260929a.webp scorebar-draw-20260929a.webp scorebar-pending-20260929a.webp; do
  [ -f "$f" ] || { echo "NEW_ASSET_MISSING:$f"; exit 1; }
done

python3 .github/scripts/ball46_scorebar_images_build_20260929.py
for f in dashboard-v2-tune.css index.html; do [ -f "$REPO_CAND/$f" ] || { echo "REPO_CANDIDATE_MISSING:$f"; exit 1; }; done

git ls-remote origin refs/heads/main | awk '{print $1}' > "$ROOT/main-sha.txt"
echo "MAIN_SHA=$(cat "$ROOT/main-sha.txt")"

python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
root=pathlib.Path('/tmp/b46-scorebar-images-predeploy'); a=os.environ['CLOUDFLARE_ACCOUNT_ID']; t=os.environ['CLOUDFLARE_API_TOKEN']; h={'Authorization':f'Bearer {t}','Accept':'application/json'}; api=f'https://api.cloudflare.com/client/v4/accounts/{a}'; s='ball46-production'
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
lock={'version':vid,'runtime_sha256':sha,'bindings':got,'compatibility_date':v.get('compatibility_date'),'compatibility_flags':v.get('compatibility_flags') or [],'assets_config':ac,'crons':crons,'deployment_id':dep.get('id'),'deployment_created_on':dep.get('created_on')}
root.joinpath('production-lock.json').write_text(json.dumps(lock,indent=2,sort_keys=True))
print('PRODUCTION_LOCK_PASS',vid,sha)
PY

nonce="${GITHUB_RUN_ID:-manual}-fresh79-$(date +%s%N)"
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  mkdir -p "$LIVE/$(dirname "$rel")"
  code=$(curl -sS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' -o "$LIVE/$rel" -w '%{http_code}' "$DIRECT/$rel?scorebarimgpre=$nonce-${RANDOM}") || true
  [ "$code" = 200 ] || { echo "LIVE_FETCH_FAILED:$code:$rel"; exit 1; }
done < <(cd "$SEED" && find . -type f -printf '%P\n' | sort)
[ "$(find "$LIVE" -type f | wc -l | tr -d ' ')" = '79' ] || { echo LIVE_NOT_79; exit 1; }
echo FRESH_79_FETCH_PASS

cp -a "$LIVE/." "$CAND/"
cp "$REPO_CAND/dashboard-v2-tune.css" "$CAND/dashboard-v2-tune.css"
cp "$REPO_CAND/index.html" "$CAND/index.html"
for f in scorebar-win-20260929a.webp scorebar-loss-20260929a.webp scorebar-draw-20260929a.webp scorebar-pending-20260929a.webp; do cp "$f" "$CAND/$f"; done

python3 - <<'PY'
from pathlib import Path
import hashlib,re
root=Path('/tmp/b46-scorebar-images-predeploy'); live=root/'live'; cand=root/'candidate'
live_paths=sorted(p.relative_to(live).as_posix() for p in live.rglob('*') if p.is_file())
cand_paths=sorted(p.relative_to(cand).as_posix() for p in cand.rglob('*') if p.is_file())
added=sorted(set(cand_paths)-set(live_paths)); removed=sorted(set(live_paths)-set(cand_paths))
modified=sorted(r for r in set(live_paths)&set(cand_paths) if hashlib.sha256((live/r).read_bytes()).digest()!=hashlib.sha256((cand/r).read_bytes()).digest())
print('ADDED_ASSETS',added); print('MODIFIED_ASSETS',modified); print('REMOVED_ASSETS',removed)
expected_added=['scorebar-draw-20260929a.webp','scorebar-loss-20260929a.webp','scorebar-pending-20260929a.webp','scorebar-win-20260929a.webp']
if added!=expected_added or modified!=['dashboard-v2-tune.css','index.html'] or removed: raise SystemExit('EXACT_SIX_GATE_BAD')
if len(cand_paths)!=83: raise SystemExit('CAND_NOT_83:'+str(len(cand_paths)))

lc=(live/'dashboard-v2-tune.css').read_text(); cc=(cand/'dashboard-v2-tune.css').read_text(); marker='/* BALL46_SCOREBAR_IMAGES_20260929'
if cc.count(marker)!=1: raise SystemExit('CSS_MARKER_COUNT_BAD')
pos=cc.index(marker)
if cc[:pos].rstrip()!=lc.rstrip(): raise SystemExit('CSS_NOT_LIVE_PLUS_APPEND')
for sel,file in [('outcome-win','scorebar-win-20260929a.webp'),('outcome-loss','scorebar-loss-20260929a.webp'),('outcome-draw','scorebar-draw-20260929a.webp'),('workspace-scorebar-pending','scorebar-pending-20260929a.webp')]:
  if sel not in cc or file not in cc: raise SystemExit('CSS_MAPPING_MISSING:'+sel+':'+file)
if 'background-size:cover!important' not in cc or 'background-position:72% center!important' not in cc: raise SystemExit('CSS_POSITIONING_MISSING')
print('CSS_SCOPE_GATE_PASS')

li=(live/'index.html').read_text(); ci=(cand/'index.html').read_text()
def strip_edge(s):
  s=re.sub(r'<script[^>]*cloudflareinsights[^>]*>.*?</script>','',s,flags=re.I|re.S)
  s=re.sub(r'<script[^>]*static\.cloudflareinsights\.com[^>]*>.*?</script>','',s,flags=re.I|re.S)
  return s
li=strip_edge(li)
pat=r'(dashboard-v2-tune\.css\?v=)([^"\']+)'
m=list(re.finditer(pat,li)); n=list(re.finditer(pat,ci))
if len(m)!=1 or len(n)!=1: raise SystemExit('TUNE_REF_COUNT_BAD')
restored=ci[:n[0].start(2)]+m[0].group(2)+ci[n[0].end(2):]
if restored!=li: raise SystemExit('INDEX_DIFF_NOT_CACHE_BUSTER_ONLY')
if n[0].group(2)!='343-scorebar-images-20260929a': raise SystemExit('INDEX_NEW_CACHE_BAD')
print('INDEX_SCOPE_GATE_PASS')

for f in expected_added:
  b=(cand/f).read_bytes()
  # Browser preview already rendered these exact repo assets at 1920/1440/1000. Here validate file structure, not compression ratio.
  if len(b)<512 or len(b)>200000: raise SystemExit('IMAGE_SIZE_SUSPICIOUS:'+f+':'+str(len(b)))
  if not (b[:4]==b'RIFF' and b[8:12]==b'WEBP'): raise SystemExit('NOT_WEBP:'+f)
  print('IMAGE_SHA',f,len(b),hashlib.sha256(b).hexdigest())
PY

nonce="${GITHUB_RUN_ID:-manual}-health-$(date +%s%N)"
for ep in board signals statistics; do curl -fsS -L --retry 3 --retry-all-errors --max-time 30 "$WWW/api/engine/$ep?scorebarimgpre=$nonce" -o "$VERIFY/$ep.json"; done
python3 - <<'PY'
import json,pathlib
r=pathlib.Path('/tmp/b46-scorebar-images-predeploy/verify')
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
grep -Fq 'Read 83 files from the assets directory' "$VERIFY/dry-run.log" || { echo DRY_NOT_83; exit 1; }
! grep -Fq 'Attaching additional modules:' "$VERIFY/dry-run.log" || { echo DRY_EXTRA_MODULES; exit 1; }
echo PREDEPLOY_DRY_RUN_PASS

echo BALL46_SCOREBAR_IMAGES_PREDEPLOY_PASS
