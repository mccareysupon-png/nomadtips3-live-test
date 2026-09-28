#!/usr/bin/env bash
set -euo pipefail
WORKER='ball46-production'
DIRECT='https://ball46-production.mccarey-supon.workers.dev'
WWW='https://www.ball46.com'
EXPECTED_VERSION='01c24c0c-6d6c-4e11-97c5-efc9414f2635'
EXPECTED_RUNTIME_SHA='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed'
EXPECTED_STEP5_CSS_SHA='239cbefc12143fcae2845f8ef9de5ff6855e9f2dd320c1b6704d88eeeecfe79f'
OLD_CSS_URL='dashboard-v2-tune.css?v=343-dashboard-v2-ui-tune-v5-market-width'
NEW_CSS_URL='dashboard-v2-tune.css?v=343-card-step6-20260928a'
BASE='/tmp/b46-step6-base'
PREVIEW='/tmp/b46-step6-preview'
ROOT='/tmp/b46-step6-deploy'
PRE="$ROOT/pre"; CAND="$ROOT/candidate"; POST="$ROOT/post"; RUNTIME="$ROOT/runtime-clean"; VERIFY="$ROOT/verify"
rm -rf "$ROOT"; mkdir -p "$PRE" "$CAND" "$POST" "$RUNTIME" "$VERIFY"

test -s "$BASE/live-paths.txt"; test -s "$PREVIEW/step6.css"; test -s "$PREVIEW/result.json"
python3 - <<'PY'
from pathlib import Path
import json
paths=[x.strip() for x in Path('/tmp/b46-step6-base/live-paths.txt').read_text().splitlines() if x.strip()]
if len(paths)!=79 or len(set(paths))!=79: raise SystemExit('LIVE_PATH_LIST_NOT_79')
r=json.loads(Path('/tmp/b46-step6-preview/result.json').read_text())
if r['nameAlign']>4 or r['timeAlign']>3 or r['heightDelta']>1.5 or r['after']['overflow']: raise SystemExit('PREVIEW_RESULT_NOT_APPROVED')
if not (0.27<=r['ratios']['team']<=0.31 and 0.13<=r['ratios']['score']<=0.16 and 0.15<=r['ratios']['signal']<=0.18): raise SystemExit('PREVIEW_RATIOS_BAD')
print('STEP6_PREVIEW_ARTIFACT_GATE_PASS',r['ratios'])
PY

python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
root=pathlib.Path('/tmp/b46-step6-deploy');a=os.environ['CLOUDFLARE_ACCOUNT_ID'];t=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {t}','Accept':'application/json'};api=f'https://api.cloudflare.com/client/v4/accounts/{a}';s='ball46-production'
def get(u):
  with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as x:return json.load(x)
d=get(f'{api}/workers/scripts/{s}/deployments')['result']['deployments'][0];vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100: raise SystemExit('PRE_MIXED_DEPLOYMENT')
vid=vs[0]['version_id'];print('PRE_CURRENT_VERSION',vid)
if vid!='01c24c0c-6d6c-4e11-97c5-efc9414f2635': raise SystemExit('PRODUCTION_VERSION_MOVED:'+vid)
v=get(f'{api}/workers/workers/{s}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or []
if len(mods)!=1 or mods[0].get('name')!='index.js' or not mods[0].get('content_base64'): raise SystemExit('PRE_MODULE_SHAPE_BAD')
runtime=base64.b64decode(mods[0]['content_base64']);sha=hashlib.sha256(runtime).hexdigest()
if sha!='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed': raise SystemExit('PRE_RUNTIME_SHA_BAD:'+sha)
expect=[('ASSETS','assets',None,None),('ENGINE','service','nomadtips3-engine-343','production'),('FULL_MARKET','service','nomadtips3-full-market-343-ball46','production'),('HUB','service','nomadtips3-5usd-hub-343','production')]
got=sorted((b.get('name'),b.get('type'),b.get('service'),b.get('environment')) for b in (v.get('bindings') or []))
if got!=sorted(expect): raise SystemExit('PRE_BINDINGS_CHANGED:'+repr(got))
sched=get(f'{api}/workers/scripts/{s}/schedules')['result'];ss=sched.get('schedules',[]) if isinstance(sched,dict) else (sched or []);crons=[x.get('cron') for x in ss if isinstance(x,dict) and x.get('cron')]
if crons!=['* * * * *']: raise SystemExit('PRE_CRON_CHANGED:'+repr(crons))
root.joinpath('runtime-clean/index.js').write_bytes(runtime);root.joinpath('pre-version.txt').write_text(vid)
print('PRE_RUNTIME_LOCK_PASS',sha)
PY

nonce="${GITHUB_RUN_ID:-manual}-pre-$(date +%s%N)"
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  mkdir -p "$PRE/$(dirname "$rel")"
  code=$(curl -sS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' -o "$PRE/$rel" -w '%{http_code}' "$DIRECT/$rel?step6deploy=$nonce-${RANDOM}") || true
  [ "$code" = 200 ] || { echo "PRE_FETCH_FAILED:$code:$rel"; exit 1; }
done < "$BASE/live-paths.txt"
[ "$(find "$PRE" -type f | wc -l | tr -d ' ')" = '79' ] || { echo PRE_NOT_79; exit 1; }
[ "$(sha256sum "$PRE/dashboard-v2-tune.css"|awk '{print $1}')" = "$EXPECTED_STEP5_CSS_SHA" ] || { echo CSS_BASE_MOVED; exit 1; }
grep -Fq "$OLD_CSS_URL" "$PRE/index.html" || { echo INDEX_OLD_CSS_URL_MISSING; exit 1; }

echo CURRENT_79_ASSETS_MIRRORED
cp -a "$PRE/." "$CAND/"
python3 - <<'PY'
from pathlib import Path
css=Path('/tmp/b46-step6-deploy/candidate/dashboard-v2-tune.css')
text=css.read_text();marker='/* BALL46 CARD REBUILD STEP3 PROTOTYPE 20260928'
i=text.find(marker)
if i<0: raise SystemExit('STEP3_MARKER_MISSING')
step6=Path('/tmp/b46-step6-preview/step6.css').read_text().strip()+'\n'
css.write_text(text[:i].rstrip()+'\n\n'+step6)
idx=Path('/tmp/b46-step6-deploy/candidate/index.html');s=idx.read_text();old='dashboard-v2-tune.css?v=343-dashboard-v2-ui-tune-v5-market-width';new='dashboard-v2-tune.css?v=343-card-step6-20260928a'
if s.count(old)!=1: raise SystemExit('INDEX_CSS_REF_COUNT_BAD:'+str(s.count(old)))
idx.write_text(s.replace(old,new,1))
PY
python3 - <<'PY'
from pathlib import Path
import hashlib
root=Path('/tmp/b46-step6-deploy');paths=[x.strip() for x in Path('/tmp/b46-step6-base/live-paths.txt').read_text().splitlines() if x.strip()];changed=[]
for rel in paths:
  if hashlib.sha256((root/'pre'/rel).read_bytes()).digest()!=hashlib.sha256((root/'candidate'/rel).read_bytes()).digest(): changed.append(rel)
print('CHANGED_ASSETS',changed)
if sorted(changed)!=['dashboard-v2-tune.css','index.html']: raise SystemExit('TWO_FILE_DIFF_GATE_FAILED:'+repr(changed))
css=(root/'candidate/dashboard-v2-tune.css').read_text();idx=(root/'candidate/index.html').read_text()
if 'BALL46 CARD REBUILD STEP6 MOCKUP MATCH 20260928' not in css or 'BALL46 CARD REBUILD STEP3 PROTOTYPE 20260928' in css: raise SystemExit('STEP6_CSS_MARKER_BAD')
if 'dashboard-v2-tune.css?v=343-card-step6-20260928a' not in idx: raise SystemExit('CACHE_BUSTER_BAD')
(root/'candidate-css-sha.txt').write_text(hashlib.sha256((root/'candidate/dashboard-v2-tune.css').read_bytes()).hexdigest())
PY
echo TWO_FILE_UI_DIFF_GATE_PASS

nonce="${GITHUB_RUN_ID:-manual}-flowpre-$(date +%s%N)"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/board?step6=$nonce" -o "$VERIFY/board-before.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/signals?step6=$nonce" -o "$VERIFY/signals-before.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/statistics?step6=$nonce" -o "$VERIFY/stats-before.json"
node - <<'NODE'
const fs=require('fs'),b=JSON.parse(fs.readFileSync('/tmp/b46-step6-deploy/verify/board-before.json')),s=JSON.parse(fs.readFileSync('/tmp/b46-step6-deploy/verify/signals-before.json')),t=JSON.parse(fs.readFileSync('/tmp/b46-step6-deploy/verify/stats-before.json'));if(b?.ok!==true||!Array.isArray(b.fixtures)||!Array.isArray(s.signals)||t?.ok!==true||!Array.isArray(t.rows))throw Error('PRE_FLOW_BAD');console.log('PRE_FLOW_OK',{fixtures:b.fixtures.length,signals:s.signals.length,stats:t.rows.length});
NODE

cat > "$RUNTIME/wrangler.jsonc" <<EOF
{"name":"ball46-production","main":"./index.js","compatibility_date":"2026-09-09","no_bundle":true,"services":[{"binding":"ENGINE","service":"nomadtips3-engine-343","environment":"production"},{"binding":"FULL_MARKET","service":"nomadtips3-full-market-343-ball46","environment":"production"},{"binding":"HUB","service":"nomadtips3-5usd-hub-343","environment":"production"}],"assets":{"directory":"$CAND","binding":"ASSETS","html_handling":"none","not_found_handling":"none","run_worker_first":true},"triggers":{"crons":["* * * * *"]}}
EOF
[ "$(find "$RUNTIME" -maxdepth 1 -type f -printf '%f\n'|sort|paste -sd, -)" = 'index.js,wrangler.jsonc' ] || { echo RUNTIME_DIR_BAD; exit 1; }
cd "$RUNTIME"
npx --yes wrangler@4.92.0 deploy --dry-run --config wrangler.jsonc 2>&1 | tee "$VERIFY/dry-run.log"
grep -Fq 'Read 79 files from the assets directory' "$VERIFY/dry-run.log" || { echo DRY_NOT_79; exit 1; }
! grep -Fq 'Attaching additional modules:' "$VERIFY/dry-run.log" || { echo DRY_EXTRA_MODULES; exit 1; }
echo DRY_RUN_PASS

python3 - <<'PY'
import json,os,urllib.request
A=os.environ['CLOUDFLARE_ACCOUNT_ID'];T=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {T}','Accept':'application/json'};u=f'https://api.cloudflare.com/client/v4/accounts/{A}/workers/scripts/ball46-production/deployments'
with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:j=json.load(r)
vs=j['result']['deployments'][0].get('versions') or [];cur=vs[0]['version_id'] if len(vs)==1 else 'MIXED';print('RACE_VERSION',cur)
if cur!='01c24c0c-6d6c-4e11-97c5-efc9414f2635': raise SystemExit('RACE_GUARD_MOVED:'+cur)
PY
echo RACE_GUARD_PASS

npx --yes wrangler@4.92.0 deploy --config wrangler.jsonc 2>&1 | tee "$VERIFY/deploy.log"
! grep -Fq 'Attaching additional modules:' "$VERIFY/deploy.log" || { echo DEPLOY_EXTRA_MODULES; exit 1; }
grep -Fq 'Found 2 new or modified static assets to upload' "$VERIFY/deploy.log" || { echo DEPLOY_NOT_TWO_ASSETS; exit 1; }
grep -Fq '+ /dashboard-v2-tune.css' "$VERIFY/deploy.log" || { echo CSS_NOT_UPLOADED; exit 1; }
grep -Fq '+ /index.html' "$VERIFY/deploy.log" || { echo INDEX_NOT_UPLOADED; exit 1; }
[ "$(grep -c '^+ /' "$VERIFY/deploy.log" || true)" = '2' ] || { echo DEPLOY_MORE_THAN_TWO; exit 1; }
echo DEPLOY_TWO_UI_ASSETS_COMPLETE

python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
root=pathlib.Path('/tmp/b46-step6-deploy');a=os.environ['CLOUDFLARE_ACCOUNT_ID'];t=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {t}','Accept':'application/json'};api=f'https://api.cloudflare.com/client/v4/accounts/{a}';s='ball46-production'
def get(u):
  with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as x:return json.load(x)
d=get(f'{api}/workers/scripts/{s}/deployments')['result']['deployments'][0];vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100: raise SystemExit('POST_MIXED_DEPLOYMENT')
vid=vs[0]['version_id'];v=get(f'{api}/workers/workers/{s}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or []
if len(mods)!=1 or mods[0].get('name')!='index.js': raise SystemExit('POST_MODULE_SHAPE_BAD')
sha=hashlib.sha256(base64.b64decode(mods[0]['content_base64'])).hexdigest()
if sha!='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed': raise SystemExit('POST_RUNTIME_SHA_BAD')
root.joinpath('post-version.txt').write_text(vid);print('POST_RUNTIME_PASS',vid,sha)
PY

nonce="${GITHUB_RUN_ID:-manual}-post-$(date +%s%N)"
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  mkdir -p "$POST/$(dirname "$rel")"
  code=$(curl -sS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' -o "$POST/$rel" -w '%{http_code}' "$DIRECT/$rel?step6post=$nonce-${RANDOM}") || true
  [ "$code" = 200 ] || { echo "POST_FETCH_FAILED:$code:$rel"; exit 1; }
  cmp -s "$POST/$rel" "$CAND/$rel" || { echo "POST_ASSET_MISMATCH:$rel"; exit 1; }
done < "$BASE/live-paths.txt"
echo POST_79_ASSETS_MATCH_CANDIDATE

nonce="${GITHUB_RUN_ID:-manual}-flowpost-$(date +%s%N)"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/board?step6post=$nonce" -o "$VERIFY/board-after.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/signals?step6post=$nonce" -o "$VERIFY/signals-after.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/statistics?step6post=$nonce" -o "$VERIFY/stats-after.json"
node - <<'NODE'
const fs=require('fs'),b=JSON.parse(fs.readFileSync('/tmp/b46-step6-deploy/verify/board-after.json')),s=JSON.parse(fs.readFileSync('/tmp/b46-step6-deploy/verify/signals-after.json')),t=JSON.parse(fs.readFileSync('/tmp/b46-step6-deploy/verify/stats-after.json'));if(b?.ok!==true||!Array.isArray(b.fixtures)||!Array.isArray(s.signals)||t?.ok!==true||!Array.isArray(t.rows))throw Error('POST_FLOW_BAD');console.log('POST_FLOW_OK',{fixtures:b.fixtures.length,signals:s.signals.length,stats:t.rows.length});
NODE

chrome=$(command -v google-chrome || command -v chromium || command -v chromium-browser)
"$chrome" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --window-size=1440,1050 --remote-debugging-port=9222 --user-data-dir="$ROOT/chrome" "$WWW/index.html?status=live&step6post=$nonce" >"$VERIFY/chrome.log" 2>&1 &
CPID=$!; trap 'kill $CPID 2>/dev/null || true' EXIT
for i in $(seq 1 40); do curl -fsS http://127.0.0.1:9222/json > "$VERIFY/pages.json" 2>/dev/null && break; sleep 1; done
test -s "$VERIFY/pages.json"
cat > "$VERIFY/check.js" <<'NODE'
const fs=require('fs');const pages=JSON.parse(fs.readFileSync('/tmp/b46-step6-deploy/verify/pages.json'));const p=pages.find(x=>x.type==='page');if(!p)throw Error('NO_PAGE');const ws=new WebSocket(p.webSocketDebuggerUrl);let id=0;const q=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&q.has(m.id)){const x=q.get(m.id);q.delete(m.id);m.error?x.j(Error(JSON.stringify(m.error))):x.r(m.result)}};const call=(method,params={})=>new Promise((r,j)=>{const n=++id;q.set(n,{r,j});ws.send(JSON.stringify({id:n,method,params}))});const sleep=ms=>new Promise(r=>setTimeout(r,ms));async function ev(expression){const z=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(z.exceptionDetails)throw Error(JSON.stringify(z.exceptionDetails));return z.result.value}async function wait(x,t=25000){const s=Date.now();while(Date.now()-s<t){try{if(await ev(x))return}catch{}await sleep(250)}throw Error('WAIT:'+x)};(async()=>{await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});await call('Runtime.enable');await wait(`document.readyState==='complete'`);await wait(`document.querySelectorAll('.match-row[data-match-id]').length>0`);await sleep(3000);const g=await ev(`(()=>{const r=document.querySelector('.match-row[data-match-id]'),t=r.querySelector('.teams-cell'),sc=r.querySelector('.score-cell'),sg=r.querySelector('.signal-cell'),names=[...t.querySelectorAll('b')],scores=[...sc.querySelectorAll('strong')],clock=sc.querySelector('small:not(.half-score)'),half=sc.querySelector('.half-score'),link=[...document.querySelectorAll('link[rel="stylesheet"]')].find(x=>x.href.includes('dashboard-v2-tune.css'));const c=x=>{const a=x.getBoundingClientRect();return {w:a.width,h:a.height,cy:a.y+a.height/2}};const cells=[t,sc,...r.querySelectorAll('.market-cell'),sg].map(c),sum=cells.reduce((a,x)=>a+x.w,0);return {row:c(r),cells,signal:c(sg),nameCenters:names.map(x=>c(x).cy),scoreCenters:scores.map(x=>c(x).cy),clock:c(clock),half:c(half),overflow:r.scrollWidth>r.clientWidth+1,href:link?.getAttribute('href')||'',ratios:{team:cells[0].w/sum,score:cells[1].w/sum,signal:cells[5].w/sum}}})()`);const nameAlign=Math.max(...g.nameCenters.map((v,i)=>Math.abs(v-g.scoreCenters[i]))),timeAlign=Math.abs(g.clock.cy-g.half.cy);if(g.overflow||nameAlign>4||timeAlign>3||g.signal.w<105||!g.href.includes('343-card-step6-20260928a'))throw Error('POST_BROWSER_BAD:'+JSON.stringify({g,nameAlign,timeAlign}));console.log('POST_BROWSER_STEP6_PASS',JSON.stringify({g,nameAlign,timeAlign}));fs.writeFileSync('/tmp/b46-step6-deploy/browser-result.json',JSON.stringify({g,nameAlign,timeAlign},null,2));ws.close();process.exit(0)})().catch(e=>{console.error(e);try{ws.close()}catch{}process.exit(1)});
NODE
node "$VERIFY/check.js"
kill "$CPID" 2>/dev/null || true; trap - EXIT

echo BALL46_CARD_STEP6_DEPLOY_VERIFIED
