#!/usr/bin/env bash
set -euo pipefail
WORKER='ball46-production'
DIRECT='https://ball46-production.mccarey-supon.workers.dev'
WWW='https://www.ball46.com'
EXPECTED_VERSION='f3476eaa-51e8-41ce-ac71-ccce20c09ce9'
EXPECTED_RUNTIME_SHA='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed'
SRC='/tmp/b46-predeploy'; BASE="$SRC/live"; CAND="$SRC/candidate"
ROOT='/tmp/b46-horizontal-deploy'; RUNTIME="$ROOT/runtime"; VERIFY="$ROOT/verify"; POST="$ROOT/post"
rm -rf "$ROOT"; mkdir -p "$RUNTIME" "$VERIFY" "$POST"
[ -d "$BASE" ] && [ -d "$CAND" ] || { echo PREDEPLOY_ARTIFACT_MISSING; exit 1; }
[ "$(find "$BASE" -type f | wc -l | tr -d ' ')" = '79' ] || { echo BASE_NOT_79; exit 1; }
[ "$(find "$CAND" -type f | wc -l | tr -d ' ')" = '79' ] || { echo CAND_NOT_79; exit 1; }
python3 - <<'PY'
from pathlib import Path
import hashlib
base=Path('/tmp/b46-predeploy/live');cand=Path('/tmp/b46-predeploy/candidate');paths=sorted(p.relative_to(base).as_posix() for p in base.rglob('*') if p.is_file());changed=[]
for rel in paths:
 if hashlib.sha256((base/rel).read_bytes()).digest()!=hashlib.sha256((cand/rel).read_bytes()).digest(): changed.append(rel)
print('PREDEPLOY_CHANGED_ASSETS',changed)
if changed!=['dashboard-v2-stage3.js','dashboard-v2-tune.css','index.html']: raise SystemExit('PREDEPLOY_DIFF_BAD')
if 'BALL46 HORIZONTAL CARD BALANCE 20260928' not in (cand/'dashboard-v2-tune.css').read_text(): raise SystemExit('HORIZONTAL_MARKER_MISSING')
if 'desktop-team-score' not in (cand/'dashboard-v2-stage3.js').read_text(): raise SystemExit('RENDER_MARKER_MISSING')
idx=(cand/'index.html').read_text()
if 'dashboard-v2-tune.css?v=343-horizontal-card-20260928a' not in idx or 'dashboard-v2-stage3.js?v=343-horizontal-card-20260928a' not in idx: raise SystemExit('CACHE_BUSTERS_MISSING')
print('PREDEPLOY_ARTIFACT_GATE_PASS')
PY
python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
root=pathlib.Path('/tmp/b46-horizontal-deploy');a=os.environ['CLOUDFLARE_ACCOUNT_ID'];t=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {t}','Accept':'application/json'};api=f'https://api.cloudflare.com/client/v4/accounts/{a}';s='ball46-production'
def get(u):
 with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:return json.load(r)
d=get(f'{api}/workers/scripts/{s}/deployments')['result']['deployments'][0];vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100: raise SystemExit('MIXED_DEPLOYMENT')
vid=vs[0]['version_id']
if vid!='f3476eaa-51e8-41ce-ac71-ccce20c09ce9': raise SystemExit('PRODUCTION_MOVED:'+vid)
v=get(f'{api}/workers/workers/{s}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or []
if len(mods)!=1 or mods[0].get('name')!='index.js' or not mods[0].get('content_base64'): raise SystemExit('MODULE_SHAPE_BAD')
runtime=base64.b64decode(mods[0]['content_base64']);sha=hashlib.sha256(runtime).hexdigest()
if sha!='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed': raise SystemExit('RUNTIME_CHANGED:'+sha)
expect=[('ASSETS','assets',None,None),('ENGINE','service','nomadtips3-engine-343','production'),('FULL_MARKET','service','nomadtips3-full-market-343-ball46','production'),('HUB','service','nomadtips3-5usd-hub-343','production')]
got=sorted((b.get('name'),b.get('type'),b.get('service'),b.get('environment')) for b in (v.get('bindings') or []))
if got!=sorted(expect): raise SystemExit('BINDINGS_CHANGED:'+repr(got))
if v.get('compatibility_date')!='2026-09-09' or (v.get('compatibility_flags') or []): raise SystemExit('COMPAT_CHANGED')
ac=(v.get('assets') or {}).get('config') or {};ex={'base_path':'/','html_handling':'none','not_found_handling':'none','run_worker_first':True}
if {k:ac.get(k) for k in ex}!=ex: raise SystemExit('ASSET_CONFIG_CHANGED:'+repr(ac))
sched=get(f'{api}/workers/scripts/{s}/schedules')['result'];ss=sched.get('schedules',[]) if isinstance(sched,dict) else (sched or [])
if [x.get('cron') for x in ss if isinstance(x,dict) and x.get('cron')]!=['* * * * *']: raise SystemExit('CRON_CHANGED')
root.joinpath('runtime/index.js').write_bytes(runtime);root.joinpath('pre-lock.json').write_text(json.dumps({'version':vid,'sha':sha,'bindings':got,'assets':ac},indent=2));print('PRE_PRODUCTION_LOCK_PASS',vid,sha)
PY
nonce="${GITHUB_RUN_ID:-manual}-race79-$(date +%s%N)"
while IFS= read -r rel; do [ -n "$rel" ] || continue; mkdir -p "$ROOT/race/$(dirname "$rel")"; code=$(curl -sS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' -o "$ROOT/race/$rel" -w '%{http_code}' "$DIRECT/$rel?hcardrace=$nonce-${RANDOM}") || true; [ "$code" = 200 ] || { echo "RACE_FETCH_FAILED:$code:$rel"; exit 1; }; cmp -s "$ROOT/race/$rel" "$BASE/$rel" || { echo "PRODUCTION_ASSET_MOVED:$rel"; exit 1; }; done < <(cd "$BASE" && find . -type f -printf '%P\n' | sort)
echo RACE_79_ASSETS_PASS
nonce="${GITHUB_RUN_ID:-manual}-prehealth-$(date +%s%N)"; for ep in board signals statistics; do curl -fsS -L --retry 3 --retry-all-errors --max-time 30 "$WWW/api/engine/$ep?hcardpre=$nonce" -o "$VERIFY/$ep-before.json"; done
python3 - <<'PY'
import json,pathlib
r=pathlib.Path('/tmp/b46-horizontal-deploy/verify')
for n in ['board','signals','statistics']:
 if json.load(open(r/f'{n}-before.json')).get('ok') is not True: raise SystemExit('PRE_API_BAD:'+n)
print('PRE_API_HEALTH_PASS')
PY
cat > "$RUNTIME/wrangler.jsonc" <<EOF
{"name":"ball46-production","main":"./index.js","compatibility_date":"2026-09-09","no_bundle":true,"services":[{"binding":"ENGINE","service":"nomadtips3-engine-343","environment":"production"},{"binding":"FULL_MARKET","service":"nomadtips3-full-market-343-ball46","environment":"production"},{"binding":"HUB","service":"nomadtips3-5usd-hub-343","environment":"production"}],"assets":{"directory":"$CAND","binding":"ASSETS","html_handling":"none","not_found_handling":"none","run_worker_first":true},"triggers":{"crons":["* * * * *"]}}
EOF
cd "$RUNTIME"; npx --yes wrangler@4.92.0 deploy --dry-run --config wrangler.jsonc 2>&1 | tee "$VERIFY/dry-run.log"; grep -Fq 'Read 79 files from the assets directory' "$VERIFY/dry-run.log" || { echo DRY_NOT_79; exit 1; }; ! grep -Fq 'Attaching additional modules:' "$VERIFY/dry-run.log" || { echo DRY_EXTRA_MODULES; exit 1; }; echo DRY_RUN_PASS
python3 - <<'PY'
import json,os,urllib.request
A=os.environ['CLOUDFLARE_ACCOUNT_ID'];T=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {T}','Accept':'application/json'};u=f'https://api.cloudflare.com/client/v4/accounts/{A}/workers/scripts/ball46-production/deployments'
with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:j=json.load(r)
vs=j['result']['deployments'][0].get('versions') or [];cur=vs[0]['version_id'] if len(vs)==1 else 'MIXED';print('FINAL_RACE_VERSION',cur)
if cur!='f3476eaa-51e8-41ce-ac71-ccce20c09ce9': raise SystemExit('FINAL_RACE_MOVED:'+cur)
PY
npx --yes wrangler@4.92.0 deploy --config wrangler.jsonc 2>&1 | tee "$VERIFY/deploy.log"; ! grep -Fq 'Attaching additional modules:' "$VERIFY/deploy.log" || { echo DEPLOY_EXTRA_MODULES; exit 1; }; grep -Fq 'Found 3 new or modified static assets to upload' "$VERIFY/deploy.log" || { echo DEPLOY_NOT_THREE_ASSETS; exit 1; }; for p in dashboard-v2-stage3.js dashboard-v2-tune.css index.html; do grep -Fq "+ /$p" "$VERIFY/deploy.log" || { echo "EXPECTED_UPLOAD_MISSING:$p"; exit 1; }; done; [ "$(grep -c '^+ /' "$VERIFY/deploy.log" || true)" = '3' ] || { echo DEPLOY_MORE_THAN_THREE; exit 1; }; echo DEPLOY_EXACT_THREE_ASSETS_PASS
python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
root=pathlib.Path('/tmp/b46-horizontal-deploy');a=os.environ['CLOUDFLARE_ACCOUNT_ID'];t=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {t}','Accept':'application/json'};api=f'https://api.cloudflare.com/client/v4/accounts/{a}';s='ball46-production'
def get(u):
 with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:return json.load(r)
d=get(f'{api}/workers/scripts/{s}/deployments')['result']['deployments'][0];vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100: raise SystemExit('POST_MIXED')
vid=vs[0]['version_id'];v=get(f'{api}/workers/workers/{s}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or []
if len(mods)!=1 or mods[0].get('name')!='index.js': raise SystemExit('POST_MODULE_SHAPE_BAD')
sha=hashlib.sha256(base64.b64decode(mods[0]['content_base64'])).hexdigest()
if sha!='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed': raise SystemExit('POST_RUNTIME_CHANGED:'+sha)
expect=[('ASSETS','assets',None,None),('ENGINE','service','nomadtips3-engine-343','production'),('FULL_MARKET','service','nomadtips3-full-market-343-ball46','production'),('HUB','service','nomadtips3-5usd-hub-343','production')];got=sorted((b.get('name'),b.get('type'),b.get('service'),b.get('environment')) for b in (v.get('bindings') or []))
if got!=sorted(expect): raise SystemExit('POST_BINDINGS_CHANGED')
root.joinpath('post-lock.json').write_text(json.dumps({'version':vid,'runtime_sha256':sha},indent=2));print('POST_RUNTIME_LOCK_PASS',vid,sha)
PY
for attempt in $(seq 1 12); do rm -rf "$POST"; mkdir -p "$POST"; ok=1; nonce="${GITHUB_RUN_ID:-manual}-post${attempt}-$(date +%s%N)"; while IFS= read -r rel; do [ -n "$rel" ] || continue; mkdir -p "$POST/$(dirname "$rel")"; code=$(curl -sS -L --retry 2 --retry-all-errors --max-time 20 -H 'Cache-Control: no-cache' -o "$POST/$rel" -w '%{http_code}' "$DIRECT/$rel?hcardpost=$nonce-${RANDOM}") || true; if [ "$code" != 200 ] || ! cmp -s "$POST/$rel" "$CAND/$rel"; then ok=0; break; fi; done < <(cd "$CAND" && find . -type f -printf '%P\n' | sort); [ "$ok" = 1 ] && { echo POST_79_MATCH_CANDIDATE; break; }; [ "$attempt" = 12 ] && { echo POST_PROPAGATION_NOT_CONVERGED; exit 1; }; sleep 2; done
nonce="${GITHUB_RUN_ID:-manual}-posthealth-$(date +%s%N)"; for ep in board signals statistics; do curl -fsS -L --retry 3 --retry-all-errors --max-time 30 "$WWW/api/engine/$ep?hcardpost=$nonce" -o "$VERIFY/$ep-after.json"; done
python3 - <<'PY'
import json,pathlib
r=pathlib.Path('/tmp/b46-horizontal-deploy/verify')
for n in ['board','signals','statistics']:
 if json.load(open(r/f'{n}-after.json')).get('ok') is not True: raise SystemExit('POST_API_BAD:'+n)
print('POST_API_HEALTH_PASS')
PY
chrome=$(command -v google-chrome || command -v chromium || command -v chromium-browser || true); [ -n "$chrome" ] || { echo CHROME_NOT_FOUND; exit 1; }
"$chrome" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --window-size=1440,1050 --remote-debugging-port=9224 --user-data-dir="$ROOT/chrome" "$WWW/?hcardactual=${GITHUB_RUN_ID:-manual}" >"$ROOT/chrome.log" 2>&1 & CPID=$!; trap 'kill $CPID 2>/dev/null || true' EXIT
for i in $(seq 1 40); do curl -fsS http://127.0.0.1:9224/json > "$ROOT/pages.json" 2>/dev/null && break; sleep 1; done; test -s "$ROOT/pages.json"
cat > "$ROOT/check.js" <<'NODE'
const fs=require('fs'),pages=JSON.parse(fs.readFileSync('/tmp/b46-horizontal-deploy/pages.json')),p=pages.find(x=>x.type==='page');if(!p)throw Error('NO_PAGE');const ws=new WebSocket(p.webSocketDebuggerUrl);let id=0;const q=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&q.has(m.id)){const x=q.get(m.id);q.delete(m.id);m.error?x.j(Error(JSON.stringify(m.error))):x.r(m.result)}};const call=(method,params={})=>new Promise((r,j)=>{const n=++id;q.set(n,{r,j});ws.send(JSON.stringify({id:n,method,params}))}),sleep=ms=>new Promise(r=>setTimeout(r,ms));async function ev(expression){const z=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(z.exceptionDetails)throw Error(JSON.stringify(z.exceptionDetails));return z.result.value}async function wait(ex,t=30000){const s=Date.now();while(Date.now()-s<t){try{if(await ev(ex))return}catch{}await sleep(250)}throw Error('WAIT:'+ex)}async function measure(){return ev(`(()=>{const rows=[...document.querySelectorAll('.match-row[data-match-id]')],r=rows[0],t=r?.querySelector('.teams-cell'),sc=r?.querySelector('.score-cell'),mk=r?[...r.querySelectorAll('.market-cell')]:[],sg=r?.querySelector('.signal-cell'),c=x=>{if(!x)return null;const a=x.getBoundingClientRect(),cs=getComputedStyle(x);return {w:a.width,h:a.height,cy:a.y+a.height/2,visible:cs.display!=='none'&&a.width>0&&a.height>0}},names=t?[...t.querySelectorAll('b')].map(c):[],ds=t?[...t.querySelectorAll('.desktop-team-score')].map(c):[],orig=sc?[...sc.querySelectorAll('strong')].map(c):[],clock=sc?c(sc.querySelector('small:not(.half-score)')):null,half=sc?c(sc.querySelector('.half-score')):null,cells=r?[c(t),c(sc),...mk.map(c),c(sg)]:[],sum=cells.reduce((a,x)=>a+(x?.w||0),0),root=document.querySelector('[data-ball46-workspace-scorebar]'),slots=root?[...root.children]:[],statuses=slots.map(x=>(x.innerText.match(/\bFT\b|\b\d{1,3}'\b/)||['PLACEHOLDER'])[0]),mins=statuses.slice(6).map(x=>{const m=x.match(/(\d{1,3})'/);return m?+m[1]:-1}).filter(x=>x>=0),sorted=mins.every((v,i,a)=>i===0||a[i-1]>=v),css=[...document.querySelectorAll('link[rel="stylesheet"]')].find(x=>(x.getAttribute('href')||'').includes('dashboard-v2-tune.css'))?.getAttribute('href')||'',js=[...document.scripts].find(x=>(x.getAttribute('src')||'').includes('dashboard-v2-stage3.js'))?.getAttribute('src')||'';return {row:c(r),team:c(t),time:c(sc),markets:mk.map(c),signal:c(sg),names,desktopScores:ds,originalScores:orig,clock,half,overflow:r?r.scrollWidth>r.clientWidth+1:true,ratios:cells.length===6?{team:cells[0].w/sum,time:cells[1].w/sum,m1:cells[2].w/sum,ah:cells[3].w/sum,ou:cells[4].w/sum,signal:cells[5].w/sum}:null,scorebar:{count:slots.length,statuses,first6:statuses.slice(0,6),last4:statuses.slice(6),minuteSorted:sorted},odds:!!window.NOMAD343_ODDS,favicon:!!document.querySelector('link[data-ball46-favicon="20260928"]'),css,js}})()`)};(async()=>{await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});await call('Runtime.enable');await call('Page.enable');await wait(`document.readyState==='complete'`);await wait(`document.querySelectorAll('.match-row[data-match-id]').length>0`);await sleep(3000);const desktop=await measure(),align=Math.max(...desktop.names.map((x,i)=>Math.abs(x.cy-desktop.desktopScores[i].cy)));if(desktop.overflow||align>3||desktop.desktopScores.some(x=>!x.visible)||desktop.originalScores.some(x=>x.visible)||!desktop.odds||!desktop.favicon)throw Error('DESKTOP_REGRESSION');const r=desktop.ratios;if(!(r&&r.team>=.28&&r.team<=.32&&r.time>=.12&&r.time<=.16&&r.m1>=.13&&r.m1<=.16&&r.ah>=.13&&r.ah<=.16&&r.ou>=.11&&r.ou<=.15&&r.signal>=.14&&r.signal<=.18))throw Error('RATIO_BAD:'+JSON.stringify(r));if(!desktop.css.includes('343-horizontal-card-20260928a')||!desktop.js.includes('343-horizontal-card-20260928a'))throw Error('CACHE_BUSTER_BAD');if(desktop.scorebar.count!==10||desktop.scorebar.first6.some(x=>x!=='FT')||!desktop.scorebar.minuteSorted)throw Error('SCOREBAR_6X4_BAD:'+JSON.stringify(desktop.scorebar));await call('Emulation.setDeviceMetricsOverride',{width:390,height:850,deviceScaleFactor:1,mobile:false});await call('Page.reload',{ignoreCache:true});await wait(`document.querySelectorAll('.match-row[data-match-id]').length>0`);await sleep(2500);const mobile=await measure();if(mobile.overflow||mobile.desktopScores.some(x=>x.visible)||mobile.originalScores.some(x=>!x.visible)||mobile.markets.some(x=>x.visible))throw Error('MOBILE_REGRESSION');const out={desktop,align,mobile};console.log('ACTUAL_BROWSER',JSON.stringify(out));fs.writeFileSync('/tmp/b46-horizontal-deploy/verify/browser.json',JSON.stringify(out,null,2));ws.close();process.exit(0)})().catch(e=>{console.error(e);try{ws.close()}catch{}process.exit(1)});
NODE
node "$ROOT/check.js"; kill "$CPID" 2>/dev/null || true; trap - EXIT
echo BALL46_HORIZONTAL_CARD_DEPLOY_SUCCESS
