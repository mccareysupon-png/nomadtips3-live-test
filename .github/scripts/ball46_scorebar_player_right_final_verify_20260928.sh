#!/usr/bin/env bash
set -euo pipefail
DIRECT='https://ball46-production.mccarey-supon.workers.dev'
WWW='https://www.ball46.com'
ROOT='/tmp/b46-player-right-final-verify'; rm -rf "$ROOT"; mkdir -p "$ROOT"
nonce="${GITHUB_RUN_ID:-manual}-$(date +%s%N)"

python3 - <<'PY'
import base64,hashlib,json,os,urllib.request
A=os.environ['CLOUDFLARE_ACCOUNT_ID'];T=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {T}','Accept':'application/json'}
api=f'https://api.cloudflare.com/client/v4/accounts/{A}';s='ball46-production'
def get(u):
  with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:return json.load(r)
d=get(f'{api}/workers/scripts/{s}/deployments')['result']['deployments'][0];vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100: raise SystemExit('FINAL_MIXED_DEPLOYMENT')
vid=vs[0]['version_id']
if vid!='c9bf0403-0be5-4b57-9da4-00867c2b05a6': raise SystemExit('FINAL_VERSION_MOVED:'+vid)
v=get(f'{api}/workers/workers/{s}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or []
if len(mods)!=1 or mods[0].get('name')!='index.js':raise SystemExit('FINAL_RUNTIME_MODULE_BAD')
sha=hashlib.sha256(base64.b64decode(mods[0]['content_base64'])).hexdigest()
if sha!='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed':raise SystemExit('FINAL_RUNTIME_SHA_BAD:'+sha)
expect=sorted([('ASSETS','assets',None,None),('ENGINE','service','nomadtips3-engine-343','production'),('FULL_MARKET','service','nomadtips3-full-market-343-ball46','production'),('HUB','service','nomadtips3-5usd-hub-343','production')])
got=sorted((b.get('name'),b.get('type'),b.get('service'),b.get('environment')) for b in (v.get('bindings') or []))
if got!=expect: raise SystemExit('FINAL_BINDINGS_BAD:'+repr(got))
print('FINAL_RUNTIME_LOCK_PASS',vid,sha)
PY

curl -fsSL --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache,no-store' "$DIRECT/?finalplayerright=$nonce" -o "$ROOT/direct-index.html"
curl -fsSL --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache,no-store' "$DIRECT/singlepage-workspace-343.css?finalplayerright=$nonce" -o "$ROOT/direct.css"
grep -Fq 'singlepage-workspace-343.css?v=343-scorebar-player-right-20260928a' "$ROOT/direct-index.html" || { echo DIRECT_CACHE_REF_BAD; exit 1; }
[ "$(sha256sum "$ROOT/direct.css"|awk '{print $1}')" = '1e74660c292756a79ed1f0e765cf5c84a0c8a19b3b32017d2700b484f18a2dca' ] || { echo DIRECT_CSS_SHA_BAD; exit 1; }
[ "$(sha256sum "$ROOT/direct-index.html"|awk '{print $1}')" = '56ec7f79cbc46f94a8a05662e0fa3473e88982ab5e39d10331282eea6b01c7aa' ] || { echo DIRECT_INDEX_SHA_BAD; exit 1; }
echo FINAL_DIRECT_ASSET_PASS

python3 - <<'PY'
from pathlib import Path
from io import BytesIO
from PIL import Image
import re,base64,hashlib
css=Path('/tmp/b46-player-right-final-verify/direct.css').read_text()
targets={
'.workspace-scorebar-cell.workspace-scorebar-signal-result.outcome-win':('1487eca1e22d3ac68ca47036f24ac28dc72c2ae22687bca6a7635bc89e39be6c',0.62,0.36),
'.workspace-scorebar-cell.workspace-scorebar-signal-result.outcome-loss':('cf76c103d9b09da518399401e22b6ff63257884af8c268540f4460dcbe559d40',0.54,0.28),
'.workspace-scorebar-cell.workspace-scorebar-pending':('e71d4ea10de0022ddfc4ae44c1546ba765fd034318fa865c82c90ed75420bfb2',0.54,0.24)}
for sel,(expect,le,rex) in targets.items():
  hits=[]
  for m in re.finditer(r'([^{}]+)\{([^{}]*)\}',css,re.S):
    clean=re.sub(r'/\*.*?\*/','',m.group(1),flags=re.S); sels=[x.strip() for x in clean.split(',')]
    if sel not in sels or 'data:image/webp;base64,' not in m.group(2): continue
    ims=re.findall(r'data:image/webp;base64,([A-Za-z0-9+/=]+)',m.group(2))
    if len(ims)==1:hits.append((ims[0],m.group(2)))
  if len(hits)!=1:raise SystemExit('FINAL_IMAGE_RULE_BAD:'+sel+':'+str(len(hits)))
  b64,body=hits[0];raw=base64.b64decode(b64);got=hashlib.sha256(raw).hexdigest()
  if got!=expect:raise SystemExit('FINAL_IMAGE_HASH_BAD:'+sel+':'+got)
  if Image.open(BytesIO(raw)).size!=(234,116):raise SystemExit('FINAL_IMAGE_DIM_BAD:'+sel)
  gm=re.search(r'linear-gradient\(90deg\s*,\s*rgba\([^)]*?,\s*([0-9.]+)\)\s*,\s*rgba\([^)]*?,\s*([0-9.]+)\)\s*\)',body,re.S)
  left,right=map(float,gm.groups()) if gm else (-1,-1)
  if abs(left-le)>1e-9 or abs(right-rex)>1e-9 or not left>right:raise SystemExit('FINAL_OVERLAY_BAD:'+sel+':'+str((left,right)))
print('FINAL_MIRROR_HASH_DIM_OVERLAY_PASS')
PY

for ep in board signals statistics; do
  curl -fsSL --retry 4 --retry-all-errors --max-time 30 "$DIRECT/api/engine/$ep?finalplayerright=$nonce" -o "$ROOT/$ep.json"
done
python3 - <<'PY'
import json,pathlib
r=pathlib.Path('/tmp/b46-player-right-final-verify')
for n in ['board','signals','statistics']:
 j=json.load(open(r/f'{n}.json'))
 if j.get('ok') is not True:raise SystemExit('FINAL_API_BAD:'+n)
print('FINAL_API_PASS')
PY

chrome=$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)
[ -n "$chrome" ] || { echo CHROME_MISSING; exit 1; }
"$chrome" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --window-size=1440,900 --remote-debugging-port=9894 --user-data-dir="$ROOT/chrome" "$DIRECT/?browserplayerright=$nonce" >"$ROOT/chrome.log" 2>&1 &
CPID=$!; trap 'kill $CPID 2>/dev/null || true' EXIT
for i in $(seq 1 80); do
 curl -fsS http://127.0.0.1:9894/json > "$ROOT/pages.tmp" 2>/dev/null && python3 -c "import json;x=json.load(open('$ROOT/pages.tmp'));assert any(p.get('type')=='page' and p.get('webSocketDebuggerUrl') for p in x)" 2>/dev/null && { mv "$ROOT/pages.tmp" "$ROOT/pages.json"; break; }
 sleep .5
done
[ -s "$ROOT/pages.json" ] || { echo FINAL_CDP_NOT_READY; exit 1; }
cat > "$ROOT/check.js" <<'NODE'
const fs=require('fs'),pages=JSON.parse(fs.readFileSync('/tmp/b46-player-right-final-verify/pages.json')),p=pages.find(x=>x.type==='page'&&x.webSocketDebuggerUrl);if(!p)throw Error('NO_PAGE');
const ws=new WebSocket(p.webSocketDebuggerUrl);let id=0,q=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&q.has(m.id)){const z=q.get(m.id);q.delete(m.id);m.error?z.j(Error(JSON.stringify(m.error))):z.r(m.result)}};const call=(method,params={})=>new Promise((r,j)=>{const n=++id;q.set(n,{r,j});ws.send(JSON.stringify({id:n,method,params}))}),sleep=ms=>new Promise(r=>setTimeout(r,ms));async function ev(x){const z=await call('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});if(z.exceptionDetails)throw Error(JSON.stringify(z.exceptionDetails));return z.result.value}async function wait(x,t=45000){const s=Date.now();while(Date.now()-s<t){try{if(await ev(x))return}catch{}await sleep(250)}throw Error('WAIT '+x)}
(async()=>{await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});await call('Runtime.enable');await call('Page.enable');await wait(`document.readyState==='complete'`);await sleep(4000);
const d=await ev(`(async()=>{const cards=[...document.querySelectorAll('[data-workspace-scorebar-slot] .workspace-scorebar-grid>div')];const states=cards.map(e=>({cls:e.className,bg:getComputedStyle(e).backgroundImage,w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height}));const imgCards=states.filter(x=>x.bg.includes('data:image/webp'));for(const x of imgCards){const m=x.bg.match(/data:image\\/webp;base64,[A-Za-z0-9+/=]+/);if(m){const im=new Image();im.src=m[0];await im.decode();x.iw=im.naturalWidth;x.ih=im.naturalHeight}}return{count:cards.length,states,odds:!!window.NOMAD343_ODDS,favicon:!!document.querySelector('link[data-ball46-favicon="20260928"]'),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2,css:[...document.styleSheets].map(s=>s.href||'').find(x=>x.includes('singlepage-workspace-343.css'))||''}})()`);if(d.count!==10||!d.odds||!d.favicon||d.overflow)throw Error('DESKTOP_BAD:'+JSON.stringify(d));if(!d.css.includes('343-scorebar-player-right-20260928a'))throw Error('DESKTOP_CSS_REF_BAD:'+d.css);const bad=d.states.filter(x=>x.bg.includes('data:image/webp')&&(x.iw!==234||x.ih!==116));if(bad.length)throw Error('DESKTOP_IMAGE_DECODE_BAD:'+JSON.stringify(bad));
const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync('/tmp/b46-player-right-final-verify/desktop-player-right.png',Buffer.from(shot.data,'base64'));
await call('Emulation.setDeviceMetricsOverride',{width:390,height:850,deviceScaleFactor:1,mobile:true});await call('Page.reload',{ignoreCache:true});await wait(`document.readyState==='complete'`);await sleep(3000);const m=await ev(`(()=>({slot:document.querySelector('[data-workspace-scorebar-slot]')?getComputedStyle(document.querySelector('[data-workspace-scorebar-slot]')).display:null,odds:!!window.NOMAD343_ODDS,favicon:!!document.querySelector('link[data-ball46-favicon="20260928"]'),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2}))()`);if(m.slot!==null&&m.slot!=='none')throw Error('MOBILE_SCOREBAR_VISIBLE:'+JSON.stringify(m));if(!m.odds||!m.favicon||m.overflow)throw Error('MOBILE_BAD:'+JSON.stringify(m));console.log('FINAL_BROWSER_PASS',JSON.stringify({desktop:d,mobile:m}));ws.close();process.exit(0)})().catch(e=>{console.error(e);process.exit(1)});
NODE
node "$ROOT/check.js"
kill $CPID 2>/dev/null || true; trap - EXIT

public=0
for i in $(seq 1 10); do
 curl -fsSL --max-time 20 -H 'Cache-Control: no-cache,no-store' "$WWW/?finalplayerright=$nonce-$i" -o "$ROOT/public-index.html" || true
 if grep -Fq 'singlepage-workspace-343.css?v=343-scorebar-player-right-20260928a' "$ROOT/public-index.html" 2>/dev/null; then public=1; break; fi
 sleep 1
done
[ "$public" = 1 ] || { echo FINAL_PUBLIC_CACHE_NOT_VISIBLE; exit 1; }
echo FINAL_PUBLIC_CACHE_VISIBLE_PASS

echo BALL46_PLAYER_RIGHT_FINAL_VERIFY_SUCCESS
