#!/usr/bin/env bash
set -euo pipefail
OUT=/tmp/b46-scorebar-refresh
DIRECT='https://ball46-production.mccarey-supon.workers.dev'
WWW='https://www.ball46.com'
rm -rf "$OUT" && mkdir -p "$OUT"
python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
root=pathlib.Path('/tmp/b46-scorebar-refresh')
a=os.environ['CLOUDFLARE_ACCOUNT_ID']; t=os.environ['CLOUDFLARE_API_TOKEN']
h={'Authorization':f'Bearer {t}','Accept':'application/json'}; api=f'https://api.cloudflare.com/client/v4/accounts/{a}'; script='ball46-production'
def get(u):
  with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:return json.load(r)
d=get(f'{api}/workers/scripts/{script}/deployments')['result']['deployments'][0]; vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100: raise SystemExit('MIXED_DEPLOYMENT')
vid=vs[0]['version_id']; v=get(f'{api}/workers/workers/{script}/versions/{vid}?include=modules')['result']; mods=v.get('modules') or []
main=[m for m in mods if m.get('name')=='index.js' and m.get('content_base64')]
if len(main)!=1: raise SystemExit('INDEX_MODULE_MISSING')
sha=hashlib.sha256(base64.b64decode(main[0]['content_base64'])).hexdigest()
exp='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed'
if sha!=exp: raise SystemExit('RUNTIME_CHANGED:'+sha)
expect=[('ASSETS','assets',None,None),('ENGINE','service','nomadtips3-engine-343','production'),('FULL_MARKET','service','nomadtips3-full-market-343-ball46','production'),('HUB','service','nomadtips3-5usd-hub-343','production')]
got=sorted((b.get('name'),b.get('type'),b.get('service'),b.get('environment')) for b in (v.get('bindings') or []))
if got!=sorted(expect): raise SystemExit('BINDINGS_CHANGED:'+repr(got))
if v.get('compatibility_date')!='2026-09-09' or (v.get('compatibility_flags') or []): raise SystemExit('COMPAT_CHANGED')
ac=(v.get('assets') or {}).get('config') or {}; exac={'base_path':'/','html_handling':'none','not_found_handling':'none','run_worker_first':True}
if {k:ac.get(k) for k in exac}!=exac: raise SystemExit('ASSET_CONFIG_CHANGED:'+repr(ac))
s=get(f'{api}/workers/scripts/{script}/schedules')['result']; ss=s.get('schedules',[]) if isinstance(s,dict) else (s or [])
if [x.get('cron') for x in ss if isinstance(x,dict) and x.get('cron')]!=['* * * * *']: raise SystemExit('CRON_CHANGED')
root.joinpath('production-lock.json').write_text(json.dumps({'version':vid,'runtime_sha256':sha,'bindings':got,'assets_config':ac,'cron':'* * * * *'},indent=2))
print('REFRESH_PRODUCTION_LOCK_OK',vid,sha)
PY
nonce="${GITHUB_RUN_ID}-$(date +%s%N)"
for rel in index.html dashboard-v2-stage3.js dashboard-v2-tune.css singlepage-workspace-343.js singlepage-workspace-343.css odds-format-343.js; do
  curl -fsS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' "$DIRECT/$rel?$nonce-$RANDOM" -o "$OUT/$rel"
  sha256sum "$OUT/$rel" >> "$OUT/key-assets.sha256"
done
grep -Fq 'BALL46_SCOREBAR_6X4_20260928' "$OUT/dashboard-v2-stage3.js" || { echo SCOREBAR_6X4_MARKER_MISSING; exit 1; }
grep -Fq 'B46_ODDS_VISIBILITY_20260928' "$OUT/odds-format-343.js" || { echo ODDS_MARKER_MISSING; exit 1; }
grep -Fq 'data-ball46-favicon="20260928"' "$OUT/index.html" || { echo FAVICON_MARKER_MISSING; exit 1; }
grep -Fq 'dashboard-v2-tune.css?v=343-card-step6-20260928a' "$OUT/index.html" || { echo STEP6_INDEX_CACHEBUSTER_MISSING; exit 1; }
grep -Fq 'BALL46 CARD REBUILD STEP6 MOCKUP MATCH 20260928' "$OUT/dashboard-v2-tune.css" || { echo STEP6_ACTUAL_CSS_MARKER_MISSING; exit 1; }
echo REFRESH_KEY_MARKERS_OK
for ep in board signals statistics; do curl -fsS -L --retry 3 --retry-all-errors --max-time 30 "$WWW/api/engine/$ep?baseline=$nonce" -o "$OUT/$ep.json"; done
python3 - <<'PY'
import json,pathlib
r=pathlib.Path('/tmp/b46-scorebar-refresh')
for n in ['board','signals','statistics']:
 j=json.load(open(r/f'{n}.json'))
 if j.get('ok') is not True: raise SystemExit('FLOW_BAD:'+n)
print('REFRESH_FLOW_OK',len(json.load(open(r/'board.json')).get('fixtures') or []),len(json.load(open(r/'signals.json')).get('signals') or []),len(json.load(open(r/'statistics.json')).get('statistics') or []))
PY
chrome=$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)
[ -n "$chrome" ] || { echo CHROME_NOT_FOUND; exit 1; }
"$chrome" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --window-size=1440,1050 --remote-debugging-port=9222 --user-data-dir="$OUT/chrome" "$WWW/index.html?baseline_refresh=${GITHUB_RUN_ID:-manual}" >"$OUT/chrome.log" 2>&1 &
CPID=$!; trap 'kill $CPID 2>/dev/null || true' EXIT
for i in $(seq 1 40); do curl -fsS http://127.0.0.1:9222/json > "$OUT/pages.json" 2>/dev/null && break; sleep 1; done
test -s "$OUT/pages.json"
cat > "$OUT/check.js" <<'NODE'
const fs=require('fs');
const pages=JSON.parse(fs.readFileSync('/tmp/b46-scorebar-refresh/pages.json'));
const p=pages.find(x=>x.type==='page'); if(!p)throw Error('NO_PAGE');
const ws=new WebSocket(p.webSocketDebuggerUrl); let id=0; const q=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&q.has(m.id)){const x=q.get(m.id);q.delete(m.id);m.error?x.j(Error(JSON.stringify(m.error))):x.r(m.result)}};
const call=(method,params={})=>new Promise((r,j)=>{const n=++id;q.set(n,{r,j});ws.send(JSON.stringify({id:n,method,params}))});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function ev(expression){const z=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(z.exceptionDetails)throw Error(JSON.stringify(z.exceptionDetails));return z.result.value}
async function wait(x,t=30000){const s=Date.now();while(Date.now()-s<t){try{if(await ev(x))return}catch{}await sleep(250)}throw Error('WAIT:'+x)}
(async()=>{
 await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j}); await call('Runtime.enable');
 await wait(`document.readyState==='complete'`);
 await wait(`document.querySelectorAll('[data-workspace-scorebar-slot] .workspace-scorebar-grid > *').length===10`);
 await wait(`document.querySelectorAll('.match-row[data-match-id]').length>0`);
 await sleep(2500);
 const x=await ev(`(()=>{const grid=document.querySelector('[data-workspace-scorebar-slot] .workspace-scorebar-grid');const cells=grid?[...grid.children]:[];const ids=cells.map(c=>c.getAttribute('data-workspace-score-id')).filter(Boolean);const statuses=cells.map(c=>c.querySelector('.workspace-scorebar-meta i')?.textContent?.trim()||'PLACEHOLDER');const first6=statuses.slice(0,6),last4=statuses.slice(6,10);const mins=last4.map(s=>{const m=String(s).match(/(\\d+)/);return m?Number(m[1]):null}).filter(v=>v!==null);const minuteSorted=mins.every((v,i,a)=>i===0||a[i-1]>=v);const sheet=[...document.styleSheets].find(s=>(s.href||'').includes('343-card-step6-20260928a'));const row=document.querySelector('.match-row[data-match-id]');return {count:cells.length,ids,statuses,first6,last4,minuteSorted,odds:!!window.NOMAD343_ODDS,favicon:!!document.querySelector('link[data-ball46-favicon="20260928"]'),step6:!!sheet,overflow:row?row.scrollWidth>row.clientWidth+1:false};})()`);
 console.log('REFRESH_BROWSER',JSON.stringify(x));
 if(x.count!==10)throw Error('SCOREBAR_COUNT_'+x.count);
 if(!x.first6.every(s=>s==='FT'))throw Error('RECENT6_NOT_ALL_FT:'+JSON.stringify(x.first6));
 if(!x.minuteSorted)throw Error('NEARFT4_NOT_DESC:'+JSON.stringify(x.last4));
 if(new Set(x.ids).size!==x.ids.length)throw Error('DUPLICATE_SCOREBAR_IDS');
 if(!x.odds||!x.favicon||!x.step6||x.overflow)throw Error('REGRESSION_MARKER_OR_LAYOUT:'+JSON.stringify(x));
 fs.writeFileSync('/tmp/b46-scorebar-refresh/browser.json',JSON.stringify(x,null,2));
 ws.close(); console.log('REFRESH_SCOREBAR_6X4_BROWSER_OK'); console.log('REFRESH_BASELINE_SUCCESS_NO_DEPLOY'); process.exit(0);
})().catch(e=>{console.error(e);try{ws.close()}catch{}process.exit(1)});
NODE
node "$OUT/check.js"
kill "$CPID" 2>/dev/null || true; trap - EXIT
