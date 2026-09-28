#!/usr/bin/env bash
set -euo pipefail
ART="/tmp/b46-scorebar-candidate"
DIRECT="https://ball46-production.mccarey-supon.workers.dev"
WWW="https://www.ball46.com"
WORK="/tmp/b46-scorebar-deploy"
VERIFY="$WORK/verify"
EXPECTED_RUNTIME_SHA="f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed"
rm -rf "$WORK" && mkdir -p "$WORK/runtime" "$VERIFY/post"

[ -f "$ART/after/dashboard-v2-stage3.js" ] || { echo STEP3_CANDIDATE_MISSING; exit 1; }
[ "$(find "$ART/after" -type f | wc -l | tr -d ' ')" = 79 ] || { echo STEP3_CANDIDATE_ASSET_COUNT_BAD; exit 1; }
[ "$(cat "$ART/verify/changed-assets.txt" | tr -d '\r')" = "dashboard-v2-stage3.js" ] || { echo STEP3_DIFF_EVIDENCE_BAD; exit 1; }
grep -Fq 'BALL46_SCOREBAR_6X4_20260928' "$ART/after/dashboard-v2-stage3.js" || { echo STEP3_MARKER_MISSING; exit 1; }
node --check "$ART/after/dashboard-v2-stage3.js"
cp "$ART/runtime/index.js" "$WORK/runtime/index.js"
[ "$(sha256sum "$WORK/runtime/index.js" | awk '{print $1}')" = "$EXPECTED_RUNTIME_SHA" ] || { echo STEP3_RUNTIME_ARTIFACT_BAD; exit 1; }
LOCKED_VERSION="$(cat "$ART/verify/locked-version.txt")"
[ -n "$LOCKED_VERSION" ] || { echo STEP3_LOCKED_VERSION_MISSING; exit 1; }
echo STEP3_CANDIDATE_EVIDENCE_OK "$LOCKED_VERSION"

python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
root=pathlib.Path('/tmp/b46-scorebar-deploy/verify');locked=pathlib.Path('/tmp/b46-scorebar-candidate/verify/locked-version.txt').read_text().strip();a=os.environ['CLOUDFLARE_ACCOUNT_ID'];t=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {t}','Accept':'application/json'};api=f'https://api.cloudflare.com/client/v4/accounts/{a}';script='ball46-production'
def get(u):
  with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:return json.load(r)
d=get(f'{api}/workers/scripts/{script}/deployments')['result']['deployments'][0];vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100:raise SystemExit('STEP3_MIXED_DEPLOYMENT')
vid=vs[0]['version_id']
if vid!=locked:raise SystemExit('STEP3_PRODUCTION_MOVED_BEFORE_DEPLOY:'+locked+':'+vid)
v=get(f'{api}/workers/workers/{script}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or []
main=[m for m in mods if m.get('name')=='index.js' and m.get('content_base64')]
if len(main)!=1:raise SystemExit('STEP3_INDEX_MODULE_MISSING')
sha=hashlib.sha256(base64.b64decode(main[0]['content_base64'])).hexdigest()
if sha!='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed':raise SystemExit('STEP3_RUNTIME_SHA_CHANGED:'+sha)
expect=[('ASSETS','assets',None,None),('ENGINE','service','nomadtips3-engine-343','production'),('FULL_MARKET','service','nomadtips3-full-market-343-ball46','production'),('HUB','service','nomadtips3-5usd-hub-343','production')]
got=sorted((b.get('name'),b.get('type'),b.get('service'),b.get('environment')) for b in (v.get('bindings') or []))
if got!=sorted(expect):raise SystemExit('STEP3_BINDINGS_CHANGED:'+repr(got))
if v.get('compatibility_date')!='2026-09-09' or (v.get('compatibility_flags') or []):raise SystemExit('STEP3_COMPAT_CHANGED')
ac=(v.get('assets') or {}).get('config') or {};exp={'base_path':'/','html_handling':'none','not_found_handling':'none','run_worker_first':True}
if {k:ac.get(k) for k in exp}!=exp:raise SystemExit('STEP3_ASSET_CONFIG_CHANGED:'+repr(ac))
s=get(f'{api}/workers/scripts/{script}/schedules')['result'];ss=s.get('schedules',[]) if isinstance(s,dict) else (s or [])
if [x.get('cron') for x in ss if isinstance(x,dict) and x.get('cron')]!=['* * * * *']:raise SystemExit('STEP3_CRON_CHANGED')
root.joinpath('pre-version.txt').write_text(vid)
print('STEP3_PRE_RUNTIME_CONFIG_LOCK_OK',vid,sha)
PY

find "$ART/after" -type f -printf '%P\n' | LC_ALL=C sort > "$VERIFY/live-paths.txt"
nonce="${GITHUB_RUN_ID}-pre-$(date +%s%N)"
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  curl -fsS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' "$DIRECT/$rel?$nonce-${RANDOM}" -o "$VERIFY/current.bin"
  cmp -s "$ART/verify/live/$rel" "$VERIFY/current.bin" || { echo STEP3_CURRENT_ASSET_MOVED:$rel; exit 1; }
done < "$VERIFY/live-paths.txt"
echo STEP3_PRE_79_ASSETS_STILL_BASE

nonce="${GITHUB_RUN_ID}-health-pre-$(date +%s%N)"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/board?scorebar_pre=$nonce" -o "$VERIFY/board-pre.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/signals?scorebar_pre=$nonce" -o "$VERIFY/signals-pre.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/statistics?scorebar_pre=$nonce" -o "$VERIFY/stats-pre.json"
node - <<'NODE'
const fs=require('fs');const b=JSON.parse(fs.readFileSync('/tmp/b46-scorebar-deploy/verify/board-pre.json')),s=JSON.parse(fs.readFileSync('/tmp/b46-scorebar-deploy/verify/signals-pre.json')),t=JSON.parse(fs.readFileSync('/tmp/b46-scorebar-deploy/verify/stats-pre.json'));if(b?.ok!==true||!Array.isArray(b.fixtures)||!Array.isArray(s.signals)||t?.ok!==true||!Array.isArray(t.rows))throw Error('STEP3_PRE_FLOW_BAD');console.log('STEP3_PRE_FLOW_OK',{fixtures:b.fixtures.length,signals:s.signals.length,stats:t.rows.length});
NODE

cat > "$WORK/runtime/wrangler.jsonc" <<'EOF'
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
  "assets":{"directory":"/tmp/b46-scorebar-candidate/after","binding":"ASSETS","html_handling":"none","not_found_handling":"none","run_worker_first":true},
  "triggers":{"crons":["* * * * *"]}
}
EOF
cd "$WORK/runtime"
npx --yes wrangler@4.92.0 deploy --dry-run --config wrangler.jsonc 2>&1 | tee "$VERIFY/dry-run.log"
! grep -Fq 'Attaching additional modules:' "$VERIFY/dry-run.log" || { echo STEP3_DRY_EXTRA_MODULES; exit 1; }
echo STEP3_FINAL_DRY_RUN_PASS

python3 - <<'PY'
import json,os,pathlib,urllib.request
p=pathlib.Path('/tmp/b46-scorebar-deploy/verify/pre-version.txt').read_text().strip();a=os.environ['CLOUDFLARE_ACCOUNT_ID'];t=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {t}','Accept':'application/json'};u=f'https://api.cloudflare.com/client/v4/accounts/{a}/workers/scripts/ball46-production/deployments'
with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:j=json.load(r)
vs=j['result']['deployments'][0].get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100:raise SystemExit('STEP3_RACE_MIXED_DEPLOYMENT')
c=vs[0]['version_id'];print('STEP3_RACE_VERSION',p,c)
if c!=p:raise SystemExit('STEP3_RACE_PRODUCTION_MOVED')
print('STEP3_RACE_GUARD_PASS')
PY

npx --yes wrangler@4.92.0 deploy --config wrangler.jsonc 2>&1 | tee "$VERIFY/deploy.log"
! grep -Fq 'Attaching additional modules:' "$VERIFY/deploy.log" || { echo STEP3_DEPLOY_EXTRA_MODULES; exit 1; }
grep -Fq 'Found 1 new or modified static asset to upload' "$VERIFY/deploy.log" || { echo STEP3_UPLOAD_COUNT_NOT_ONE; exit 1; }
grep -Fq '+ /dashboard-v2-stage3.js' "$VERIFY/deploy.log" || { echo STEP3_WRONG_ASSET_UPLOADED; exit 1; }
echo STEP3_DEPLOY_ONE_ASSET_PASS

python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
a=os.environ['CLOUDFLARE_ACCOUNT_ID'];t=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {t}','Accept':'application/json'};api=f'https://api.cloudflare.com/client/v4/accounts/{a}';script='ball46-production'
def get(u):
  with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:return json.load(r)
d=get(f'{api}/workers/scripts/{script}/deployments')['result']['deployments'][0];vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100:raise SystemExit('STEP3_POST_MIXED_DEPLOYMENT')
vid=vs[0]['version_id'];v=get(f'{api}/workers/workers/{script}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or [];main=[m for m in mods if m.get('name')=='index.js' and m.get('content_base64')]
if len(main)!=1:raise SystemExit('STEP3_POST_INDEX_MODULE_BAD')
sha=hashlib.sha256(base64.b64decode(main[0]['content_base64'])).hexdigest()
if sha!='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed':raise SystemExit('STEP3_POST_RUNTIME_SHA_BAD')
expect=[('ASSETS','assets',None,None),('ENGINE','service','nomadtips3-engine-343','production'),('FULL_MARKET','service','nomadtips3-full-market-343-ball46','production'),('HUB','service','nomadtips3-5usd-hub-343','production')]
got=sorted((b.get('name'),b.get('type'),b.get('service'),b.get('environment')) for b in (v.get('bindings') or []))
if got!=sorted(expect):raise SystemExit('STEP3_POST_BINDINGS_BAD')
pathlib.Path('/tmp/b46-scorebar-deploy/verify/post-version.txt').write_text(vid)
print('STEP3_POST_RUNTIME_CONFIG_OK',vid,sha)
PY

# Allow edge propagation, but never redeploy. Require candidate dashboard bytes to appear.
TARGET="$ART/after/dashboard-v2-stage3.js"
for i in $(seq 1 12); do
  nonce="${GITHUB_RUN_ID}-target-${i}-$(date +%s%N)"
  curl -fsS -L --retry 2 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' "$DIRECT/dashboard-v2-stage3.js?$nonce" -o "$VERIFY/post/dashboard-v2-stage3.js"
  if cmp -s "$TARGET" "$VERIFY/post/dashboard-v2-stage3.js"; then echo STEP3_TARGET_PROPAGATED_ATTEMPT=$i; break; fi
  [ "$i" -lt 12 ] || { echo STEP3_TARGET_NOT_PROPAGATED; exit 1; }
  sleep 2
done

nonce="${GITHUB_RUN_ID}-post-$(date +%s%N)"
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  mkdir -p "$VERIFY/post/$(dirname "$rel")"
  curl -fsS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' "$DIRECT/$rel?$nonce-${RANDOM}" -o "$VERIFY/post/$rel"
  if [ "$rel" = "dashboard-v2-stage3.js" ]; then exp="$ART/after/$rel"; else exp="$ART/verify/live/$rel"; fi
  cmp -s "$exp" "$VERIFY/post/$rel" || { echo STEP3_POST_ASSET_MISMATCH:$rel; exit 1; }
done < "$VERIFY/live-paths.txt"
echo STEP3_POST_ONLY_DASHBOARD_CHANGED_OTHER_78_IDENTICAL

nonce="${GITHUB_RUN_ID}-health-post-$(date +%s%N)"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/board?scorebar_post=$nonce" -o "$VERIFY/board-post.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/signals?scorebar_post=$nonce" -o "$VERIFY/signals-post.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/statistics?scorebar_post=$nonce" -o "$VERIFY/stats-post.json"
node - <<'NODE'
const fs=require('fs');const b=JSON.parse(fs.readFileSync('/tmp/b46-scorebar-deploy/verify/board-post.json')),s=JSON.parse(fs.readFileSync('/tmp/b46-scorebar-deploy/verify/signals-post.json')),t=JSON.parse(fs.readFileSync('/tmp/b46-scorebar-deploy/verify/stats-post.json'));if(b?.ok!==true||!Array.isArray(b.fixtures)||!Array.isArray(s.signals)||t?.ok!==true||!Array.isArray(t.rows))throw Error('STEP3_POST_FLOW_BAD');console.log('STEP3_POST_FLOW_OK',{fixtures:b.fixtures.length,signals:s.signals.length,stats:t.rows.length});
NODE

chrome=$(command -v google-chrome || command -v chromium || true)
[ -n "$chrome" ] || { echo STEP3_CHROME_NOT_FOUND; exit 1; }
"$chrome" --headless=new --no-sandbox --disable-gpu --remote-debugging-port=9227 --user-data-dir="$VERIFY/chrome" "$WWW/index.html?status=live&scorebar=${GITHUB_RUN_ID}" >"$VERIFY/chrome.log" 2>&1 & CPID=$!
trap 'kill $CPID 2>/dev/null || true' EXIT
for i in $(seq 1 30); do curl -fsS http://127.0.0.1:9227/json > "$VERIFY/pages.json" 2>/dev/null && break; sleep 1; done
sleep 8
node - <<'NODE'
const fs=require('fs');const board=JSON.parse(fs.readFileSync('/tmp/b46-scorebar-deploy/verify/board-post.json'));const rows=board.fixtures||[];
const ms=v=>{if(typeof v==='number')return v;const n=Date.parse(v||'');return Number.isFinite(n)?n:0};const ko=f=>ms(f.kickoffAt)||ms(f.kickoffUtc);const id=f=>String(f.fixtureId??[f?.home?.name,f?.away?.name,f.kickoffAt??f.kickoffUtc].join('|'));
const recent=rows.filter(f=>String(f.boardState||'').toLowerCase()==='finished').sort((a,b)=>ko(b)-ko(a)||id(b).localeCompare(id(a))).slice(0,6).map(id);
const near=rows.filter(f=>String(f.boardState||'').toLowerCase()==='live').sort((a,b)=>(Number.isFinite(Number(b.minute))?Number(b.minute):-1)-(Number.isFinite(Number(a.minute))?Number(a.minute):-1)||ko(b)-ko(a)||id(b).localeCompare(id(a))).slice(0,4).map(id);
const expected=[...recent,...near];const p=JSON.parse(fs.readFileSync('/tmp/b46-scorebar-deploy/verify/pages.json')).find(x=>x.type==='page');if(!p)throw Error('NO_PAGE');const ws=new WebSocket(p.webSocketDebuggerUrl);let seq=0,pending=new Map();ws.onmessage=e=>{const x=JSON.parse(e.data);if(x.id&&pending.has(x.id)){const q=pending.get(x.id);pending.delete(x.id);x.error?q[1](Error(JSON.stringify(x.error))):q[0](x.result)}};const call=(method,params={})=>new Promise((a,b)=>{const n=++seq;pending.set(n,[a,b]);ws.send(JSON.stringify({id:n,method,params}))});(async()=>{await new Promise((a,b)=>{ws.onopen=a;ws.onerror=b});const ev=async e=>(await call('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true})).result.value;const data=await ev(`(()=>{const cells=[...document.querySelectorAll('[data-workspace-scorebar-slot] .workspace-scorebar-cell')];return {count:cells.length,ids:cells.map(x=>x.getAttribute('data-workspace-score-id')).filter(Boolean),statuses:cells.map(x=>x.querySelector('.workspace-scorebar-meta i')?.textContent||''),oddsDisplay:(()=>{const s=document.querySelector('[data-workspace-odds-slot]');return s?getComputedStyle(s).display:null})(),oddsH:document.querySelector('[data-workspace-odds-slot]')?.getBoundingClientRect().height||0,oddsBtn:document.querySelector('[data-odds-format-button]')?.textContent||'',oddsApi:!!window.NOMAD343_ODDS,favicon:(document.querySelector('link[rel~="icon"]')?.href||'').startsWith('data:image/svg+xml')}})()`);console.log('STEP3_BROWSER_SCOREBAR',data,'EXPECTED',expected);if(data.count!==10)throw Error('SCOREBAR_COUNT_'+data.count);if(JSON.stringify(data.ids)!==JSON.stringify(expected))throw Error('SCOREBAR_IDS_MISMATCH');if(data.statuses.slice(0,6).some(x=>x!=='FT'))throw Error('RECENT_STATUS_NOT_FT');if(data.statuses.slice(6).some(x=>x==='FT'||!x))throw Error('LIVE_STATUS_BAD');if(data.oddsDisplay==='none'||data.oddsH<12||!data.oddsBtn.includes('DEC')||!data.oddsApi)throw Error('ODDS_REGRESSION');if(!data.favicon)throw Error('FAVICON_REGRESSION');for(const [f,l] of [['fractional','FRA'],['american','AM'],['decimal','DEC']]){const z=await ev(`(()=>{window.NOMAD343_ODDS.setFormat('${f}');return document.querySelector('[data-odds-format-button]')?.textContent||''})()`);if(!z.includes(l))throw Error('ODDS_SWITCH_'+f)}ws.close();process.exit(0)})().catch(e=>{console.error(e);process.exit(1)});
NODE
kill "$CPID" 2>/dev/null || true; trap - EXIT

echo BALL46_SCOREBAR_6X4_DEPLOY_VERIFIED_SUCCESS
