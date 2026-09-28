#!/usr/bin/env bash
set -euo pipefail

WORKER="ball46-production"
DIRECT="https://ball46-production.mccarey-supon.workers.dev"
WWW="https://www.ball46.com"
EXPECTED_VERSION="67295490-765a-4a0d-9e2d-5dca65ad2d9d"
EXPECTED_RUNTIME_SHA="f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed"
EXPECTED_BASE_CSS_SHA="54ca6c53ad6f6f7836e61efd8180030c74ea2827a42c180153c0fc15005e431d"
SRCROOT="/tmp/b46-step5-source"
SNAP="$SRCROOT/current-live"
PATHS="$SRCROOT/reference-live-paths.txt"
ROOT="/tmp/b46-step5"
BEFORE="$ROOT/before"
CAND="$ROOT/candidate"
RUNTIME="$ROOT/runtime-clean"
VERIFY="$ROOT/verify"
rm -rf "$ROOT"
mkdir -p "$BEFORE" "$CAND" "$RUNTIME" "$VERIFY"

test -d "$SNAP" || { echo CURRENT_V226_SNAPSHOT_MISSING; exit 1; }
test -s "$PATHS" || { echo CURRENT_V226_PATH_MAP_MISSING; exit 1; }

# 1) Lock current Production to the exact v226 package captured by the
# read-only diagnostic. Fail closed if anything has moved.
python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
r=pathlib.Path('/tmp/b46-step5');a=os.environ['CLOUDFLARE_ACCOUNT_ID'];t=os.environ['CLOUDFLARE_API_TOKEN']
h={'Authorization':f'Bearer {t}','Accept':'application/json'};api=f'https://api.cloudflare.com/client/v4/accounts/{a}';script='ball46-production'
def get(u):
  with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as x:return json.load(x)
deps=get(f'{api}/workers/scripts/{script}/deployments')['result']['deployments']
if not deps:raise SystemExit('NO_CURRENT_DEPLOYMENT')
d=deps[0];vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100:raise SystemExit('MIXED_DEPLOYMENT:'+json.dumps(vs,sort_keys=True))
vid=vs[0]['version_id'];expected='67295490-765a-4a0d-9e2d-5dca65ad2d9d'
if vid!=expected:raise SystemExit(f'PRODUCTION_MOVED:{vid}!={expected}')
r.joinpath('pre-version.txt').write_text(vid+'\n')
v=get(f'{api}/workers/workers/{script}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or []
if len(mods)!=1 or mods[0].get('name')!='index.js' or not mods[0].get('content_base64'):
  raise SystemExit('RUNTIME_MODULE_SHAPE_CHANGED:'+repr([m.get('name') for m in mods]))
b=base64.b64decode(mods[0]['content_base64']);sha=hashlib.sha256(b).hexdigest()
if sha!='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed':raise SystemExit('RUNTIME_SHA_CHANGED:'+sha)
r.joinpath('runtime-clean/index.js').write_bytes(b)
if v.get('compatibility_date')!='2026-09-09' or (v.get('compatibility_flags') or []):raise SystemExit('COMPAT_CHANGED')
expect=[('ASSETS','assets',None,None),('ENGINE','service','nomadtips3-engine-343','production'),('FULL_MARKET','service','nomadtips3-full-market-343-ball46','production'),('HUB','service','nomadtips3-5usd-hub-343','production')]
got=sorted((x.get('name'),x.get('type'),x.get('service'),x.get('environment')) for x in (v.get('bindings') or []))
if got!=sorted(expect):raise SystemExit('BINDINGS_CHANGED:'+repr(got))
ac=(v.get('assets') or {}).get('config') or {};exp={'base_path':'/','html_handling':'none','not_found_handling':'none','run_worker_first':True}
if {k:ac.get(k) for k in exp}!=exp:raise SystemExit('ASSET_CONFIG_CHANGED:'+repr(ac))
s=get(f'{api}/workers/scripts/{script}/schedules')['result'];ss=s.get('schedules',[]) if isinstance(s,dict) else (s or [])
crons=[x.get('cron') for x in ss if isinstance(x,dict) and x.get('cron')]
if crons!=['* * * * *']:raise SystemExit('CRON_CHANGED:'+repr(crons))
meta={'version_id':vid,'version_number':v.get('number'),'created_on':v.get('created_on'),'annotations':v.get('annotations') or {},'runtime_sha256':sha,'modules':['index.js'],'compatibility_date':v.get('compatibility_date'),'compatibility_flags':v.get('compatibility_flags') or [],'bindings':v.get('bindings') or [],'assets':v.get('assets') or {},'crons':crons}
r.joinpath('production-lock.json').write_text(json.dumps(meta,indent=2,sort_keys=True))
print('PRODUCTION_LOCK_OK',vid,'number=',v.get('number'),'runtime=',sha)
PY

# 2) Exact inventory gate. v226 provenance: the creating Wrangler deployment
# read exactly these 79 assets and post-verified all 79 against its target.
python3 - <<'PY'
from pathlib import Path
p=Path('/tmp/b46-step5-source/reference-live-paths.txt');xs=[x.strip() for x in p.read_text().splitlines() if x.strip()]
if len(xs)!=79 or len(set(xs))!=79:raise SystemExit('PATH_MAP_NOT_79')
need={'index.html','dashboard-v2-tune.css','dashboard-v2.css','dashboard-v2-stage3.js','odds-format-343.js','signal.js','statistics.js','full-market-bookmaker-343.js'}
if not need.issubset(set(xs)):raise SystemExit('REQUIRED_PATH_MISSING:'+repr(sorted(need-set(xs))))
s=Path('/tmp/b46-step5-source/current-live')
missing=[x for x in xs if not (s/x).is_file()]
if missing:raise SystemExit('SNAPSHOT_MISSING:'+repr(missing))
Path('/tmp/b46-step5/live-paths.txt').write_text('\n'.join(xs)+'\n')
print('EXACT_INVENTORY_GATE_OK',len(xs))
PY

# 3) Re-fetch every current asset and require byte-for-byte equality to the
# fresh v226 diagnostic snapshot before building a candidate.
nonce="${GITHUB_RUN_ID:-manual}-step5-lock-$(date +%s%N)"
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  mkdir -p "$BEFORE/$(dirname "$rel")"
  code=$(curl -sS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' -o "$BEFORE/$rel" -w '%{http_code}' "$DIRECT/$rel?step5-final=$nonce-${RANDOM}") || true
  [ "$code" = 200 ] || { echo "CURRENT_ASSET_FETCH_FAILED:$code:$rel"; exit 1; }
  [ -s "$BEFORE/$rel" ] || { echo "CURRENT_ASSET_EMPTY:$rel"; exit 1; }
  cmp -s "$SNAP/$rel" "$BEFORE/$rel" || { echo "CURRENT_ASSET_DRIFT:$rel"; exit 1; }
done < "$ROOT/live-paths.txt"
[ "$(find "$BEFORE" -type f | wc -l | tr -d ' ')" = 79 ] || { echo CURRENT_FETCH_COUNT_BAD; exit 1; }
CSS_SHA=$(sha256sum "$BEFORE/dashboard-v2-tune.css"|awk '{print $1}')
[ "$CSS_SHA" = "$EXPECTED_BASE_CSS_SHA" ] || { echo "TARGET_CSS_MOVED:$CSS_SHA"; exit 1; }
echo CURRENT_79_ASSETS_LOCKED_EXACT
echo TARGET_CSS_BASELINE_OK="$CSS_SHA"

# 4) Read-only live flow health before candidate work.
nonce="${GITHUB_RUN_ID:-manual}-health-$(date +%s%N)"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/board?step5=$nonce" -o "$VERIFY/board.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/signals?step5=$nonce" -o "$VERIFY/signals.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/statistics?step5=$nonce" -o "$VERIFY/stats.json"
node - <<'NODE'
const fs=require('fs');const b=JSON.parse(fs.readFileSync('/tmp/b46-step5/verify/board.json')),s=JSON.parse(fs.readFileSync('/tmp/b46-step5/verify/signals.json')),t=JSON.parse(fs.readFileSync('/tmp/b46-step5/verify/stats.json'));if(b?.ok!==true||!Array.isArray(b.fixtures)||!Array.isArray(s.signals)||t?.ok!==true||!Array.isArray(t.rows))throw Error('LIVE_FLOW_BAD');const out={fixtures:b.fixtures.length,signals:s.signals.length,stats:t.rows.length};fs.writeFileSync('/tmp/b46-step5/flow-counts.json',JSON.stringify(out,null,2));console.log('PRE_FLOW_OK',out);
NODE

# 5) Candidate starts from CURRENT Production bytes. Append exactly the Step 3
# CSS block already validated in Step 3 visual tests and Step 4 behavior tests.
cp -a "$BEFORE/." "$CAND/"
! grep -Fq 'BALL46 CARD REBUILD STEP3 PROTOTYPE 20260928' "$CAND/dashboard-v2-tune.css" || { echo STEP3_PATCH_ALREADY_PRESENT; exit 1; }
cat >> "$CAND/dashboard-v2-tune.css" <<'CSS'

/* BALL46 CARD REBUILD STEP3 PROTOTYPE 20260928
   CSS-only desktop prototype. Preserve the current row DOM contract and all data wiring. */
@media (min-width:901px){
  .match-row .score-cell{
    min-width:0;
    display:grid;
    grid-template-columns:30px minmax(0,1fr);
    grid-template-rows:repeat(2,minmax(0,1fr));
    column-gap:7px;
    align-items:center;
    text-align:center;
  }
  .match-row .score-cell>strong:nth-of-type(1){grid-column:1;grid-row:1}
  .match-row .score-cell>strong:nth-of-type(2){grid-column:1;grid-row:2}
  .match-row .score-cell>small:not(.half-score){
    grid-column:2;grid-row:1;align-self:end;margin:0 0 2px;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left;font-size:8px;line-height:1.05;
  }
  .match-row .score-cell>.half-score{
    grid-column:2;grid-row:2;align-self:start;margin:2px 0 0;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left;font-size:7px;line-height:1.05;
  }
  .match-row .signal-cell.prediction-live{
    display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;
    min-width:0;padding-left:12px;
  }
  .match-row .signal-cell.prediction-live .pred-main{
    display:block;width:100%;white-space:normal;overflow:visible;text-overflow:clip;
    overflow-wrap:anywhere;text-align:center;font-size:8px;line-height:1.18;
  }
  .match-row .signal-cell.prediction-live .pred-sub{
    display:block;width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
    text-align:center;font-size:7px;line-height:1.05;
  }
}
@media (min-width:1181px){
  .match-row{grid-template-columns:minmax(0,1fr) 92px 118px 118px 118px 128px;gap:6px}
}
@media (min-width:901px) and (max-width:1180px){
  .match-row{grid-template-columns:minmax(0,1fr) 78px 118px 118px 118px 96px;gap:5px}
  .match-row .score-cell{grid-template-columns:27px minmax(0,1fr);column-gap:5px}
}
CSS

# 6) Hard diff gate across the complete 79-file package.
python3 - <<'PY'
from pathlib import Path
import hashlib
r=Path('/tmp/b46-step5');a=r/'before';b=r/'candidate';paths=[x.strip() for x in r.joinpath('live-paths.txt').read_text().splitlines() if x.strip()];changed=[]
for rel in paths:
  if not (b/rel).is_file():raise SystemExit('CANDIDATE_MISSING:'+rel)
  if hashlib.sha256((a/rel).read_bytes()).digest()!=hashlib.sha256((b/rel).read_bytes()).digest():changed.append(rel)
extra=sorted(p.relative_to(b).as_posix() for p in b.rglob('*') if p.is_file() and p.relative_to(b).as_posix() not in set(paths))
if extra:raise SystemExit('CANDIDATE_EXTRA_FILES:'+repr(extra))
print('CHANGED_ASSETS=',changed)
if changed!=['dashboard-v2-tune.css']:raise SystemExit('ONE_FILE_DIFF_GATE_FAILED:'+repr(changed))
r.joinpath('changed-assets.txt').write_text('dashboard-v2-tune.css\n');r.joinpath('candidate-css-sha.txt').write_text(hashlib.sha256((b/'dashboard-v2-tune.css').read_bytes()).hexdigest()+'\n')
PY
echo ONE_FILE_DIFF_GATE_PASS

# 7) Clean runtime directory: exactly index.js + wrangler.jsonc. Assets stay
# outside it. This prevents accidental attachment of snapshots/logs as modules.
cat > "$RUNTIME/wrangler.jsonc" <<EOF
{
  "name":"ball46-production",
  "main":"./index.js",
  "compatibility_date":"2026-09-09",
  "no_bundle":true,
  "services":[
    {"binding":"ENGINE","service":"nomadtips3-engine-343","environment":"production"},
    {"binding":"FULL_MARKET","service":"nomadtips3-full-market-343-ball46","environment":"production"},
    {"binding":"HUB","service":"nomadtips3-5usd-hub-343","environment":"production"}
  ],
  "assets":{"directory":"$CAND","binding":"ASSETS","html_handling":"none","not_found_handling":"none","run_worker_first":true},
  "triggers":{"crons":["* * * * *"]}
}
EOF
mapfile -t RF < <(find "$RUNTIME" -maxdepth 1 -type f -printf '%f\n'|sort)
[ "${#RF[@]}" -eq 2 ] && [ "${RF[0]}" = index.js ] && [ "${RF[1]}" = wrangler.jsonc ] || { echo "RUNTIME_DIR_BAD:${RF[*]}"; exit 1; }
[ "$(sha256sum "$RUNTIME/index.js"|awk '{print $1}')" = "$EXPECTED_RUNTIME_SHA" ] || { echo CLEAN_RUNTIME_SHA_BAD; exit 1; }
echo CLEAN_RUNTIME_GATE_PASS

# 8) DRY RUN ONLY. This verifier intentionally contains no real deploy command.
cd "$RUNTIME"
npx --yes wrangler@4.92.0 deploy --dry-run --config wrangler.jsonc 2>&1 | tee "$VERIFY/dry-run.log"
! grep -Fq 'Attaching additional modules:' "$VERIFY/dry-run.log" || { echo DRY_RUN_EXTRA_MODULES; exit 1; }
grep -Fq 'Read 79 files from the assets directory' "$VERIFY/dry-run.log" || { echo DRY_RUN_ASSET_COUNT_UNCONFIRMED; exit 1; }
grep -Fq -- '--dry-run: exiting now.' "$VERIFY/dry-run.log" || { echo DRY_RUN_EXIT_MARKER_MISSING; exit 1; }
echo DRY_RUN_PASS_79_ASSETS_NO_EXTRA_MODULES

# 9) Race guard: Production must still be the exact v226 locked at start.
python3 - <<'PY'
import json,os,pathlib,urllib.request
r=pathlib.Path('/tmp/b46-step5');pre=r.joinpath('pre-version.txt').read_text().strip();a=os.environ['CLOUDFLARE_ACCOUNT_ID'];t=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {t}','Accept':'application/json'};u=f'https://api.cloudflare.com/client/v4/accounts/{a}/workers/scripts/ball46-production/deployments'
with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as x:d=json.load(x)['result']['deployments'][0]
vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100:raise SystemExit('RACE_DEPLOYMENT_SHAPE_CHANGED')
cur=vs[0]['version_id'];print('RACE_VERSION',pre,cur)
if cur!=pre:raise SystemExit('RACE_GUARD_FAILED_PRODUCTION_MOVED')
r.joinpath('race-guard.txt').write_text('PASS '+cur+'\n')
PY
echo RACE_GUARD_PASS

# 10) Final no-deploy report.
python3 - <<'PY'
import json,pathlib
r=pathlib.Path('/tmp/b46-step5');m=json.loads(r.joinpath('production-lock.json').read_text());f=json.loads(r.joinpath('flow-counts.json').read_text());css=r.joinpath('candidate-css-sha.txt').read_text().strip()
text='\n'.join(['status=PASS','deployment=no','production_changed_by_step5=no',f"production_version={m['version_id']}",f"production_version_number={m['version_number']}",f"runtime_sha256={m['runtime_sha256']}",'runtime_modules=index.js','compatibility_date=2026-09-09','compatibility_flags=none','bindings=ASSETS,ENGINE:nomadtips3-engine-343@production,FULL_MARKET:nomadtips3-full-market-343-ball46@production,HUB:nomadtips3-5usd-hub-343@production','cron=* * * * *','asset_inventory=79 exact current-v226 paths','snapshot_match=PASS','target_css_baseline_sha256=54ca6c53ad6f6f7836e61efd8180030c74ea2827a42c180153c0fc15005e431d','changed_assets=dashboard-v2-tune.css',f'candidate_css_sha256={css}','clean_runtime_dir=index.js,wrangler.jsonc','dry_run=PASS','dry_run_assets=79','extra_modules=none','race_guard=PASS',f"flow_fixtures={f['fixtures']}",f"flow_signals={f['signals']}",f"flow_stats={f['stats']}",'step3_visual_validation=previously-PASS','step4_behavior_validation=previously-PASS','ready_for_deploy=yes','await_user_approval=yes'])+'\n';r.joinpath('report.txt').write_text(text);print(text,end='')
PY

echo BALL46_CARD_STEP5_PREDEPLOY_VERIFIED_NO_DEPLOY
