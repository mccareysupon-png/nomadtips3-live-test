#!/usr/bin/env bash
set -euo pipefail
DIRECT='https://ball46-production.mccarey-supon.workers.dev'
WWW='https://www.ball46.com'
ROOT='/tmp/b46-realistic-bg-final-verify'; rm -rf "$ROOT"; mkdir -p "$ROOT"
nonce="${GITHUB_RUN_ID:-manual}-$(date +%s%N)"

python3 - <<'PY'
import base64,hashlib,json,os,urllib.request
A=os.environ['CLOUDFLARE_ACCOUNT_ID'];T=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {T}','Accept':'application/json'}
api=f'https://api.cloudflare.com/client/v4/accounts/{A}';s='ball46-production'
def get(u):
  with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:return json.load(r)
d=get(f'{api}/workers/scripts/{s}/deployments')['result']['deployments'][0];vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100: raise SystemExit('FINAL_MIXED_DEPLOYMENT')
vid=vs[0]['version_id'];v=get(f'{api}/workers/workers/{s}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or []
if len(mods)!=1 or mods[0].get('name')!='index.js':raise SystemExit('FINAL_RUNTIME_MODULE_BAD')
sha=hashlib.sha256(base64.b64decode(mods[0]['content_base64'])).hexdigest()
if sha!='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed':raise SystemExit('FINAL_RUNTIME_SHA_BAD:'+sha)
print('FINAL_RUNTIME_LOCK_PASS',vid,sha)
PY

curl -fsSL --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache,no-store' "$DIRECT/?finalrealbg=$nonce" -o "$ROOT/direct-index.html"
curl -fsSL --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache,no-store' "$DIRECT/singlepage-workspace-343.css?finalrealbg=$nonce" -o "$ROOT/direct.css"
grep -Fq 'singlepage-workspace-343.css?v=343-scorebar-realistic-player-bg-20260928a' "$ROOT/direct-index.html" || { echo DIRECT_CACHE_REF_BAD; exit 1; }
[ "$(sha256sum "$ROOT/direct.css"|awk '{print $1}')" = 'e4f35c62685a5963bc70a95809aecdfa8bc22dac67f999b6f83e2d168baf11d0' ] || { echo DIRECT_CSS_SHA_BAD; exit 1; }
[ "$(sha256sum "$ROOT/direct-index.html"|awk '{print $1}')" = '408bd35dc6ad17720e835c83dd4983b1ee56986c9b60a5af6981a582bb9fb5ed' ] || { echo DIRECT_INDEX_SHA_BAD; exit 1; }
echo FINAL_DIRECT_ASSET_PASS

python3 - <<'PY'
from pathlib import Path
import re,base64,hashlib
css=Path('/tmp/b46-realistic-bg-final-verify/direct.css').read_text()
targets={
'.workspace-scorebar-cell.workspace-scorebar-signal-result.outcome-win':'73e92cbccd9fc7af96571ac9f647d8e8a0aeb136de4352a4a28c404b40942497',
'.workspace-scorebar-cell.workspace-scorebar-signal-result.outcome-loss':'9811deecc7a6fba27e2fb03408589f2cc6893a692b297cd2359cf9c007b3dbcc',
'.workspace-scorebar-cell.workspace-scorebar-pending':'def9d5165833c241e281d406e3a239ea06cba198df5fdc7cdd3388c8c18c0154'}
def clean(s):return ' '.join(re.sub(r'/\*.*?\*/',' ',s,flags=re.S).split())
for sel,expect in targets.items():
  hits=[]
  for m in re.finditer(r'([^{}]+)\{([^{}]*)\}',css,re.S):
    if clean(m.group(1))!=sel:continue
    ims=re.findall(r'data:image/webp;base64,([A-Za-z0-9+/=]+)',m.group(2))
    if len(ims)==1:hits.append(ims[0])
  if len(hits)!=1:raise SystemExit('FINAL_IMAGE_RULE_BAD:'+sel+':'+str(len(hits)))
  raw=base64.b64decode(hits[0]);got=hashlib.sha256(raw).hexdigest()
  if got!=expect:raise SystemExit('FINAL_IMAGE_HASH_BAD:'+sel+':'+got)
print('FINAL_THREE_IMAGE_HASH_PASS')
PY

for ep in board signals statistics; do
  curl -fsSL --retry 4 --retry-all-errors --max-time 30 "$DIRECT/api/engine/$ep?finalrealbg=$nonce" -o "$ROOT/$ep.json"
done
python3 - <<'PY'
import json,pathlib
r=pathlib.Path('/tmp/b46-realistic-bg-final-verify')
for n in ['board','signals','statistics']:
 j=json.load(open(r/f'{n}.json'))
 if j.get('ok') is not True:raise SystemExit('FINAL_API_BAD:'+n)
print('FINAL_API_PASS')
PY

chrome=$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)
[ -n "$chrome" ] || { echo CHROME_MISSING; exit 1; }
"$chrome" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --window-size=1440,900 --remote-debugging-port=9892 --user-data-dir="$ROOT/chrome" "$DIRECT/?browserrealbg=$nonce" >"$ROOT/chrome.log" 2>&1 &
CPID=$!; trap 'kill $CPID 2>/dev/null || true' EXIT
for i in $(seq 1 80); do
 curl -fsS http://127.0.0.1:9892/json > "$ROOT/pages.tmp" 2>/dev/null && python3 -c "import json;x=json.load(open('$ROOT/pages.tmp'));assert any(p.get('type')=='page' and p.get('webSocketDebuggerUrl') for p in x)" 2>/dev/null && { mv "$ROOT/pages.tmp" "$ROOT/pages.json"; break; }
 sleep .5
done
[ -s "$ROOT/pages.json" ] || { echo FINAL_CDP_NOT_READY; exit 1; }
cat > "$ROOT/check.js" <<'NODE'
const fs=require('fs'),pages=JSON.parse(fs.readFileSync('/tmp/b46-realistic-bg-final-verify/pages.json')),p=pages.find(x=>x.type==='page'&&x.webSocketDebuggerUrl);if(!p)throw Error('NO_PAGE');
const ws=new WebSocket(p.webSocketDebuggerUrl);let id=0,q=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&q.has(m.id)){const z=q.get(m.id);q.delete(m.id);m.error?z.j(Error(JSON.stringify(m.error))):z.r(m.result)}};const call=(method,params={})=>new Promise((r,j)=>{const n=++id;q.set(n,{r,j});ws.send(JSON.stringify({id:n,method,params}))}),sleep=ms=>new Promise(r=>setTimeout(r,ms));async function ev(x){const z=await call('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});if(z.exceptionDetails)throw Error(JSON.stringify(z.exceptionDetails));return z.result.value}async function wait(x,t=45000){const s=Date.now();while(Date.now()-s<t){try{if(await ev(x))return}catch{}await sleep(250)}throw Error('WAIT '+x)}
(async()=>{await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});await call('Runtime.enable');await call('Page.enable');await wait(`document.readyState==='complete'`);await sleep(4000);
const d=await ev(`(async()=>{const cards=[...document.querySelectorAll('[data-workspace-scorebar-slot] .workspace-scorebar-grid>div')];const states=cards.map(e=>({cls:e.className,bg:getComputedStyle(e).backgroundImage,w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height}));const imgCards=states.filter(x=>x.bg.includes('data:image/webp'));for(const x of imgCards){const m=x.bg.match(/data:image\\/webp;base64,[A-Za-z0-9+/=]+/);if(m){const im=new Image();im.src=m[0];await im.decode();x.iw=im.naturalWidth;x.ih=im.naturalHeight}}return{count:cards.length,states,odds:!!window.NOMAD343_ODDS,favicon:!!document.querySelector('link[data-ball46-favicon="20260928"]'),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2,css:[...document.styleSheets].map(s=>s.href||'').find(x=>x.includes('singlepage-workspace-343.css'))||''}})()`);if(d.count!==10||!d.odds||!d.favicon||d.overflow)throw Error('DESKTOP_BAD:'+JSON.stringify(d));if(!d.css.includes('343-scorebar-realistic-player-bg-20260928a'))throw Error('DESKTOP_CSS_REF_BAD:'+d.css);const bad=d.states.filter(x=>x.bg.includes('data:image/webp')&&(x.iw!==234||x.ih!==116));if(bad.length)throw Error('DESKTOP_IMAGE_DECODE_BAD:'+JSON.stringify(bad));
await call('Emulation.setDeviceMetricsOverride',{width:390,height:850,deviceScaleFactor:1,mobile:true});await call('Page.reload',{ignoreCache:true});await wait(`document.readyState==='complete'`);await sleep(3000);const m=await ev(`(()=>({slot:document.querySelector('[data-workspace-scorebar-slot]')?getComputedStyle(document.querySelector('[data-workspace-scorebar-slot]')).display:null,odds:!!window.NOMAD343_ODDS,favicon:!!document.querySelector('link[data-ball46-favicon="20260928"]'),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2}))()`);if(m.slot!==null&&m.slot!=='none')throw Error('MOBILE_SCOREBAR_VISIBLE:'+JSON.stringify(m));if(!m.odds||!m.favicon||m.overflow)throw Error('MOBILE_BAD:'+JSON.stringify(m));console.log('FINAL_BROWSER_PASS',JSON.stringify({desktop:d,mobile:m}));ws.close();process.exit(0)})().catch(e=>{console.error(e);process.exit(1)});
NODE
node "$ROOT/check.js"
kill $CPID 2>/dev/null || true; trap - EXIT

# Public cache visibility: file-based checks avoid curl pipe-write false positives.
public=0
for i in $(seq 1 10); do
 curl -fsSL --max-time 20 -H 'Cache-Control: no-cache,no-store' "$WWW/?finalrealbg=$nonce-$i" -o "$ROOT/public-index.html" || true
 if grep -Fq 'singlepage-workspace-343.css?v=343-scorebar-realistic-player-bg-20260928a' "$ROOT/public-index.html" 2>/dev/null; then public=1; break; fi
 sleep 1
done
if [ "$public" = 1 ]; then echo FINAL_PUBLIC_CACHE_VISIBLE_PASS; else echo FINAL_PUBLIC_CACHE_PENDING_NONBLOCKING; fi

echo BALL46_REALISTIC_SCOREBAR_BG_FINAL_VERIFY_SUCCESS
