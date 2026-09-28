#!/usr/bin/env bash
set -euo pipefail
WWW="https://www.ball46.com"
SRC="/tmp/b46-step4-source"
OUT="/tmp/b46-step4-output"
BEFORE="$SRC/before"
PROTO="$SRC/prototype"
rm -rf "$OUT" && mkdir -p "$OUT/pre" "$OUT/post" "$OUT/screens"

# Step 4 is read-only against Production. Lock the UI/runtime files that own the tested behavior.
FILES=(
  index.html
  dashboard-v2-stage3.js
  dashboard-v2-tune.css
  dashboard-v2-tune.js
  expanded-match-343.js
  live-summary-full-odds-343.js
  singlepage-workspace-343.js
  color-semantics-343.js
)
for rel in "${FILES[@]}"; do
  test -s "$BEFORE/$rel" || { echo "SOURCE_MISSING:$rel"; exit 1; }
  code=$(curl -sS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' -o "$OUT/pre/$rel" -w '%{http_code}' "$WWW/$rel?step4-pre=${GITHUB_RUN_ID:-manual}-${RANDOM}")
  [ "$code" = 200 ] || { echo "PROD_FETCH_FAILED:$code:$rel"; exit 1; }
  [ "$(sha256sum "$OUT/pre/$rel" | awk '{print $1}')" = "$(sha256sum "$BEFORE/$rel" | awk '{print $1}')" ] || { echo "PRODUCTION_BASE_MOVED:$rel"; exit 1; }
done
echo STEP4_PRODUCTION_BASE_LOCK_PASS

# Extract ONLY the Step-3 CSS addition. No JS/HTML from the prototype is injected.
python3 - <<'PY'
from pathlib import Path
b=Path('/tmp/b46-step4-source/before/dashboard-v2-tune.css').read_text()
p=Path('/tmp/b46-step4-source/prototype/dashboard-v2-tune.css').read_text()
if not p.startswith(b): raise SystemExit('STEP3_CSS_NOT_APPEND_ONLY')
d=p[len(b):]
if 'BALL46 CARD REBUILD STEP3 PROTOTYPE 20260928' not in d: raise SystemExit('STEP3_CSS_TOKEN_MISSING')
if '@media (max-width:900px)' in d or '@media(max-width:900px)' in d: raise SystemExit('STEP3_CSS_MOBILE_SCOPE_DETECTED')
Path('/tmp/b46-step4-output/step4.css').write_text(d)
print('STEP4_CSS_DELTA_BYTES',len(d.encode()))
PY

# Read-only API health before browser behavior tests.
nonce="${GITHUB_RUN_ID:-manual}-$(date +%s%N)"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/board?step4-pre=$nonce" -o "$OUT/board-before.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/signals?step4-pre=$nonce" -o "$OUT/signals-before.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/statistics?step4-pre=$nonce" -o "$OUT/stats-before.json"
node - <<'NODE'
const fs=require('fs');
const b=JSON.parse(fs.readFileSync('/tmp/b46-step4-output/board-before.json'));
const s=JSON.parse(fs.readFileSync('/tmp/b46-step4-output/signals-before.json'));
const t=JSON.parse(fs.readFileSync('/tmp/b46-step4-output/stats-before.json'));
if(b?.ok!==true||!Array.isArray(b?.fixtures))throw Error('PRE_BOARD_BAD');
if(!Array.isArray(s?.signals))throw Error('PRE_SIGNALS_BAD');
if(t?.ok!==true||!Array.isArray(t?.rows))throw Error('PRE_STATS_BAD');
console.log('STEP4_PRE_FLOW_OK',{fixtures:b.fixtures.length,signals:s.signals.length,stats:t.rows.length});
NODE

chrome=$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)
[ -n "$chrome" ] || { echo CHROME_NOT_FOUND; exit 1; }
rm -rf "$OUT/chrome"
"$chrome" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --window-size=1440,1050 \
  --remote-debugging-port=9222 --user-data-dir="$OUT/chrome" \
  "$WWW/index.html?status=live&step4=${GITHUB_RUN_ID:-manual}" >"$OUT/chrome.log" 2>&1 &
CPID=$!
trap 'kill $CPID 2>/dev/null || true' EXIT
for i in $(seq 1 40); do
  curl -fsS http://127.0.0.1:9222/json > "$OUT/pages.json" 2>/dev/null && break
  sleep 1
done

test -s "$OUT/pages.json"
cat > "$OUT/step4-cdp.js" <<'NODE'
const fs=require('fs');
const pages=JSON.parse(fs.readFileSync('/tmp/b46-step4-output/pages.json','utf8'));
const page=pages.find(x=>x.type==='page'); if(!page)throw Error('NO_PAGE');
const css=fs.readFileSync('/tmp/b46-step4-output/step4.css','utf8');
const ws=new WebSocket(page.webSocketDebuggerUrl); let id=0; const pending=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result)}};
const call=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}))});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function ev(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error('EVAL:'+JSON.stringify(r.exceptionDetails));return r.result?.value}
async function wait(expr,timeout=15000,step=250){const start=Date.now();while(Date.now()-start<timeout){try{if(await ev(expr))return true}catch{}await sleep(step)}throw Error('WAIT_TIMEOUT:'+expr)}
async function shot(path){await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false}).then(r=>fs.writeFileSync(path,Buffer.from(r.data,'base64')))}
(async()=>{
 await new Promise((ok,fail)=>{ws.onopen=ok;ws.onerror=fail});
 await call('Page.enable'); await call('Runtime.enable');
 await wait(`document.readyState==='complete'`); await wait(`!!window.NOMAD343_DASHBOARD_V2 && document.querySelectorAll('.match-row[data-match-id]').length>0`,20000);
 await sleep(5000);
 const before=await ev(`(()=>{const r=document.querySelector('.match-row[data-match-id]');const sig=r?.querySelector('.signal-cell'),sc=r?.querySelector('.score-cell');return {rows:document.querySelectorAll('.match-row[data-match-id]').length,signal:Math.round(sig?.getBoundingClientRect().width||0),score:Math.round(sc?.getBoundingClientRect().width||0),dash:!!window.NOMAD343_DASHBOARD_V2,expand:!!window.NOMAD343_EXPANDED_MATCH,rich:!!window.NOMAD343_LIVE_SUMMARY_FULL_ODDS,view:document.body.dataset.workspaceView||''}})()`);
 if(!before.dash||!before.expand||!before.rich)throw Error('REQUIRED_RUNTIME_API_MISSING:'+JSON.stringify(before));
 const injected=await ev(`(()=>{let s=document.querySelector('style[data-step4-card-prototype]');if(s)s.remove();s=document.createElement('style');s.dataset.step4CardPrototype='true';s.textContent=${JSON.stringify(css)};document.head.appendChild(s);return true})()`);
 if(!injected)throw Error('CSS_INJECT_FAILED'); await sleep(300);
 const after=await ev(`(()=>{const r=document.querySelector('.match-row[data-match-id]');const sig=r?.querySelector('.signal-cell'),sc=r?.querySelector('.score-cell');const rows=[...document.querySelectorAll('.match-row')];return {signal:Math.round(sig?.getBoundingClientRect().width||0),score:Math.round(sc?.getBoundingClientRect().width||0),overflow:rows.some(x=>x.scrollWidth>x.clientWidth+1),style:!!document.querySelector('style[data-step4-card-prototype]')}})()`);
 if(!after.style||after.overflow||after.signal<=before.signal||after.score<=before.score)throw Error('CARD_GEOMETRY_BAD:'+JSON.stringify({before,after}));
 await shot('/tmp/b46-step4-output/screens/live-css-injected.png');

 const statusResults={};
 for(const kind of ['live','scheduled','finished']){
   const res=await ev(`(()=>{const b=document.querySelector('[data-status-filter="${kind}"]');if(!b)return {missing:true};b.click();const count=Number(document.querySelector('[data-filter-count="${kind}"]')?.textContent||0);const secs=[...document.querySelectorAll('[data-status-section]')].map(x=>x.dataset.statusSection);const rows=document.querySelectorAll('.match-row').length;return {count,secs,rows,overflow:[...document.querySelectorAll('.match-row')].some(x=>x.scrollWidth>x.clientWidth+1),style:!!document.querySelector('style[data-step4-card-prototype]')}})()`);
   if(res.missing||res.overflow||!res.style)throw Error('STATUS_FILTER_BAD:'+kind+':'+JSON.stringify(res));
   if(res.count>0 && (res.rows===0 || res.secs.some(x=>x!==kind)))throw Error('STATUS_FILTER_CONTENT_BAD:'+kind+':'+JSON.stringify(res));
   if(res.count===0 && res.rows!==0)throw Error('STATUS_ZERO_STILL_ROWS:'+kind+':'+JSON.stringify(res));
   statusResults[kind]=res; await sleep(150);
 }
 await ev(`document.querySelector('[data-status-filter="all"]')?.click()`); await sleep(200);

 const search=await ev(`(()=>{const first=document.querySelector('.match-row .teams-cell b');const input=document.querySelector('[data-search]');if(!first||!input)return {skip:true};const term=(first.textContent||'').trim();input.value=term;input.dispatchEvent(new Event('input',{bubbles:true}));const rows=[...document.querySelectorAll('.match-row')];const ok=rows.length>0&&rows.every(r=>r.textContent.toLowerCase().includes(term.toLowerCase()));input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));return {term,rows:rows.length,ok}})()`);
 if(!search.skip&&!search.ok)throw Error('SEARCH_FILTER_BAD:'+JSON.stringify(search)); await sleep(200);

 const expandStart=await ev(`(()=>{const row=document.querySelector('.match-row[data-match-id]');if(!row)return null;const id=row.dataset.matchId;window.NOMAD343_EXPANDED_MATCH.open(id);return id})()`);
 if(!expandStart)throw Error('NO_ROW_FOR_EXPAND');
 await wait(`!!document.querySelector('.match-expanded[data-expanded-match="${expandStart}"]')`,5000); await sleep(400);
 const expBefore=await ev(`(()=>{const r=document.querySelector('.match-row[data-match-id="${expandStart}"]'),e=document.querySelector('.match-expanded[data-expanded-match="${expandStart}"]');return {adjacent:!!r&&r.nextElementSibling===e,style:!!document.querySelector('style[data-step4-card-prototype]')}})()`);
 if(!expBefore.adjacent||!expBefore.style)throw Error('EXPANDED_PLACEMENT_BAD_PRE:'+JSON.stringify(expBefore));
 await shot('/tmp/b46-step4-output/screens/expanded-before-reload.png');
 await ev(`(()=>{const h=document.querySelector('[data-board-sections]');window.__step4Mut=0;window.__step4MO=new MutationObserver(()=>window.__step4Mut++);window.__step4MO.observe(h,{childList:true,subtree:true});window.NOMAD343_DASHBOARD_V2.reload();return true})()`);
 await sleep(3500);
 const expAfter=await ev(`(()=>{const r=document.querySelector('.match-row[data-match-id="${expandStart}"]'),e=document.querySelector('.match-expanded[data-expanded-match="${expandStart}"]');return {adjacent:!!r&&r.nextElementSibling===e,connected:!!e?.isConnected,mut:window.__step4Mut||0,overflow:[...document.querySelectorAll('.match-row')].some(x=>x.scrollWidth>x.clientWidth+1),style:!!document.querySelector('style[data-step4-card-prototype]')}})()`);
 if(!expAfter.adjacent||!expAfter.connected||expAfter.mut<1||expAfter.overflow||!expAfter.style)throw Error('EXPANDED_RELOAD_BAD:'+JSON.stringify(expAfter));
 await ev(`(()=>{window.__step4MO?.disconnect();return true})()`); await ev(`window.NOMAD343_EXPANDED_MATCH.close()`); await sleep(150);

 const rich=await ev(`(async()=>{const api=window.NOMAD343_LIVE_SUMMARY_FULL_ODDS;const row=document.querySelector('.match-row[data-match-id]');const id=row?.dataset.matchId;if(!api||!id)return {skip:'missing-api-or-row'};for(let i=0;i<20;i++){const hit=api.current(id);if(hit)return {id,hit:true,bookmakerCount:Number(hit.bookmakerCount||0),source:hit.source||'',row:!!document.querySelector('.match-row[data-match-id="'+CSS.escape(id)+'"]')};await new Promise(r=>setTimeout(r,500))}return {id,hit:false,skip:'provider-not-ready-or-rate-limited',row:!!document.querySelector('.match-row[data-match-id="'+CSS.escape(id)+'"]')}})()`);
 if(rich.row===false)throw Error('RICH_ODDS_REMOVED_ROW:'+JSON.stringify(rich));

 const signal=await ev(`(()=>{const b=document.querySelector('[data-workspace-view="signal"]');if(!b)return {skip:true};b.click();const rows=[...document.querySelectorAll('.match-row')];return {view:document.body.dataset.workspaceView||'',rows:rows.length,overflow:rows.some(x=>x.scrollWidth>x.clientWidth+1),style:!!document.querySelector('style[data-step4-card-prototype]')}})()`);
 if(!signal.skip&&(signal.view!=='signal'||signal.overflow||!signal.style))throw Error('SIGNAL_VIEW_BAD:'+JSON.stringify(signal));
 await sleep(300); await shot('/tmp/b46-step4-output/screens/signal-view.png');
 await ev(`document.querySelector('[data-workspace-view="live"]')?.click()`); await sleep(250);

 await ev(`(()=>{const h=document.querySelector('[data-board-sections]');window.__step4AutoMut=0;window.__step4AutoMO=new MutationObserver(()=>window.__step4AutoMut++);window.__step4AutoMO.observe(h,{childList:true,subtree:true});return true})()`);
 await sleep(33000);
 const auto=await ev(`(()=>{window.__step4AutoMO?.disconnect();const rows=[...document.querySelectorAll('.match-row')];return {mut:window.__step4AutoMut||0,rows:rows.length,style:!!document.querySelector('style[data-step4-card-prototype]'),overflow:rows.some(x=>x.scrollWidth>x.clientWidth+1)}})()`);
 if(auto.mut<1||!auto.style||auto.overflow)throw Error('AUTO_REFRESH_BAD:'+JSON.stringify(auto));
 await shot('/tmp/b46-step4-output/screens/after-30s-auto-refresh.png');

 const result={before,after,statusResults,search,expanded:{before:expBefore,after:expAfter},rich,signal,auto};
 fs.writeFileSync('/tmp/b46-step4-output/step4-results.json',JSON.stringify(result,null,2));
 console.log('STEP4_BROWSER_PASS',JSON.stringify(result));
 ws.close(); process.exit(0);
})().catch(e=>{console.error(e);try{ws.close()}catch{}process.exit(1)});
NODE
node "$OUT/step4-cdp.js"
kill "$CPID" 2>/dev/null || true
trap - EXIT

nonce="${GITHUB_RUN_ID:-manual}-$(date +%s%N)"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/board?step4-post=$nonce" -o "$OUT/board-after.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/signals?step4-post=$nonce" -o "$OUT/signals-after.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/statistics?step4-post=$nonce" -o "$OUT/stats-after.json"
node - <<'NODE'
const fs=require('fs');const b=JSON.parse(fs.readFileSync('/tmp/b46-step4-output/board-after.json')),s=JSON.parse(fs.readFileSync('/tmp/b46-step4-output/signals-after.json')),t=JSON.parse(fs.readFileSync('/tmp/b46-step4-output/stats-after.json'));
if(b?.ok!==true||!Array.isArray(b?.fixtures))throw Error('POST_BOARD_BAD');if(!Array.isArray(s?.signals))throw Error('POST_SIGNALS_BAD');if(t?.ok!==true||!Array.isArray(t?.rows))throw Error('POST_STATS_BAD');console.log('STEP4_POST_FLOW_OK',{fixtures:b.fixtures.length,signals:s.signals.length,stats:t.rows.length});
NODE

for rel in "${FILES[@]}"; do
  code=$(curl -sS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' -o "$OUT/post/$rel" -w '%{http_code}' "$WWW/$rel?step4-post=${GITHUB_RUN_ID:-manual}-${RANDOM}")
  [ "$code" = 200 ] || { echo "POST_PROD_FETCH_FAILED:$code:$rel"; exit 1; }
  [ "$(sha256sum "$OUT/post/$rel" | awk '{print $1}')" = "$(sha256sum "$OUT/pre/$rel" | awk '{print $1}')" ] || { echo "PRODUCTION_CHANGED_DURING_STEP4:$rel"; exit 1; }
done
echo STEP4_PRODUCTION_UNCHANGED_PASS
echo BALL46_CARD_STEP4_BEHAVIOR_VERIFIED
