#!/usr/bin/env bash
set -euo pipefail
DIRECT='https://ball46-production.mccarey-supon.workers.dev'
WWW='https://www.ball46.com'
ROOT='/tmp/b46-mobile-clock-dedupe'
BASE="$ROOT/base"
CAND="$ROOT/candidate"
VERIFY="$ROOT/verify"
RUNTIME="$ROOT/runtime"
rm -rf "$ROOT"
mkdir -p "$BASE" "$CAND" "$VERIFY" "$RUNTIME"

cat > "$ROOT/paths.txt" <<'PATHS'
5usd-control.html
api-monitor.html
app.css
ball46-logo.svg
ball46-next.css
brand-clean-header-343.css
bulk-odds-compat-343.js
color-semantics-343.css
color-semantics-343.js
content-rails-343.css
dashboard-v2-stage3.js
dashboard-v2-tune.css
dashboard-v2-tune.js
dashboard-v2.css
detection-test.html
event-flow-bars-343.css
event-flow-bars-343.js
expanded-match-343.css
expanded-match-343.js
football-language-343.js
full-market-bookmaker-343.css
full-market-bookmaker-343.js
index.html
language-ar-343.js
language-es-343.js
language-fr-343.js
language-id-343.js
language-menu-343.js
language-pt-br-343.js
language-vintage-343.png
league-flags-343.js
live-prediction-343.js
live-summary-full-odds-343.js
longterm-performance-343.css
longterm-performance-343.js
market-registry-343.js
mobile-menu-classic-343.css
mobile-menu-classic-343.js
odds-format-343.js
odds-vintage-343.png
promo-live-343.svg
promo-signal-343.svg
promo-stat-343.svg
rich-odds-on-demand-343.js
robots.txt
settings.css
settings.html
settings.js
signal-bettor-343.css
signal-compact-343.css
signal-event-flow-line-343.css
signal-event-flow-line-343.js
signal-focus-343.js
signal-next.html
signal-next.js
signal-shared-view-343.css
signal-v2-clean-343.css
signal.html
signal.js
singlepage-workspace-343.css
singlepage-workspace-343.js
sitemap.xml
statistics-next.html
statistics-next.js
statistics-page-343.css
statistics-v2-clean-343.css
statistics.html
statistics.js
team-kits-343.js
team-sides-343.css
team-sides-343.js
theme-341-343.css
theme-light-343.css
ui-sync-fixes-343-v2.js
ui-sync-fixes-343.css
v2-header.css
v2-shared.css
v2-shared.js
workspace-route-guard-343.js
PATHS
[ "$(wc -l < "$ROOT/paths.txt" | tr -d ' ')" = "79" ] || { echo PATH_LIST_NOT_79; exit 1; }

python3 - <<'PY'
import base64,hashlib,json,os,urllib.request,pathlib
A=os.environ['CLOUDFLARE_ACCOUNT_ID']; T=os.environ['CLOUDFLARE_API_TOKEN']
h={'Authorization':f'Bearer {T}','Accept':'application/json'}
api=f'https://api.cloudflare.com/client/v4/accounts/{A}'; s='ball46-production'
def get(u):
    with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r: return json.load(r)
d=get(f'{api}/workers/scripts/{s}/deployments')['result']['deployments'][0]
vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100: raise SystemExit('MIXED_DEPLOYMENT')
vid=vs[0]['version_id']
v=get(f'{api}/workers/workers/{s}/versions/{vid}?include=modules')['result']
mods=v.get('modules') or []
if len(mods)!=1 or mods[0].get('name')!='index.js': raise SystemExit('RUNTIME_MODULE_BAD')
raw=base64.b64decode(mods[0]['content_base64']); sha=hashlib.sha256(raw).hexdigest()
expect=sorted([
 ('ASSETS','assets',None,None),
 ('ENGINE','service','nomadtips3-engine-343','production'),
 ('FULL_MARKET','service','nomadtips3-full-market-343-ball46','production'),
 ('HUB','service','nomadtips3-5usd-hub-343','production')])
got=sorted((b.get('name'),b.get('type'),b.get('service'),b.get('environment')) for b in (v.get('bindings') or []))
if got!=expect: raise SystemExit('BINDINGS_BAD:'+repr(got))
r=pathlib.Path('/tmp/b46-mobile-clock-dedupe')
(r/'locked-version.txt').write_text(vid)
(r/'runtime-sha.txt').write_text(sha)
(r/'runtime'/'index.js').write_bytes(raw)
print('PRODUCTION_RUNTIME_LOCK_PASS',vid,sha)
PY

nonce="${GITHUB_RUN_ID:-manual}-$(date +%s%N)"
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  mkdir -p "$BASE/$(dirname "$rel")"
  code=$(curl -sS -L --retry 4 --retry-all-errors --max-time 30 \
    -H 'Cache-Control: no-cache,no-store' -H 'Pragma: no-cache' \
    -o "$BASE/$rel" -w '%{http_code}' "$DIRECT/$rel?mobileclockpre=$nonce-$RANDOM") || true
  [ "$code" = 200 ] || { echo "BASE_FETCH_FAIL:$rel:$code"; exit 1; }
done < "$ROOT/paths.txt"
[ "$(find "$BASE" -type f | wc -l | tr -d ' ')" = "79" ] || { echo BASE_NOT_79; exit 1; }
cp -a "$BASE/." "$CAND/"

python3 - <<'PY'
from pathlib import Path
import re,hashlib
r=Path('/tmp/b46-mobile-clock-dedupe'); js=r/'candidate'/'dashboard-v2-tune.js'; idx=r/'candidate'/'index.html'
s=js.read_text()
old="const status=row.querySelector('.teams-cell small')?.textContent?.trim()||clock;"
new="const status=row.querySelector('.teams-cell small')?.textContent?.trim()||'';"
if s.count(old)!=1: raise SystemExit('TARGET_LINE_COUNT_'+str(s.count(old)))
if new in s: raise SystemExit('TARGET_ALREADY_PATCHED')
js.write_text(s.replace(old,new,1))
h=idx.read_text()
pat=r'dashboard-v2-tune\.js\?v=[^"&< ]+'
m=re.findall(pat,h)
if len(m)!=1: raise SystemExit('CACHE_REF_COUNT_'+str(len(m)))
newref='dashboard-v2-tune.js?v=343-dashboard-v2-ui-tune-v5-mobile-clock-dedupe-20260928a'
idx.write_text(re.sub(pat,newref,h,count=1))
paths=[x for x in (r/'paths.txt').read_text().splitlines() if x]
chg=[]
for p in paths:
    a=r/'base'/p; b=r/'candidate'/p
    if hashlib.sha256(a.read_bytes()).digest()!=hashlib.sha256(b.read_bytes()).digest(): chg.append(p)
want=['dashboard-v2-tune.js','index.html']
if sorted(chg)!=want: raise SystemExit('DIFF_GATE_BAD:'+repr(chg))
print('EXACT_TWO_FILE_DIFF_PASS',chg)
print('BASE_JS_SHA',hashlib.sha256((r/'base'/'dashboard-v2-tune.js').read_bytes()).hexdigest())
print('CAND_JS_SHA',hashlib.sha256(js.read_bytes()).hexdigest())
print('BASE_INDEX_SHA',hashlib.sha256((r/'base'/'index.html').read_bytes()).hexdigest())
print('CAND_INDEX_SHA',hashlib.sha256(idx.read_bytes()).hexdigest())
PY
node --check "$CAND/dashboard-v2-tune.js"
grep -Fq "const status=row.querySelector('.teams-cell small')?.textContent?.trim()||'';" "$CAND/dashboard-v2-tune.js"
grep -Fq 'dashboard-v2-tune.js?v=343-dashboard-v2-ui-tune-v5-mobile-clock-dedupe-20260928a' "$CAND/index.html"
echo TARGET_PATCH_SYNTAX_PASS

cat > "$ROOT/base-test.html" <<'HTML'
<!doctype html><html><body>
<div data-board-sections>
<div class="match-row" id="r1"><div class="teams-cell">Alpha<br>Beta</div><div class="score-cell">1-0<small>LIVE · 67'</small></div><div class="signal-cell">AH HOME</div></div>
<div class="match-row" id="r2"><div class="teams-cell">Gamma<br>Delta<small>2H</small></div><div class="score-cell">0-0<small>LIVE · 52'</small></div><div class="signal-cell">UNDER</div></div>
</div>
<script src="/base/dashboard-v2-tune.js"></script>
<script>setTimeout(()=>{const a=document.querySelector('#r1 .mobile-clock')?.textContent||'',b=document.querySelector('#r1 .mobile-signal')?.textContent||'',c=document.querySelector('#r2 .mobile-signal')?.textContent||'';document.documentElement.dataset.result=(a==="LIVE · 67'"&&b==="LIVE · 67'"&&c==="2H")?'PASS':'FAIL';},100);</script>
</body></html>
HTML
cat > "$ROOT/cand-test.html" <<'HTML'
<!doctype html><html><body>
<div data-board-sections>
<div class="match-row" id="r1"><div class="teams-cell">Alpha<br>Beta</div><div class="score-cell">1-0<small>LIVE · 67'</small></div><div class="signal-cell">AH HOME</div></div>
<div class="match-row" id="r2"><div class="teams-cell">Gamma<br>Delta<small>2H</small></div><div class="score-cell">0-0<small>LIVE · 52'</small></div><div class="signal-cell">UNDER</div></div>
</div>
<script src="/candidate/dashboard-v2-tune.js"></script>
<script>setTimeout(()=>{const a=document.querySelector('#r1 .mobile-clock')?.textContent||'',b=document.querySelector('#r1 .mobile-signal')?.textContent||'',c=document.querySelector('#r2 .mobile-signal')?.textContent||'';document.documentElement.dataset.result=(a==="LIVE · 67'"&&b===""&&c==="2H")?'PASS':'FAIL';},100);</script>
</body></html>
HTML
(cd "$ROOT" && python3 -m http.server 8776 --bind 127.0.0.1 >"$VERIFY/unit-server.log" 2>&1 &) 
SPID=$!
trap 'kill $SPID 2>/dev/null || true' EXIT
sleep .5
chrome=$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)
[ -n "$chrome" ] || { echo CHROME_MISSING; exit 1; }
"$chrome" --headless=new --no-sandbox --disable-gpu --dump-dom --virtual-time-budget=1200 http://127.0.0.1:8776/base-test.html > "$VERIFY/base-dom.html"
grep -Fq 'data-result="PASS"' "$VERIFY/base-dom.html" || { echo BASE_ROOT_CAUSE_NOT_REPRODUCED; exit 1; }
"$chrome" --headless=new --no-sandbox --disable-gpu --dump-dom --virtual-time-budget=1200 http://127.0.0.1:8776/cand-test.html > "$VERIFY/cand-dom.html"
grep -Fq 'data-result="PASS"' "$VERIFY/cand-dom.html" || { echo CAND_DEDUPE_TEST_FAIL; exit 1; }
kill $SPID 2>/dev/null || true
trap - EXIT
echo DETERMINISTIC_MOBILE_CLOCK_TEST_PASS

for ep in board signals statistics; do
  curl -fsS -L --retry 4 --retry-all-errors --max-time 30 "$WWW/api/engine/$ep?mobileclockpre=$nonce" -o "$VERIFY/$ep.json"
done
python3 - <<'PY'
import json,pathlib
r=pathlib.Path('/tmp/b46-mobile-clock-dedupe/verify')
for n in ['board','signals','statistics']:
    j=json.load(open(r/f'{n}.json'))
    if j.get('ok') is not True: raise SystemExit('API_BAD:'+n)
print('SNAPSHOT_API_PASS')
PY
cat > "$VERIFY/server.py" <<'PY'
import http.server,pathlib,urllib.parse
ROOT=pathlib.Path('/tmp/b46-mobile-clock-dedupe/candidate'); SNAP=pathlib.Path('/tmp/b46-mobile-clock-dedupe/verify')
class H(http.server.SimpleHTTPRequestHandler):
    def translate_path(self,path):
        p=urllib.parse.urlparse(path).path
        return str(ROOT/(p.lstrip('/') or 'index.html'))
    def do_GET(self):
        p=urllib.parse.urlparse(self.path).path
        m={'/api/engine/board':'board.json','/api/engine/signals':'signals.json','/api/engine/statistics':'statistics.json'}
        if p in m:
            data=(SNAP/m[p]).read_bytes(); self.send_response(200); self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data); return
        return super().do_GET()
    def log_message(self,fmt,*args): pass
http.server.ThreadingHTTPServer(('127.0.0.1',8777),H).serve_forever()
PY
python3 "$VERIFY/server.py" >"$VERIFY/server.log" 2>&1 &
SPID=$!
trap 'kill $SPID 2>/dev/null || true' EXIT
"$chrome" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --window-size=390,850 --remote-debugging-port=9886 --user-data-dir="$VERIFY/chrome" http://127.0.0.1:8777/ >"$VERIFY/chrome.log" 2>&1 &
CPID=$!
trap 'kill $CPID 2>/dev/null || true; kill $SPID 2>/dev/null || true' EXIT
for i in $(seq 1 80); do
  curl -fsS http://127.0.0.1:9886/json > "$VERIFY/pages.tmp" 2>/dev/null && \
  python3 -c "import json;x=json.load(open('$VERIFY/pages.tmp'));assert any(p.get('type')=='page' and p.get('webSocketDebuggerUrl') for p in x)" 2>/dev/null && { mv "$VERIFY/pages.tmp" "$VERIFY/pages.json"; break; }
  sleep .5
done
[ -s "$VERIFY/pages.json" ] || { echo CDP_NOT_READY; exit 1; }
cat > "$VERIFY/check.js" <<'NODE'
const fs=require('fs'),pages=JSON.parse(fs.readFileSync('/tmp/b46-mobile-clock-dedupe/verify/pages.json')),p=pages.find(x=>x.type==='page'&&x.webSocketDebuggerUrl);if(!p)throw Error('NO_PAGE');
const ws=new WebSocket(p.webSocketDebuggerUrl);let id=0,q=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&q.has(m.id)){const z=q.get(m.id);q.delete(m.id);m.error?z.j(Error(JSON.stringify(m.error))):z.r(m.result)}};
const call=(method,params={})=>new Promise((r,j)=>{const n=++id;q.set(n,{r,j});ws.send(JSON.stringify({id:n,method,params}))}),sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function ev(x){const z=await call('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});if(z.exceptionDetails)throw Error(JSON.stringify(z.exceptionDetails));return z.result.value}
async function wait(x,t=45000){const s=Date.now();while(Date.now()-s<t){try{if(await ev(x))return}catch{}await sleep(250)}throw Error('WAIT '+x)}
(async()=>{await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});await call('Runtime.enable');await call('Page.enable');await call('Page.bringToFront');await wait(`document.readyState==='complete'`);await sleep(3000);
const m=await ev(`(()=>{const rows=[...document.querySelectorAll('.match-row')];const tuned=rows.map(r=>{const c=r.querySelector('.mobile-clock')?.textContent?.trim()||'',s=r.querySelector('.mobile-signal')?.textContent?.trim()||'';return{clock:c,signal:s,dup:!!c&&c===s}});return{rows:rows.length,tuned:tuned.length,dups:tuned.filter(x=>x.dup),slot:document.querySelector('[data-workspace-scorebar-slot]')?getComputedStyle(document.querySelector('[data-workspace-scorebar-slot]')).display:null,odds:!!window.NOMAD343_ODDS,favicon:!!document.querySelector('link[data-ball46-favicon="20260928"]'),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2,ref:[...document.scripts].map(s=>s.src).find(x=>x.includes('dashboard-v2-tune.js'))||''}})()`);if(m.dups.length)throw Error('MOBILE_CLOCK_DUPLICATES:'+JSON.stringify(m.dups));if(m.slot!==null&&m.slot!=='none')throw Error('MOBILE_SCOREBAR_CHANGED:'+m.slot);if(!m.odds||!m.favicon||m.overflow)throw Error('MOBILE_REGRESSION:'+JSON.stringify(m));if(!m.ref.includes('343-dashboard-v2-ui-tune-v5-mobile-clock-dedupe-20260928a'))throw Error('CACHE_BUSTER_BAD:'+m.ref);
await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});await call('Page.reload',{ignoreCache:true});await wait(`document.readyState==='complete'`);await sleep(2500);
const d=await ev(`(()=>({scorebar:document.querySelectorAll('[data-workspace-scorebar-slot] .workspace-scorebar-grid>div').length,odds:!!window.NOMAD343_ODDS,favicon:!!document.querySelector('link[data-ball46-favicon="20260928"]'),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2}))()`);if(d.scorebar!==10||!d.odds||!d.favicon||d.overflow)throw Error('DESKTOP_REGRESSION:'+JSON.stringify(d));console.log('FULL_CANDIDATE_BROWSER_PASS',JSON.stringify({mobile:m,desktop:d}));ws.close();process.exit(0)})().catch(e=>{console.error(e);process.exit(1)});
NODE
node "$VERIFY/check.js"
kill $CPID 2>/dev/null || true; kill $SPID 2>/dev/null || true
trap - EXIT

cat > "$RUNTIME/wrangler.jsonc" <<EOF
{"name":"ball46-production","main":"./index.js","compatibility_date":"2026-09-09","no_bundle":true,"services":[{"binding":"ENGINE","service":"nomadtips3-engine-343","environment":"production"},{"binding":"FULL_MARKET","service":"nomadtips3-full-market-343-ball46","environment":"production"},{"binding":"HUB","service":"nomadtips3-5usd-hub-343","environment":"production"}],"assets":{"directory":"$CAND","binding":"ASSETS","html_handling":"none","not_found_handling":"none","run_worker_first":true},"triggers":{"crons":["* * * * *"]}}
EOF
(cd "$RUNTIME" && npx --yes wrangler@4.92.0 deploy --dry-run --config wrangler.jsonc 2>&1) | tee "$VERIFY/dry-run.log"
grep -Fq 'Read 79 files from the assets directory' "$VERIFY/dry-run.log" || { echo DRY_NOT_79; exit 1; }
! grep -Fq 'Attaching additional modules:' "$VERIFY/dry-run.log" || { echo DRY_EXTRA_MODULES; exit 1; }
echo DRY_RUN_79_RUNTIME_PASS

python3 - <<'PY'
import json,os,urllib.request,pathlib
A=os.environ['CLOUDFLARE_ACCOUNT_ID'];T=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {T}','Accept':'application/json'}
u=f'https://api.cloudflare.com/client/v4/accounts/{A}/workers/scripts/ball46-production/deployments'
with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as rr:d=json.load(rr)
vs=d['result']['deployments'][0].get('versions') or []
vid=vs[0]['version_id'] if len(vs)==1 and float(vs[0].get('percentage',0))==100 else 'MIXED'
locked=pathlib.Path('/tmp/b46-mobile-clock-dedupe/locked-version.txt').read_text().strip()
if vid!=locked: raise SystemExit('PRODUCTION_MOVED_DURING_PREDEPLOY:'+locked+'->'+vid)
print('FINAL_RACE_READONLY_PASS',vid)
PY

echo BALL46_MOBILE_CLOCK_DEDUPE_PREDEPLOY_GREEN_NO_DEPLOY
