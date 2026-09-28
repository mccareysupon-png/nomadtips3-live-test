#!/usr/bin/env bash
set -euo pipefail
ROOT=/tmp/b46-step6-browser-actual
WWW='https://www.ball46.com'
EXPECTED_VERSION='f3476eaa-51e8-41ce-ac71-ccce20c09ce9'
EXPECTED_RUNTIME_SHA='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed'
rm -rf "$ROOT"; mkdir -p "$ROOT"
python3 - <<'PY'
import base64,hashlib,json,os,urllib.request
A=os.environ['CLOUDFLARE_ACCOUNT_ID'];T=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {T}','Accept':'application/json'};api=f'https://api.cloudflare.com/client/v4/accounts/{A}';s='ball46-production'
def get(u):
  with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:return json.load(r)
d=get(f'{api}/workers/scripts/{s}/deployments')['result']['deployments'][0];vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100: raise SystemExit('MIXED_DEPLOYMENT')
vid=vs[0]['version_id'];v=get(f'{api}/workers/workers/{s}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or []
if vid!='f3476eaa-51e8-41ce-ac71-ccce20c09ce9': raise SystemExit('PRODUCTION_MOVED:'+vid)
if len(mods)!=1 or mods[0].get('name')!='index.js': raise SystemExit('MODULE_SHAPE_BAD')
sha=hashlib.sha256(base64.b64decode(mods[0]['content_base64'])).hexdigest()
if sha!='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed': raise SystemExit('RUNTIME_SHA_BAD')
print('PRODUCTION_LOCK_PASS',vid,sha)
PY
chrome=$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)
[ -n "$chrome" ] || { echo CHROME_NOT_FOUND; exit 1; }
"$chrome" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --window-size=1440,1050 --remote-debugging-port=9222 --user-data-dir="$ROOT/chrome" "$WWW/index.html?status=live&step6actual=${GITHUB_RUN_ID:-manual}" >"$ROOT/chrome.log" 2>&1 &
CPID=$!; trap 'kill $CPID 2>/dev/null || true' EXIT
for i in $(seq 1 40); do curl -fsS http://127.0.0.1:9222/json > "$ROOT/pages.json" 2>/dev/null && break; sleep 1; done
test -s "$ROOT/pages.json"
cat > "$ROOT/check.js" <<'NODE'
const fs=require('fs');const pages=JSON.parse(fs.readFileSync('/tmp/b46-step6-browser-actual/pages.json'));const p=pages.find(x=>x.type==='page');if(!p)throw Error('NO_PAGE');const ws=new WebSocket(p.webSocketDebuggerUrl);let id=0;const q=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&q.has(m.id)){const x=q.get(m.id);q.delete(m.id);m.error?x.j(Error(JSON.stringify(m.error))):x.r(m.result)}};const call=(method,params={})=>new Promise((r,j)=>{const n=++id;q.set(n,{r,j});ws.send(JSON.stringify({id:n,method,params}))});const sleep=ms=>new Promise(r=>setTimeout(r,ms));async function ev(expression){const z=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(z.exceptionDetails)throw Error(JSON.stringify(z.exceptionDetails));return z.result.value}async function wait(x,t=30000){const s=Date.now();while(Date.now()-s<t){try{if(await ev(x))return}catch{}await sleep(250)}throw Error('WAIT:'+x)};(async()=>{await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});await call('Runtime.enable');await wait(`document.readyState==='complete'`);await wait(`document.querySelectorAll('.match-row[data-match-id]').length>0`);await sleep(3500);const g=await ev(`(()=>{const r=document.querySelector('.match-row[data-match-id]'),t=r.querySelector('.teams-cell'),sc=r.querySelector('.score-cell'),sg=r.querySelector('.signal-cell'),names=[...t.querySelectorAll('b')],scores=[...sc.querySelectorAll('strong')],clock=sc.querySelector('small:not(.half-score)'),half=sc.querySelector('.half-score'),link=[...document.querySelectorAll('link[rel="stylesheet"]')].find(x=>x.href.includes('dashboard-v2-tune.css'));const c=x=>{const a=x.getBoundingClientRect();return {x:a.x,y:a.y,w:a.width,h:a.height,cx:a.x+a.width/2,cy:a.y+a.height/2}};const markets=[...r.querySelectorAll('.market-cell')];const cells=[t,sc,...markets,sg].map(c),sum=cells.reduce((a,x)=>a+x.w,0);return {row:c(r),team:c(t),score:c(sc),markets:markets.map(c),signal:c(sg),nameCenters:names.map(x=>c(x).cy),scoreCenters:scores.map(x=>c(x).cy),clock:c(clock),half:c(half),overflow:r.scrollWidth>r.clientWidth+1,href:link?.getAttribute('href')||'',resolvedHref:link?.href||'',ratios:{team:cells[0].w/sum,score:cells[1].w/sum,signal:cells[5].w/sum},step6Marker:[...document.styleSheets].some(s=>String(s.href||'').includes('dashboard-v2-tune.css'))}})()`);const nameAlign=Math.max(...g.nameCenters.map((v,i)=>Math.abs(v-g.scoreCenters[i]))),timeAlign=Math.abs(g.clock.cy-g.half.cy);const out={g,nameAlign,timeAlign};console.log('ACTUAL_BROWSER',JSON.stringify(out));if(g.overflow)throw Error('OVERFLOW');if(nameAlign>4)throw Error('SCORE_ALIGN_BAD:'+nameAlign);if(timeAlign>3)throw Error('TIME_HT_BAD:'+timeAlign);if(g.signal.w<105)throw Error('SIGNAL_NARROW:'+g.signal.w);if(g.team.w<190)throw Error('TEAM_NARROW:'+g.team.w);if(g.score.w<90)throw Error('TIME_NARROW:'+g.score.w);if(!g.href.includes('343-card-step6-20260928a'))throw Error('CACHE_BUSTER_NOT_NEW:'+g.href);if(!(g.ratios.team>.27&&g.ratios.team<.31&&g.ratios.score>.13&&g.ratios.score<.16&&g.ratios.signal>.15&&g.ratios.signal<.18))throw Error('RATIO_BAD:'+JSON.stringify(g.ratios));fs.writeFileSync('/tmp/b46-step6-browser-actual/result.json',JSON.stringify(out,null,2));ws.close();process.exit(0)})().catch(e=>{console.error(e);try{ws.close()}catch{}process.exit(1)});
NODE
node "$ROOT/check.js"
kill "$CPID" 2>/dev/null || true; trap - EXIT
echo BALL46_STEP6_ACTUAL_BROWSER_VERIFIED
