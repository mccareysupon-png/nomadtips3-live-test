#!/usr/bin/env bash
set -euo pipefail
ART="/tmp/b46-repair-artifact"
DIRECT="https://ball46-production.mccarey-supon.workers.dev"
WWW="https://www.ball46.com"
CLEAN="/tmp/b46-clean-runtime"
VERIFY="/tmp/b46-repair-verify"
EXPECTED_SHA="f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed"
rm -rf "$CLEAN" "$VERIFY" && mkdir -p "$CLEAN" "$VERIFY"

[ "$(find "$ART/after" -type f | wc -l | tr -d ' ')" = 79 ] || { echo ARTIFACT_ASSET_COUNT_BAD; exit 1; }
[ "$(sha256sum "$ART/runtime/index.js" | awk '{print $1}')" = "$EXPECTED_SHA" ] || { echo ARTIFACT_RUNTIME_BAD; exit 1; }
grep -Fq 'B46_ODDS_VISIBILITY_20260928' "$ART/after/odds-format-343.js"

python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
root=pathlib.Path('/tmp/b46-repair-verify');a=os.environ['CLOUDFLARE_ACCOUNT_ID'];t=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {t}','Accept':'application/json'};api=f'https://api.cloudflare.com/client/v4/accounts/{a}';script='ball46-production'
def get(u):
  with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:return json.load(r)
d=get(f'{api}/workers/scripts/{script}/deployments')['result']['deployments'][0];vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100:raise SystemExit('MIXED_DEPLOYMENT')
vid=vs[0]['version_id'];root.joinpath('pre-version.txt').write_text(vid)
v=get(f'{api}/workers/workers/{script}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or []
main=[m for m in mods if m.get('name')=='index.js' and m.get('content_base64')]
if len(main)!=1:raise SystemExit('INDEX_MODULE_MISSING')
sha=hashlib.sha256(base64.b64decode(main[0]['content_base64'])).hexdigest()
if sha!='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed':raise SystemExit('INDEX_SHA_CHANGED:'+sha)
expect=[('ASSETS','assets',None,None),('ENGINE','service','nomadtips3-engine-343','production'),('FULL_MARKET','service','nomadtips3-full-market-343-ball46','production'),('HUB','service','nomadtips3-5usd-hub-343','production')]
got=sorted((b.get('name'),b.get('type'),b.get('service'),b.get('environment')) for b in (v.get('bindings') or []))
if got!=sorted(expect):raise SystemExit('BINDINGS_CHANGED:'+repr(got))
if v.get('compatibility_date')!='2026-09-09' or (v.get('compatibility_flags') or []):raise SystemExit('COMPAT_CHANGED')
ac=(v.get('assets') or {}).get('config') or {};exp={'base_path':'/','html_handling':'none','not_found_handling':'none','run_worker_first':True}
if {k:ac.get(k) for k in exp}!=exp:raise SystemExit('ASSET_CONFIG_CHANGED')
s=get(f'{api}/workers/scripts/{script}/schedules')['result'];ss=s.get('schedules',[]) if isinstance(s,dict) else (s or [])
if [x.get('cron') for x in ss if isinstance(x,dict) and x.get('cron')]!=['* * * * *']:raise SystemExit('CRON_CHANGED')
root.joinpath('pre-modules.json').write_text(json.dumps([m.get('name') for m in mods],indent=2));print('CURRENT_LOCK_OK',vid,'modules=',len(mods),sha)
PY

# Prove artifact bytes equal CURRENT Production before using them.
nonce="${GITHUB_RUN_ID}-pre-$(date +%s%N)"
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  mkdir -p "$VERIFY/live/$(dirname "$rel")"
  curl -fsS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' "$DIRECT/$rel?$nonce-${RANDOM}" -o "$VERIFY/live/$rel"
  cmp -s "$ART/after/$rel" "$VERIFY/live/$rel" || { echo CURRENT_ASSET_NOT_ARTIFACT:$rel; exit 1; }
done < "$ART/live-paths.txt"
echo CURRENT_79_ASSETS_MATCH_ARTIFACT

nonce="${GITHUB_RUN_ID}-health-pre-$(date +%s%N)"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/board?repair=$nonce" -o "$VERIFY/board-pre.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/signals?repair=$nonce" -o "$VERIFY/signals-pre.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/statistics?repair=$nonce" -o "$VERIFY/stats-pre.json"
node - <<'NODE'
const fs=require('fs');const b=JSON.parse(fs.readFileSync('/tmp/b46-repair-verify/board-pre.json')),s=JSON.parse(fs.readFileSync('/tmp/b46-repair-verify/signals-pre.json')),t=JSON.parse(fs.readFileSync('/tmp/b46-repair-verify/stats-pre.json'));if(b?.ok!==true||!Array.isArray(b.fixtures)||!Array.isArray(s.signals)||t?.ok!==true||!Array.isArray(t.rows))throw Error('PRE_FLOW_BAD');console.log('PRE_FLOW_OK',{fixtures:b.fixtures.length,signals:s.signals.length,stats:t.rows.length});
NODE

cp "$ART/runtime/index.js" "$CLEAN/index.js"
cat > "$CLEAN/wrangler.jsonc" <<'EOF'
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
  "assets":{"directory":"/tmp/b46-repair-artifact/after","binding":"ASSETS","html_handling":"none","not_found_handling":"none","run_worker_first":true},
  "triggers":{"crons":["* * * * *"]}
}
EOF
cd "$CLEAN"
npx --yes wrangler@4.92.0 deploy --dry-run --config wrangler.jsonc 2>&1 | tee "$VERIFY/dry.log"
! grep -Fq 'Attaching additional modules:' "$VERIFY/dry.log" || { echo DRY_EXTRA_MODULES; exit 1; }

python3 - <<'PY'
import json,os,pathlib,urllib.request
p=pathlib.Path('/tmp/b46-repair-verify/pre-version.txt').read_text().strip();a=os.environ['CLOUDFLARE_ACCOUNT_ID'];t=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {t}','Accept':'application/json'};u=f'https://api.cloudflare.com/client/v4/accounts/{a}/workers/scripts/ball46-production/deployments'
with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:j=json.load(r)
c=j['result']['deployments'][0]['versions'][0]['version_id'];print('RACE_VERSION',p,c)
if c!=p:raise SystemExit('PRODUCTION_MOVED')
PY

npx --yes wrangler@4.92.0 deploy --config wrangler.jsonc 2>&1 | tee "$VERIFY/deploy.log"
! grep -Fq 'Attaching additional modules:' "$VERIFY/deploy.log" || { echo DEPLOY_EXTRA_MODULES; exit 1; }

python3 - <<'PY'
import base64,hashlib,json,os,urllib.request
a=os.environ['CLOUDFLARE_ACCOUNT_ID'];t=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {t}','Accept':'application/json'};api=f'https://api.cloudflare.com/client/v4/accounts/{a}';script='ball46-production'
def get(u):
  with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:return json.load(r)
d=get(f'{api}/workers/scripts/{script}/deployments')['result']['deployments'][0];vid=d['versions'][0]['version_id'];v=get(f'{api}/workers/workers/{script}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or [];print('POST_VERSION',vid,'POST_MODULES',[m.get('name') for m in mods])
if len(mods)!=1 or mods[0].get('name')!='index.js':raise SystemExit('POST_RUNTIME_SHAPE_BAD')
sha=hashlib.sha256(base64.b64decode(mods[0]['content_base64'])).hexdigest()
if sha!='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed':raise SystemExit('POST_SHA_BAD')
print('POST_RUNTIME_REPAIRED',sha)
PY

nonce="${GITHUB_RUN_ID}-post-$(date +%s%N)"
rm -rf "$VERIFY/post" && mkdir -p "$VERIFY/post"
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  mkdir -p "$VERIFY/post/$(dirname "$rel")"
  curl -fsS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' "$DIRECT/$rel?$nonce-${RANDOM}" -o "$VERIFY/post/$rel"
  cmp -s "$ART/after/$rel" "$VERIFY/post/$rel" || { echo POST_ASSET_CHANGED:$rel; exit 1; }
done < "$ART/live-paths.txt"
echo POST_79_ASSETS_UNCHANGED

chrome=$(command -v google-chrome || command -v chromium || true)
[ -n "$chrome" ] || { echo CHROME_NOT_FOUND; exit 1; }
"$chrome" --headless=new --no-sandbox --disable-gpu --remote-debugging-port=9225 --user-data-dir="$VERIFY/chrome" "$WWW/index.html?status=live&repair=${GITHUB_RUN_ID}" >"$VERIFY/chrome.log" 2>&1 & CPID=$!
trap 'kill $CPID 2>/dev/null || true' EXIT
for i in $(seq 1 30); do curl -fsS http://127.0.0.1:9225/json > "$VERIFY/pages.json" 2>/dev/null && break; sleep 1; done
sleep 8
node - <<'NODE'
const fs=require('fs');const p=JSON.parse(fs.readFileSync('/tmp/b46-repair-verify/pages.json')).find(x=>x.type==='page');if(!p)throw Error('NO_PAGE');const ws=new WebSocket(p.webSocketDebuggerUrl);let id=0,m=new Map();ws.onmessage=e=>{const x=JSON.parse(e.data);if(x.id&&m.has(x.id)){const q=m.get(x.id);m.delete(x.id);x.error?q[1](Error(JSON.stringify(x.error))):q[0](x.result)}};const call=(method,params={})=>new Promise((a,b)=>{const n=++id;m.set(n,[a,b]);ws.send(JSON.stringify({id:n,method,params}))});(async()=>{await new Promise((a,b)=>{ws.onopen=a;ws.onerror=b});const ev=async e=>(await call('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true})).result.value;const b=await ev(`(()=>{const s=document.querySelector('[data-workspace-odds-slot]'),x=document.querySelector('[data-odds-format-button]');return {display:s?getComputedStyle(s).display:null,h:s?.getBoundingClientRect().height||0,btn:x?.textContent||'',api:!!window.NOMAD343_ODDS}})()`);console.log('ODDS_VISIBLE',b);if(b.display==='none'||b.h<12||!b.btn.includes('DEC')||!b.api)throw Error('ODDS_NOT_VISIBLE');for(const [f,l] of [['fractional','FRA'],['american','AM'],['decimal','DEC']]){const z=await ev(`(()=>{window.NOMAD343_ODDS.setFormat('${f}');return document.querySelector('[data-odds-format-button]')?.textContent||''})()`);if(!z.includes(l))throw Error('SWITCH_'+f)}ws.close();process.exit(0)})().catch(e=>{console.error(e);process.exit(1)});
NODE
kill "$CPID" 2>/dev/null || true; trap - EXIT

echo BALL46_RUNTIME_SHAPE_REPAIR_VERIFIED
