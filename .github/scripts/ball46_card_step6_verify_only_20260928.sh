#!/usr/bin/env bash
set -euo pipefail
ROOT=/tmp/b46-card-step6
DIRECT='https://ball46-production.mccarey-supon.workers.dev'
WWW='https://www.ball46.com'
EXPECTED_VERSION='01c24c0c-6d6c-4e11-97c5-efc9414f2635'
EXPECTED_RUNTIME_SHA='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed'
EXPECTED_STEP5_CSS_SHA='239cbefc12143fcae2845f8ef9de5ff6855e9f2dd320c1b6704d88eeeecfe79f'
rm -rf "$ROOT"; mkdir -p "$ROOT"
python3 - <<'PY'
import base64,hashlib,json,os,urllib.request
A=os.environ['CLOUDFLARE_ACCOUNT_ID'];T=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {T}','Accept':'application/json'};api=f'https://api.cloudflare.com/client/v4/accounts/{A}';s='ball46-production'
def get(u):
  with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:return json.load(r)
d=get(f'{api}/workers/scripts/{s}/deployments')['result']['deployments'][0];vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100: raise SystemExit('MIXED_DEPLOYMENT')
vid=vs[0]['version_id'];print('CURRENT_VERSION',vid)
if vid!='01c24c0c-6d6c-4e11-97c5-efc9414f2635': raise SystemExit('PRODUCTION_MOVED:'+vid)
v=get(f'{api}/workers/workers/{s}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or []
if len(mods)!=1 or mods[0].get('name')!='index.js': raise SystemExit('MODULE_SHAPE_BAD')
sha=hashlib.sha256(base64.b64decode(mods[0]['content_base64'])).hexdigest();print('RUNTIME_SHA',sha)
if sha!='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed': raise SystemExit('RUNTIME_MOVED')
PY
nonce="${GITHUB_RUN_ID:-manual}-$(date +%s%N)"
curl -fsS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' "$DIRECT/dashboard-v2-tune.css?step6=$nonce" -o "$ROOT/current.css"
[ "$(sha256sum "$ROOT/current.css"|awk '{print $1}')" = "$EXPECTED_STEP5_CSS_SHA" ] || { echo CSS_BASE_MOVED; exit 1; }
cat > "$ROOT/step6.css" <<'CSS'
/* BALL46 CARD REBUILD STEP6 MOCKUP MATCH 20260928 */
@media (min-width:761px){
  .match-row{
    grid-template-columns:minmax(0,29fr) minmax(0,14fr) minmax(0,14fr) minmax(0,14fr) minmax(0,13fr) minmax(0,16fr)!important;
    gap:6px!important;
  }
  .match-row .teams-cell{min-width:0;height:42px;display:grid;grid-template-rows:repeat(2,minmax(0,1fr));align-items:center}
  .match-row .teams-cell>b{min-width:0;margin:0;line-height:1.15;align-self:center}
  .match-row .score-cell{min-width:0;height:42px;display:grid;grid-template-columns:30px minmax(0,auto) minmax(0,1fr);grid-template-rows:repeat(2,minmax(0,1fr));column-gap:6px;align-items:center;position:relative;text-align:center}
  .match-row .score-cell::after{content:"";position:absolute;left:35px;top:3px;bottom:3px;width:1px;background:var(--line);pointer-events:none}
  .match-row .score-cell>strong:nth-of-type(1){grid-column:1;grid-row:1;align-self:center}
  .match-row .score-cell>strong:nth-of-type(2){grid-column:1;grid-row:2;align-self:center}
  .match-row .score-cell>small:not(.half-score){grid-column:2;grid-row:1 / span 2;align-self:center;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center;font-size:9px;line-height:1.05}
  .match-row .score-cell>.half-score{grid-column:3;grid-row:1 / span 2;align-self:center;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left;font-size:8px;line-height:1.05}
  .match-row .market-cell,.match-row .signal-cell.prediction-live{min-width:0}
  .match-row .signal-cell.prediction-live{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:0 5px 0 8px;border-left:1px solid var(--line)}
  .match-row .signal-cell.prediction-live .pred-main{display:block;width:100%;white-space:normal;overflow:visible;text-overflow:clip;overflow-wrap:anywhere;text-align:center;font-size:8px;line-height:1.18}
  .match-row .signal-cell.prediction-live .pred-sub{display:block;width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center;font-size:7px;line-height:1.05}
}
@media (min-width:761px) and (max-width:980px){
  .match-row{grid-template-columns:minmax(0,30fr) minmax(0,15fr) minmax(0,14fr) minmax(0,14fr) minmax(0,12fr) minmax(0,15fr)!important;gap:4px!important}
  .match-row .score-cell{grid-template-columns:26px minmax(0,auto) minmax(0,1fr);column-gap:4px}
  .match-row .score-cell::after{left:30px}
  .match-row .score-cell>small:not(.half-score){font-size:8px}
  .match-row .score-cell>.half-score{font-size:7px}
  .match-row .signal-cell.prediction-live{padding-left:6px}
}
CSS
chrome=$(command -v google-chrome || command -v chromium || command -v chromium-browser)
"$chrome" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --window-size=1440,1050 --remote-debugging-port=9222 --user-data-dir="$ROOT/chrome" "$WWW/index.html?status=live&step6preview=$nonce" >"$ROOT/chrome.log" 2>&1 &
CPID=$!; trap 'kill $CPID 2>/dev/null || true' EXIT
for i in $(seq 1 40); do curl -fsS http://127.0.0.1:9222/json > "$ROOT/pages.json" 2>/dev/null && break; sleep 1; done
test -s "$ROOT/pages.json"
CSS64=$(base64 -w0 "$ROOT/step6.css")
cat > "$ROOT/check.js" <<'NODE'
const fs=require('fs');const pages=JSON.parse(fs.readFileSync('/tmp/b46-card-step6/pages.json'));const p=pages.find(x=>x.type==='page');if(!p)throw Error('NO_PAGE');const ws=new WebSocket(p.webSocketDebuggerUrl);let id=0;const q=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&q.has(m.id)){const x=q.get(m.id);q.delete(m.id);m.error?x.j(Error(JSON.stringify(m.error))):x.r(m.result)}};const call=(method,params={})=>new Promise((r,j)=>{const n=++id;q.set(n,{r,j});ws.send(JSON.stringify({id:n,method,params}))});const sleep=ms=>new Promise(r=>setTimeout(r,ms));async function ev(expression){const z=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(z.exceptionDetails)throw Error(JSON.stringify(z.exceptionDetails));return z.result.value}async function wait(x,t=25000){const s=Date.now();while(Date.now()-s<t){try{if(await ev(x))return}catch{}await sleep(250)}throw Error('WAIT:'+x)};(async()=>{await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});await call('Runtime.enable');await wait(`document.readyState==='complete'`);await wait(`document.querySelectorAll('.match-row[data-match-id]').length>0`);await sleep(2500);const before=await ev(`(()=>{const r=document.querySelector('.match-row[data-match-id]');return {h:r.getBoundingClientRect().height,w:r.getBoundingClientRect().width}})()`);const css=Buffer.from(process.env.CSS64,'base64').toString('utf8');await ev(`(()=>{const s=document.createElement('style');s.id='ball46-step6-preview';s.textContent=${JSON.stringify(css)};document.head.appendChild(s);return true})()`);await sleep(300);const g=await ev(`(()=>{const r=document.querySelector('.match-row[data-match-id]'),t=r.querySelector('.teams-cell'),sc=r.querySelector('.score-cell'),m=[...r.querySelectorAll('.market-cell')],sg=r.querySelector('.signal-cell'),names=[...t.querySelectorAll('b')],scores=[...sc.querySelectorAll('strong')],clock=sc.querySelector('small:not(.half-score)'),half=sc.querySelector('.half-score');const c=x=>{const a=x.getBoundingClientRect();return {x:a.x,y:a.y,w:a.width,h:a.height,cx:a.x+a.width/2,cy:a.y+a.height/2}};return {row:c(r),team:c(t),score:c(sc),markets:m.map(c),signal:c(sg),nameCenters:names.map(x=>c(x).cy),scoreCenters:scores.map(x=>c(x).cy),clock:c(clock),half:c(half),overflow:r.scrollWidth>r.clientWidth+1,text:sg.innerText}})()`);const nameAlign=Math.max(...g.nameCenters.map((v,i)=>Math.abs(v-g.scoreCenters[i])));const timeAlign=Math.abs(g.clock.cy-g.half.cy);const heightDelta=Math.abs(g.row.h-before.h);const usable=g.team.w+g.score.w+g.markets.reduce((a,x)=>a+x.w,0)+g.signal.w;const ratios={team:g.team.w/usable,score:g.score.w/usable,signal:g.signal.w/usable};const out={before,after:g,nameAlign,timeAlign,heightDelta,ratios};console.log(JSON.stringify(out));if(g.overflow)throw Error('OVERFLOW');if(nameAlign>4)throw Error('SCORE_NOT_ALIGNED:'+nameAlign);if(timeAlign>3)throw Error('CLOCK_HT_NOT_HORIZONTAL:'+timeAlign);if(heightDelta>1.5)throw Error('ROW_HEIGHT_CHANGED:'+heightDelta);if(g.signal.w<105)throw Error('SIGNAL_TOO_NARROW:'+g.signal.w);if(g.team.w<190)throw Error('TEAM_AREA_TOO_NARROW:'+g.team.w);if(g.score.w<90)throw Error('TIME_AREA_TOO_NARROW:'+g.score.w);fs.writeFileSync('/tmp/b46-card-step6/result.json',JSON.stringify(out,null,2));ws.close();process.exit(0)})().catch(e=>{console.error(e);try{ws.close()}catch{}process.exit(1)});
NODE
CSS64="$CSS64" node "$ROOT/check.js"
kill "$CPID" 2>/dev/null || true; trap - EXIT
echo BALL46_CARD_STEP6_VERIFY_ONLY_PASS
