#!/usr/bin/env bash
set -euo pipefail
ROOT='/tmp/b46-scorebar-result-predeploy'
CAND="$ROOT/candidate"
VERIFY='/tmp/b46-scorebar-result-deploy-verify'
# Exact proven V5 candidate gate. Never rebuild here.
[ "$(find "$ROOT/base" -type f | wc -l | tr -d ' ')" = 79 ] || { echo ARTIFACT_BASE_NOT_79; exit 1; }
[ "$(find "$CAND" -type f | wc -l | tr -d ' ')" = 79 ] || { echo ARTIFACT_CAND_NOT_79; exit 1; }
printf '%s  %s\n' \
'aaa977a6a7b7e031426964f24834fd60ad4519a9821d244f797719b2f4355c4e' dashboard-v2-stage3.js \
'deb16cdb601f5898f88aa0f84bfc7d989af9576a6b94ae33521fd67b7d60ac90' singlepage-workspace-343.css \
'cec789ea440f0e9bf3ce7cf0db69d5d407649829ca142a0c16c7dc1fceb481b3' index.html | (cd "$CAND" && sha256sum -c -)
grep -Fq 'BALL46_SCOREBAR_SIGNAL_SETTLEMENT_20260928' "$CAND/dashboard-v2-stage3.js" || { echo SIGNAL_SETTLEMENT_MARKER_MISSING; exit 1; }
grep -Fq 'BALL46_SCOREBAR_SIGNAL_SETTLEMENT_VISUALS_20260928' "$CAND/singlepage-workspace-343.css" || { echo SIGNAL_VISUAL_MARKER_MISSING; exit 1; }
grep -Fq 'dashboard-v2-stage3.js?v=343-signal-settlement-20260928a' "$CAND/index.html" || { echo JS_BUSTER_MISSING; exit 1; }
grep -Fq 'singlepage-workspace-343.css?v=343-signal-settlement-20260928a' "$CAND/index.html" || { echo CSS_BUSTER_MISSING; exit 1; }
node --check "$CAND/dashboard-v2-stage3.js"
echo EXACT_V5_ARTIFACT_GATE_PASS

# Reuse the previously proven surgical deploy rail, but adapt only its locks/markers/busters
# and replace its old team-result browser proof with the Signal-settlement proof below.
python3 - <<'PY'
from pathlib import Path
src=Path('.github/scripts/ball46_scorebar_results_deploy_20260928.sh').read_text()
s=src
s=s.replace("EXPECTED_VERSION='35a2bad7-c5ca-4163-85ef-6a37b18bffbd'","EXPECTED_VERSION='8d386fb0-1646-4cc5-a15e-da38dc68974f'",1)
s=s.replace("if vid!='35a2bad7-c5ca-4163-85ef-6a37b18bffbd'", "if vid!='8d386fb0-1646-4cc5-a15e-da38dc68974f'",1)
s=s.replace("if cur!='35a2bad7-c5ca-4163-85ef-6a37b18bffbd'", "if cur!='8d386fb0-1646-4cc5-a15e-da38dc68974f'",1)
s=s.replace("for m in ['BALL46_SCOREBAR_RESULT_DETAIL_20260928','BALL46_SCOREBAR_RESULT_VISUALS_20260928','outcome-win','outcome-loss','outcome-draw','workspace-scorebar-live']:", "for m in ['BALL46_SCOREBAR_SIGNAL_SETTLEMENT_20260928','BALL46_SCOREBAR_SIGNAL_SETTLEMENT_VISUALS_20260928','workspace-scorebar-signal-result','outcome-win','outcome-loss','outcome-draw','workspace-scorebar-live']:",1)
s=s.replace("singlepage-workspace-343.css?v=343-scorebar-result-20260928a","singlepage-workspace-343.css?v=343-signal-settlement-20260928a")
s=s.replace("dashboard-v2-stage3.js?v=343-scorebar-result-20260928a","dashboard-v2-stage3.js?v=343-signal-settlement-20260928a")
# Keep proof files out of runtime module directory (same hygiene fix that made previous deploy safe).
old="(root/'index.js').write_bytes(runtime);(root/'pre-version.txt').write_text(vid);print('PRE_RUNTIME_LOCK_PASS',vid,sha)"
new="(root/'index.js').write_bytes(runtime);pathlib.Path('/tmp/b46-scorebar-result-deploy-verify/pre-version.txt').write_text(vid);print('PRE_RUNTIME_LOCK_PASS',vid,sha)"
if old not in s: raise SystemExit('PRE_VERSION_PATTERN_NOT_FOUND')
s=s.replace(old,new,1)
old2='cd "$RUNTIME"\nnpx --yes wrangler@4.92.0 deploy --dry-run --config wrangler.jsonc 2>&1 | tee "$VERIFY/dry-run.log"'
new2='''[ "$(find "$RUNTIME" -maxdepth 1 -type f -printf '%f\\n' | sort | paste -sd, -)" = 'index.js,wrangler.jsonc' ] || { echo RUNTIME_DIR_NOT_CLEAN; find "$RUNTIME" -maxdepth 1 -type f -printf '%f\\n'; exit 1; }
cd "$RUNTIME"
npx --yes wrangler@4.92.0 deploy --dry-run --config wrangler.jsonc 2>&1 | tee "$VERIFY/dry-run.log"'''
if old2 not in s: raise SystemExit('DRY_RUN_PATTERN_NOT_FOUND')
s=s.replace(old2,new2,1)
# Remove the old browser proof, which checked team WIN/LOSS semantics.
marker='# Public browser proof'
pos=s.find(marker)
if pos<0: raise SystemExit('OLD_BROWSER_MARKER_NOT_FOUND')
s=s[:pos]
Path('/tmp/ball46_signal_settlement_deploy_core.sh').write_text(s)
PY
bash /tmp/ball46_signal_settlement_deploy_core.sh

# Fresh post-deploy Statistics truth for the public browser proof.
mkdir -p "$VERIFY"
nonce="${GITHUB_RUN_ID:-manual}-signalbrowser-$(date +%s%N)"
curl -fsS -L --retry 4 --retry-all-errors --max-time 30 "https://www.ball46.com/api/engine/statistics?verify=$nonce" -o "$VERIFY/statistics-browser.json"
python3 - <<'PY'
import json,pathlib
p=pathlib.Path('/tmp/b46-scorebar-result-deploy-verify')
j=json.load(open(p/'statistics-browser.json'))
if j.get('ok') is not True or not isinstance(j.get('rows'),list): raise SystemExit('BROWSER_STATS_BAD')
allowed={'WIN','HALF_WIN','LOSS','HALF_LOSS','PUSH','DRAW'}
rows=[x for x in j['rows'] if str(x.get('status','')).upper()=='SETTLED' and str(x.get('result','')).upper() in allowed]
rows.sort(key=lambda x:x.get('settledAt') or x.get('createdAt') or 0,reverse=True)
if len(rows)<6: raise SystemExit('POST_SETTLED_LT6')
(p/'expected-six-browser.json').write_text(json.dumps(rows[:6],ensure_ascii=False,indent=2))
print('POST_SETTLEMENT_TRUTH_PASS',[x.get('result') for x in rows[:6]])
PY

chrome=$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)
[ -n "$chrome" ] || { echo CHROME_NOT_FOUND; exit 1; }
rm -rf "$VERIFY/chrome"; mkdir -p "$VERIFY/chrome"
"$chrome" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --window-size=1440,950 --remote-debugging-port=9555 --user-data-dir="$VERIFY/chrome" "https://www.ball46.com/?signal-settlement=$nonce" >"$VERIFY/chrome.log" 2>&1 & CPID=$!
trap 'kill ${CPID:-0} 2>/dev/null || true' EXIT
rm -f "$VERIFY/pages.json" "$VERIFY/pages.tmp"
for i in $(seq 1 80); do
 if curl -fsS http://127.0.0.1:9555/json > "$VERIFY/pages.tmp" 2>/dev/null && python3 -c "import json,sys;x=json.load(open(sys.argv[1]));assert any(p.get('type')=='page' and p.get('webSocketDebuggerUrl') for p in x)" "$VERIFY/pages.tmp" 2>/dev/null; then mv "$VERIFY/pages.tmp" "$VERIFY/pages.json"; break; fi
 sleep .5
done
[ -s "$VERIFY/pages.json" ] || { echo CHROME_CDP_NOT_READY; exit 1; }
cat > "$VERIFY/check-signal.js" <<'NODE'
const fs=require('fs');
const pages=JSON.parse(fs.readFileSync('/tmp/b46-scorebar-result-deploy-verify/pages.json'));const p=pages.find(x=>x.type==='page'&&x.webSocketDebuggerUrl);if(!p)throw Error('NO_PAGE');
const expected=JSON.parse(fs.readFileSync('/tmp/b46-scorebar-result-deploy-verify/expected-six-browser.json'));
const mapResult=r=>r==='WIN'?'WIN':r==='HALF_WIN'?'WIN ½':r==='LOSS'?'LOSS':r==='HALF_LOSS'?'LOSS ½':(r==='PUSH'||r==='DRAW')?'DRAW':r;
const ws=new WebSocket(p.webSocketDebuggerUrl);let id=0,q=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&q.has(m.id)){const x=q.get(m.id);q.delete(m.id);m.error?x.j(Error(JSON.stringify(m.error))):x.r(m.result)}};const call=(method,params={})=>new Promise((r,j)=>{const n=++id;q.set(n,{r,j});ws.send(JSON.stringify({id:n,method,params}))});const sleep=ms=>new Promise(r=>setTimeout(r,ms));async function ev(x){const z=await call('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});if(z.exceptionDetails)throw Error(JSON.stringify(z.exceptionDetails));return z.result.value}async function wait(x,t=40000){const s=Date.now();while(Date.now()-s<t){try{if(await ev(x))return}catch{}await sleep(250)}throw Error('WAIT:'+x)}
async function read(){return ev(`(()=>{const grid=document.querySelector('[data-workspace-scorebar-slot] .workspace-scorebar-grid'),cards=grid?[...grid.children]:[],left=cards.slice(0,6).map(c=>({result:c.getAttribute('data-scorebar-signal-result')||'',cls:c.className,text:c.innerText.trim(),score:c.querySelector('.workspace-scorebar-meta b')?.textContent.trim()||'',market:c.querySelector('.workspace-scorebar-pick strong')?.textContent.trim()||'',pick:c.querySelector('.workspace-scorebar-pick em')?.textContent.trim()||'',img:getComputedStyle(c).backgroundImage})),right=cards.slice(6).map(c=>({live:c.classList.contains('workspace-scorebar-live'),placeholder:c.classList.contains('placeholder'),status:c.querySelector('.workspace-scorebar-meta i')?.textContent.trim()||''})),mins=cards.slice(6).map(c=>{const t=c.querySelector('.workspace-scorebar-meta i')?.textContent||'',m=t.match(/(\d{1,3})'/);return m?+m[1]:-1}).filter(x=>x>=0),slot=document.querySelector('[data-workspace-scorebar-slot]'),css=[...document.querySelectorAll('link[rel="stylesheet"]')].find(x=>(x.getAttribute('href')||'').includes('singlepage-workspace-343.css'))?.getAttribute('href')||'',js=[...document.scripts].find(x=>(x.getAttribute('src')||'').includes('dashboard-v2-stage3.js'))?.getAttribute('src')||'',main=document.querySelector('.dashboard-shell')||document.body;return{count:cards.length,left,right,minuteSorted:mins.every((v,i,a)=>i===0||a[i-1]>=v),slotDisplay:slot?getComputedStyle(slot).display:'none',odds:!!window.NOMAD343_ODDS,favicon:!!document.querySelector('link[data-ball46-favicon="20260928"]'),css,js,overflow:main.scrollWidth>main.clientWidth+2}})()`)}
function score(x){const f=x?.finalScore||{};return (f.home==null||f.away==null)?'—':String(f.home)+'–'+String(f.away)}
(async()=>{await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});await call('Runtime.enable');await call('Page.enable');await call('Page.bringToFront');await wait(`document.readyState==='complete'`);await wait(`document.querySelectorAll('[data-scorebar-signal-result]').length===6`,40000);await sleep(700);let d=await read();let want=expected.map(x=>mapResult(String(x.result||'').toUpperCase())),got=d.left.map(x=>x.result);
// If a settlement raced after our API snapshot, refresh expected from the same page and compare to current UI after one reload.
if(JSON.stringify(got)!==JSON.stringify(want)){const fresh=await ev(`fetch('/api/engine/statistics?verify='+Date.now(),{cache:'no-store'}).then(r=>r.json())`);const rows=(fresh.rows||[]).filter(x=>String(x.status||'').toUpperCase()==='SETTLED'&&['WIN','HALF_WIN','LOSS','HALF_LOSS','PUSH','DRAW'].includes(String(x.result||'').toUpperCase())).sort((a,b)=>Number(b.settledAt||b.createdAt||0)-Number(a.settledAt||a.createdAt||0)).slice(0,6);expected.splice(0,expected.length,...rows);want=expected.map(x=>mapResult(String(x.result||'').toUpperCase()));await call('Page.reload',{ignoreCache:true});await wait(`document.querySelectorAll('[data-scorebar-signal-result]').length===6`,40000);await sleep(700);d=await read();got=d.left.map(x=>x.result)}
if(d.count!==10||JSON.stringify(got)!==JSON.stringify(want))throw Error('SIGNAL_RESULT_ORDER_BAD '+JSON.stringify({got,want}));
for(let i=0;i<6;i++){const c=d.left[i],x=expected[i],home=String(x?.home?.name||''),away=String(x?.away?.name||''),sel=String(x?.selection||'').toUpperCase();if(!c.market||!c.pick||!c.img.includes('svg+xml')||c.score!==score(x)||!c.text.includes(home)||!c.text.includes(away)||!c.pick.toUpperCase().includes(sel))throw Error('SIGNAL_DETAIL_BAD_'+i+' '+JSON.stringify({c,x}))}
if(d.left.some(x=>x.cls.includes('workspace-scorebar-team')))throw Error('OLD_TEAM_OUTCOME_SEMANTICS');if(d.right.some(x=>!x.live&&!x.placeholder)||!d.minuteSorted)throw Error('RIGHT4_BAD '+JSON.stringify(d.right));if(!d.odds||!d.favicon||d.overflow)throw Error('DESKTOP_REGRESSION '+JSON.stringify(d));if(!d.css.includes('343-signal-settlement-20260928a')||!d.js.includes('343-signal-settlement-20260928a'))throw Error('BUSTER_BAD');
await call('Emulation.setDeviceMetricsOverride',{width:390,height:850,deviceScaleFactor:1,mobile:false});await call('Page.reload',{ignoreCache:true});await wait(`document.readyState==='complete'`);await sleep(3000);const m=await read();if(m.slotDisplay!=='none'||!m.odds||!m.favicon||m.overflow)throw Error('MOBILE_REGRESSION '+JSON.stringify(m));const out={desktop:d,mobile:m,expectedResults:want};fs.writeFileSync('/tmp/b46-scorebar-result-deploy-verify/browser-signal.json',JSON.stringify(out,null,2));console.log('POST_SIGNAL_BROWSER_PASS',JSON.stringify({results:got,right:d.right,mobileSlot:m.slotDisplay}));ws.close();process.exit(0)})().catch(e=>{console.error(e);try{ws.close()}catch{}process.exit(1)});
NODE
node "$VERIFY/check-signal.js"
kill "$CPID" 2>/dev/null || true; trap - EXIT
echo BALL46_SIGNAL_SETTLEMENT_DEPLOY_SUCCESS
