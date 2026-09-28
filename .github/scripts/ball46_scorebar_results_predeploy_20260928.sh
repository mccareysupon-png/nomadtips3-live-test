#!/usr/bin/env bash
set -euo pipefail
WORKER='ball46-production'
DIRECT='https://ball46-production.mccarey-supon.workers.dev'
WWW='https://www.ball46.com'
EXPECTED_VERSION='35a2bad7-c5ca-4163-85ef-6a37b18bffbd'
EXPECTED_RUNTIME_SHA='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed'
ROOT='/tmp/b46-scorebar-result-predeploy'
BASE="$ROOT/base"; CAND="$ROOT/candidate"; VERIFY="$ROOT/verify"; RUNTIME="$ROOT/runtime"
rm -rf "$ROOT"; mkdir -p "$BASE" "$CAND" "$VERIFY" "$RUNTIME"
cat > "$ROOT/paths.txt" <<'EOF'
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
EOF
[ "$(wc -l < "$ROOT/paths.txt" | tr -d ' ')" = '79' ] || { echo PATH_LIST_NOT_79; exit 1; }
python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
root=pathlib.Path('/tmp/b46-scorebar-result-predeploy');a=os.environ['CLOUDFLARE_ACCOUNT_ID'];t=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {t}','Accept':'application/json'};api=f'https://api.cloudflare.com/client/v4/accounts/{a}';s='ball46-production'
def get(u):
  with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as x:return json.load(x)
d=get(f'{api}/workers/scripts/{s}/deployments')['result']['deployments'][0];vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100: raise SystemExit('MIXED_DEPLOYMENT')
vid=vs[0]['version_id']
if vid!='35a2bad7-c5ca-4163-85ef-6a37b18bffbd': raise SystemExit('PRODUCTION_VERSION_MOVED:'+vid)
v=get(f'{api}/workers/workers/{s}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or []
if len(mods)!=1 or mods[0].get('name')!='index.js' or not mods[0].get('content_base64'): raise SystemExit('MODULE_SHAPE_BAD')
runtime=base64.b64decode(mods[0]['content_base64']);sha=hashlib.sha256(runtime).hexdigest()
if sha!='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed': raise SystemExit('RUNTIME_SHA_MOVED:'+sha)
expect=[('ASSETS','assets',None,None),('ENGINE','service','nomadtips3-engine-343','production'),('FULL_MARKET','service','nomadtips3-full-market-343-ball46','production'),('HUB','service','nomadtips3-5usd-hub-343','production')]
got=sorted((b.get('name'),b.get('type'),b.get('service'),b.get('environment')) for b in (v.get('bindings') or []))
if got!=sorted(expect): raise SystemExit('BINDINGS_CHANGED:'+repr(got))
sched=get(f'{api}/workers/scripts/{s}/schedules')['result'];ss=sched.get('schedules',[]) if isinstance(sched,dict) else (sched or []);crons=[x.get('cron') for x in ss if isinstance(x,dict) and x.get('cron')]
if crons!=['* * * * *']: raise SystemExit('CRON_CHANGED:'+repr(crons))
(root/'runtime/index.js').write_bytes(runtime);(root/'production-version.txt').write_text(vid)
print('PRODUCTION_LOCK_PASS',vid,sha)
PY
nonce="${GITHUB_RUN_ID:-manual}-base-$(date +%s%N)"
while IFS= read -r rel; do
  mkdir -p "$BASE/$(dirname "$rel")"
  code=$(curl -sS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' -o "$BASE/$rel" -w '%{http_code}' "$DIRECT/$rel?scorebarresult=$nonce-${RANDOM}") || true
  [ "$code" = 200 ] || { echo "BASE_FETCH_FAILED:$code:$rel"; exit 1; }
done < "$ROOT/paths.txt"
[ "$(find "$BASE" -type f | wc -l | tr -d ' ')" = '79' ] || { echo BASE_NOT_79; exit 1; }
grep -Fq 'BALL46_SCOREBAR_6X4_20260928' "$BASE/dashboard-v2-stage3.js" || { echo SCOREBAR_6X4_BASE_MISSING; exit 1; }
! grep -Fq 'BALL46_SCOREBAR_RESULT_DETAIL_20260928' "$BASE/dashboard-v2-stage3.js" || { echo RESULT_DETAIL_ALREADY_PRESENT; exit 1; }
! grep -Fq 'BALL46_SCOREBAR_RESULT_VISUALS_20260928' "$BASE/singlepage-workspace-343.css" || { echo RESULT_VISUALS_ALREADY_PRESENT; exit 1; }
grep -Fq 'singlepage-workspace-343.css?v=343-geometry-frame-20260922a' "$BASE/index.html" || { echo BASE_WORKSPACE_CSS_REF_MOVED; exit 1; }
grep -Fq 'dashboard-v2-stage3.js?v=343-horizontal-card-20260928a' "$BASE/index.html" || { echo BASE_STAGE3_JS_REF_MOVED; exit 1; }
echo BASE_79_LOCK_PASS
cp -a "$BASE/." "$CAND/"
python3 - <<'PY'
from pathlib import Path
root=Path('/tmp/b46-scorebar-result-predeploy');js=root/'candidate/dashboard-v2-stage3.js';s=js.read_text()
start=s.index('/* BALL46_WORKSPACE_SCOREBAR_20260926 — UI only, zero extra requests */')
end=s.index("document.addEventListener('ball46:stable-chrome-ready',renderWorkspaceScorebar);",start)+len("document.addEventListener('ball46:stable-chrome-ready',renderWorkspaceScorebar);")
new=r'''/* BALL46_WORKSPACE_SCOREBAR_20260926 — UI only, zero extra requests */
/* BALL46_SCOREBAR_RESULT_DETAIL_20260928 — 6 recent results with per-team WIN/LOSS/DRAW + 4 near-FT live; board data only */
function renderWorkspaceScorebar(){
  const slot=document.querySelector('[data-workspace-scorebar-slot]');
  if(!slot)return;
  const kickoffMs=function(f){return dateMs(f?.kickoffAt??f?.kickoffUtc)??0};
  const recent=fixtures.filter(function(f){return classify(f)==='finished'}).slice().sort(function(a,b){return kickoffMs(b)-kickoffMs(a)||String(fixtureKey(b)).localeCompare(String(fixtureKey(a)))}).slice(0,6);
  const nearFt=fixtures.filter(function(f){return classify(f)==='live'}).slice().sort(function(a,b){return (num(b?.minute)??-1)-(num(a?.minute)??-1)||kickoffMs(b)-kickoffMs(a)||String(fixtureKey(b)).localeCompare(String(fixtureKey(a)))}).slice(0,4);
  const outcomePair=function(f){const p=scorePair(f),h=num(p.home),a=num(p.away);if(h===null||a===null)return {home:'draw',away:'draw'};if(h===a)return {home:'draw',away:'draw'};return h>a?{home:'win',away:'loss'}:{home:'loss',away:'win'}};
  const teamRow=function(name,result){const label=String(result||'draw').toUpperCase();return '<span class="workspace-scorebar-team outcome-'+esc(result)+'"><span class="workspace-scorebar-name">'+esc(name||'—')+'</span><em>'+esc(label)+'</em></span>'};
  const makeResultCell=function(f){const id=fixtureKey(f),p=scorePair(f),score=(p.home===null||p.away===null)?'—':(show(p.home)+'–'+show(p.away)),outcome=outcomePair(f),league=String(f?.league?.name||'RESULT').trim()||'RESULT';return '<button type="button" class="workspace-scorebar-cell workspace-scorebar-result" data-workspace-score-id="'+esc(id)+'" title="'+esc(league)+'"><span class="workspace-scorebar-meta"><i>FT · '+esc(league)+'</i><b>'+esc(score)+'</b></span>'+teamRow(f?.home?.name,outcome.home)+teamRow(f?.away?.name,outcome.away)+'</button>'};
  const makeLiveCell=function(f){const id=fixtureKey(f),p=scorePair(f),score=(p.home===null||p.away===null)?'—':(show(p.home)+'–'+show(p.away)),minute=num(f?.minute),clock=minute===null?detailedStatus(f):('LIVE · '+Math.max(0,Math.round(minute))+"'");return '<button type="button" class="workspace-scorebar-cell workspace-scorebar-live" data-workspace-score-id="'+esc(id)+'"><span class="workspace-scorebar-meta"><i>'+esc(clock)+'</i><b>'+esc(score)+'</b></span><span class="workspace-scorebar-team live"><span class="workspace-scorebar-name">'+esc(f?.home?.name||'—')+'</span></span><span class="workspace-scorebar-team live"><span class="workspace-scorebar-name">'+esc(f?.away?.name||'—')+'</span></span></button>'};
  const resultCells=recent.map(makeResultCell),liveCells=nearFt.map(makeLiveCell);
  while(resultCells.length<6)resultCells.push('<div class="workspace-scorebar-cell placeholder"><span>'+(resultCells.length===0?'No recent results':'—')+'</span><span class="away">—</span></div>');
  while(liveCells.length<4)liveCells.push('<div class="workspace-scorebar-cell placeholder"><span>'+(liveCells.length===0?'No late live matches':'—')+'</span><span class="away">—</span></div>');
  slot.innerHTML='<div class="workspace-scorebar-grid">'+resultCells.concat(liveCells).join('')+'</div>';
  /* BALL46_SCOREBAR_READONLY_20260926 — visual/data unchanged; click disabled only */slot.querySelectorAll('[data-workspace-score-id]').forEach(function(btn){btn.onclick=null});
}
document.addEventListener('ball46:stable-chrome-ready',renderWorkspaceScorebar);'''
js.write_text(s[:start]+new+s[end:])
css=root/'candidate/singlepage-workspace-343.css';c=css.read_text();c+=r'''

/* BALL46_SCOREBAR_RESULT_VISUALS_20260928 */
.workspace-scorebar-cell.workspace-scorebar-result,.workspace-scorebar-cell.workspace-scorebar-live{padding:5px 6px;background:#101722}
.workspace-scorebar-cell .workspace-scorebar-team{display:flex!important;align-items:center;justify-content:space-between;gap:4px;min-width:0;height:16px;margin-top:2px;padding:1px 4px;border-radius:5px;overflow:hidden;color:#fff!important;background-repeat:no-repeat;background-size:cover;background-position:center}
.workspace-scorebar-cell .workspace-scorebar-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:7.2px;font-weight:900;line-height:1.2;text-shadow:0 1px 1px rgba(0,0,0,.35)}
.workspace-scorebar-cell .workspace-scorebar-team em{flex:0 0 auto;min-width:26px;padding:1px 3px;border-radius:999px;font-size:5.4px;font-style:normal;font-weight:950;line-height:1.25;text-align:center;letter-spacing:.28px;color:#fff;box-shadow:0 0 0 1px rgba(255,255,255,.14) inset}
.workspace-scorebar-cell .workspace-scorebar-team.outcome-win{background-color:#103A24;background-image:linear-gradient(90deg,rgba(16,58,36,.98),rgba(22,101,52,.78)),url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 24'%3E%3Cg fill='none' stroke='%23ffffff' stroke-opacity='.10' stroke-width='.8'%3E%3Crect x='1' y='1' width='118' height='22' rx='2'/%3E%3Cpath d='M60 1v22M48 7h24v10H48z'/%3E%3Ccircle cx='60' cy='12' r='4'/%3E%3C/g%3E%3C/svg%3E")}
.workspace-scorebar-cell .workspace-scorebar-team.outcome-win em{background:#16A34A}
.workspace-scorebar-cell .workspace-scorebar-team.outcome-loss{background-color:#3B1212;background-image:linear-gradient(90deg,rgba(59,18,18,.98),rgba(127,29,29,.78)),url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 24'%3E%3Cg fill='none' stroke='%23ffffff' stroke-opacity='.10' stroke-width='.8'%3E%3Crect x='1' y='1' width='118' height='22' rx='2'/%3E%3Cpath d='M60 1v22M48 7h24v10H48z'/%3E%3Ccircle cx='60' cy='12' r='4'/%3E%3C/g%3E%3C/svg%3E")}
.workspace-scorebar-cell .workspace-scorebar-team.outcome-loss em{background:#DC2626}
.workspace-scorebar-cell .workspace-scorebar-team.outcome-draw{background-color:#2F343C;background-image:linear-gradient(90deg,rgba(47,52,60,.98),rgba(75,85,99,.82)),url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 24'%3E%3Cg fill='none' stroke='%23ffffff' stroke-opacity='.10' stroke-width='.8'%3E%3Crect x='1' y='1' width='118' height='22' rx='2'/%3E%3Cpath d='M60 1v22M48 7h24v10H48z'/%3E%3Ccircle cx='60' cy='12' r='4'/%3E%3C/g%3E%3C/svg%3E")}
.workspace-scorebar-cell .workspace-scorebar-team.outcome-draw em{background:#6B7280}
.workspace-scorebar-cell.workspace-scorebar-live{background-color:#132A46;background-image:linear-gradient(135deg,rgba(19,42,70,.98),rgba(14,165,233,.16)),url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 58'%3E%3Cg fill='none' stroke='%2338BDF8' stroke-opacity='.16' stroke-width='.9'%3E%3Crect x='2' y='2' width='116' height='54' rx='3'/%3E%3Cpath d='M60 2v54M44 18h32v22H44z'/%3E%3Ccircle cx='60' cy='29' r='8'/%3E%3C/g%3E%3C/svg%3E")}
.workspace-scorebar-cell.workspace-scorebar-live .workspace-scorebar-meta i{color:#7DD3FC}.workspace-scorebar-cell.workspace-scorebar-live .workspace-scorebar-meta b{color:#E0F2FE}
.workspace-scorebar-cell.workspace-scorebar-live .workspace-scorebar-team.live{background:rgba(19,42,70,.62);box-shadow:0 0 0 1px rgba(56,189,248,.18) inset}
.workspace-scorebar-cell.workspace-scorebar-result .workspace-scorebar-meta{margin-bottom:1px}.workspace-scorebar-cell.workspace-scorebar-result .workspace-scorebar-meta i{max-width:72%;color:#CBD5E1}.workspace-scorebar-cell.workspace-scorebar-result .workspace-scorebar-meta b{color:#F8FAFC;font-size:9.5px}
''';css.write_text(c)
idx=root/'candidate/index.html';i=idx.read_text();oldcss='singlepage-workspace-343.css?v=343-geometry-frame-20260922a';newcss='singlepage-workspace-343.css?v=343-scorebar-result-20260928a';oldjs='dashboard-v2-stage3.js?v=343-horizontal-card-20260928a';newjs='dashboard-v2-stage3.js?v=343-scorebar-result-20260928a'
if i.count(oldcss)!=1 or i.count(oldjs)!=1: raise SystemExit('CACHE_BASE_REF_COUNT_BAD')
idx.write_text(i.replace(oldcss,newcss,1).replace(oldjs,newjs,1))
print('PATCH_BUILT')
PY
node --check "$CAND/dashboard-v2-stage3.js"
python3 - <<'PY'
from pathlib import Path
import hashlib
root=Path('/tmp/b46-scorebar-result-predeploy');paths=[x.strip() for x in (root/'paths.txt').read_text().splitlines() if x.strip()];changed=[]
for rel in paths:
 a=root/'base'/rel;b=root/'candidate'/rel
 if hashlib.sha256(a.read_bytes()).digest()!=hashlib.sha256(b.read_bytes()).digest():changed.append(rel)
print('CHANGED_ASSETS',changed)
if sorted(changed)!=['dashboard-v2-stage3.js','index.html','singlepage-workspace-343.css']: raise SystemExit('THREE_FILE_DIFF_GATE_BAD:'+repr(changed))
js=(root/'candidate/dashboard-v2-stage3.js').read_text();css=(root/'candidate/singlepage-workspace-343.css').read_text();idx=(root/'candidate/index.html').read_text()
for m in ['BALL46_SCOREBAR_RESULT_DETAIL_20260928','outcome-win','outcome-loss','outcome-draw','workspace-scorebar-live']:
 if m not in js and m not in css: raise SystemExit('MISSING_MARKER:'+m)
for ref in ['singlepage-workspace-343.css?v=343-scorebar-result-20260928a','dashboard-v2-stage3.js?v=343-scorebar-result-20260928a']:
 if ref not in idx: raise SystemExit('CACHE_BUSTER_MISSING:'+ref)
print('THREE_FILE_DIFF_GATE_PASS')
PY
nonce="${GITHUB_RUN_ID:-manual}-api-$(date +%s%N)"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/board?scorebarresult=$nonce" -o "$VERIFY/board.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/signals?scorebarresult=$nonce" -o "$VERIFY/signals.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/statistics?scorebarresult=$nonce" -o "$VERIFY/statistics.json"
node - <<'NODE'
const fs=require('fs'),b=JSON.parse(fs.readFileSync('/tmp/b46-scorebar-result-predeploy/verify/board.json')),s=JSON.parse(fs.readFileSync('/tmp/b46-scorebar-result-predeploy/verify/signals.json')),t=JSON.parse(fs.readFileSync('/tmp/b46-scorebar-result-predeploy/verify/statistics.json'));if(b?.ok!==true||!Array.isArray(b.fixtures)||!Array.isArray(s.signals)||t?.ok!==true||!Array.isArray(t.rows))throw Error('API_HEALTH_BAD');console.log('API_HEALTH_PASS',{fixtures:b.fixtures.length,signals:s.signals.length,stats:t.rows.length});
NODE
cat > "$VERIFY/server.py" <<'PY'
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse
import os
ROOT=Path('/tmp/b46-scorebar-result-predeploy/candidate');V=Path('/tmp/b46-scorebar-result-predeploy/verify')
MAP={'/api/engine/board':V/'board.json','/api/engine/signals':V/'signals.json','/api/engine/statistics':V/'statistics.json'}
class H(SimpleHTTPRequestHandler):
 def translate_path(self,path):
  p=urlparse(path).path
  if p=='/':p='/index.html'
  return str(ROOT/p.lstrip('/'))
 def do_GET(self):
  p=urlparse(self.path).path
  if p in MAP:
   d=MAP[p].read_bytes();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(d);return
  return super().do_GET()
 def log_message(self,*a):pass
os.chdir(ROOT);ThreadingHTTPServer(('127.0.0.1',8765),H).serve_forever()
PY
python3 "$VERIFY/server.py" >"$VERIFY/server.log" 2>&1 & SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true; kill ${CHROME_PID:-0} 2>/dev/null || true' EXIT
sleep 1
chrome=$(command -v google-chrome || command -v chromium || command -v chromium-browser)
rm -rf "$VERIFY/chrome"; mkdir -p "$VERIFY/chrome"
"$chrome" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --remote-debugging-port=9333 --user-data-dir="$VERIFY/chrome" --window-size=1440,900 http://127.0.0.1:8765/ >"$VERIFY/chrome.log" 2>&1 & CHROME_PID=$!
for i in $(seq 1 60); do curl -fsS http://127.0.0.1:9333/json > "$VERIFY/pages.json" 2>/dev/null && break; sleep .25; done
cat > "$VERIFY/check.js" <<'NODE'
const fs=require('fs'),pages=JSON.parse(fs.readFileSync('/tmp/b46-scorebar-result-predeploy/verify/pages.json')),p=pages.find(x=>x.type==='page');if(!p)throw Error('NO_PAGE');const ws=new WebSocket(p.webSocketDebuggerUrl);let id=0,q=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&q.has(m.id)){const x=q.get(m.id);q.delete(m.id);m.error?x.j(Error(JSON.stringify(m.error))):x.r(m.result)}};const call=(method,params={})=>new Promise((r,j)=>{const n=++id;q.set(n,{r,j});ws.send(JSON.stringify({id:n,method,params}))}),sleep=ms=>new Promise(r=>setTimeout(r,ms));async function ev(x){const z=await call('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});if(z.exceptionDetails)throw Error(JSON.stringify(z.exceptionDetails));return z.result.value}async function wait(x,t=30000){const s=Date.now();while(Date.now()-s<t){try{if(await ev(x))return}catch{}await sleep(250)}throw Error('WAIT:'+x)};(async()=>{await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});await call('Runtime.enable');await call('Page.enable');await wait(`document.readyState==='complete'`);await wait(`document.querySelectorAll('[data-workspace-scorebar-slot] .workspace-scorebar-grid > *').length===10`);await wait(`document.querySelectorAll('.match-row[data-match-id]').length>0`);await sleep(900);const out=await ev(`(()=>{const grid=document.querySelector('[data-workspace-scorebar-slot] .workspace-scorebar-grid'),cells=[...grid.children],first=cells.slice(0,6),last=cells.slice(6),parseScore=x=>{const s=x.querySelector('.workspace-scorebar-meta b')?.textContent||'';const m=s.match(/(\\d+)\\D+(\\d+)/);return m?[+m[1],+m[2]]:null},results=first.map(x=>({score:parseScore(x),rows:[...x.querySelectorAll('.workspace-scorebar-team')].map(r=>({label:r.querySelector('em')?.textContent.trim()||'',cls:r.className,bg:getComputedStyle(r).backgroundColor,img:getComputedStyle(r).backgroundImage}))})),live=last.map(x=>({placeholder:x.classList.contains('placeholder'),live:x.classList.contains('workspace-scorebar-live'),status:x.querySelector('.workspace-scorebar-meta i')?.textContent.trim()||''})),slot=document.querySelector('[data-workspace-scorebar-slot]'),css=[...document.querySelectorAll('link[rel=stylesheet]')].find(x=>(x.getAttribute('href')||'').includes('singlepage-workspace-343.css'))?.getAttribute('href')||'',js=[...document.scripts].find(x=>(x.getAttribute('src')||'').includes('dashboard-v2-stage3.js'))?.getAttribute('src')||'';return {count:cells.length,results,live,overflow:grid.scrollWidth>grid.clientWidth+1,slotDisplay:getComputedStyle(slot).display,odds:!!window.NOMAD343_ODDS,favicon:!!document.querySelector('link[data-ball46-favicon="20260928"]'),css,js}})()`);if(out.count!==10||out.overflow||!out.odds||!out.favicon)throw Error('BASIC_BAD:'+JSON.stringify(out));if(!out.css.includes('343-scorebar-result-20260928a')||!out.js.includes('343-scorebar-result-20260928a'))throw Error('BUSTER_BAD');for(const r of out.results){if(!r.score||r.rows.length!==2)throw Error('RESULT_SHAPE_BAD:'+JSON.stringify(r));const [h,a]=r.score,expect=h===a?['DRAW','DRAW']:h>a?['WIN','LOSS']:['LOSS','WIN'];if(r.rows[0].label!==expect[0]||r.rows[1].label!==expect[1])throw Error('RESULT_LABEL_BAD:'+JSON.stringify({r,expect}));for(const row of r.rows){if(!row.img.includes('svg+xml'))throw Error('BACKGROUND_IMAGE_MISSING:'+JSON.stringify(row));if(row.label==='WIN'&&!row.cls.includes('outcome-win'))throw Error('WIN_CLASS_BAD');if(row.label==='LOSS'&&!row.cls.includes('outcome-loss'))throw Error('LOSS_CLASS_BAD');if(row.label==='DRAW'&&!row.cls.includes('outcome-draw'))throw Error('DRAW_CLASS_BAD')}}for(const x of out.live){if(!x.placeholder&&!x.live)throw Error('LIVE_CLASS_BAD:'+JSON.stringify(x))}await call('Emulation.setDeviceMetricsOverride',{width:390,height:850,deviceScaleFactor:1,mobile:false});await call('Page.reload',{ignoreCache:true});await wait(`document.readyState==='complete'`);await sleep(700);const mobile=await ev(`(()=>{const s=document.querySelector('[data-workspace-scorebar-slot]');return {display:getComputedStyle(s).display,matchOverflow:[...document.querySelectorAll('.match-row[data-match-id]')].some(x=>x.scrollWidth>x.clientWidth+1)}})()`);if(mobile.display!=='none'||mobile.matchOverflow)throw Error('MOBILE_BAD:'+JSON.stringify(mobile));console.log('SCOREBAR_RESULT_BROWSER_PASS',JSON.stringify({desktop:out,mobile}));fs.writeFileSync('/tmp/b46-scorebar-result-predeploy/verify/browser.json',JSON.stringify({desktop:out,mobile},null,2));ws.close();process.exit(0)})().catch(e=>{console.error(e);try{ws.close()}catch{}process.exit(1)});
NODE
node "$VERIFY/check.js"
cat > "$RUNTIME/wrangler.jsonc" <<EOF
{"name":"ball46-production","main":"./index.js","compatibility_date":"2026-09-09","no_bundle":true,"services":[{"binding":"ENGINE","service":"nomadtips3-engine-343","environment":"production"},{"binding":"FULL_MARKET","service":"nomadtips3-full-market-343-ball46","environment":"production"},{"binding":"HUB","service":"nomadtips3-5usd-hub-343","environment":"production"}],"assets":{"directory":"$CAND","binding":"ASSETS","html_handling":"none","not_found_handling":"none","run_worker_first":true},"triggers":{"crons":["* * * * *"]}}
EOF
cd "$RUNTIME"
npx --yes wrangler@4.92.0 deploy --dry-run --config wrangler.jsonc 2>&1 | tee "$VERIFY/dry-run.log"
grep -Fq 'Read 79 files from the assets directory' "$VERIFY/dry-run.log" || { echo DRY_NOT_79; exit 1; }
! grep -Fq 'Attaching additional modules:' "$VERIFY/dry-run.log" || { echo DRY_EXTRA_MODULES; exit 1; }
echo SCOREBAR_RESULT_PREDEPLOY_SUCCESS_NO_DEPLOY
