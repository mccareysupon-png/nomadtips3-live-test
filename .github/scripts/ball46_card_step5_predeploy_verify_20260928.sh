#!/usr/bin/env bash
set -euo pipefail

WORKER="ball46-production"
DIRECT="https://ball46-production.mccarey-supon.workers.dev"
WWW="https://www.ball46.com"
EXPECTED_VERSION="4756de47-f316-42bf-970f-b4aee251862b"
EXPECTED_RUNTIME_SHA="f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed"
EXPECTED_BASE_CSS_SHA="54ca6c53ad6f6f7836e61efd8180030c74ea2827a42c180153c0fc15005e431d"
SRC="/tmp/b46-step5-source"
ROOT="/tmp/b46-step5"
BASE="$ROOT/before"
CAND="$ROOT/candidate"
RUNTIME="$ROOT/runtime-clean"
VERIFY="$ROOT/verify"
REPORT="$ROOT/report.txt"

rm -rf "$ROOT"
mkdir -p "$BASE" "$CAND" "$RUNTIME" "$VERIFY"

# 1) Lock CURRENT Production. This is read-only and intentionally hard-fails
# if Production has moved since the last fully verified Ball46 package.
python3 - <<'PY'
import base64, hashlib, json, os, pathlib, urllib.request
root=pathlib.Path('/tmp/b46-step5')
a=os.environ['CLOUDFLARE_ACCOUNT_ID']; t=os.environ['CLOUDFLARE_API_TOKEN']
h={'Authorization':f'Bearer {t}','Accept':'application/json'}
api=f'https://api.cloudflare.com/client/v4/accounts/{a}'
script='ball46-production'
def get(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers=h),timeout=30) as r:
        return json.load(r)
deps=get(f'{api}/workers/scripts/{script}/deployments')['result']['deployments']
if not deps: raise SystemExit('NO_CURRENT_DEPLOYMENT')
d=deps[0]; vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100:
    raise SystemExit('MIXED_OR_UNEXPECTED_DEPLOYMENT:'+json.dumps(vs,sort_keys=True))
vid=vs[0]['version_id']
expected='4756de47-f316-42bf-970f-b4aee251862b'
if vid!=expected: raise SystemExit(f'PRODUCTION_VERSION_MOVED:{vid}!={expected}')
root.joinpath('pre-version.txt').write_text(vid)
v=get(f'{api}/workers/workers/{script}/versions/{vid}?include=modules')['result']
mods=v.get('modules') or []
if len(mods)!=1 or mods[0].get('name')!='index.js' or not mods[0].get('content_base64'):
    raise SystemExit('RUNTIME_MODULE_SHAPE_CHANGED:'+repr([m.get('name') for m in mods]))
runtime=base64.b64decode(mods[0]['content_base64'])
sha=hashlib.sha256(runtime).hexdigest()
if sha!='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed':
    raise SystemExit('RUNTIME_SHA_CHANGED:'+sha)
root.joinpath('runtime-clean/index.js').write_bytes(runtime)
if v.get('compatibility_date')!='2026-09-09' or (v.get('compatibility_flags') or [])!=[]:
    raise SystemExit('COMPAT_CHANGED')
expect=[
 ('ASSETS','assets',None,None),
 ('ENGINE','service','nomadtips3-engine-343','production'),
 ('FULL_MARKET','service','nomadtips3-full-market-343-ball46','production'),
 ('HUB','service','nomadtips3-5usd-hub-343','production')]
got=sorted((b.get('name'),b.get('type'),b.get('service'),b.get('environment')) for b in (v.get('bindings') or []))
if got!=sorted(expect): raise SystemExit('BINDINGS_CHANGED:'+repr(got))
ac=(v.get('assets') or {}).get('config') or {}
exp_ac={'base_path':'/','html_handling':'none','not_found_handling':'none','run_worker_first':True}
if {k:ac.get(k) for k in exp_ac}!=exp_ac:
    raise SystemExit('ASSET_CONFIG_CHANGED:'+json.dumps(ac,sort_keys=True))
sraw=get(f'{api}/workers/scripts/{script}/schedules')['result']
schedules=sraw.get('schedules',[]) if isinstance(sraw,dict) else (sraw or [])
crons=[x.get('cron') for x in schedules if isinstance(x,dict) and x.get('cron')]
if crons!=['* * * * *']: raise SystemExit('CRON_CHANGED:'+repr(crons))
meta={
 'version_id':vid,'runtime_sha256':sha,'modules':[m.get('name') for m in mods],
 'compatibility_date':v.get('compatibility_date'),'compatibility_flags':v.get('compatibility_flags') or [],
 'bindings':v.get('bindings') or [],'assets':v.get('assets') or {},'crons':crons,
 'version_number':v.get('number'),'created_on':v.get('created_on'),'annotations':v.get('annotations') or {}}
root.joinpath('production-lock.json').write_text(json.dumps(meta,indent=2,sort_keys=True))
print('PRODUCTION_LOCK_OK',vid,sha,'modules=',[m.get('name') for m in mods])
PY

# 2) Prove the retained exact asset package is the SAME package served by
# CURRENT Production before it is used as the candidate base.
test -s "$SRC/live-paths.txt"
test -d "$SRC/after"
python3 - <<'PY'
from pathlib import Path
src=Path('/tmp/b46-step5-source')
paths=[x.strip() for x in src.joinpath('live-paths.txt').read_text().splitlines() if x.strip()]
if len(paths)!=79: raise SystemExit('BASELINE_PATH_COUNT_NOT_79:'+str(len(paths)))
if len(set(paths))!=79: raise SystemExit('BASELINE_PATH_DUPLICATES')
required={'index.html','dashboard-v2-tune.css','dashboard-v2.css','dashboard-v2-stage3.js','signal.js','statistics.js','odds-format-343.js'}
if not required.issubset(set(paths)):
    raise SystemExit('REQUIRED_ASSET_MISSING:'+repr(sorted(required-set(paths))))
missing=[p for p in paths if not src.joinpath('after',p).is_file()]
if missing: raise SystemExit('BASELINE_ARTIFACT_MISSING:'+repr(missing))
Path('/tmp/b46-step5/live-paths.txt').write_text('\n'.join(paths)+'\n')
print('BASELINE_ASSET_INVENTORY_OK',len(paths))
PY

nonce="${GITHUB_RUN_ID:-manual}-step5-current-$(date +%s%N)"
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  mkdir -p "$BASE/$(dirname "$rel")"
  code=$(curl -sS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' \
    -o "$BASE/$rel" -w '%{http_code}' "$DIRECT/$rel?step5-lock=$nonce-${RANDOM}") || true
  [ "$code" = 200 ] || { echo "CURRENT_ASSET_FETCH_FAILED:$code:$rel"; exit 1; }
  [ -s "$BASE/$rel" ] || { echo "CURRENT_ASSET_EMPTY:$rel"; exit 1; }
  cmp -s "$SRC/after/$rel" "$BASE/$rel" || { echo "CURRENT_ASSET_DRIFT:$rel"; exit 1; }
done < "$ROOT/live-paths.txt"

test "$(find "$BASE" -type f | wc -l | tr -d ' ')" = 79
BASE_CSS_SHA=$(sha256sum "$BASE/dashboard-v2-tune.css" | awk '{print $1}')
[ "$BASE_CSS_SHA" = "$EXPECTED_BASE_CSS_SHA" ] || { echo "TARGET_CSS_BASE_MOVED:$BASE_CSS_SHA"; exit 1; }
echo CURRENT_79_ASSETS_EXACTLY_MATCH_VERIFIED_PACKAGE

# 3) Read-only live flow health before any candidate staging.
nonce="${GITHUB_RUN_ID:-manual}-step5-health-$(date +%s%N)"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/board?step5=$nonce" -o "$VERIFY/board.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/signals?step5=$nonce" -o "$VERIFY/signals.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/statistics?step5=$nonce" -o "$VERIFY/stats.json"
node - <<'NODE'
const fs=require('fs');
const b=JSON.parse(fs.readFileSync('/tmp/b46-step5/verify/board.json'));
const s=JSON.parse(fs.readFileSync('/tmp/b46-step5/verify/signals.json'));
const t=JSON.parse(fs.readFileSync('/tmp/b46-step5/verify/stats.json'));
if(b?.ok!==true||!Array.isArray(b.fixtures)) throw Error('BOARD_HEALTH_BAD');
if(!Array.isArray(s.signals)) throw Error('SIGNALS_HEALTH_BAD');
if(t?.ok!==true||!Array.isArray(t.rows)) throw Error('STATS_HEALTH_BAD');
const out={fixtures:b.fixtures.length,signals:s.signals.length,stats:t.rows.length};
fs.writeFileSync('/tmp/b46-step5/flow-counts.json',JSON.stringify(out,null,2));
console.log('PRE_FLOW_OK',out);
NODE

# 4) Build candidate from CURRENT verified bytes and append the exact Step 3
# CSS delta. Nothing else is edited.
cp -a "$BASE/." "$CAND/"
grep -Fq 'BALL46 CARD REBUILD STEP3 PROTOTYPE 20260928' "$CAND/dashboard-v2-tune.css" && { echo STEP3_PATCH_ALREADY_PRESENT; exit 1; } || true
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

# 5) Hard one-file diff gate across the entire 79-file package.
python3 - <<'PY'
from pathlib import Path
import hashlib
r=Path('/tmp/b46-step5'); before=r/'before'; cand=r/'candidate'
paths=[x.strip() for x in r.joinpath('live-paths.txt').read_text().splitlines() if x.strip()]
changed=[]
for rel in paths:
    a=before/rel; b=cand/rel
    if not b.is_file(): raise SystemExit('CANDIDATE_MISSING:'+rel)
    if hashlib.sha256(a.read_bytes()).digest()!=hashlib.sha256(b.read_bytes()).digest(): changed.append(rel)
extra=sorted(p.relative_to(cand).as_posix() for p in cand.rglob('*') if p.is_file() and p.relative_to(cand).as_posix() not in set(paths))
if extra: raise SystemExit('CANDIDATE_EXTRA_FILES:'+repr(extra))
print('CHANGED_ASSETS=',changed)
if changed!=['dashboard-v2-tune.css']: raise SystemExit('ONE_FILE_DIFF_GATE_FAILED:'+repr(changed))
r.joinpath('changed-assets.txt').write_text('dashboard-v2-tune.css\n')
r.joinpath('candidate-css-sha.txt').write_text(hashlib.sha256((cand/'dashboard-v2-tune.css').read_bytes()).hexdigest()+'\n')
PY
echo ONE_FILE_DIFF_GATE_PASS

# 6) Clean runtime directory: ONLY index.js + wrangler.jsonc. Candidate assets
# live outside this directory to prevent the historical extra-module failure.
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
mapfile -t RUNTIME_FILES < <(find "$RUNTIME" -maxdepth 1 -type f -printf '%f\n' | sort)
[ "${#RUNTIME_FILES[@]}" -eq 2 ] || { printf 'RUNTIME_DIR_BAD:%s\n' "${RUNTIME_FILES[*]}"; exit 1; }
[ "${RUNTIME_FILES[0]}" = "index.js" ] && [ "${RUNTIME_FILES[1]}" = "wrangler.jsonc" ] || { printf 'RUNTIME_DIR_BAD:%s\n' "${RUNTIME_FILES[*]}"; exit 1; }
[ "$(sha256sum "$RUNTIME/index.js" | awk '{print $1}')" = "$EXPECTED_RUNTIME_SHA" ] || { echo CLEAN_RUNTIME_SHA_BAD; exit 1; }
echo CLEAN_RUNTIME_GATE_PASS

# 7) DRY RUN ONLY. There is deliberately no real wrangler deploy command in
# this verifier. Also fail if Wrangler attempts to attach extra modules.
cd "$RUNTIME"
npx --yes wrangler@4.92.0 deploy --dry-run --config wrangler.jsonc 2>&1 | tee "$VERIFY/dry-run.log"
! grep -Fq 'Attaching additional modules:' "$VERIFY/dry-run.log" || { echo DRY_RUN_EXTRA_MODULES; exit 1; }
grep -Eq 'Total Upload|--dry-run|dry run|dry-run|Your Worker has access to' "$VERIFY/dry-run.log" || true
echo DRY_RUN_PASS_NO_EXTRA_MODULES

# 8) Race guard: Production must still be EXACTLY the version locked at start.
python3 - <<'PY'
import json, os, pathlib, urllib.request
root=pathlib.Path('/tmp/b46-step5')
pre=root.joinpath('pre-version.txt').read_text().strip()
a=os.environ['CLOUDFLARE_ACCOUNT_ID']; t=os.environ['CLOUDFLARE_API_TOKEN']
h={'Authorization':f'Bearer {t}','Accept':'application/json'}
u=f'https://api.cloudflare.com/client/v4/accounts/{a}/workers/scripts/ball46-production/deployments'
with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r: d=json.load(r)['result']['deployments'][0]
vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100: raise SystemExit('RACE_DEPLOYMENT_SHAPE_CHANGED')
cur=vs[0]['version_id']
print('RACE_VERSION',pre,cur)
if cur!=pre: raise SystemExit('RACE_GUARD_FAILED_PRODUCTION_MOVED')
PY
echo RACE_GUARD_PASS

# 9) Final report. NO DEPLOY has occurred.
python3 - <<'PY'
import json, pathlib
r=pathlib.Path('/tmp/b46-step5')
lock=json.loads(r.joinpath('production-lock.json').read_text())
flow=json.loads(r.joinpath('flow-counts.json').read_text())
css=r.joinpath('candidate-css-sha.txt').read_text().strip()
report='\n'.join([
 'status=PASS',
 'deployment=no',
 'production_changed=no',
 f"production_version={lock['version_id']}",
 f"runtime_sha256={lock['runtime_sha256']}",
 'runtime_modules='+','.join(lock['modules']),
 f"compatibility_date={lock['compatibility_date']}",
 'compatibility_flags='+','.join(lock['compatibility_flags']),
 'bindings=ASSETS,ENGINE:nomadtips3-engine-343@production,FULL_MARKET:nomadtips3-full-market-343-ball46@production,HUB:nomadtips3-5usd-hub-343@production',
 'cron=* * * * *',
 'asset_count=79',
 'asset_package_match=current-production-exact',
 'changed_assets=dashboard-v2-tune.css',
 f'candidate_css_sha256={css}',
 'clean_runtime_dir=index.js,wrangler.jsonc',
 'dry_run=PASS',
 'extra_modules=none',
 'race_guard=PASS',
 f"flow_fixtures={flow['fixtures']}",
 f"flow_signals={flow['signals']}",
 f"flow_stats={flow['stats']}",
 'step3_delta=exact-validated-css-block',
 'step4_behavior=previously-PASS',
 'ready_for_deploy=yes-but-await-user-approval',
])+'\n'
r.joinpath('report.txt').write_text(report)
print(report,end='')
PY

echo BALL46_CARD_STEP5_PREDEPLOY_VERIFIED_NO_DEPLOY
