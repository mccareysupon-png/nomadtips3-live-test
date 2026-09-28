#!/usr/bin/env bash
set -euo pipefail
DIRECT='https://ball46-production.mccarey-supon.workers.dev'; WWW='https://www.ball46.com'
OLD_VERSION='07d2ec0d-37bd-43bb-bb98-b5dc6e05d788'; EXPECTED_RUNTIME='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed'
ROOT='/tmp/b46-visualfix'; BASE="$ROOT/base"; CAND="$ROOT/candidate"; RUNTIME="$ROOT/runtime"; OUT='/tmp/b46-visualfix-deploy'
rm -rf "$OUT"; mkdir -p "$OUT/pre" "$OUT/post"
[ "$(find "$BASE" -type f | wc -l | tr -d ' ')" = '79' ] || { echo BASE_NOT_79; exit 1; }
[ "$(find "$CAND" -type f | wc -l | tr -d ' ')" = '79' ] || { echo CAND_NOT_79; exit 1; }
printf '%s  %s\n' \
 'faf93860732aa583cad3b841c7f905d96cbc6f0890bbdc550c7e5fd7973210ea' singlepage-workspace-343.css \
 '2d4a219d0da93608474c8c1de04366c9fc50f878fd9ff7e756bcbd6375012067' index.html \
 '83d1c17b60fcf122fe083245a5e09a587c1bf06dc0dceae34a02106fb42a023a' dashboard-v2-stage3.js | (cd "$CAND" && sha256sum -c -)
python3 - <<'PY'
from pathlib import Path
import hashlib
R=Path('/tmp/b46-visualfix');chg=[]
for p in [x.strip() for x in (R/'paths.txt').read_text().splitlines() if x.strip()]:
 if hashlib.sha256((R/'base'/p).read_bytes()).digest()!=hashlib.sha256((R/'candidate'/p).read_bytes()).digest(): chg.append(p)
if sorted(chg)!=['index.html','singlepage-workspace-343.css']: raise SystemExit('DIFF_GATE_BAD:'+repr(chg))
print('DEPLOY_TWO_FILE_DIFF_GATE_PASS',chg)
PY
python3 - <<'PY'
import base64,hashlib,json,os,urllib.request,pathlib
A=os.environ['CLOUDFLARE_ACCOUNT_ID'];T=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {T}','Accept':'application/json'};api=f'https://api.cloudflare.com/client/v4/accounts/{A}';s='ball46-production'
def get(u):
 with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:return json.load(r)
def snap():
 d=get(f'{api}/workers/scripts/{s}/deployments')['result']['deployments'][0];vs=d.get('versions') or []
 if len(vs)!=1 or float(vs[0].get('percentage',0))!=100: raise SystemExit('MIXED_DEPLOYMENT')
 vid=vs[0]['version_id'];v=get(f'{api}/workers/workers/{s}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or []
 if len(mods)!=1 or mods[0].get('name')!='index.js': raise SystemExit('MODULE_BAD')
 sha=hashlib.sha256(base64.b64decode(mods[0]['content_base64'])).hexdigest();return vid,sha,v
vid,sha,v=snap()
if vid!='07d2ec0d-37bd-43bb-bb98-b5dc6e05d788' or sha!='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed': raise SystemExit('PRE_RACE_LOCK_BAD:'+vid+':'+sha)
expect=sorted([('ASSETS','assets',None,None),('ENGINE','service','nomadtips3-engine-343','production'),('FULL_MARKET','service','nomadtips3-full-market-343-ball46','production'),('HUB','service','nomadtips3-5usd-hub-343','production')]);got=sorted((b.get('name'),b.get('type'),b.get('service'),b.get('environment')) for b in (v.get('bindings') or []))
if got!=expect: raise SystemExit('PRE_BINDINGS_BAD:'+repr(got))
print('PRE_RACE_LOCK_PASS',vid,sha)
PY
nonce="${GITHUB_RUN_ID:-manual}-$(date +%s%N)"
while IFS= read -r rel; do
 [ -n "$rel" ] || continue; mkdir -p "$OUT/pre/$(dirname "$rel")"
 code=$(curl -sS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache,no-store' -H 'Pragma: no-cache' -o "$OUT/pre/$rel" -w '%{http_code}' "$DIRECT/$rel?guard=$nonce-$RANDOM") || true
 [ "$code" = 200 ] || { echo GUARD_FETCH_FAIL:$rel:$code; exit 1; }
 cmp -s "$OUT/pre/$rel" "$BASE/$rel" || { echo PRODUCTION_ASSET_MOVED:$rel; sha256sum "$OUT/pre/$rel" "$BASE/$rel"; exit 1; }
done < "$ROOT/paths.txt"
echo PRE_DEPLOY_79_BYTE_LOCK_PASS
(cd "$RUNTIME" && npx --yes wrangler@4.92.0 deploy --dry-run --config wrangler.jsonc 2>&1) | tee "$OUT/dry-run.log"
grep -Fq 'Read 79 files from the assets directory' "$OUT/dry-run.log" || { echo DRY_NOT_79; exit 1; }
! grep -Fq 'Attaching additional modules:' "$OUT/dry-run.log" || { echo DRY_EXTRA_MODULES; exit 1; }
python3 - <<'PY'
import json,os,urllib.request
A=os.environ['CLOUDFLARE_ACCOUNT_ID'];T=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {T}','Accept':'application/json'};u=f'https://api.cloudflare.com/client/v4/accounts/{A}/workers/scripts/ball46-production/deployments'
with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:d=json.load(r)
vs=d['result']['deployments'][0].get('versions') or [];vid=vs[0]['version_id'] if len(vs)==1 else 'MIXED'
if vid!='07d2ec0d-37bd-43bb-bb98-b5dc6e05d788': raise SystemExit('FINAL_RACE_MOVED:'+vid)
print('FINAL_RACE_PASS',vid)
PY
(cd "$RUNTIME" && npx --yes wrangler@4.92.0 deploy --config wrangler.jsonc 2>&1) | tee "$OUT/deploy.log"
grep -Eq 'Found 2 new or modified static assets|2 new or modified static assets' "$OUT/deploy.log" || { echo DEPLOY_NOT_EXACT_2; cat "$OUT/deploy.log"; exit 1; }
python3 - <<'PY'
import base64,hashlib,json,os,urllib.request,pathlib
A=os.environ['CLOUDFLARE_ACCOUNT_ID'];T=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {T}','Accept':'application/json'};api=f'https://api.cloudflare.com/client/v4/accounts/{A}';s='ball46-production'
def get(u):
 with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:return json.load(r)
d=get(f'{api}/workers/scripts/{s}/deployments')['result']['deployments'][0];vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100: raise SystemExit('POST_MIXED')
vid=vs[0]['version_id'];
if vid=='07d2ec0d-37bd-43bb-bb98-b5dc6e05d788': raise SystemExit('VERSION_DID_NOT_CHANGE')
v=get(f'{api}/workers/workers/{s}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or [];sha=hashlib.sha256(base64.b64decode(mods[0]['content_base64'])).hexdigest()
if sha!='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed': raise SystemExit('POST_RUNTIME_BAD:'+sha)
expect=sorted([('ASSETS','assets',None,None),('ENGINE','service','nomadtips3-engine-343','production'),('FULL_MARKET','service','nomadtips3-full-market-343-ball46','production'),('HUB','service','nomadtips3-5usd-hub-343','production')]);got=sorted((b.get('name'),b.get('type'),b.get('service'),b.get('environment')) for b in (v.get('bindings') or []))
if got!=expect: raise SystemExit('POST_BINDINGS_BAD:'+repr(got))
pathlib.Path('/tmp/b46-visualfix-deploy/new-version.txt').write_text(vid);print('POST_RUNTIME_LOCK_PASS',vid,sha)
PY
nonce2="${GITHUB_RUN_ID:-manual}-post-$(date +%s%N)"
while IFS= read -r rel; do
 [ -n "$rel" ] || continue; mkdir -p "$OUT/post/$(dirname "$rel")"; ok=0
 for attempt in $(seq 1 14); do
  code=$(curl -sS -L --retry 2 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache,no-store' -H 'Pragma: no-cache' -o "$OUT/post/$rel" -w '%{http_code}' "$DIRECT/$rel?post=$nonce2-$attempt-$RANDOM") || true
  if [ "$code" = 200 ] && cmp -s "$OUT/post/$rel" "$CAND/$rel"; then ok=1; break; fi; sleep 2
 done
 [ "$ok" = 1 ] || { echo POST_ASSET_MISMATCH:$rel; exit 1; }
done < "$ROOT/paths.txt"
echo POST_79_ASSETS_PASS
for ep in board signals statistics; do curl -fsS -L --retry 4 --retry-all-errors --max-time 30 "$WWW/api/engine/$ep?post=$nonce2" -o "$OUT/$ep.json"; done
python3 - <<'PY'
import json,pathlib
r=pathlib.Path('/tmp/b46-visualfix-deploy');allowed={'WIN','HALF_WIN','LOSS','HALF_LOSS','PUSH','DRAW'}
for n in ['board','signals','statistics']:
 j=json.load(open(r/f'{n}.json'))
 if j.get('ok') is not True: raise SystemExit('POST_API_BAD:'+n)
s=json.load(open(r/'signals.json'));t=json.load(open(r/'statistics.json'));sett=[x for x in t.get('rows',[]) if str(x.get('status','')).upper()=='SETTLED' and str(x.get('result','')).upper() in allowed];sett.sort(key=lambda x:x.get('settledAt') or x.get('createdAt') or 0,reverse=True);pend=[x for x in s.get('signals',[]) if str(x.get('status','')).upper()=='PENDING'];pend.sort(key=lambda x:(x.get('mirrorMinute') if x.get('mirrorMinute') is not None else x.get('minute') if x.get('minute') is not None else x.get('entryMinute') if x.get('entryMinute') is not None else -1,x.get('createdAt') or 0),reverse=True);(r/'expected.json').write_text(json.dumps({'settled':sett[:6],'pending':pend[:4]},ensure_ascii=False));print('POST_API_PASS',{'settled':len(sett),'pending':len(pend)})
PY
chrome=$(command -v google-chrome || command -v chromium || command -v chromium-browser || true); [ -n "$chrome" ] || exit 1
"$chrome" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --window-size=1440,900 --remote-debugging-port=9895 --user-data-dir="$OUT/chrome" "$WWW/?visualfix=$nonce2" >"$OUT/chrome.log" 2>&1 & CPID=$!; trap 'kill $CPID 2>/dev/null||true' EXIT
for i in $(seq 1 80); do curl -fsS http://127.0.0.1:9895/json > "$OUT/pages.tmp" 2>/dev/null && python3 -c "import json;x=json.load(open('$OUT/pages.tmp'));assert any(p.get('type')=='page' and p.get('webSocketDebuggerUrl') for p in x)" 2>/dev/null && { mv "$OUT/pages.tmp" "$OUT/pages.json"; break; }; sleep .5; done
[ -s "$OUT/pages.json" ] || { echo CDP_NOT_READY; exit 1; }
cat > "$OUT/check.js" <<'NODE'
const fs=require('fs'),pages=JSON.parse(fs.readFileSync('/tmp/b46-visualfix-deploy/pages.json')),p=pages.find(x=>x.type==='page'&&x.webSocketDebuggerUrl),exp=JSON.parse(fs.readFileSync('/tmp/b46-visualfix-deploy/expected.json'));if(!p)throw Error('NO_PAGE');const map=r=>r==='WIN'?'WIN':r==='HALF_WIN'?'WIN ½':r==='LOSS'?'LOSS':r==='HALF_LOSS'?'LOSS ½':(r==='PUSH'||r==='DRAW')?'DRAW':r;const ws=new WebSocket(p.webSocketDebuggerUrl);let id=0,q=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&q.has(m.id)){const z=q.get(m.id);q.delete(m.id);m.error?z.j(Error(JSON.stringify(m.error))):z.r(m.result)}};const call=(method,params={})=>new Promise((r,j)=>{const n=++id;q.set(n,{r,j});ws.send(JSON.stringify({id:n,method,params}))}),sleep=ms=>new Promise(r=>setTimeout(r,ms));async function ev(x){const z=await call('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});if(z.exceptionDetails)throw Error(JSON.stringify(z.exceptionDetails));return z.result.value}async function wait(x,t=45000){const s=Date.now();while(Date.now()-s<t){try{if(await ev(x))return}catch{}await sleep(250)}throw Error('WAIT '+x)};(async()=>{await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});await call('Runtime.enable');await call('Page.enable');await call('Page.bringToFront');await wait(`document.readyState==='complete'`);await wait(`document.querySelectorAll('[data-scorebar-signal-result]').length===6`);await sleep(1000);const d=await ev(`(async()=>{async function probe(cls){const e=document.createElement('div');e.className='workspace-scorebar-cell '+cls;e.style.position='fixed';e.style.left='-9999px';document.body.appendChild(e);const bg=getComputedStyle(e).backgroundImage;const m=bg.match(/data:image\\/webp;base64,[A-Za-z0-9+/=]+/);let decoded=false,w=0,h=0;if(m){const im=new Image();await new Promise(r=>{im.onload=()=>{decoded=true;w=im.naturalWidth;h=im.naturalHeight;r()};im.onerror=()=>r();im.src=m[0]});}e.remove();return{hasWebp:!!m,decoded,w,h}}const c=[...document.querySelectorAll('[data-workspace-scorebar-slot] .workspace-scorebar-grid>div')];return{count:c.length,left:c.slice(0,6).map(x=>x.getAttribute('data-scorebar-signal-result')||''),right:c.slice(6).map(x=>({id:x.getAttribute('data-scorebar-pending-signal')||'',pending:x.hasAttribute('data-scorebar-pending-signal'),placeholder:x.classList.contains('placeholder'),live:x.classList.contains('workspace-scorebar-live'),text:x.innerText})),loss:await probe('workspace-scorebar-signal-result outcome-loss'),pendingProbe:await probe('workspace-scorebar-pending'),slot:getComputedStyle(document.querySelector('[data-workspace-scorebar-slot]')).display,odds:!!window.NOMAD343_ODDS,favicon:!!document.querySelector('link[data-ball46-favicon="20260928"]'),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2}})()`);const wl=exp.settled.map(x=>map(String(x.result||'').toUpperCase()));if(d.count!==10||JSON.stringify(d.left)!==JSON.stringify(wl))throw Error('LEFT_FLOW_BAD');const wp=exp.pending.map(x=>String(x.id||x.fixtureId||'')),real=d.right.filter(x=>x.pending);if(JSON.stringify(real.map(x=>x.id))!==JSON.stringify(wp)||d.right.some(x=>x.live)||d.right.filter(x=>x.placeholder).length!==4-wp.length)throw Error('RIGHT_FLOW_BAD');for(const [k,z] of Object.entries({loss:d.loss,pending:d.pendingProbe}))if(!z.hasWebp||!z.decoded||z.w!==234||z.h!==116)throw Error(k.toUpperCase()+'_IMAGE_DECODE_BAD '+JSON.stringify(z));if(!d.odds||!d.favicon||d.overflow)throw Error('DESKTOP_REGRESSION');await call('Emulation.setDeviceMetricsOverride',{width:390,height:850,deviceScaleFactor:1,mobile:false});await call('Page.reload',{ignoreCache:true});await wait(`document.readyState==='complete'`);await sleep(2200);const m=await ev(`(()=>({slot:getComputedStyle(document.querySelector('[data-workspace-scorebar-slot]')).display,odds:!!window.NOMAD343_ODDS,favicon:!!document.querySelector('link[data-ball46-favicon="20260928"]'),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2}))()`);if(m.slot!=='none'||!m.odds||!m.favicon||m.overflow)throw Error('MOBILE_BAD');console.log('VISUALFIX_POST_BROWSER_PASS',JSON.stringify({left:wl,pending:wp,loss:d.loss,pendingProbe:d.pendingProbe,mobile:m.slot}));ws.close();process.exit(0)})().catch(e=>{console.error(e);process.exit(1)});
NODE
node "$OUT/check.js"
kill "$CPID" 2>/dev/null||true; trap - EXIT
echo BALL46_SCOREBAR_VISUALFIX_DEPLOY_SUCCESS
