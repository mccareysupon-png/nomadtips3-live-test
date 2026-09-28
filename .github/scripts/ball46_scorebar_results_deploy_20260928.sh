#!/usr/bin/env bash
set -euo pipefail
WORKER='ball46-production'
DIRECT='https://ball46-production.mccarey-supon.workers.dev'
WWW='https://www.ball46.com'
EXPECTED_VERSION='35a2bad7-c5ca-4163-85ef-6a37b18bffbd'
EXPECTED_RUNTIME_SHA='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed'
ROOT='/tmp/b46-scorebar-result-predeploy'
BASE="$ROOT/base"; CAND="$ROOT/candidate"; VERIFY='/tmp/b46-scorebar-result-deploy-verify'; RUNTIME='/tmp/b46-scorebar-result-runtime'; POST='/tmp/b46-scorebar-result-post'
rm -rf "$VERIFY" "$RUNTIME" "$POST"; mkdir -p "$VERIFY" "$RUNTIME" "$POST"
[ -s "$ROOT/paths.txt" ] || { echo ARTIFACT_PATHS_MISSING; exit 1; }
[ "$(wc -l < "$ROOT/paths.txt" | tr -d ' ')" = '79' ] || { echo ARTIFACT_PATHS_NOT_79; exit 1; }
[ "$(find "$BASE" -type f | wc -l | tr -d ' ')" = '79' ] || { echo ARTIFACT_BASE_NOT_79; exit 1; }
[ "$(find "$CAND" -type f | wc -l | tr -d ' ')" = '79' ] || { echo ARTIFACT_CAND_NOT_79; exit 1; }
python3 - <<'PY'
from pathlib import Path
import hashlib
r=Path('/tmp/b46-scorebar-result-predeploy');paths=[x.strip() for x in (r/'paths.txt').read_text().splitlines() if x.strip()];changed=[]
for p in paths:
 a=r/'base'/p;b=r/'candidate'/p
 if not a.is_file() or not b.is_file(): raise SystemExit('ARTIFACT_FILE_MISSING:'+p)
 if hashlib.sha256(a.read_bytes()).digest()!=hashlib.sha256(b.read_bytes()).digest():changed.append(p)
print('ARTIFACT_CHANGED_ASSETS',changed)
want=['dashboard-v2-stage3.js','index.html','singlepage-workspace-343.css']
if sorted(changed)!=sorted(want): raise SystemExit('ARTIFACT_DIFF_BAD:'+repr(changed))
for p in want: print('CAND_SHA',p,hashlib.sha256((r/'candidate'/p).read_bytes()).hexdigest())
js=(r/'candidate/dashboard-v2-stage3.js').read_text();css=(r/'candidate/singlepage-workspace-343.css').read_text();idx=(r/'candidate/index.html').read_text()
for m in ['BALL46_SCOREBAR_RESULT_DETAIL_20260928','BALL46_SCOREBAR_RESULT_VISUALS_20260928','outcome-win','outcome-loss','outcome-draw','workspace-scorebar-live']:
 if m not in js and m not in css: raise SystemExit('CAND_MARKER_MISSING:'+m)
for ref in ['singlepage-workspace-343.css?v=343-scorebar-result-20260928a','dashboard-v2-stage3.js?v=343-scorebar-result-20260928a']:
 if ref not in idx: raise SystemExit('CAND_BUSTER_MISSING:'+ref)
print('ARTIFACT_GATE_PASS')
PY
node --check "$CAND/dashboard-v2-stage3.js"

# Lock current Worker runtime/bindings/cron and save exact runtime module.
python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
root=pathlib.Path('/tmp/b46-scorebar-result-runtime');a=os.environ['CLOUDFLARE_ACCOUNT_ID'];t=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {t}','Accept':'application/json'};api=f'https://api.cloudflare.com/client/v4/accounts/{a}';s='ball46-production'
def get(u):
 with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as x:return json.load(x)
def lock(tag):
 d=get(f'{api}/workers/scripts/{s}/deployments')['result']['deployments'][0];vs=d.get('versions') or []
 if len(vs)!=1 or float(vs[0].get('percentage',0))!=100: raise SystemExit(tag+'_MIXED_DEPLOYMENT')
 vid=vs[0]['version_id'];
 if vid!='35a2bad7-c5ca-4163-85ef-6a37b18bffbd': raise SystemExit(tag+'_VERSION_MOVED:'+vid)
 v=get(f'{api}/workers/workers/{s}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or []
 if len(mods)!=1 or mods[0].get('name')!='index.js' or not mods[0].get('content_base64'): raise SystemExit(tag+'_MODULE_SHAPE_BAD')
 runtime=base64.b64decode(mods[0]['content_base64']);sha=hashlib.sha256(runtime).hexdigest()
 if sha!='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed': raise SystemExit(tag+'_RUNTIME_SHA_BAD:'+sha)
 expect=[('ASSETS','assets',None,None),('ENGINE','service','nomadtips3-engine-343','production'),('FULL_MARKET','service','nomadtips3-full-market-343-ball46','production'),('HUB','service','nomadtips3-5usd-hub-343','production')]
 got=sorted((b.get('name'),b.get('type'),b.get('service'),b.get('environment')) for b in (v.get('bindings') or []))
 if got!=sorted(expect): raise SystemExit(tag+'_BINDINGS_BAD:'+repr(got))
 sched=get(f'{api}/workers/scripts/{s}/schedules')['result'];ss=sched.get('schedules',[]) if isinstance(sched,dict) else (sched or []);crons=[x.get('cron') for x in ss if isinstance(x,dict) and x.get('cron')]
 if crons!=['* * * * *']: raise SystemExit(tag+'_CRON_BAD:'+repr(crons))
 return vid,runtime,sha
vid,runtime,sha=lock('PRE');(root/'index.js').write_bytes(runtime);(root/'pre-version.txt').write_text(vid);print('PRE_RUNTIME_LOCK_PASS',vid,sha)
PY

# Byte-for-byte race guard: all 79 Production assets must still equal the proven predeploy base.
RACE='/tmp/b46-scorebar-result-race'; rm -rf "$RACE"; mkdir -p "$RACE"
nonce="${GITHUB_RUN_ID:-manual}-race-$(date +%s%N)"
while IFS= read -r rel; do
 mkdir -p "$RACE/$(dirname "$rel")"
 code=$(curl -sS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' -o "$RACE/$rel" -w '%{http_code}' "$DIRECT/$rel?race=$nonce-${RANDOM}") || true
 [ "$code" = 200 ] || { echo "RACE_FETCH_FAILED:$code:$rel"; exit 1; }
 cmp -s "$RACE/$rel" "$BASE/$rel" || { echo "RACE_ASSET_MOVED:$rel"; exit 1; }
done < "$ROOT/paths.txt"
echo RACE_79_ASSETS_PASS

nonce="${GITHUB_RUN_ID:-manual}-preapi-$(date +%s%N)"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/board?pre=$nonce" -o "$VERIFY/board-before.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/signals?pre=$nonce" -o "$VERIFY/signals-before.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/statistics?pre=$nonce" -o "$VERIFY/statistics-before.json"
node - <<'NODE'
const fs=require('fs'),b=JSON.parse(fs.readFileSync('/tmp/b46-scorebar-result-deploy-verify/board-before.json')),s=JSON.parse(fs.readFileSync('/tmp/b46-scorebar-result-deploy-verify/signals-before.json')),t=JSON.parse(fs.readFileSync('/tmp/b46-scorebar-result-deploy-verify/statistics-before.json'));if(b?.ok!==true||!Array.isArray(b.fixtures)||!Array.isArray(s.signals)||t?.ok!==true||!Array.isArray(t.rows))throw Error('PRE_API_BAD');console.log('PRE_API_HEALTH_PASS',{fixtures:b.fixtures.length,signals:s.signals.length,stats:t.rows.length});
NODE

cat > "$RUNTIME/wrangler.jsonc" <<EOF
{"name":"ball46-production","main":"./index.js","compatibility_date":"2026-09-09","no_bundle":true,"services":[{"binding":"ENGINE","service":"nomadtips3-engine-343","environment":"production"},{"binding":"FULL_MARKET","service":"nomadtips3-full-market-343-ball46","environment":"production"},{"binding":"HUB","service":"nomadtips3-5usd-hub-343","environment":"production"}],"assets":{"directory":"$CAND","binding":"ASSETS","html_handling":"none","not_found_handling":"none","run_worker_first":true},"triggers":{"crons":["* * * * *"]}}
EOF
cd "$RUNTIME"
npx --yes wrangler@4.92.0 deploy --dry-run --config wrangler.jsonc 2>&1 | tee "$VERIFY/dry-run.log"
grep -Fq 'Read 79 files from the assets directory' "$VERIFY/dry-run.log" || { echo DRY_NOT_79; exit 1; }
! grep -Fq 'Attaching additional modules:' "$VERIFY/dry-run.log" || { echo DRY_EXTRA_MODULES; exit 1; }
echo DRY_RUN_PASS

# Final version race guard immediately before deploy.
python3 - <<'PY'
import json,os,urllib.request
A=os.environ['CLOUDFLARE_ACCOUNT_ID'];T=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {T}','Accept':'application/json'};u=f'https://api.cloudflare.com/client/v4/accounts/{A}/workers/scripts/ball46-production/deployments'
with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:j=json.load(r)
vs=j['result']['deployments'][0].get('versions') or [];cur=vs[0]['version_id'] if len(vs)==1 else 'MIXED';print('FINAL_RACE_VERSION',cur)
if cur!='35a2bad7-c5ca-4163-85ef-6a37b18bffbd': raise SystemExit('FINAL_RACE_MOVED:'+cur)
PY

echo FINAL_RACE_GUARD_PASS
npx --yes wrangler@4.92.0 deploy --config wrangler.jsonc 2>&1 | tee "$VERIFY/deploy.log"
! grep -Fq 'Attaching additional modules:' "$VERIFY/deploy.log" || { echo DEPLOY_EXTRA_MODULES; exit 1; }
grep -Fq 'Found 3 new or modified static assets to upload' "$VERIFY/deploy.log" || { echo DEPLOY_NOT_THREE; exit 1; }
for rel in dashboard-v2-stage3.js singlepage-workspace-343.css index.html; do grep -Fq "+ /$rel" "$VERIFY/deploy.log" || { echo "DEPLOY_MISSING:$rel"; exit 1; }; done
[ "$(grep -c '^+ /' "$VERIFY/deploy.log" || true)" = '3' ] || { echo DEPLOY_MORE_THAN_THREE; exit 1; }
echo DEPLOY_EXACT_THREE_ASSETS_PASS

# Post-deploy runtime/bindings/cron lock; capture new Production version.
python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
root=pathlib.Path('/tmp/b46-scorebar-result-deploy-verify');a=os.environ['CLOUDFLARE_ACCOUNT_ID'];t=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {t}','Accept':'application/json'};api=f'https://api.cloudflare.com/client/v4/accounts/{a}';s='ball46-production'
def get(u):
 with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as x:return json.load(x)
d=get(f'{api}/workers/scripts/{s}/deployments')['result']['deployments'][0];vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100: raise SystemExit('POST_MIXED_DEPLOYMENT')
vid=vs[0]['version_id'];v=get(f'{api}/workers/workers/{s}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or []
if len(mods)!=1 or mods[0].get('name')!='index.js' or not mods[0].get('content_base64'): raise SystemExit('POST_MODULE_BAD')
sha=hashlib.sha256(base64.b64decode(mods[0]['content_base64'])).hexdigest()
if sha!='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed': raise SystemExit('POST_RUNTIME_SHA_BAD:'+sha)
expect=[('ASSETS','assets',None,None),('ENGINE','service','nomadtips3-engine-343','production'),('FULL_MARKET','service','nomadtips3-full-market-343-ball46','production'),('HUB','service','nomadtips3-5usd-hub-343','production')]
got=sorted((b.get('name'),b.get('type'),b.get('service'),b.get('environment')) for b in (v.get('bindings') or []))
if got!=sorted(expect): raise SystemExit('POST_BINDINGS_BAD:'+repr(got))
sched=get(f'{api}/workers/scripts/{s}/schedules')['result'];ss=sched.get('schedules',[]) if isinstance(sched,dict) else (sched or []);crons=[x.get('cron') for x in ss if isinstance(x,dict) and x.get('cron')]
if crons!=['* * * * *']: raise SystemExit('POST_CRON_BAD:'+repr(crons))
(root/'post-version.txt').write_text(vid);print('POST_RUNTIME_LOCK_PASS',vid,sha)
PY

# Every deployed asset must equal candidate exactly.
nonce="${GITHUB_RUN_ID:-manual}-post-$(date +%s%N)"
while IFS= read -r rel; do
 mkdir -p "$POST/$(dirname "$rel")"
 code=$(curl -sS -L --retry 5 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' -o "$POST/$rel" -w '%{http_code}' "$DIRECT/$rel?post=$nonce-${RANDOM}") || true
 [ "$code" = 200 ] || { echo "POST_FETCH_FAILED:$code:$rel"; exit 1; }
 cmp -s "$POST/$rel" "$CAND/$rel" || { echo "POST_ASSET_MISMATCH:$rel"; exit 1; }
done < "$ROOT/paths.txt"
echo POST_79_MATCH_CANDIDATE

nonce="${GITHUB_RUN_ID:-manual}-postapi-$(date +%s%N)"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/board?post=$nonce" -o "$VERIFY/board-after.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/signals?post=$nonce" -o "$VERIFY/signals-after.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/statistics?post=$nonce" -o "$VERIFY/statistics-after.json"
node - <<'NODE'
const fs=require('fs'),b=JSON.parse(fs.readFileSync('/tmp/b46-scorebar-result-deploy-verify/board-after.json')),s=JSON.parse(fs.readFileSync('/tmp/b46-scorebar-result-deploy-verify/signals-after.json')),t=JSON.parse(fs.readFileSync('/tmp/b46-scorebar-result-deploy-verify/statistics-after.json'));if(b?.ok!==true||!Array.isArray(b.fixtures)||!Array.isArray(s.signals)||t?.ok!==true||!Array.isArray(t.rows))throw Error('POST_API_BAD');console.log('POST_API_HEALTH_PASS',{fixtures:b.fixtures.length,signals:s.signals.length,stats:t.rows.length});
NODE

# Public browser proof, desktop then mobile. No fixed scores: derive WIN/LOSS/DRAW from what Production displays.
chrome=$(command -v google-chrome || command -v chromium || command -v chromium-browser)
rm -rf "$VERIFY/chrome"; mkdir -p "$VERIFY/chrome"
"$chrome" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --remote-debugging-port=9444 --user-data-dir="$VERIFY/chrome" --window-size=1440,900 "$WWW/?scorebar-result=${GITHUB_RUN_ID:-manual}-$(date +%s%N)" >"$VERIFY/chrome.log" 2>&1 & CHROME_PID=$!
trap 'kill ${CHROME_PID:-0} 2>/dev/null || true' EXIT
rm -f "$VERIFY/pages.json" "$VERIFY/pages.tmp"
for i in $(seq 1 120); do
 if curl -fsS http://127.0.0.1:9444/json > "$VERIFY/pages.tmp" 2>/dev/null && python3 -c "import json,sys; x=json.load(open(sys.argv[1])); assert any(i.get('type')=='page' and i.get('webSocketDebuggerUrl') for i in x)" "$VERIFY/pages.tmp" 2>/dev/null; then mv "$VERIFY/pages.tmp" "$VERIFY/pages.json"; break; fi
 sleep .25
done
[ -s "$VERIFY/pages.json" ] || { echo POST_CHROME_NOT_READY; exit 1; }
cat > "$VERIFY/browser-check.js" <<'NODE'
const fs=require('fs'),pages=JSON.parse(fs.readFileSync('/tmp/b46-scorebar-result-deploy-verify/pages.json')),p=pages.find(x=>x.type==='page');if(!p)throw Error('NO_PAGE');const ws=new WebSocket(p.webSocketDebuggerUrl);let id=0,q=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&q.has(m.id)){const z=q.get(m.id);q.delete(m.id);m.error?z.j(Error(JSON.stringify(m.error))):z.r(m.result)}};const call=(method,params={})=>new Promise((r,j)=>{const n=++id;q.set(n,{r,j});ws.send(JSON.stringify({id:n,method,params}))}),sleep=ms=>new Promise(r=>setTimeout(r,ms));async function ev(x){const z=await call('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});if(z.exceptionDetails)throw Error(JSON.stringify(z.exceptionDetails));return z.result.value}async function wait(x,t=30000){const s=Date.now();while(Date.now()-s<t){try{if(await ev(x))return}catch{}await sleep(250)}throw Error('WAIT:'+x)};(async()=>{await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});await call('Runtime.enable');await call('Page.enable');await wait(`document.readyState==='complete'`);await wait(`document.querySelectorAll('[data-workspace-scorebar-slot] .workspace-scorebar-grid > *').length===10`);await wait(`document.querySelectorAll('.match-row[data-match-id]').length>0`);await sleep(1200);const out=await ev(`(()=>{const grid=document.querySelector('[data-workspace-scorebar-slot] .workspace-scorebar-grid'),cells=[...grid.children],first=cells.slice(0,6),last=cells.slice(6),parseScore=x=>{const s=x.querySelector('.workspace-scorebar-meta b')?.textContent||'';const m=s.match(/(\\d+)\\D+(\\d+)/);return m?[+m[1],+m[2]]:null},results=first.map(x=>({result:x.classList.contains('workspace-scorebar-result'),score:parseScore(x),rows:[...x.querySelectorAll('.workspace-scorebar-team')].map(r=>({label:r.querySelector('em')?.textContent.trim()||'',cls:r.className,bg:getComputedStyle(r).backgroundColor,img:getComputedStyle(r).backgroundImage,badge:r.querySelector('em')?getComputedStyle(r.querySelector('em')).backgroundColor:''}))})),live=last.map(x=>({placeholder:x.classList.contains('placeholder'),live:x.classList.contains('workspace-scorebar-live'),status:x.querySelector('.workspace-scorebar-meta i')?.textContent.trim()||'',img:getComputedStyle(x).backgroundImage})),css=[...document.querySelectorAll('link[rel=stylesheet]')].find(x=>(x.getAttribute('href')||'').includes('singlepage-workspace-343.css'))?.getAttribute('href')||'',js=[...document.scripts].find(x=>(x.getAttribute('src')||'').includes('dashboard-v2-stage3.js'))?.getAttribute('src')||'',mainOverflow=[...document.querySelectorAll('.match-row[data-match-id]')].some(x=>x.scrollWidth>x.clientWidth+1);return {count:cells.length,results,live,overflow:grid.scrollWidth>grid.clientWidth+1,odds:!!window.NOMAD343_ODDS,favicon:!!document.querySelector('link[data-ball46-favicon="20260928"]'),css,js,mainOverflow}})()`);if(out.count!==10||out.overflow||out.mainOverflow||!out.odds||!out.favicon)throw Error('DESKTOP_BASIC_BAD:'+JSON.stringify(out));if(!out.css.includes('343-scorebar-result-20260928a')||!out.js.includes('343-scorebar-result-20260928a'))throw Error('BUSTER_BAD');const colors={WIN:{row:'rgb(16, 58, 36)',badge:'rgb(22, 163, 74)',cls:'outcome-win'},LOSS:{row:'rgb(59, 18, 18)',badge:'rgb(220, 38, 38)',cls:'outcome-loss'},DRAW:{row:'rgb(47, 52, 60)',badge:'rgb(107, 114, 128)',cls:'outcome-draw'}};for(const r of out.results){if(!r.result||!r.score||r.rows.length!==2)throw Error('RESULT_SHAPE_BAD:'+JSON.stringify(r));const [h,a]=r.score,expect=h===a?['DRAW','DRAW']:h>a?['WIN','LOSS']:['LOSS','WIN'];for(let i=0;i<2;i++){const row=r.rows[i],lab=expect[i],c=colors[lab];if(row.label!==lab||!row.cls.includes(c.cls)||row.bg!==c.row||row.badge!==c.badge||!row.img.includes('svg+xml'))throw Error('RESULT_VISUAL_BAD:'+JSON.stringify({r,i,expect,row,c}))}}for(const x of out.live){if(!x.placeholder){if(!x.live||!x.img.includes('svg+xml'))throw Error('LIVE_VISUAL_BAD:'+JSON.stringify(x))}}await call('Emulation.setDeviceMetricsOverride',{width:390,height:850,deviceScaleFactor:1,mobile:false});await call('Page.reload',{ignoreCache:true});await wait(`document.readyState==='complete'`);await wait(`document.querySelectorAll('.match-row[data-match-id]').length>0`);await sleep(800);const mobile=await ev(`(()=>{const s=document.querySelector('[data-workspace-scorebar-slot]');return {display:getComputedStyle(s).display,matchOverflow:[...document.querySelectorAll('.match-row[data-match-id]')].some(x=>x.scrollWidth>x.clientWidth+1),odds:!!window.NOMAD343_ODDS,favicon:!!document.querySelector('link[data-ball46-favicon="20260928"]')}})()`);if(mobile.display!=='none'||mobile.matchOverflow||!mobile.odds||!mobile.favicon)throw Error('MOBILE_BAD:'+JSON.stringify(mobile));console.log('POST_BROWSER_PASS',JSON.stringify({desktop:out,mobile}));fs.writeFileSync('/tmp/b46-scorebar-result-deploy-verify/browser.json',JSON.stringify({desktop:out,mobile},null,2));ws.close();process.exit(0)})().catch(e=>{console.error(e);try{ws.close()}catch{}process.exit(1)});
NODE
node "$VERIFY/browser-check.js"
echo BALL46_SCOREBAR_RESULTS_DEPLOY_SUCCESS
