#!/usr/bin/env bash
set -euo pipefail
DIRECT='https://ball46-production.mccarey-supon.workers.dev'
WWW='https://www.ball46.com'
EXPECTED_VERSION='07d2ec0d-37bd-43bb-bb98-b5dc6e05d788'
EXPECTED_RUNTIME='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed'
ROOT='/tmp/b46-visualfix'; BASE="$ROOT/base"; CAND="$ROOT/candidate"; VERIFY="$ROOT/verify"; RUNTIME="$ROOT/runtime"
SEED='/tmp/b46-seed'
rm -rf "$ROOT"; mkdir -p "$BASE" "$CAND" "$VERIFY" "$RUNTIME"
[ -s "$SEED/paths.txt" ] || { echo SEED_PATHS_MISSING; exit 1; }
cp "$SEED/paths.txt" "$ROOT/paths.txt"
[ "$(wc -l < "$ROOT/paths.txt" | tr -d ' ')" = '79' ] || { echo PATHS_NOT_79; exit 1; }
cp "$SEED/runtime/index.js" "$RUNTIME/index.js"
cp "$SEED/runtime/wrangler.jsonc" "$RUNTIME/wrangler.jsonc"
python3 - <<'PY'
from pathlib import Path
p=Path('/tmp/b46-visualfix/runtime/wrangler.jsonc')
s=p.read_text().replace('/tmp/b46-bg-pending/candidate','/tmp/b46-visualfix/candidate')
p.write_text(s)
PY
python3 - <<'PY'
import base64,hashlib,json,os,urllib.request,pathlib
A=os.environ['CLOUDFLARE_ACCOUNT_ID'];T=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {T}','Accept':'application/json'};api=f'https://api.cloudflare.com/client/v4/accounts/{A}';s='ball46-production'
def get(u):
 with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:return json.load(r)
d=get(f'{api}/workers/scripts/{s}/deployments')['result']['deployments'][0];vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100: raise SystemExit('MIXED_DEPLOYMENT')
vid=vs[0]['version_id'];v=get(f'{api}/workers/workers/{s}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or []
if len(mods)!=1 or mods[0].get('name')!='index.js' or not mods[0].get('content_base64'): raise SystemExit('MODULE_BAD')
runtime=base64.b64decode(mods[0]['content_base64']);sha=hashlib.sha256(runtime).hexdigest()
if vid!='07d2ec0d-37bd-43bb-bb98-b5dc6e05d788' or sha!='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed': raise SystemExit('PRODUCTION_LOCK_BAD:'+vid+':'+sha)
seed=pathlib.Path('/tmp/b46-visualfix/runtime/index.js').read_bytes()
if hashlib.sha256(seed).hexdigest()!=sha: raise SystemExit('SEED_RUNTIME_NOT_CURRENT')
expect=sorted([('ASSETS','assets',None,None),('ENGINE','service','nomadtips3-engine-343','production'),('FULL_MARKET','service','nomadtips3-full-market-343-ball46','production'),('HUB','service','nomadtips3-5usd-hub-343','production')]);got=sorted((b.get('name'),b.get('type'),b.get('service'),b.get('environment')) for b in (v.get('bindings') or []))
if got!=expect: raise SystemExit('BINDINGS_BAD:'+repr(got))
ss=get(f'{api}/workers/scripts/{s}/schedules')['result'];ss=ss.get('schedules',[]) if isinstance(ss,dict) else (ss or []);cr=[x.get('cron') for x in ss if isinstance(x,dict) and x.get('cron')]
if cr!=['* * * * *']: raise SystemExit('CRON_BAD:'+repr(cr))
pathlib.Path('/tmp/b46-visualfix/production-version.txt').write_text(vid)
pathlib.Path('/tmp/b46-visualfix/runtime-sha.txt').write_text(sha)
print('PREDEPLOY_PRODUCTION_LOCK_PASS',vid,sha)
PY
nonce="${GITHUB_RUN_ID:-manual}-$(date +%s%N)"
while IFS= read -r rel; do
 [ -n "$rel" ] || continue
 mkdir -p "$BASE/$(dirname "$rel")"
 code=$(curl -sS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache,no-store' -H 'Pragma: no-cache' -o "$BASE/$rel" -w '%{http_code}' "$DIRECT/$rel?visualfix=$nonce-$RANDOM") || true
 [ "$code" = 200 ] || { echo FETCH_FAIL:$rel:$code; exit 1; }
done < "$ROOT/paths.txt"
[ "$(find "$BASE" -type f | wc -l | tr -d ' ')" = '79' ] || { echo BASE_NOT_79; exit 1; }
cp -a "$BASE/." "$CAND/"
printf '%s  %s\n' \
 'a8186bd85a9c9f884d992ecd24fad7b80820fdc92ae6cace82034bdc92c566a1' singlepage-workspace-343.css \
 '83d1c17b60fcf122fe083245a5e09a587c1bf06dc0dceae34a02106fb42a023a' dashboard-v2-stage3.js \
 '464c7f603b6449308e322071ecd056d436bd0be3c4cdca8b2b7c13c52d13cd4f' index.html | (cd "$BASE" && sha256sum -c -)
python3 - <<'PY'
from pathlib import Path
import re,base64,hashlib
R=Path('/tmp/b46-visualfix'); css=R/'candidate/singlepage-workspace-343.css'; idx=R/'candidate/index.html'
loss=(Path('.github/fixtures/ball46_scorebar_loss_valid_20260928.b64').read_text().strip())
blue=(Path('.github/fixtures/ball46_scorebar_pending_blue_20260928.b64').read_text().strip())
for name,b64,want in [('loss',loss,'d69d45d633f6c74faf4b39b78190465261dc8b61cdc4388de0c1feef1f30dbaf'),('pending',blue,'2f199c3ed051f5d7833a7b19a12d5b7c05721162f4210b500432f25235224846')]:
 raw=base64.b64decode(b64)
 got=hashlib.sha256(raw).hexdigest()
 if got!=want: raise SystemExit(name.upper()+'_FIXTURE_SHA_BAD:'+got)
 if raw[:4]!=b'RIFF' or raw[8:12]!=b'WEBP': raise SystemExit(name.upper()+'_NOT_WEBP')
s=css.read_text()
loss_rule='.workspace-scorebar-cell.workspace-scorebar-signal-result.outcome-loss{background-color:#3B1212;background-image:linear-gradient(90deg,rgba(25,5,5,.54),rgba(25,5,5,.28)),url("data:image/webp;base64,'+loss+'")}'
pend_rule='.workspace-scorebar-cell.workspace-scorebar-pending{background-color:#132A46;background-image:linear-gradient(90deg,rgba(5,18,38,.54),rgba(5,18,38,.24)),url("data:image/webp;base64,'+blue+'")}'
s,n1=re.subn(r'\.workspace-scorebar-cell\.workspace-scorebar-signal-result\.outcome-loss\{[^}]*\}',lambda m:loss_rule,s,count=1)
s,n2=re.subn(r'\.workspace-scorebar-cell\.workspace-scorebar-pending\{background-color:[^}]*\}',lambda m:pend_rule,s,count=1)
if n1!=1 or n2!=1: raise SystemExit(f'CSS_RULE_REPLACE_BAD:{n1}:{n2}')
css.write_text(s)
i=idx.read_text(); old='singlepage-workspace-343.css?v=343-scorebar-bg-pending-20260928a'; new='singlepage-workspace-343.css?v=343-scorebar-visualfix-20260928a'
if i.count(old)!=1: raise SystemExit('INDEX_CSS_CACHE_MARKER_BAD:'+str(i.count(old)))
i=i.replace(old,new); idx.write_text(i)
print('FIXTURE_SHA_PASS',hashlib.sha256(base64.b64decode(loss)).hexdigest(),hashlib.sha256(base64.b64decode(blue)).hexdigest())
PY
python3 - <<'PY'
from pathlib import Path
import hashlib,json
R=Path('/tmp/b46-visualfix'); paths=[x.strip() for x in (R/'paths.txt').read_text().splitlines() if x.strip()];chg=[]
for p in paths:
 a=R/'base'/p;b=R/'candidate'/p
 if hashlib.sha256(a.read_bytes()).digest()!=hashlib.sha256(b.read_bytes()).digest(): chg.append(p)
if sorted(chg)!=['index.html','singlepage-workspace-343.css']: raise SystemExit('DIFF_GATE_BAD:'+repr(chg))
manifest={p:hashlib.sha256((R/'candidate'/p).read_bytes()).hexdigest() for p in ['singlepage-workspace-343.css','index.html','dashboard-v2-stage3.js']}
(R/'candidate-sha.json').write_text(json.dumps(manifest,indent=2));print('TWO_FILE_DIFF_GATE_PASS',chg,manifest)
PY
for ep in board signals statistics; do curl -fsS -L --retry 4 --retry-all-errors --max-time 30 "$WWW/api/engine/$ep?pre=$nonce" -o "$VERIFY/$ep.json"; done
python3 - <<'PY'
import json,pathlib
r=pathlib.Path('/tmp/b46-visualfix/verify');allowed={'WIN','HALF_WIN','LOSS','HALF_LOSS','PUSH','DRAW'}
for n in ['board','signals','statistics']:
 j=json.load(open(r/f'{n}.json'))
 if j.get('ok') is not True: raise SystemExit('API_BAD:'+n)
s=json.load(open(r/'signals.json'));t=json.load(open(r/'statistics.json'));sett=[x for x in t.get('rows',[]) if str(x.get('status','')).upper()=='SETTLED' and str(x.get('result','')).upper() in allowed];sett.sort(key=lambda x:x.get('settledAt') or x.get('createdAt') or 0,reverse=True);pend=[x for x in s.get('signals',[]) if str(x.get('status','')).upper()=='PENDING'];pend.sort(key=lambda x:(x.get('mirrorMinute') if x.get('mirrorMinute') is not None else x.get('minute') if x.get('minute') is not None else x.get('entryMinute') if x.get('entryMinute') is not None else -1,x.get('createdAt') or 0),reverse=True);(r/'expected.json').write_text(json.dumps({'settled':sett[:6],'pending':pend[:4]},ensure_ascii=False));print('API_SNAPSHOT_PASS',{'settled':len(sett),'pending':len(pend)})
PY
cat > "$VERIFY/server.py" <<'PY'
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from urllib.parse import urlparse
from pathlib import Path
import os
C=Path('/tmp/b46-visualfix/candidate'); V=Path('/tmp/b46-visualfix/verify')
class H(SimpleHTTPRequestHandler):
 def do_GET(self):
  p=urlparse(self.path).path
  if p in ['/api/engine/board','/api/engine/signals','/api/engine/statistics']:
   f=V/(p.rsplit('/',1)[-1]+'.json'); b=f.read_bytes(); self.send_response(200); self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(b))); self.end_headers(); self.wfile.write(b); return
  return super().do_GET()
 def log_message(self,*a): pass
os.chdir(C); ThreadingHTTPServer(('127.0.0.1',8766),H).serve_forever()
PY
python3 "$VERIFY/server.py" >"$VERIFY/server.log" 2>&1 & SPID=$!; trap 'kill $SPID 2>/dev/null||true' EXIT
chrome=$(command -v google-chrome || command -v chromium || command -v chromium-browser || true); [ -n "$chrome" ] || exit 1
"$chrome" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --window-size=1440,900 --remote-debugging-port=9896 --user-data-dir="$VERIFY/chrome" 'http://127.0.0.1:8766/' >"$VERIFY/chrome.log" 2>&1 & CPID=$!; trap 'kill $CPID $SPID 2>/dev/null||true' EXIT
for i in $(seq 1 80); do curl -fsS http://127.0.0.1:9896/json > "$VERIFY/pages.tmp" 2>/dev/null && python3 -c "import json;x=json.load(open('$VERIFY/pages.tmp'));assert any(p.get('type')=='page' and p.get('webSocketDebuggerUrl') for p in x)" 2>/dev/null && { mv "$VERIFY/pages.tmp" "$VERIFY/pages.json"; break; }; sleep .5; done
[ -s "$VERIFY/pages.json" ] || { echo CDP_NOT_READY; exit 1; }
cat > "$VERIFY/check.js" <<'NODE'
const fs=require('fs'),pages=JSON.parse(fs.readFileSync('/tmp/b46-visualfix/verify/pages.json')),p=pages.find(x=>x.type==='page'&&x.webSocketDebuggerUrl),exp=JSON.parse(fs.readFileSync('/tmp/b46-visualfix/verify/expected.json'));if(!p)throw Error('NO_PAGE');const map=r=>r==='WIN'?'WIN':r==='HALF_WIN'?'WIN ½':r==='LOSS'?'LOSS':r==='HALF_LOSS'?'LOSS ½':(r==='PUSH'||r==='DRAW')?'DRAW':r;const ws=new WebSocket(p.webSocketDebuggerUrl);let id=0,q=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&q.has(m.id)){const z=q.get(m.id);q.delete(m.id);m.error?z.j(Error(JSON.stringify(m.error))):z.r(m.result)}};const call=(method,params={})=>new Promise((r,j)=>{const n=++id;q.set(n,{r,j});ws.send(JSON.stringify({id:n,method,params}))}),sleep=ms=>new Promise(r=>setTimeout(r,ms));async function ev(x){const z=await call('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});if(z.exceptionDetails)throw Error(JSON.stringify(z.exceptionDetails));return z.result.value}async function wait(x,t=45000){const s=Date.now();while(Date.now()-s<t){try{if(await ev(x))return}catch{}await sleep(250)}throw Error('WAIT '+x)};(async()=>{await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});await call('Runtime.enable');await call('Page.enable');await call('Page.bringToFront');await wait(`document.readyState==='complete'`);await wait(`document.querySelectorAll('[data-scorebar-signal-result]').length===6`);await sleep(800);const d=await ev(`(async()=>{async function probe(cls){const e=document.createElement('div');e.className='workspace-scorebar-cell '+cls;e.style.position='fixed';e.style.left='-9999px';document.body.appendChild(e);const bg=getComputedStyle(e).backgroundImage;const m=bg.match(/data:image\\/webp;base64,[A-Za-z0-9+/=]+/);let decoded=false,w=0,h=0;if(m){const im=new Image();await new Promise(r=>{im.onload=()=>{decoded=true;w=im.naturalWidth;h=im.naturalHeight;r()};im.onerror=()=>r();im.src=m[0]});}e.remove();return{bg,hasWebp:!!m,decoded,w,h}}const c=[...document.querySelectorAll('[data-workspace-scorebar-slot] .workspace-scorebar-grid>div')];return{count:c.length,left:c.slice(0,6).map(x=>x.getAttribute('data-scorebar-signal-result')||''),right:c.slice(6).map(x=>({id:x.getAttribute('data-scorebar-pending-signal')||'',pending:x.hasAttribute('data-scorebar-pending-signal'),placeholder:x.classList.contains('placeholder'),live:x.classList.contains('workspace-scorebar-live'),text:x.innerText})),loss:await probe('workspace-scorebar-signal-result outcome-loss'),pendingProbe:await probe('workspace-scorebar-pending'),slot:getComputedStyle(document.querySelector('[data-workspace-scorebar-slot]')).display,odds:!!window.NOMAD343_ODDS,favicon:!!document.querySelector('link[data-ball46-favicon="20260928"]'),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2}})()`);const wl=exp.settled.map(x=>map(String(x.result||'').toUpperCase()));if(d.count!==10||JSON.stringify(d.left)!==JSON.stringify(wl))throw Error('LEFT_FLOW_BAD');const wp=exp.pending.map(x=>String(x.id||x.fixtureId||'')),real=d.right.filter(x=>x.pending);if(JSON.stringify(real.map(x=>x.id))!==JSON.stringify(wp)||d.right.some(x=>x.live)||d.right.filter(x=>x.placeholder).length!==4-wp.length)throw Error('RIGHT_FLOW_BAD');for(const [k,z] of Object.entries({loss:d.loss,pending:d.pendingProbe}))if(!z.hasWebp||!z.decoded||z.w!==234||z.h!==116)throw Error(k.toUpperCase()+'_IMAGE_DECODE_BAD '+JSON.stringify(z));if(!d.odds||!d.favicon||d.overflow)throw Error('DESKTOP_REGRESSION');await call('Emulation.setDeviceMetricsOverride',{width:390,height:850,deviceScaleFactor:1,mobile:false});await call('Page.reload',{ignoreCache:true});await wait(`document.readyState==='complete'`);await sleep(1800);const m=await ev(`(()=>({slot:getComputedStyle(document.querySelector('[data-workspace-scorebar-slot]')).display,odds:!!window.NOMAD343_ODDS,favicon:!!document.querySelector('link[data-ball46-favicon="20260928"]'),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2}))()`);if(m.slot!=='none'||!m.odds||!m.favicon||m.overflow)throw Error('MOBILE_BAD');console.log('VISUALFIX_BROWSER_PASS',JSON.stringify({left:wl,pending:wp,loss:d.loss,pendingProbe:d.pendingProbe,mobile:m.slot}));ws.close();process.exit(0)})().catch(e=>{console.error(e);process.exit(1)});
NODE
node "$VERIFY/check.js"
kill "$CPID" "$SPID" 2>/dev/null||true; trap - EXIT
(cd "$RUNTIME" && npx --yes wrangler@4.92.0 deploy --dry-run --config wrangler.jsonc 2>&1) | tee "$VERIFY/dry-run.log"
grep -Fq 'Read 79 files from the assets directory' "$VERIFY/dry-run.log" || { echo DRY_NOT_79; exit 1; }
! grep -Fq 'Attaching additional modules:' "$VERIFY/dry-run.log" || { echo DRY_EXTRA_MODULES; exit 1; }
echo BALL46_SCOREBAR_VISUALFIX_PREDEPLOY_SUCCESS_NO_DEPLOY
