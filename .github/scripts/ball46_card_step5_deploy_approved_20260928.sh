#!/usr/bin/env bash
set -euo pipefail

WORKER="ball46-production"
DIRECT="https://ball46-production.mccarey-supon.workers.dev"
WWW="https://www.ball46.com"
EXPECTED_VERSION="7d23e1dc-df40-488b-bde5-8f456dcfa76a"
EXPECTED_RUNTIME_SHA="f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed"
EXPECTED_BASE_CSS_SHA="54ca6c53ad6f6f7836e61efd8180030c74ea2827a42c180153c0fc15005e431d"
EXPECTED_CAND_CSS_SHA="239cbefc12143fcae2845f8ef9de5ff6855e9f2dd320c1b6704d88eeeecfe79f"
SRC="/tmp/b46-step5-approved"
ROOT="/tmp/b46-step5-deploy"
LIVE_PRE="$ROOT/live-pre"
CAND="$ROOT/candidate"
LIVE_POST="$ROOT/live-post"
RUNTIME="$ROOT/runtime-clean"
VERIFY="$ROOT/verify"
REPORT="$ROOT/report.txt"
rm -rf "$ROOT"
mkdir -p "$LIVE_PRE" "$CAND" "$LIVE_POST" "$RUNTIME" "$VERIFY"

# 0) Validate the exact Step5 package already approved by the user.
test -s "$SRC/report.txt"
test -s "$SRC/live-paths.txt"
test -d "$SRC/before"
test -d "$SRC/candidate"
grep -Fxq 'status=PASS' "$SRC/report.txt"
grep -Fxq 'ready_for_deploy=yes' "$SRC/report.txt"
grep -Fxq 'deployment=no' "$SRC/report.txt"
grep -Fxq 'changed_assets=dashboard-v2-tune.css' "$SRC/report.txt"
[ "$(sha256sum "$SRC/before/dashboard-v2-tune.css" | awk '{print $1}')" = "$EXPECTED_BASE_CSS_SHA" ]
[ "$(sha256sum "$SRC/candidate/dashboard-v2-tune.css" | awk '{print $1}')" = "$EXPECTED_CAND_CSS_SHA" ]
grep -Fq 'BALL46 CARD REBUILD STEP3 PROTOTYPE 20260928' "$SRC/candidate/dashboard-v2-tune.css"
python3 - <<'PY'
from pathlib import Path
import hashlib
r=Path('/tmp/b46-step5-approved')
paths=[x.strip() for x in (r/'live-paths.txt').read_text().splitlines() if x.strip()]
if len(paths)!=79 or len(set(paths))!=79: raise SystemExit('APPROVED_INVENTORY_NOT_79')
changed=[]
for rel in paths:
    a=r/'before'/rel; b=r/'candidate'/rel
    if not a.is_file() or not b.is_file(): raise SystemExit('APPROVED_FILE_MISSING:'+rel)
    if hashlib.sha256(a.read_bytes()).digest()!=hashlib.sha256(b.read_bytes()).digest(): changed.append(rel)
print('APPROVED_CHANGED_ASSETS',changed)
if changed!=['dashboard-v2-tune.css']: raise SystemExit('APPROVED_DIFF_NOT_ONE_FILE:'+repr(changed))
PY
echo APPROVED_ARTIFACT_GATE_PASS

# 1) Lock CURRENT Production metadata and runtime before reading any assets.
python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
root=pathlib.Path('/tmp/b46-step5-deploy');a=os.environ['CLOUDFLARE_ACCOUNT_ID'];t=os.environ['CLOUDFLARE_API_TOKEN']
h={'Authorization':f'Bearer {t}','Accept':'application/json'};api=f'https://api.cloudflare.com/client/v4/accounts/{a}';script='ball46-production'
def get(u):
  with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as x:return json.load(x)
deps=get(f'{api}/workers/scripts/{script}/deployments')['result']['deployments']
if not deps: raise SystemExit('NO_CURRENT_DEPLOYMENT')
vs=deps[0].get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100: raise SystemExit('MIXED_OR_UNEXPECTED_DEPLOYMENT:'+repr(vs))
vid=vs[0]['version_id']; expected='7d23e1dc-df40-488b-bde5-8f456dcfa76a'
print('PRE_CURRENT_VERSION',vid)
if vid!=expected: raise SystemExit('PRODUCTION_VERSION_MOVED:'+vid+'!='+expected)
v=get(f'{api}/workers/workers/{script}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or []
if len(mods)!=1 or mods[0].get('name')!='index.js' or not mods[0].get('content_base64'): raise SystemExit('PRE_RUNTIME_MODULE_SHAPE_CHANGED:'+repr([m.get('name') for m in mods]))
runtime=base64.b64decode(mods[0]['content_base64']);sha=hashlib.sha256(runtime).hexdigest()
if sha!='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed': raise SystemExit('PRE_RUNTIME_SHA_CHANGED:'+sha)
expect=[('ASSETS','assets',None,None),('ENGINE','service','nomadtips3-engine-343','production'),('FULL_MARKET','service','nomadtips3-full-market-343-ball46','production'),('HUB','service','nomadtips3-5usd-hub-343','production')]
got=sorted((b.get('name'),b.get('type'),b.get('service'),b.get('environment')) for b in (v.get('bindings') or []))
if got!=sorted(expect): raise SystemExit('PRE_BINDINGS_CHANGED:'+repr(got))
if v.get('compatibility_date')!='2026-09-09' or (v.get('compatibility_flags') or []): raise SystemExit('PRE_COMPAT_CHANGED')
ac=(v.get('assets') or {}).get('config') or {};exp={'base_path':'/','html_handling':'none','not_found_handling':'none','run_worker_first':True}
if {k:ac.get(k) for k in exp}!=exp: raise SystemExit('PRE_ASSET_CONFIG_CHANGED:'+repr(ac))
s=get(f'{api}/workers/scripts/{script}/schedules')['result'];ss=s.get('schedules',[]) if isinstance(s,dict) else (s or []);crons=[x.get('cron') for x in ss if isinstance(x,dict) and x.get('cron')]
if crons!=['* * * * *']: raise SystemExit('PRE_CRON_CHANGED:'+repr(crons))
root.joinpath('runtime-clean/index.js').write_bytes(runtime);root.joinpath('pre-version.txt').write_text(vid)
root.joinpath('pre-lock.json').write_text(json.dumps({'version':vid,'number':v.get('number'),'runtime_sha256':sha,'modules':[m.get('name') for m in mods],'bindings':v.get('bindings') or [],'assets':v.get('assets') or {},'crons':crons},indent=2,sort_keys=True))
print('PRE_RUNTIME_CONFIG_LOCK_PASS','number=',v.get('number'),'sha=',sha)
PY

# 2) Freshly mirror all 79 CURRENT live assets. This is the deployment base.
nonce="${GITHUB_RUN_ID:-manual}-pre-$(date +%s%N)"
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  mkdir -p "$LIVE_PRE/$(dirname "$rel")"
  code=$(curl -sS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' -o "$LIVE_PRE/$rel" -w '%{http_code}' "$DIRECT/$rel?step5rebase=$nonce-${RANDOM}") || true
  [ "$code" = 200 ] || { echo "PRE_FETCH_FAILED:$code:$rel"; exit 1; }
  [ -s "$LIVE_PRE/$rel" ] || { echo "PRE_EMPTY_ASSET:$rel"; exit 1; }
done < "$SRC/live-paths.txt"
[ "$(find "$LIVE_PRE" -type f | wc -l | tr -d ' ')" = "79" ] || { echo PRE_LIVE_NOT_79; exit 1; }
[ "$(sha256sum "$LIVE_PRE/dashboard-v2-tune.css" | awk '{print $1}')" = "$EXPECTED_BASE_CSS_SHA" ] || { echo TARGET_CSS_BASELINE_MOVED; exit 1; }
python3 - <<'PY'
from pathlib import Path
import hashlib,json
src=Path('/tmp/b46-step5-approved/before');cur=Path('/tmp/b46-step5-deploy/live-pre');paths=[x.strip() for x in Path('/tmp/b46-step5-approved/live-paths.txt').read_text().splitlines() if x.strip()]
drift=[]
for rel in paths:
  if hashlib.sha256((src/rel).read_bytes()).digest()!=hashlib.sha256((cur/rel).read_bytes()).digest(): drift.append(rel)
Path('/tmp/b46-step5-deploy/current-drift-from-approved-v226.json').write_text(json.dumps(drift,indent=2))
print('CURRENT_DRIFT_FROM_APPROVED_V226',drift)
if 'dashboard-v2-tune.css' in drift: raise SystemExit('TARGET_CSS_DRIFTED')
PY
echo CURRENT_79_ASSETS_MIRRORED_TARGET_BASELINE_PASS

# 3) Rebase only the approved CSS onto the fresh current snapshot.
cp -a "$LIVE_PRE/." "$CAND/"
cp "$SRC/candidate/dashboard-v2-tune.css" "$CAND/dashboard-v2-tune.css"
python3 - <<'PY'
from pathlib import Path
import hashlib
r=Path('/tmp/b46-step5-deploy');paths=[x.strip() for x in Path('/tmp/b46-step5-approved/live-paths.txt').read_text().splitlines() if x.strip()]
changed=[]
for rel in paths:
  if hashlib.sha256((r/'live-pre'/rel).read_bytes()).digest()!=hashlib.sha256((r/'candidate'/rel).read_bytes()).digest(): changed.append(rel)
print('CURRENT_BASE_CHANGED_ASSETS',changed)
if changed!=['dashboard-v2-tune.css']: raise SystemExit('ONE_FILE_DIFF_FAILED:'+repr(changed))
if hashlib.sha256((r/'candidate/dashboard-v2-tune.css').read_bytes()).hexdigest()!='239cbefc12143fcae2845f8ef9de5ff6855e9f2dd320c1b6704d88eeeecfe79f': raise SystemExit('CANDIDATE_CSS_HASH_BAD')
PY
echo ONE_FILE_REBASE_DIFF_GATE_PASS

# 4) Current live flow must be healthy immediately before deployment.
nonce="${GITHUB_RUN_ID:-manual}-flowpre-$(date +%s%N)"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/board?step5rebase=$nonce" -o "$VERIFY/board-before.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/signals?step5rebase=$nonce" -o "$VERIFY/signals-before.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/statistics?step5rebase=$nonce" -o "$VERIFY/stats-before.json"
node - <<'NODE'
const fs=require('fs');const b=JSON.parse(fs.readFileSync('/tmp/b46-step5-deploy/verify/board-before.json')),s=JSON.parse(fs.readFileSync('/tmp/b46-step5-deploy/verify/signals-before.json')),t=JSON.parse(fs.readFileSync('/tmp/b46-step5-deploy/verify/stats-before.json'));if(b?.ok!==true||!Array.isArray(b.fixtures)||!Array.isArray(s.signals)||t?.ok!==true||!Array.isArray(t.rows))throw Error('PRE_FLOW_BAD');fs.writeFileSync('/tmp/b46-step5-deploy/pre-flow.json',JSON.stringify({fixtures:b.fixtures.length,signals:s.signals.length,stats:t.rows.length},null,2));console.log('PRE_FLOW_OK',{fixtures:b.fixtures.length,signals:s.signals.length,stats:t.rows.length});
NODE

# 5) Clean runtime directory; candidate assets stay external.
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
[ "$(find "$RUNTIME" -maxdepth 1 -type f -printf '%f\n' | sort | paste -sd, -)" = "index.js,wrangler.jsonc" ] || { echo CLEAN_RUNTIME_DIR_BAD; exit 1; }
cd "$RUNTIME"
npx --yes wrangler@4.92.0 deploy --dry-run --config wrangler.jsonc 2>&1 | tee "$VERIFY/dry-run.log"
grep -Fq 'Read 79 files from the assets directory' "$VERIFY/dry-run.log" || { echo DRY_NOT_79_ASSETS; exit 1; }
! grep -Fq 'Attaching additional modules:' "$VERIFY/dry-run.log" || { echo DRY_EXTRA_MODULES; exit 1; }
echo DRY_RUN_PASS_79_ASSETS_NO_EXTRA_MODULES

# 6) Race guard immediately before write.
python3 - <<'PY'
import json,os,urllib.request
expected='7d23e1dc-df40-488b-bde5-8f456dcfa76a';a=os.environ['CLOUDFLARE_ACCOUNT_ID'];t=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {t}','Accept':'application/json'};u=f'https://api.cloudflare.com/client/v4/accounts/{a}/workers/scripts/ball46-production/deployments'
with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:j=json.load(r)
vs=j['result']['deployments'][0].get('versions') or [];cur=vs[0]['version_id'] if len(vs)==1 else 'MIXED';print('RACE_VERSION',expected,cur)
if cur!=expected: raise SystemExit('RACE_GUARD_PRODUCTION_MOVED:'+cur)
PY
echo RACE_GUARD_PASS

# 7) Surgical deploy of current snapshot + one approved CSS change.
npx --yes wrangler@4.92.0 deploy --config wrangler.jsonc 2>&1 | tee "$VERIFY/deploy.log"
! grep -Fq 'Attaching additional modules:' "$VERIFY/deploy.log" || { echo DEPLOY_EXTRA_MODULES; exit 1; }
grep -Fq 'Found 1 new or modified static asset to upload' "$VERIFY/deploy.log" || { echo DEPLOY_NOT_EXACTLY_ONE_ASSET; exit 1; }
grep -Fq '+ /dashboard-v2-tune.css' "$VERIFY/deploy.log" || { echo DEPLOY_TARGET_ASSET_NOT_REPORTED; exit 1; }
[ "$(grep -c '^+ /' "$VERIFY/deploy.log" || true)" = "1" ] || { echo DEPLOY_REPORTED_MULTIPLE_ASSETS; exit 1; }
echo DEPLOY_ONE_CSS_COMMAND_COMPLETE

# 8) Verify new runtime/config shape.
python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
root=pathlib.Path('/tmp/b46-step5-deploy');a=os.environ['CLOUDFLARE_ACCOUNT_ID'];t=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {t}','Accept':'application/json'};api=f'https://api.cloudflare.com/client/v4/accounts/{a}';script='ball46-production'
def get(u):
  with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as x:return json.load(x)
d=get(f'{api}/workers/scripts/{script}/deployments')['result']['deployments'][0];vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100: raise SystemExit('POST_MIXED_DEPLOYMENT')
vid=vs[0]['version_id'];old='7d23e1dc-df40-488b-bde5-8f456dcfa76a'
if vid==old: raise SystemExit('POST_VERSION_DID_NOT_CHANGE')
v=get(f'{api}/workers/workers/{script}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or []
if len(mods)!=1 or mods[0].get('name')!='index.js' or not mods[0].get('content_base64'): raise SystemExit('POST_RUNTIME_MODULE_SHAPE_BAD:'+repr([m.get('name') for m in mods]))
sha=hashlib.sha256(base64.b64decode(mods[0]['content_base64'])).hexdigest()
if sha!='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed': raise SystemExit('POST_RUNTIME_SHA_CHANGED:'+sha)
expect=[('ASSETS','assets',None,None),('ENGINE','service','nomadtips3-engine-343','production'),('FULL_MARKET','service','nomadtips3-full-market-343-ball46','production'),('HUB','service','nomadtips3-5usd-hub-343','production')]
got=sorted((b.get('name'),b.get('type'),b.get('service'),b.get('environment')) for b in (v.get('bindings') or []))
if got!=sorted(expect): raise SystemExit('POST_BINDINGS_CHANGED:'+repr(got))
if v.get('compatibility_date')!='2026-09-09' or (v.get('compatibility_flags') or []): raise SystemExit('POST_COMPAT_CHANGED')
ac=(v.get('assets') or {}).get('config') or {};exp={'base_path':'/','html_handling':'none','not_found_handling':'none','run_worker_first':True}
if {k:ac.get(k) for k in exp}!=exp: raise SystemExit('POST_ASSET_CONFIG_CHANGED:'+repr(ac))
s=get(f'{api}/workers/scripts/{script}/schedules')['result'];ss=s.get('schedules',[]) if isinstance(s,dict) else (s or []);crons=[x.get('cron') for x in ss if isinstance(x,dict) and x.get('cron')]
if crons!=['* * * * *']: raise SystemExit('POST_CRON_CHANGED:'+repr(crons))
root.joinpath('post-version.txt').write_text(vid);root.joinpath('post-lock.json').write_text(json.dumps({'version':vid,'number':v.get('number'),'runtime_sha256':sha,'modules':[m.get('name') for m in mods],'bindings':v.get('bindings') or [],'assets':v.get('assets') or {},'crons':crons},indent=2,sort_keys=True))
print('POST_RUNTIME_CONFIG_PASS',vid,'number=',v.get('number'),'sha=',sha)
PY

# 9) Every live asset must byte-match the fresh-current-based candidate.
nonce="${GITHUB_RUN_ID:-manual}-post-$(date +%s%N)"
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  mkdir -p "$LIVE_POST/$(dirname "$rel")"
  code=$(curl -sS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' -o "$LIVE_POST/$rel" -w '%{http_code}' "$DIRECT/$rel?step5post=$nonce-${RANDOM}") || true
  [ "$code" = 200 ] || { echo "POST_FETCH_FAILED:$code:$rel"; exit 1; }
  cmp -s "$LIVE_POST/$rel" "$CAND/$rel" || { echo "POST_ASSET_MISMATCH:$rel"; exit 1; }
done < "$SRC/live-paths.txt"
[ "$(sha256sum "$LIVE_POST/dashboard-v2-tune.css" | awk '{print $1}')" = "$EXPECTED_CAND_CSS_SHA" ]
echo POST_79_ASSETS_MATCH_CURRENT_BASED_CANDIDATE

# 10) Live flow after deploy.
nonce="${GITHUB_RUN_ID:-manual}-flowpost-$(date +%s%N)"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/board?step5post=$nonce" -o "$VERIFY/board-after.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/signals?step5post=$nonce" -o "$VERIFY/signals-after.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/statistics?step5post=$nonce" -o "$VERIFY/stats-after.json"
node - <<'NODE'
const fs=require('fs');const b=JSON.parse(fs.readFileSync('/tmp/b46-step5-deploy/verify/board-after.json')),s=JSON.parse(fs.readFileSync('/tmp/b46-step5-deploy/verify/signals-after.json')),t=JSON.parse(fs.readFileSync('/tmp/b46-step5-deploy/verify/stats-after.json'));if(b?.ok!==true||!Array.isArray(b.fixtures)||!Array.isArray(s.signals)||t?.ok!==true||!Array.isArray(t.rows))throw Error('POST_FLOW_BAD');fs.writeFileSync('/tmp/b46-step5-deploy/post-flow.json',JSON.stringify({fixtures:b.fixtures.length,signals:s.signals.length,stats:t.rows.length},null,2));console.log('POST_FLOW_OK',{fixtures:b.fixtures.length,signals:s.signals.length,stats:t.rows.length});
NODE

# 11) Real production browser geometry/behavior check at desktop width.
chrome=$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)
[ -n "$chrome" ] || { echo CHROME_NOT_FOUND; exit 1; }
rm -rf "$ROOT/chrome"
"$chrome" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --window-size=1440,1050 --remote-debugging-port=9222 --user-data-dir="$ROOT/chrome" "$WWW/index.html?status=live&step5post=${GITHUB_RUN_ID:-manual}" >"$VERIFY/chrome.log" 2>&1 &
CPID=$!;trap 'kill $CPID 2>/dev/null || true' EXIT
for i in $(seq 1 40); do curl -fsS http://127.0.0.1:9222/json > "$VERIFY/pages.json" 2>/dev/null && break; sleep 1; done
test -s "$VERIFY/pages.json"
cat > "$VERIFY/post-browser.js" <<'NODE'
const fs=require('fs');const pages=JSON.parse(fs.readFileSync('/tmp/b46-step5-deploy/verify/pages.json','utf8'));const page=pages.find(x=>x.type==='page');if(!page)throw Error('NO_PAGE');const ws=new WebSocket(page.webSocketDebuggerUrl);let id=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result)}};const call=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}))});const sleep=ms=>new Promise(r=>setTimeout(r,ms));async function ev(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error('EVAL:'+JSON.stringify(r.exceptionDetails));return r.result?.value}async function wait(expr,timeout=25000){const st=Date.now();while(Date.now()-st<timeout){try{if(await ev(expr))return}catch{}await sleep(250)}throw Error('WAIT_TIMEOUT:'+expr)}
(async()=>{await new Promise((ok,fail)=>{ws.onopen=ok;ws.onerror=fail});await call('Page.enable');await call('Runtime.enable');await wait(`document.readyState==='complete'`);await wait(`document.querySelectorAll('.match-row[data-match-id]').length>0`);await sleep(3500);const g=await ev(`(()=>{const r=document.querySelector('.match-row[data-match-id]');const sig=r?.querySelector('.signal-cell'),sc=r?.querySelector('.score-cell');const rows=[...document.querySelectorAll('.match-row')];return {rows:rows.length,signal:Math.round(sig?.getBoundingClientRect().width||0),score:Math.round(sc?.getBoundingClientRect().width||0),overflow:rows.some(x=>x.scrollWidth>x.clientWidth+1),dash:!!window.NOMAD343_DASHBOARD_V2,expand:!!window.NOMAD343_EXPANDED_MATCH}})()`);if(!g.dash||!g.expand||g.rows<1||g.signal<120||g.score<85||g.overflow)throw Error('DEPLOYED_CARD_GEOMETRY_BAD:'+JSON.stringify(g));const idv=await ev(`(()=>{const r=document.querySelector('.match-row[data-match-id]');if(!r)return '';window.NOMAD343_EXPANDED_MATCH.open(r.dataset.matchId);return r.dataset.matchId})()`);if(!idv)throw Error('NO_ROW_FOR_EXPAND');await wait(`!!document.querySelector('.match-expanded[data-expanded-match="${idv}"]')`,5000);const ex=await ev(`(()=>{const r=document.querySelector('.match-row[data-match-id="${idv}"]'),e=document.querySelector('.match-expanded[data-expanded-match="${idv}"]');return {adjacent:!!r&&r.nextElementSibling===e,overflow:[...document.querySelectorAll('.match-row')].some(x=>x.scrollWidth>x.clientWidth+1)}})()`);if(!ex.adjacent||ex.overflow)throw Error('DEPLOYED_EXPANDED_BAD:'+JSON.stringify(ex));await ev(`window.NOMAD343_EXPANDED_MATCH.close()`);fs.writeFileSync('/tmp/b46-step5-deploy/browser-result.json',JSON.stringify({geometry:g,expanded:ex},null,2));console.log('POST_BROWSER_PASS',JSON.stringify({geometry:g,expanded:ex}));ws.close();process.exit(0)})().catch(e=>{console.error(e);try{ws.close()}catch{}process.exit(1)});
NODE
node "$VERIFY/post-browser.js"
kill "$CPID" 2>/dev/null || true;trap - EXIT

cat > "$REPORT" <<EOF
status=PASS
deployment=yes
approved_predeploy_run=36366786529
rebase_source_version=$EXPECTED_VERSION
post_version=$(cat "$ROOT/post-version.txt")
runtime_sha256=$EXPECTED_RUNTIME_SHA
runtime_modules=index.js
asset_inventory=79
preserved_current_drift=$(tr -d '\n ' < "$ROOT/current-drift-from-approved-v226.json")
changed_asset=dashboard-v2-tune.css
base_css_sha256=$EXPECTED_BASE_CSS_SHA
candidate_css_sha256=$EXPECTED_CAND_CSS_SHA
one_file_diff=PASS
dry_run=PASS
extra_modules=none
race_guard=PASS
post_runtime_config=PASS
post_79_assets_match_candidate=PASS
post_flow=PASS
post_browser=PASS
result=BALL46_CARD_STEP5_DEPLOY_VERIFIED
EOF
cat "$REPORT"
echo BALL46_CARD_STEP5_DEPLOY_VERIFIED
