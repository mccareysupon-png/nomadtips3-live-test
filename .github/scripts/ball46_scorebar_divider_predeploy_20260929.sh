#!/usr/bin/env bash
set -euo pipefail
WORKER='ball46-production'
DIRECT='https://ball46-production.mccarey-supon.workers.dev'
WWW='https://www.ball46.com'
ROOT='/tmp/b46-divider-predeploy'
SEED='/tmp/b46-divider-seed/candidate'
LIVE="$ROOT/live"; CAND="$ROOT/candidate"; RUNTIME="$ROOT/runtime"; VERIFY="$ROOT/verify"
rm -rf "$ROOT"; mkdir -p "$LIVE" "$CAND" "$RUNTIME" "$VERIFY"

[ -d "$SEED" ] || { echo SEED_83_PATHLIST_MISSING; exit 1; }
[ "$(find "$SEED" -type f | wc -l | tr -d ' ')" = '83' ] || { echo SEED_PATHLIST_NOT_83; exit 1; }

git ls-remote origin refs/heads/main | awk '{print $1}' > "$ROOT/main-sha.txt"
echo "MAIN_SHA=$(cat "$ROOT/main-sha.txt")"

python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
root=pathlib.Path('/tmp/b46-divider-predeploy'); a=os.environ['CLOUDFLARE_ACCOUNT_ID']; t=os.environ['CLOUDFLARE_API_TOKEN']; h={'Authorization':f'Bearer {t}','Accept':'application/json'}; api=f'https://api.cloudflare.com/client/v4/accounts/{a}'; s='ball46-production'
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

nonce="${GITHUB_RUN_ID:-manual}-dividerfresh83-$(date +%s%N)"
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  mkdir -p "$LIVE/$(dirname "$rel")"
  code=$(curl -sS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' -o "$LIVE/$rel" -w '%{http_code}' "$DIRECT/$rel?dividerpre=$nonce-${RANDOM}") || true
  [ "$code" = 200 ] || { echo "LIVE_FETCH_FAILED:$code:$rel"; exit 1; }
done < <(cd "$SEED" && find . -type f -printf '%P\n' | sort)
[ "$(find "$LIVE" -type f | wc -l | tr -d ' ')" = '83' ] || { echo LIVE_NOT_83; exit 1; }
echo FRESH_83_FETCH_PASS

cp -a "$LIVE/." "$CAND/"
python3 - <<'PY'
from pathlib import Path
root=Path('/tmp/b46-divider-predeploy'); cand=root/'candidate'
css=cand/'dashboard-v2-tune.css'; idx=cand/'index.html'
s=css.read_text()
marker='/* BALL46_SCOREBAR_DIVIDER_CAMOUFLAGE_20260929 */'
if marker in s: raise SystemExit('DIVIDER_MARKER_ALREADY_PRESENT')
if 'BALL46_SCOREBAR_IMAGES_20260929' not in s: raise SystemExit('CURRENT_IMAGE_MARKER_MISSING')
append='''\n\n/* BALL46_SCOREBAR_DIVIDER_CAMOUFLAGE_20260929 */\n@media(min-width:761px){\n  .workspace-scorebar-grid>.workspace-scorebar-cell:not(:last-child){\n    border-right-color:transparent!important;\n  }\n}\n'''
css.write_text(s.rstrip()+append)
i=idx.read_text()
old='dashboard-v2-tune.css?v=343-scorebar-images-20260929a'
new='dashboard-v2-tune.css?v=343-scorebar-divider-camo-20260929a'
if i.count(old)!=1: raise SystemExit('CURRENT_TUNE_CACHE_REF_UNEXPECTED:'+str(i.count(old)))
idx.write_text(i.replace(old,new,1))
print('CANDIDATE_BUILT')
PY

python3 - <<'PY'
from pathlib import Path
import hashlib,re
root=Path('/tmp/b46-divider-predeploy'); live=root/'live'; cand=root/'candidate'
live_paths=sorted(p.relative_to(live).as_posix() for p in live.rglob('*') if p.is_file())
cand_paths=sorted(p.relative_to(cand).as_posix() for p in cand.rglob('*') if p.is_file())
added=sorted(set(cand_paths)-set(live_paths)); removed=sorted(set(live_paths)-set(cand_paths))
modified=sorted(r for r in set(live_paths)&set(cand_paths) if hashlib.sha256((live/r).read_bytes()).digest()!=hashlib.sha256((cand/r).read_bytes()).digest())
print('ADDED_ASSETS',added); print('MODIFIED_ASSETS',modified); print('REMOVED_ASSETS',removed)
if added or removed or modified!=['dashboard-v2-tune.css','index.html']: raise SystemExit('EXACT_TWO_GATE_BAD')
if len(cand_paths)!=83: raise SystemExit('CAND_NOT_83:'+str(len(cand_paths)))

lc=(live/'dashboard-v2-tune.css').read_text(); cc=(cand/'dashboard-v2-tune.css').read_text(); marker='/* BALL46_SCOREBAR_DIVIDER_CAMOUFLAGE_20260929 */'
if cc.count(marker)!=1: raise SystemExit('CSS_MARKER_COUNT_BAD')
pos=cc.index(marker)
if cc[:pos].rstrip()!=lc.rstrip(): raise SystemExit('CSS_NOT_LIVE_PLUS_APPEND')
tail=cc[pos:]
if 'border-right-color:transparent!important' not in tail: raise SystemExit('TRANSPARENT_BORDER_RULE_MISSING')
# Keep media-query min-width allowed; reject only geometry-changing declarations inside the appended patch.
forbidden_decl=re.compile(r'(?m)^\s*(?:border-right(?:-width|-style)?|gap|column-gap|row-gap|display|width|height)\s*:')
m=forbidden_decl.search(tail)
if m: raise SystemExit('GEOMETRY_MUTATION_FORBIDDEN:'+m.group(0).strip())
print('CSS_SCOPE_GATE_PASS')

li=(live/'index.html').read_text(); ci=(cand/'index.html').read_text()
old='dashboard-v2-tune.css?v=343-scorebar-images-20260929a'; new='dashboard-v2-tune.css?v=343-scorebar-divider-camo-20260929a'
if li.count(old)!=1 or ci.count(new)!=1: raise SystemExit('INDEX_CACHE_MARKER_BAD')
if ci.replace(new,old,1)!=li: raise SystemExit('INDEX_DIFF_NOT_CACHE_BUSTER_ONLY')
print('INDEX_SCOPE_GATE_PASS')

for f in ['scorebar-win-20260929a.webp','scorebar-loss-20260929a.webp','scorebar-draw-20260929a.webp','scorebar-pending-20260929a.webp']:
  if hashlib.sha256((live/f).read_bytes()).digest()!=hashlib.sha256((cand/f).read_bytes()).digest(): raise SystemExit('IMAGE_CHANGED:'+f)
print('STATUS_IMAGES_UNCHANGED_PASS')
PY

nonce="${GITHUB_RUN_ID:-manual}-dividerhealth-$(date +%s%N)"
for ep in board signals statistics; do curl -fsS -L --retry 3 --retry-all-errors --max-time 30 "$WWW/api/engine/$ep?dividerpre=$nonce" -o "$VERIFY/$ep.json"; done
python3 - <<'PY'
import json,pathlib
r=pathlib.Path('/tmp/b46-divider-predeploy/verify')
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

echo BALL46_SCOREBAR_DIVIDER_PREDEPLOY_PASS
