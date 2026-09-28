#!/usr/bin/env bash
set -euo pipefail
DIRECT='https://ball46-production.mccarey-supon.workers.dev'; WWW='https://www.ball46.com'
EXPECTED_VERSION='9d68b06d-2f83-4b0f-958a-d4b0babf1857'; EXPECTED_RUNTIME='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed'
ROOT='/tmp/b46-scorebar-result-predeploy'; CAND="$ROOT/candidate"; OUT='/tmp/b46-signal-settlement-verify'; rm -rf "$OUT"; mkdir -p "$OUT/assets"
[ "$(find "$CAND" -type f | wc -l | tr -d ' ')" = 79 ] || { echo CAND_NOT_79; exit 1; }
printf '%s  %s\n' 'aaa977a6a7b7e031426964f24834fd60ad4519a9821d244f797719b2f4355c4e' dashboard-v2-stage3.js 'deb16cdb601f5898f88aa0f84bfc7d989af9576a6b94ae33521fd67b7d60ac90' singlepage-workspace-343.css 'cec789ea440f0e9bf3ce7cf0db69d5d407649829ca142a0c16c7dc1fceb481b3' index.html | (cd "$CAND" && sha256sum -c -)
python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
O=pathlib.Path('/tmp/b46-signal-settlement-verify');A=os.environ['CLOUDFLARE_ACCOUNT_ID'];T=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {T}','Accept':'application/json'};api=f'https://api.cloudflare.com/client/v4/accounts/{A}';s='ball46-production'
def get(u):
 with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:return json.load(r)
d=get(f'{api}/workers/scripts/{s}/deployments')['result']['deployments'][0];vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100: raise SystemExit('MIXED_DEPLOYMENT')
vid=vs[0]['version_id']
if vid!='9d68b06d-2f83-4b0f-958a-d4b0babf1857': raise SystemExit('VERSION_MOVED:'+vid)
v=get(f'{api}/workers/workers/{s}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or []
if len(mods)!=1 or mods[0].get('name')!='index.js': raise SystemExit('MODULE_BAD')
sha=hashlib.sha256(base64.b64decode(mods[0]['content_base64'])).hexdigest()
if sha!='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed': raise SystemExit('RUNTIME_BAD:'+sha)
expect=sorted([('ASSETS','assets',None,None),('ENGINE','service','nomadtips3-engine-343','production'),('FULL_MARKET','service','nomadtips3-full-market-343-ball46','production'),('HUB','service','nomadtips3-5usd-hub-343','production')]);got=sorted((b.get('name'),b.get('type'),b.get('service'),b.get('environment')) for b in (v.get('bindings') or []))
if got!=expect: raise SystemExit('BINDINGS_BAD:'+repr(got))
ss=get(f'{api}/workers/scripts/{s}/schedules')['result'];ss=ss.get('schedules',[]) if isinstance(ss,dict) else (ss or []);cr=[x.get('cron') for x in ss if isinstance(x,dict) and x.get('cron')]
if cr!=['* * * * *']: raise SystemExit('CRON_BAD:'+repr(cr))
print('VERIFY_RUNTIME_LOCK_PASS',vid,sha)
PY
nonce="${GITHUB_RUN_ID:-manual}-$(date +%s%N)"
while IFS= read -r rel; do
  mkdir -p "$OUT/assets/$(dirname "$rel")"; ok=0
  for attempt in $(seq 1 12); do
    code=$(curl -sS -L --retry 2 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache, no-store' -H 'Pragma: no-cache' -o "$OUT/assets/$rel" -w '%{http_code}' "$DIRECT/$rel?verify=$nonce-$attempt-$RANDOM") || true
    if [ "$code" = 200 ] && cmp -s "$OUT/assets/$rel" "$CAND/$rel"; then ok=1; break; fi
    if [ "$attempt" -lt 12 ]; then sleep 2; fi
  done
  [ "$ok" = 1 ] || { echo "ASSET_STILL_MISMATCH:$rel"; sha256sum "$OUT/assets/$rel" "$CAND/$rel" || true; exit 1; }
done < "$ROOT/paths.txt"
echo VERIFY_79_ASSETS_PASS
for ep in board signals statistics; do curl -fsS -L --retry 4 --retry-all-errors --max-time 30 "$WWW/api/engine/$ep?verify=$nonce" -o "$OUT/$ep.json"; done
python3 - <<'PY'
import json,pathlib
r=pathlib.Path('/tmp/b46-signal-settlement-verify')
for n in ['board','signals','statistics']:
 j=json.load(open(r/f'{n}.json'))
 if j.get('ok') is not True: raise SystemExit('API_BAD:'+n)
st=json.load(open(r/'statistics.json'));allowed={'WIN','HALF_WIN','LOSS','HALF_LOSS','PUSH','DRAW'};rows=[x for x in st.get('rows',[]) if str(x.get('status','')).upper()=='SETTLED' and str(x.get('result','')).upper() in allowed];rows.sort(key=lambda x:x.get('settledAt') or x.get('createdAt') or 0,reverse=True)
if len(rows)<6: raise SystemExit('SETTLED_LT6')
(r/'expected.json').write_text(json.dumps(rows[:6],ensure_ascii=False,indent=2));print('VERIFY_API_PASS',{'fixtures':len(json.load(open(r/'board.json')).get('fixtures',[])),'signals':len(json.load(open(r/'signals.json')).get('signals',[])),'stats':len(st.get('rows',[])),'latest':[x.get('result') for x in rows[:6]]})
PY
chrome=$(command -v google-chrome || command -v chromium || command -v chromium-browser || true); [ -n "$chrome" ] || exit 1
"$chrome" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --window-size=1440,950 --remote-debugging-port=9666 --user-data-dir="$OUT/chrome" "$WWW/?signalverify=$nonce" >"$OUT/chrome.log" 2>&1 & CPID=$!; trap 'kill $CPID 2>/dev/null || true' EXIT
for i in $(seq 1 80); do curl -fsS http://127.0.0.1:9666/json > "$OUT/pages.tmp" 2>/dev/null && python3 -c "import json; x=json.load(open('$OUT/pages.tmp')); assert any(p.get('type')=='page' and p.get('webSocketDebuggerUrl') for p in x)" 2>/dev/null && { mv "$OUT/pages.tmp" "$OUT/pages.json"; break; }; sleep .5; done
[ -s "$OUT/pages.json" ] || { echo CDP_NOT_READY; exit 1; }
cat > "$OUT/check.js" <<'NODE'
const fs=require('fs'),pages=JSON.parse(fs.readFileSync('/tmp/b46-signal-settlement-verify/pages.json')),p=pages.find(x=>x.type==='page'&&x.webSocketDebuggerUrl),expected=JSON.parse(fs.readFileSync('/tmp/b46-signal-settlement-verify/expected.json'));if(!p)throw Error('NO_PAGE');const map=r=>r==='WIN'?'WIN':r==='HALF_WIN'?'WIN ½':r==='LOSS'?'LOSS':r==='HALF_LOSS'?'LOSS ½':(r==='PUSH'||r==='DRAW')?'DRAW':r;const ws=new WebSocket(p.webSocketDebuggerUrl);let id=0,q=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&q.has(m.id)){const x=q.get(m.id);q.delete(m.id);m.error?x.j(Error(JSON.stringify(m.error))):x.r(m.result)}};const call=(method,params={})=>new Promise((r,j)=>{const n=++id;q.set(n,{r,j});ws.send(JSON.stringify({id:n,method,params}))}),sleep=ms=>new Promise(r=>setTimeout(r,ms));async function ev(x){const z=await call('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});if(z.exceptionDetails)throw Error(JSON.stringify(z.exceptionDetails));return z.result.value}async function wait(x,t=45000){const s=Date.now();while(Date.now()-s<t){try{if(await ev(x))return}catch{}await sleep(250)}throw Error('WAIT '+x)}async function read(){return ev(`(()=>{const g=document.querySelector('[data-workspace-scorebar-slot] .workspace-scorebar-grid'),c=g?[...g.children]:[],left=c.slice(0,6).map(x=>({result:x.getAttribute('data-scorebar-signal-result')||'',text:x.innerText,score:x.querySelector('.workspace-scorebar-meta b')?.textContent.trim()||'',market:x.querySelector('.workspace-scorebar-pick strong')?.textContent.trim()||'',pick:x.querySelector('.workspace-scorebar-pick em')?.textContent.trim()||'',img:getComputedStyle(x).backgroundImage,cls:x.className})),right=c.slice(6).map(x=>({live:x.classList.contains('workspace-scorebar-live'),placeholder:x.classList.contains('placeholder'),status:x.querySelector('.workspace-scorebar-meta i')?.textContent.trim()||''})),mins=c.slice(6).map(x=>{const m=(x.querySelector('.workspace-scorebar-meta i')?.textContent||'').match(/(\d{1,3})'/);return m?+m[1]:-1}).filter(x=>x>=0),slot=document.querySelector('[data-workspace-scorebar-slot]'),css=[...document.querySelectorAll('link[rel=stylesheet]')].find(x=>(x.href||'').includes('singlepage-workspace-343.css'))?.href||'',js=[...document.scripts].find(x=>(x.src||'').includes('dashboard-v2-stage3.js'))?.src||'',main=document.querySelector('.dashboard-shell')||document.body;return{count:c.length,left,right,sorted:mins.every((v,i,a)=>i===0||a[i-1]>=v),slot:getComputedStyle(slot).display,odds:!!window.NOMAD343_ODDS,favicon:!!document.querySelector('link[data-ball46-favicon="20260928"]'),css,js,overflow:main.scrollWidth>main.clientWidth+2}})()`)}function sc(x){const f=x.finalScore||{};return f.home==null||f.away==null?'—':`${f.home}–${f.away}`}
(async()=>{await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});await call('Runtime.enable');await call('Page.enable');await call('Page.bringToFront');await wait(`document.readyState==='complete'`);await wait(`document.querySelectorAll('[data-scorebar-signal-result]').length===6`);await sleep(600);const d=await read(),want=expected.map(x=>map(String(x.result||'').toUpperCase())),got=d.left.map(x=>x.result);if(d.count!==10||JSON.stringify(got)!==JSON.stringify(want))throw Error('RESULTS_BAD '+JSON.stringify({got,want}));for(let i=0;i<6;i++){const c=d.left[i],x=expected[i];if(c.score!==sc(x)||!c.text.includes(x.home?.name||'')||!c.text.includes(x.away?.name||'')||!c.market||!c.pick||!c.img.includes('svg+xml')||c.cls.includes('workspace-scorebar-team'))throw Error('DETAIL_BAD_'+i)}if(d.right.some(x=>!x.live&&!x.placeholder)||!d.sorted)throw Error('RIGHT4_BAD');if(!d.odds||!d.favicon||d.overflow||!d.css.includes('343-signal-settlement-20260928a')||!d.js.includes('343-signal-settlement-20260928a'))throw Error('DESKTOP_REGRESSION');await call('Emulation.setDeviceMetricsOverride',{width:390,height:850,deviceScaleFactor:1,mobile:false});await call('Page.reload',{ignoreCache:true});await wait(`document.readyState==='complete'`);await sleep(3000);const m=await read();if(m.slot!=='none'||!m.odds||!m.favicon||m.overflow)throw Error('MOBILE_REGRESSION');console.log('VERIFY_SIGNAL_BROWSER_PASS',JSON.stringify({results:got,right:d.right,mobileSlot:m.slot}));fs.writeFileSync('/tmp/b46-signal-settlement-verify/browser.json',JSON.stringify({desktop:d,mobile:m,expectedResults:want},null,2));ws.close();process.exit(0)})().catch(e=>{console.error(e);process.exit(1)});
NODE
node "$OUT/check.js"
kill "$CPID" 2>/dev/null || true; trap - EXIT
echo BALL46_SIGNAL_SETTLEMENT_VERIFY_ONLY_SUCCESS
