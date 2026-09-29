#!/usr/bin/env bash
set -euo pipefail

R=/tmp/b46fix4
SNAP=/tmp/b46snapshot
SCRIPT_NAME=ball46-production
DIRECT='https://ball46-production.mccarey-supon.workers.dev'
EXPECT_VERSION='d54d0bae-0bd7-4a36-beed-052aa69a3a5e'
EXPECT_RUNTIME_SHA='0c2cd4b167f23e581acd69946a4b56740832d5c0f9388d6aa007c25d9ff31980'
rm -rf "$R"
mkdir -p "$R/base" "$R/candidate" "$R/live" "$R/runtime" "$R/verify"

SRC=$(find "$SNAP" -type d -name candidate | while read -r d; do
  if [ "$(find "$d" -type f | wc -l | tr -d ' ')" = 83 ] && [ -s "$d/index.html" ]; then echo "$d"; fi
done | head -1)
[ -n "$SRC" ] || { echo V4_SNAPSHOT_83_NOT_FOUND; exit 1; }
cp -a "$SRC/." "$R/base/"
[ "$(find "$R/base" -type f | wc -l | tr -d ' ')" = 83 ] || { echo V4_BASE_NOT_83; exit 1; }

AUTH="Authorization: Bearer $CLOUDFLARE_API_TOKEN"
curl -fsS "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/$SCRIPT_NAME/deployments?per_page=5" -H "$AUTH" -o "$R/verify/deployments.json"
curl -fsS "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/workers/$SCRIPT_NAME/versions/$EXPECT_VERSION?include=modules" -H "$AUTH" -o "$R/verify/version.json"
node - <<'NODE'
const fs=require('fs'),crypto=require('crypto');
const R='/tmp/b46fix4';
const d=JSON.parse(fs.readFileSync(R+'/verify/deployments.json','utf8'));
const x=d.result?.deployments?.[0],vs=x?.versions||[];
if(d.success!==true||vs.length!==1||Number(vs[0].percentage)!==100)throw Error('V4_MIXED_PRODUCTION');
if(vs[0].version_id!=='d54d0bae-0bd7-4a36-beed-052aa69a3a5e')throw Error('V4_PRODUCTION_MOVED:'+vs[0].version_id);
const v=JSON.parse(fs.readFileSync(R+'/verify/version.json','utf8')).result;
const m=(v.modules||[]).find(z=>z.name===v.main_module&&z.content_base64);if(!m)throw Error('V4_MAIN_MISSING');
const b=Buffer.from(m.content_base64,'base64'),sha=crypto.createHash('sha256').update(b).digest('hex');
if(sha!=='0c2cd4b167f23e581acd69946a4b56740832d5c0f9388d6aa007c25d9ff31980')throw Error('V4_RUNTIME_MOVED:'+sha);
if(!b.toString('utf8').includes('__B46_FOOTER_LEGAL_20260929__'))throw Error('V4_FOOTER_WRAPPER_MISSING');
const got=(v.bindings||[]).map(z=>[z.name,z.type,z.service||null,z.environment||null]).sort();
const want=[['ASSETS','assets',null,null],['ENGINE','service','nomadtips3-engine-343','production'],['FULL_MARKET','service','nomadtips3-full-market-343-ball46','production'],['HUB','service','nomadtips3-5usd-hub-343','production']].sort();
if(JSON.stringify(got)!==JSON.stringify(want))throw Error('V4_BINDINGS_MOVED:'+JSON.stringify(got));
fs.writeFileSync(R+'/runtime/index.js',b);
console.log('V4_PRODUCTION_LOCK_PASS',JSON.stringify({deployment:x.id,version:vs[0].version_id,runtime_sha256:sha,created_on:x.created_on}));
NODE

find "$R/base" -type f -printf '%P\n' | LC_ALL=C sort > "$R/verify/paths.txt"
[ "$(wc -l < "$R/verify/paths.txt" | tr -d ' ')" = 83 ] || exit 1
nonce="${GITHUB_RUN_ID:-manual}-v4-$(date +%s%N)"
while IFS= read -r rel; do
  mkdir -p "$R/live/$(dirname "$rel")"
  code=$(curl -sS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' -o "$R/live/$rel" -w '%{http_code}' "$DIRECT/$rel?v4=$nonce-$RANDOM") || true
  [ "$code" = 200 ] || { echo "V4_FETCH_FAIL:$rel:$code"; exit 1; }
done < "$R/verify/paths.txt"
node - <<'NODE'
const fs=require('fs');const R='/tmp/b46fix4';
const rt=fs.readFileSync(R+'/runtime/index.js','utf8');const m=rt.match(/const __B46_FOOTER_HTML__=(.*?);\nconst __B46_FOOTER_CSS__/s);if(!m)throw Error('V4_FOOTER_CONST');
const foot=JSON.parse(m[1]),link='<link rel="stylesheet" href="/ball46-footer.css?v=20260929">',html=new Set(['index.html','signal.html','statistics.html']);
const ps=fs.readFileSync(R+'/verify/paths.txt','utf8').trim().split('\n'),bad=[];
for(const p of ps){let a=fs.readFileSync(R+'/base/'+p),b=fs.readFileSync(R+'/live/'+p);if(html.has(p))b=Buffer.from(b.toString('utf8').replace(link,'').replace(foot,''));if(!a.equals(b))bad.push(p)}
console.log('V4_RACE_83_MISMATCH',bad);if(bad.length)throw Error('V4_ASSETS_MOVED:'+bad.join(','));
console.log('V4_RACE_83_PASS');
NODE

cp -a "$R/base/." "$R/candidate/"
python3 - <<'PY'
from pathlib import Path
import re,hashlib
R=Path('/tmp/b46fix4');B=R/'base';C=R/'candidate'
p=C/'index.html';s=p.read_text();a='<section class="workspace-stage">'
assert s.count(a)==1,('stage_anchor',s.count(a)); assert 'data-workspace-scorebar-slot' not in s
s=s.replace(a,a+'<section class="workspace-scorebar-slot" data-workspace-scorebar-slot></section>',1)
pat=r'workspace-route-guard-343\.js(?:\?[^"\']*)?';hits=re.findall(pat,s);assert len(hits)==1,('guard_ref',hits)
s=re.sub(pat,'workspace-route-guard-343.js?v=343-refresh-state-20260929a',s,count=1);p.write_text(s)
p=C/'workspace-route-guard-343.js';g=p.read_text();marker='function cleanLiveRoute(){'
assert g.count(marker)==1 and 'BALL46_REFRESH_ROUTE_GUARD_20260929' not in g
g=g.replace(marker,"/* BALL46_REFRESH_ROUTE_GUARD_20260929 */\nfunction hasExplicitNonLiveRoute(){const v=new URLSearchParams(location.search).get('view');return v==='statistics'||v==='signal'}\n"+marker,1)
g,n=re.subn(r"if\s*\(\s*navType\(\)\s*===\s*'reload'\s*&&\s*last\s*===\s*'live'\s*\)\s*cleanLiveRoute\(\)\s*;","if(navType()==='reload'&&last==='live'&&!hasExplicitNonLiveRoute())cleanLiveRoute();",g,count=1);assert n==1,('reload_patch',n)
g,n=re.subn(r"if\s*\(\s*view\s*===\s*'live'\s*\)\s*cleanLiveRoute\(\)\s*;","if(view==='live'&&!hasExplicitNonLiveRoute())cleanLiveRoute();",g,count=1);assert n==1,('view_patch',n)
p.write_text(g)
def h(x):return hashlib.sha256(x.read_bytes()).hexdigest()
ch=[str(x.relative_to(B)) for x in sorted(B.rglob('*')) if x.is_file() and h(x)!=h(C/x.relative_to(B))]
ex=[str(x.relative_to(C)) for x in C.rglob('*') if x.is_file() and not (B/x.relative_to(C)).exists()]
print('V4_CHANGED_ASSETS',ch,'EXTRA',ex)
assert ch==['index.html','workspace-route-guard-343.js'] and not ex
(R/'verify/changed-assets.txt').write_text('\n'.join(ch)+'\n')
PY
node --check "$R/candidate/workspace-route-guard-343.js"

cat > "$R/server.js" <<'NODE'
const http=require('http'),fs=require('fs'),path=require('path'),base='/tmp/b46fix4/candidate';
const ct={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.json':'application/json'};
http.createServer(async(q,s)=>{try{const u=new URL(q.url,'http://127.0.0.1');if(u.pathname.startsWith('/api/')){await new Promise(r=>setTimeout(r,700));const x=await fetch('https://ball46.com'+u.pathname+u.search,{headers:{'cache-control':'no-cache'}});s.writeHead(x.status,{'content-type':x.headers.get('content-type')||'application/json','cache-control':'no-store'});s.end(Buffer.from(await x.arrayBuffer()));return}const rel=decodeURIComponent(u.pathname.slice(1))||'index.html',f=path.join(base,rel);if(!f.startsWith(base)||!fs.existsSync(f)||!fs.statSync(f).isFile()){s.writeHead(404);s.end('not found');return}s.writeHead(200,{'content-type':ct[path.extname(f)]||'application/octet-stream','cache-control':'no-store'});s.end(fs.readFileSync(f))}catch(e){s.writeHead(500);s.end(String(e.stack||e))}}).listen(8765,'127.0.0.1');
NODE
node "$R/server.js" > "$R/verify/server.log" 2>&1 & SPID=$!
trap 'kill ${CPID:-0} ${SPID:-0} 2>/dev/null || true' EXIT
for i in $(seq 1 80); do if curl -fsS http://127.0.0.1:8765/index.html >/dev/null 2>&1; then break; fi; sleep .1; done
curl -fsS http://127.0.0.1:8765/index.html >/dev/null
chrome=$(command -v google-chrome || command -v chromium || command -v chromium-browser)
"$chrome" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --window-size=1440,1000 --remote-debugging-port=9777 --user-data-dir="$R/chrome" about:blank > "$R/verify/chrome.log" 2>&1 & CPID=$!
rm -f "$R/pages.json" "$R/pages.tmp"
for i in $(seq 1 120); do
  if curl -fsS http://127.0.0.1:9777/json > "$R/pages.tmp" 2>/dev/null && node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync('$R/pages.tmp','utf8'));if(!Array.isArray(j)||!j.some(x=>x.type==='page'&&x.webSocketDebuggerUrl))process.exit(1)" 2>/dev/null; then
    mv "$R/pages.tmp" "$R/pages.json"; break
  fi
  sleep .1
done
[ -s "$R/pages.json" ] || { echo V4_CDP_NOT_READY; cat "$R/verify/chrome.log"; exit 1; }

cat > "$R/check.js" <<'NODE'
const fs=require('fs');
const pages=JSON.parse(fs.readFileSync('/tmp/b46fix4/pages.json','utf8'));const pg=pages.find(x=>x.type==='page'&&x.webSocketDebuggerUrl);if(!pg)throw Error('V4_NO_PAGE');
const ws=new WebSocket(pg.webSocketDebuggerUrl);let id=0,M=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&M.has(m.id)){const z=M.get(m.id);M.delete(m.id);m.error?z.j(Error(JSON.stringify(m.error))):z.r(m.result)}};
const call=(method,params={})=>new Promise((r,j)=>{const n=++id;M.set(n,{r,j});ws.send(JSON.stringify({id:n,method,params}))});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function ev(x){const z=await call('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});if(z.exceptionDetails)throw Error('V4_EVAL:'+JSON.stringify(z.exceptionDetails));return z.result.value}
async function wait(x,t=30000){const s=Date.now();while(Date.now()-s<t){try{if(await ev(x))return}catch{}await sleep(50)}throw Error('V4_WAIT:'+x)}
const A=(x,m)=>{if(!x)throw Error(m)};
(async()=>{await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});await call('Runtime.enable');await call('Page.enable');
const sampler=`(()=>{window.__b46Samples=[];window.__b46Shifts=[];const tick=()=>{const st=document.querySelector('.workspace-stage'),slot=document.querySelector('[data-workspace-scorebar-slot]');if(st)window.__b46Samples.push({t:performance.now(),slot:!!slot,h:slot?slot.getBoundingClientRect().height:0,view:document.body?.dataset?.workspaceView||'',url:location.href})};setInterval(tick,5);try{new MutationObserver(tick).observe(document.documentElement,{childList:true,subtree:true});new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.__b46Shifts.push(e.value)}).observe({type:'layout-shift',buffered:true})}catch(_){}})()`;
await call('Page.addScriptToEvaluateOnNewDocument',{source:sampler});
async function nav(url,view,delay=1200){await call('Page.navigate',{url});await sleep(80);await wait(`document.body&&document.body.dataset.workspaceView==='${view}'`);await sleep(delay);return ev(`(()=>({url:location.href,view:document.body.dataset.workspaceView,samples:window.__b46Samples||[],slots:document.querySelectorAll('[data-workspace-scorebar-slot]').length,h:document.querySelector('[data-workspace-scorebar-slot]')?.getBoundingClientRect().height||0,total:document.querySelector('[data-stat-market="all"]')?.classList.contains('active')||false,ah:document.querySelector('[data-stat-market="ah"]')?.classList.contains('active')||false,cls:(window.__b46Shifts||[]).reduce((a,b)=>a+b,0)}))()`)}
let x=await nav('http://127.0.0.1:8765/index.html?view=statistics','statistics');
A(x.total&&new URL(x.url).searchParams.get('view')==='statistics','V4_TOTAL_INITIAL:'+JSON.stringify(x));A(x.slots===1&&x.h>0,'V4_TOTAL_SHELL_INITIAL');A(x.samples.some(s=>s.slot)&&x.samples.every(s=>s.slot),'V4_STAGE_WITHOUT_SHELL_INITIAL:'+JSON.stringify(x.samples.slice(0,40)));
let old=await ev('performance.timeOrigin');await call('Page.reload',{ignoreCache:true});await sleep(100);await wait(`performance.timeOrigin!==${old}`);await wait(`document.body&&document.body.dataset.workspaceView==='statistics'`);await sleep(1200);
let y=await ev(`(()=>({url:location.href,view:document.body.dataset.workspaceView,samples:window.__b46Samples||[],slots:document.querySelectorAll('[data-workspace-scorebar-slot]').length,h:document.querySelector('[data-workspace-scorebar-slot]')?.getBoundingClientRect().height||0,total:document.querySelector('[data-stat-market="all"]')?.classList.contains('active')||false,cls:(window.__b46Shifts||[]).reduce((a,b)=>a+b,0)}))()`);
A(y.total&&new URL(y.url).searchParams.get('view')==='statistics','V4_TOTAL_RELOAD:'+JSON.stringify(y));A(y.slots===1&&Math.abs(y.h-x.h)<=1,'V4_TOTAL_GEOMETRY:'+JSON.stringify({before:x.h,after:y.h}));A(y.samples.some(s=>s.slot)&&y.samples.every(s=>s.slot),'V4_STAGE_WITHOUT_SHELL_RELOAD:'+JSON.stringify(y.samples.slice(0,40)));
let ah=await nav('http://127.0.0.1:8765/index.html?view=statistics&market=ah','statistics',500);A(ah.ah&&new URL(ah.url).searchParams.get('market')==='ah','V4_AH_INITIAL:'+JSON.stringify(ah));old=await ev('performance.timeOrigin');await call('Page.reload',{ignoreCache:true});await sleep(100);await wait(`performance.timeOrigin!==${old}`);await wait(`document.body&&document.body.dataset.workspaceView==='statistics'`);await sleep(500);ah=await ev(`(()=>({url:location.href,a:document.querySelector('[data-stat-market="ah"]')?.classList.contains('active')}))()`);A(ah.a&&new URL(ah.url).searchParams.get('market')==='ah','V4_AH_RELOAD:'+JSON.stringify(ah));
let sig=await nav('http://127.0.0.1:8765/index.html?view=signal','signal',300);old=await ev('performance.timeOrigin');await call('Page.reload',{ignoreCache:true});await sleep(100);await wait(`performance.timeOrigin!==${old}`);await wait(`document.body&&document.body.dataset.workspaceView==='signal'`);let sig2=await ev(`(()=>({url:location.href,v:document.body.dataset.workspaceView}))()`);A(sig2.v==='signal'&&new URL(sig2.url).searchParams.get('view')==='signal','V4_SIGNAL_RELOAD:'+JSON.stringify(sig2));
console.log('V4_BROWSER_PASS',JSON.stringify({total:{url:x.url,h:x.h,cls:x.cls,samples:x.samples.length},totalReload:{url:y.url,h:y.h,cls:y.cls,samples:y.samples.length},ah,sig:sig2}));ws.close();process.exit(0)})().catch(e=>{console.error('V4_BROWSER_FAIL',e);try{ws.close()}catch{}process.exit(1)});
NODE
node "$R/check.js"
kill $CPID $SPID 2>/dev/null || true
trap - EXIT

cat > "$R/runtime/wrangler.jsonc" <<EOF
{"name":"ball46-production","main":"./index.js","compatibility_date":"2026-09-09","no_bundle":true,"services":[{"binding":"ENGINE","service":"nomadtips3-engine-343","environment":"production"},{"binding":"FULL_MARKET","service":"nomadtips3-full-market-343-ball46","environment":"production"},{"binding":"HUB","service":"nomadtips3-5usd-hub-343","environment":"production"}],"assets":{"directory":"$R/candidate","binding":"ASSETS","html_handling":"none","not_found_handling":"none","run_worker_first":true},"triggers":{"crons":["* * * * *"]}}
EOF
cd "$R/runtime"
npx --yes wrangler@4.92.0 deploy --dry-run --config wrangler.jsonc 2>&1 | tee "$R/verify/dry-run.log"
grep -Fq 'Read 83 files from the assets directory' "$R/verify/dry-run.log" || { echo V4_DRY_NOT_83; exit 1; }
! grep -Fq 'Attaching additional modules:' "$R/verify/dry-run.log" || { echo V4_DRY_EXTRA_MODULES; exit 1; }
echo V4_PREDEPLOY_PASS
