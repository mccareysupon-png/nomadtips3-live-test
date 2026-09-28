#!/usr/bin/env bash
set -euo pipefail
DIRECT='https://ball46-production.mccarey-supon.workers.dev'; WWW='https://www.ball46.com'
EXPECTED_VERSION='35a2bad7-c5ca-4163-85ef-6a37b18bffbd'; EXPECTED_RUNTIME_SHA='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed'
CAND='/tmp/b46-predeploy/candidate'; ROOT='/tmp/b46-horizontal-verify'; rm -rf "$ROOT"; mkdir -p "$ROOT/assets"
[ "$(find "$CAND" -type f | wc -l | tr -d ' ')" = 79 ] || { echo CAND_NOT_79; exit 1; }
python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
root=pathlib.Path('/tmp/b46-horizontal-verify');A=os.environ['CLOUDFLARE_ACCOUNT_ID'];T=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {T}','Accept':'application/json'};api=f'https://api.cloudflare.com/client/v4/accounts/{A}';s='ball46-production'
def get(u):
 with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:return json.load(r)
d=get(f'{api}/workers/scripts/{s}/deployments')['result']['deployments'][0];vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100: raise SystemExit('MIXED')
vid=vs[0]['version_id']
if vid!='35a2bad7-c5ca-4163-85ef-6a37b18bffbd': raise SystemExit('VERSION_MOVED:'+vid)
v=get(f'{api}/workers/workers/{s}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or []
if len(mods)!=1 or mods[0].get('name')!='index.js': raise SystemExit('MODULE_SHAPE_BAD')
sha=hashlib.sha256(base64.b64decode(mods[0]['content_base64'])).hexdigest()
if sha!='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed': raise SystemExit('RUNTIME_CHANGED:'+sha)
expect=[('ASSETS','assets',None,None),('ENGINE','service','nomadtips3-engine-343','production'),('FULL_MARKET','service','nomadtips3-full-market-343-ball46','production'),('HUB','service','nomadtips3-5usd-hub-343','production')];got=sorted((b.get('name'),b.get('type'),b.get('service'),b.get('environment')) for b in (v.get('bindings') or []))
if got!=sorted(expect): raise SystemExit('BINDINGS_CHANGED')
root.joinpath('production-lock.json').write_text(json.dumps({'version':vid,'runtime_sha256':sha},indent=2));print('VERIFY_LOCK_PASS',vid,sha)
PY
nonce="${GITHUB_RUN_ID:-manual}-verify79-$(date +%s%N)"
while IFS= read -r rel; do [ -n "$rel" ] || continue; mkdir -p "$ROOT/assets/$(dirname "$rel")"; code=$(curl -sS -L --retry 3 --retry-all-errors --max-time 25 -H 'Cache-Control: no-cache' -o "$ROOT/assets/$rel" -w '%{http_code}' "$DIRECT/$rel?hcardverify=$nonce-${RANDOM}") || true; [ "$code" = 200 ] || { echo "FETCH_BAD:$code:$rel"; exit 1; }; cmp -s "$ROOT/assets/$rel" "$CAND/$rel" || { echo "ASSET_MISMATCH:$rel"; exit 1; }; done < <(cd "$CAND" && find . -type f -printf '%P\n' | sort)
echo VERIFY_79_ASSETS_PASS
for ep in board signals statistics; do curl -fsS -L --retry 3 --retry-all-errors --max-time 30 "$WWW/api/engine/$ep?hcardverify=$nonce" -o "$ROOT/$ep.json"; done
python3 - <<'PY'
import json,pathlib
r=pathlib.Path('/tmp/b46-horizontal-verify')
for n in ['board','signals','statistics']:
 if json.load(open(r/f'{n}.json')).get('ok') is not True: raise SystemExit('API_BAD:'+n)
print('VERIFY_API_PASS')
PY
chrome=$(command -v google-chrome || command -v chromium || command -v chromium-browser || true); [ -n "$chrome" ] || exit 1
"$chrome" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --window-size=1440,1050 --remote-debugging-port=9225 --user-data-dir="$ROOT/chrome" "$WWW/?hcardverify=${GITHUB_RUN_ID:-manual}" >"$ROOT/chrome.log" 2>&1 & CPID=$!; trap 'kill $CPID 2>/dev/null || true' EXIT
for i in $(seq 1 40); do curl -fsS http://127.0.0.1:9225/json > "$ROOT/pages.json" 2>/dev/null && break; sleep 1; done; test -s "$ROOT/pages.json"
cat > "$ROOT/check.js" <<'NODE'
const fs=require('fs'),pages=JSON.parse(fs.readFileSync('/tmp/b46-horizontal-verify/pages.json')),p=pages.find(x=>x.type==='page');if(!p)throw Error('NO_PAGE');const ws=new WebSocket(p.webSocketDebuggerUrl);let id=0,q=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&q.has(m.id)){const x=q.get(m.id);q.delete(m.id);m.error?x.j(Error(JSON.stringify(m.error))):x.r(m.result)}};const call=(method,params={})=>new Promise((r,j)=>{const n=++id;q.set(n,{r,j});ws.send(JSON.stringify({id:n,method,params}))}),sleep=ms=>new Promise(r=>setTimeout(r,ms));async function ev(x){const z=await call('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});if(z.exceptionDetails)throw Error(JSON.stringify(z.exceptionDetails));return z.result.value}async function wait(x,t=30000){const s=Date.now();while(Date.now()-s<t){try{if(await ev(x))return}catch{}await sleep(250)}throw Error('WAIT:'+x)}async function measure(){return ev(`(()=>{const r=document.querySelector('.match-row[data-match-id]'),t=r?.querySelector('.teams-cell'),sc=r?.querySelector('.score-cell'),mk=r?[...r.querySelectorAll('.market-cell')]:[],sg=r?.querySelector('.signal-cell'),c=x=>{if(!x)return null;const a=x.getBoundingClientRect(),cs=getComputedStyle(x);return {w:a.width,h:a.height,cy:a.y+a.height/2,visible:cs.display!=='none'&&a.width>0&&a.height>0}},names=t?[...t.querySelectorAll('b')].map(c):[],ds=t?[...t.querySelectorAll('.desktop-team-score')].map(c):[],orig=sc?[...sc.querySelectorAll('strong')].map(c):[],cells=r?[c(t),c(sc),...mk.map(c),c(sg)]:[],sum=cells.reduce((a,x)=>a+(x?.w||0),0),grid=document.querySelector('[data-workspace-scorebar-slot] .workspace-scorebar-grid'),slots=grid?[...grid.children]:[],statuses=slots.map(x=>x.querySelector('.workspace-scorebar-meta i')?.textContent.trim()||'PLACEHOLDER'),mins=statuses.slice(6).map(x=>{const m=x.match(/(\d{1,3})'/);return m?+m[1]:-1}).filter(x=>x>=0),css=[...document.querySelectorAll('link[rel="stylesheet"]')].find(x=>(x.getAttribute('href')||'').includes('dashboard-v2-tune.css'))?.getAttribute('href')||'',js=[...document.scripts].find(x=>(x.getAttribute('src')||'').includes('dashboard-v2-stage3.js'))?.getAttribute('src')||'';return {row:c(r),team:c(t),time:c(sc),markets:mk.map(c),signal:c(sg),names,desktopScores:ds,originalScores:orig,overflow:r?r.scrollWidth>r.clientWidth+1:true,ratios:cells.length===6?{team:cells[0].w/sum,time:cells[1].w/sum,m1:cells[2].w/sum,ah:cells[3].w/sum,ou:cells[4].w/sum,signal:cells[5].w/sum}:null,scorebar:{count:slots.length,statuses,first6:statuses.slice(0,6),last4:statuses.slice(6),minuteSorted:mins.every((v,i,a)=>i===0||a[i-1]>=v)},odds:!!window.NOMAD343_ODDS,favicon:!!document.querySelector('link[data-ball46-favicon="20260928"]'),css,js}})()`)};(async()=>{await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});await call('Runtime.enable');await call('Page.enable');await wait(`document.readyState==='complete'`);await wait(`document.querySelectorAll('.match-row[data-match-id]').length>0`);await wait(`document.querySelectorAll('[data-workspace-scorebar-slot] .workspace-scorebar-grid > *').length===10`,30000);await sleep(1200);const d=await measure(),align=Math.max(...d.names.map((x,i)=>Math.abs(x.cy-d.desktopScores[i].cy))),r=d.ratios;if(d.overflow||align>3||d.desktopScores.some(x=>!x.visible)||d.originalScores.some(x=>x.visible)||!d.odds||!d.favicon)throw Error('DESKTOP_BAD');if(!(r&&r.team>=.28&&r.team<=.32&&r.time>=.12&&r.time<=.16&&r.m1>=.13&&r.m1<=.16&&r.ah>=.13&&r.ah<=.16&&r.ou>=.11&&r.ou<=.15&&r.signal>=.14&&r.signal<=.18))throw Error('RATIO_BAD');if(!d.css.includes('343-horizontal-card-20260928a')||!d.js.includes('343-horizontal-card-20260928a'))throw Error('BUSTER_BAD');if(d.scorebar.count!==10||d.scorebar.first6.some(x=>x!=='FT')||!d.scorebar.minuteSorted)throw Error('SCOREBAR_BAD:'+JSON.stringify(d.scorebar));await call('Emulation.setDeviceMetricsOverride',{width:390,height:850,deviceScaleFactor:1,mobile:false});await call('Page.reload',{ignoreCache:true});await wait(`document.querySelectorAll('.match-row[data-match-id]').length>0`);await sleep(1200);const m=await measure();if(m.overflow||m.desktopScores.some(x=>x.visible)||m.originalScores.some(x=>!x.visible)||m.markets.some(x=>x.visible))throw Error('MOBILE_BAD');const out={desktop:d,align,mobile:m};console.log('VERIFY_BROWSER',JSON.stringify(out));fs.writeFileSync('/tmp/b46-horizontal-verify/browser.json',JSON.stringify(out,null,2));ws.close();process.exit(0)})().catch(e=>{console.error(e);try{ws.close()}catch{}process.exit(1)});
NODE
node "$ROOT/check.js"; kill "$CPID" 2>/dev/null || true; trap - EXIT
echo BALL46_HORIZONTAL_CARD_VERIFY_ONLY_SUCCESS
