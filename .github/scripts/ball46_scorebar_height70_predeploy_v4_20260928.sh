#!/usr/bin/env bash
set -euo pipefail
LOG='/tmp/b46-height70-v3.log'
set +e
bash .github/scripts/ball46_scorebar_height70_predeploy_v3_20260928.sh >"$LOG" 2>&1
rc=$?
set -e
cat "$LOG"
[ "$rc" -ne 0 ] || { echo V3_EXPECTED_MINIMAL_PREVIEW_FAILURE_MISSING; exit 1; }
grep -Fq "DESKTOP_HEIGHT_BAD:{'slot': '72px', 'grid': '70px', 'cards': [80, 80, 80, 80, 80, 80, 80, 80, 80, 80]" "$LOG" || { echo V3_FAILED_FOR_UNEXPECTED_REASON; exit 1; }
echo EXPECTED_MINIMAL_PREVIEW_BOX_MODEL_FALSE_ALARM_CONFIRMED
ROOT='/tmp/b46-height70-predeploy'; CAND="$ROOT/candidate"; VERIFY="$ROOT/verify"; RUNTIME="$ROOT/runtime"; DIRECT='https://ball46-production.mccarey-supon.workers.dev'
(cd "$CAND" && python3 -m http.server 8781 --bind 127.0.0.1 >"$VERIFY/full-server.log" 2>&1) & SPID=$!
trap 'kill $SPID 2>/dev/null || true; kill ${CPID:-0} 2>/dev/null || true' EXIT
sleep .5
chrome=$(command -v google-chrome || command -v chromium || command -v chromium-browser || true); [ -n "$chrome" ] || { echo CHROME_MISSING; exit 1; }
"$chrome" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --window-size=1440,900 --remote-debugging-port=9898 --user-data-dir="$VERIFY/full-chrome" http://127.0.0.1:8781/index.html >"$VERIFY/full-chrome.log" 2>&1 & CPID=$!
for i in $(seq 1 80); do curl -fsS http://127.0.0.1:9898/json > "$VERIFY/pages.json" 2>/dev/null && python3 -c "import json;x=json.load(open('$VERIFY/pages.json'));assert any(p.get('type')=='page' and p.get('webSocketDebuggerUrl') for p in x)" 2>/dev/null && break; sleep .5; done
[ -s "$VERIFY/pages.json" ] || { echo CDP_NOT_READY; exit 1; }
cat > "$VERIFY/full-check.js" <<'NODE'
const fs=require('fs'),pages=JSON.parse(fs.readFileSync('/tmp/b46-height70-predeploy/verify/pages.json')),p=pages.find(x=>x.type==='page'&&x.webSocketDebuggerUrl);if(!p)throw Error('NO_PAGE');const ws=new WebSocket(p.webSocketDebuggerUrl);let id=0,q=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&q.has(m.id)){const z=q.get(m.id);q.delete(m.id);m.error?z.j(Error(JSON.stringify(m.error))):z.r(m.result)}};const call=(method,params={})=>new Promise((r,j)=>{const n=++id;q.set(n,{r,j});ws.send(JSON.stringify({id:n,method,params}))}),sleep=ms=>new Promise(r=>setTimeout(r,ms));async function ev(x){const z=await call('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});if(z.exceptionDetails)throw Error(JSON.stringify(z.exceptionDetails));return z.result.value}
(async()=>{await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});await call('Runtime.enable');await call('Page.enable');await sleep(3000);
const d=await ev(`(async()=>{document.querySelectorAll('[data-h70-probe]').forEach(x=>x.remove());const slot=document.createElement('div');slot.className='workspace-scorebar-slot';slot.dataset.h70Probe='1';slot.setAttribute('data-workspace-scorebar-slot','');slot.style.width='1168px';slot.style.position='fixed';slot.style.left='0';slot.style.top='0';slot.style.zIndex='2147483647';const grid=document.createElement('div');grid.className='workspace-scorebar-grid';grid.style.gridTemplateColumns='repeat(10,minmax(0,1fr))';grid.style.width='1168px';slot.appendChild(grid);const cls=['outcome-win','outcome-loss','outcome-draw','outcome-win','outcome-loss','outcome-draw','pending','pending','pending','pending'];for(const c of cls){const e=document.createElement('div');e.className=c==='pending'?'workspace-scorebar-cell workspace-scorebar-pending':'workspace-scorebar-cell workspace-scorebar-signal-result '+c;grid.appendChild(e)}document.body.appendChild(slot);const cards=[...grid.children];const states=[];for(const e of cards){const cs=getComputedStyle(e),o={h:e.getBoundingClientRect().height,w:e.getBoundingClientRect().width,box:cs.boxSizing,bg:cs.backgroundImage};const m=o.bg.match(/data:image\\/webp;base64,[A-Za-z0-9+/=]+/);if(m){const im=new Image();im.src=m[0];await im.decode();o.iw=im.naturalWidth;o.ih=im.naturalHeight}states.push(o)}return{slotH:slot.getBoundingClientRect().height,gridH:grid.getBoundingClientRect().height,count:cards.length,states,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2}})()`);
if(Math.abs(d.slotH-72)>.01||Math.abs(d.gridH-70)>.01||d.count!==10||d.states.some(x=>Math.abs(x.h-70)>.01)||d.states.some(x=>x.box!=='border-box'))throw Error('FULL_STACK_HEIGHT_BAD:'+JSON.stringify(d));if(d.states.filter(x=>x.iw).some(x=>x.iw!==234||x.ih!==116))throw Error('IMAGE_DIM_BAD:'+JSON.stringify(d.states));console.log('FULL_STACK_DESKTOP_70PX_PASS',JSON.stringify(d));await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false}).then(x=>fs.writeFileSync('/tmp/b46-height70-predeploy/verify/height70-full-preview.png',Buffer.from(x.data,'base64')));
await call('Emulation.setDeviceMetricsOverride',{width:390,height:850,deviceScaleFactor:1,mobile:true});await sleep(700);const m=await ev(`(()=>{const s=document.querySelector('[data-h70-probe]');return{display:s?getComputedStyle(s).display:null,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2}})()`);if(m.display!=='none')throw Error('MOBILE_SCOREBAR_NOT_HIDDEN:'+JSON.stringify(m));console.log('FULL_STACK_MOBILE_HIDDEN_PASS',JSON.stringify(m));ws.close();process.exit(0)})().catch(e=>{console.error(e);process.exit(1)});
NODE
node "$VERIFY/full-check.js"
kill $CPID 2>/dev/null || true; kill $SPID 2>/dev/null || true; trap - EXIT
nonce="${GITHUB_RUN_ID:-manual}-$(date +%s%N)"
for ep in board signals statistics; do curl -fsSL --retry 4 --retry-all-errors --max-time 30 "$DIRECT/api/engine/$ep?h70v4=$nonce" -o "$VERIFY/$ep.json"; done
python3 - <<'PY'
import json,pathlib
r=pathlib.Path('/tmp/b46-height70-predeploy/verify')
for n in ['board','signals','statistics']:
 j=json.load(open(r/f'{n}.json'))
 if j.get('ok') is not True:raise SystemExit('API_BAD:'+n)
print('SNAPSHOT_API_PASS')
PY
cat > "$RUNTIME/wrangler.jsonc" <<EOF
{"name":"ball46-production","main":"./index.js","compatibility_date":"2026-09-09","no_bundle":true,"services":[{"binding":"ENGINE","service":"nomadtips3-engine-343","environment":"production"},{"binding":"FULL_MARKET","service":"nomadtips3-full-market-343-ball46","environment":"production"},{"binding":"HUB","service":"nomadtips3-5usd-hub-343","environment":"production"}],"assets":{"directory":"$CAND","binding":"ASSETS","html_handling":"none","not_found_handling":"none","run_worker_first":true},"triggers":{"crons":["* * * * *"]}}
EOF
(cd "$RUNTIME" && npx --yes wrangler@4.92.0 deploy --dry-run --config wrangler.jsonc 2>&1) | tee "$VERIFY/dry-run-v4.log"
grep -Fq 'Read 79 files from the assets directory' "$VERIFY/dry-run-v4.log" || { echo DRY_NOT_79; exit 1; }; ! grep -Fq 'Attaching additional modules:' "$VERIFY/dry-run-v4.log" || { echo DRY_EXTRA_MODULES; exit 1; }
echo DRY_RUN_79_RUNTIME_PASS
python3 - <<'PY'
import json,os,urllib.request,pathlib
A=os.environ['CLOUDFLARE_ACCOUNT_ID'];T=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {T}','Accept':'application/json'};u=f'https://api.cloudflare.com/client/v4/accounts/{A}/workers/scripts/ball46-production/deployments'
with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:d=json.load(r)
vs=d['result']['deployments'][0].get('versions') or [];vid=vs[0]['version_id'] if len(vs)==1 and float(vs[0].get('percentage',0))==100 else 'MIXED';locked=pathlib.Path('/tmp/b46-height70-predeploy/locked-version.txt').read_text().strip()
if vid!=locked:raise SystemExit('FINAL_RACE_ABORT:'+locked+'->'+vid)
print('FINAL_RACE_READONLY_PASS',vid)
PY
echo BALL46_HEIGHT70_PREDEPLOY_GREEN_NO_DEPLOY
