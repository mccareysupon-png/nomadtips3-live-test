#!/usr/bin/env bash
set -euo pipefail
WWW='https://www.ball46.com'; DIRECT='https://ball46-production.mccarey-supon.workers.dev'; OUT='/tmp/b46-scorebar-measure'; rm -rf "$OUT"; mkdir -p "$OUT"
python3 - <<'PY'
import base64,hashlib,json,os,urllib.request,pathlib
O=pathlib.Path('/tmp/b46-scorebar-measure'); A=os.environ['CLOUDFLARE_ACCOUNT_ID']; T=os.environ['CLOUDFLARE_API_TOKEN']; h={'Authorization':f'Bearer {T}','Accept':'application/json'}; api=f'https://api.cloudflare.com/client/v4/accounts/{A}'; s='ball46-production'
def get(u):
 with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:return json.load(r)
d=get(f'{api}/workers/scripts/{s}/deployments')['result']['deployments'][0]; vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100: raise SystemExit('MIXED_DEPLOYMENT')
vid=vs[0]['version_id']; v=get(f'{api}/workers/workers/{s}/versions/{vid}?include=modules')['result']; mods=v.get('modules') or []
if len(mods)!=1 or mods[0].get('name')!='index.js': raise SystemExit('MODULE_BAD')
sha=hashlib.sha256(base64.b64decode(mods[0]['content_base64'])).hexdigest();
if sha!='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed': raise SystemExit('RUNTIME_MOVED:'+sha)
(O/'production.txt').write_text(vid+'\n'+sha+'\n'); print('PRODUCTION_LOCK',vid,sha)
PY
nonce="${GITHUB_RUN_ID:-manual}-$(date +%s%N)"
for ep in board signals statistics; do curl -fsS -L --retry 4 --retry-all-errors --max-time 30 "$WWW/api/engine/$ep?scan=$nonce" -o "$OUT/$ep.json"; done
python3 - <<'PY'
import json,pathlib
r=pathlib.Path('/tmp/b46-scorebar-measure'); sig=json.load(open(r/'signals.json')); st=json.load(open(r/'statistics.json')); board=json.load(open(r/'board.json'))
if not isinstance(sig.get('signals'),list) or not isinstance(st.get('rows'),list) or not isinstance(board.get('fixtures'),list): raise SystemExit('API_SHAPE_BAD')
print('API_COUNTS',{'signals':len(sig['signals']),'stats':len(st['rows']),'fixtures':len(board['fixtures'])})
if sig['signals']:
 print('ACTIVE_SIGNAL_SAMPLE',json.dumps(sig['signals'][0],ensure_ascii=False)[:5000])
 print('ACTIVE_SIGNAL_KEYS',sorted(sig['signals'][0].keys()))
else:
 # inspect recent unsettled/non-settled rows to understand compatible field names without inventing schema
 cand=[x for x in st['rows'] if str(x.get('status','')).upper() not in ('SETTLED','')]
 print('ACTIVE_SIGNAL_SAMPLE','NONE_CURRENT')
 if cand: print('NONSETTLED_STAT_SAMPLE',json.dumps(cand[0],ensure_ascii=False)[:5000])
PY
chrome=$(command -v google-chrome || command -v chromium || command -v chromium-browser || true); [ -n "$chrome" ] || { echo CHROME_MISSING; exit 1; }
"$chrome" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --window-size=1440,950 --remote-debugging-port=9777 --user-data-dir="$OUT/chrome" "$WWW/?measure=$nonce" >"$OUT/chrome.log" 2>&1 & CPID=$!; trap 'kill $CPID 2>/dev/null || true' EXIT
for i in $(seq 1 80); do curl -fsS http://127.0.0.1:9777/json > "$OUT/pages.tmp" 2>/dev/null && python3 -c "import json; x=json.load(open('$OUT/pages.tmp')); assert any(p.get('type')=='page' and p.get('webSocketDebuggerUrl') for p in x)" 2>/dev/null && { mv "$OUT/pages.tmp" "$OUT/pages.json"; break; }; sleep .5; done
cat > "$OUT/measure.js" <<'NODE'
const fs=require('fs'),pages=JSON.parse(fs.readFileSync('/tmp/b46-scorebar-measure/pages.json')),p=pages.find(x=>x.type==='page'&&x.webSocketDebuggerUrl);if(!p)throw Error('NO_PAGE');const ws=new WebSocket(p.webSocketDebuggerUrl);let id=0,q=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&q.has(m.id)){const x=q.get(m.id);q.delete(m.id);m.error?x.j(Error(JSON.stringify(m.error))):x.r(m.result)}};const call=(method,params={})=>new Promise((r,j)=>{const n=++id;q.set(n,{r,j});ws.send(JSON.stringify({id:n,method,params}))}),sleep=ms=>new Promise(r=>setTimeout(r,ms));async function ev(x){const z=await call('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});if(z.exceptionDetails)throw Error(JSON.stringify(z.exceptionDetails));return z.result.value}async function wait(x,t=45000){const s=Date.now();while(Date.now()-s<t){try{if(await ev(x))return}catch{}await sleep(250)}throw Error('WAIT '+x)}
(async()=>{await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});await call('Runtime.enable');await call('Page.enable');await call('Page.bringToFront');await wait(`document.readyState==='complete'`);await wait(`document.querySelectorAll('[data-workspace-scorebar-slot] .workspace-scorebar-grid > *').length===10`);await sleep(700);const d=await ev(`(()=>{const g=document.querySelector('[data-workspace-scorebar-slot] .workspace-scorebar-grid'),c=[...g.children],rr=x=>{const r=x.getBoundingClientRect(),s=getComputedStyle(x);return{w:+r.width.toFixed(2),h:+r.height.toFixed(2),radius:s.borderRadius,pad:s.padding,gap:s.gap,font:s.fontSize,line:s.lineHeight,bg:s.backgroundImage}};const gr=getComputedStyle(g);return{viewport:[innerWidth,innerHeight],grid:{w:+g.getBoundingClientRect().width.toFixed(2),gap:gr.columnGap,cols:gr.gridTemplateColumns},left:rr(c[0]),right:rr(c[6]),all:c.map(rr),slotDisplay:getComputedStyle(document.querySelector('[data-workspace-scorebar-slot]')).display}})()`);console.log('CARD_MEASURE',JSON.stringify(d));fs.writeFileSync('/tmp/b46-scorebar-measure/measure.json',JSON.stringify(d,null,2));ws.close();process.exit(0)})().catch(e=>{console.error(e);process.exit(1)});
NODE
node "$OUT/measure.js"
kill "$CPID" 2>/dev/null || true; trap - EXIT
echo SCOREBAR_MEASURE_SCAN_SUCCESS_NO_DEPLOY
