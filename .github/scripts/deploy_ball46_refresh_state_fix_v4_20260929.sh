#!/usr/bin/env bash
set -euo pipefail

R=/tmp/b46release
ART=/tmp/b46artifact
SCRIPT_NAME=ball46-production
DIRECT='https://ball46-production.mccarey-supon.workers.dev'
WWW='https://ball46.com'
PRE_VERSION='d54d0bae-0bd7-4a36-beed-052aa69a3a5e'
RUNTIME_SHA='0c2cd4b167f23e581acd69946a4b56740832d5c0f9388d6aa007c25d9ff31980'
rm -rf "$R"; mkdir -p "$R/live" "$R/post" "$R/runtime" "$R/verify"

BASE="$ART/base"
CAND="$ART/candidate"
[ -s "$BASE/index.html" ] && [ -s "$CAND/index.html" ] || { echo RELEASE_ARTIFACT_SHAPE_BAD; find "$ART" -maxdepth 2 -type f | head; exit 1; }
[ "$(find "$BASE" -type f | wc -l | tr -d ' ')" = 83 ] || { echo RELEASE_BASE_NOT_83; exit 1; }
[ "$(find "$CAND" -type f | wc -l | tr -d ' ')" = 83 ] || { echo RELEASE_CAND_NOT_83; exit 1; }
cp "$ART/runtime/index.js" "$R/runtime/index.js"
[ "$(sha256sum "$R/runtime/index.js" | awk '{print $1}')" = "$RUNTIME_SHA" ] || { echo RELEASE_ARTIFACT_RUNTIME_BAD; exit 1; }

echo '=== RELEASE: exact candidate diff ==='
python3 - <<'PY'
from pathlib import Path
import hashlib
B=Path('/tmp/b46artifact/base');C=Path('/tmp/b46artifact/candidate')
def h(p):return hashlib.sha256(p.read_bytes()).hexdigest()
ch=[str(x.relative_to(B)) for x in sorted(B.rglob('*')) if x.is_file() and h(x)!=h(C/x.relative_to(B))]
ex=[str(x.relative_to(C)) for x in C.rglob('*') if x.is_file() and not (B/x.relative_to(C)).exists()]
print('RELEASE_CHANGED_ASSETS',ch,'EXTRA',ex)
if ch!=['index.html','workspace-route-guard-343.js'] or ex:raise SystemExit('RELEASE_DIFF_GATE_BAD')
i=(C/'index.html').read_text();g=(C/'workspace-route-guard-343.js').read_text()
if i.count('data-workspace-scorebar-slot')!=1:raise SystemExit('RELEASE_STATIC_SCOREBAR_SLOT_BAD')
if 'workspace-route-guard-343.js?v=343-refresh-state-20260929a' not in i:raise SystemExit('RELEASE_CACHEBUSTER_MISSING')
for m in ['BALL46_REFRESH_ROUTE_GUARD_20260929','hasExplicitNonLiveRoute','view===\'statistics\'','view===\'signal\'']:
    if m not in g:raise SystemExit('RELEASE_GUARD_MARKER_MISSING:'+m)
if 'fetch(' in g or '/api/' in g:raise SystemExit('RELEASE_GUARD_NETWORK_CODE_FORBIDDEN')
print('RELEASE_TWO_ASSET_MARKERS_PASS')
PY
node --check "$CAND/workspace-route-guard-343.js"

AUTH="Authorization: Bearer $CLOUDFLARE_API_TOKEN"
lock_current(){
  local tag="$1"
  curl -fsS "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/$SCRIPT_NAME/deployments?per_page=5" -H "$AUTH" -o "$R/verify/deployments-$tag.json"
  curl -fsS "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/workers/$SCRIPT_NAME/versions/$PRE_VERSION?include=modules" -H "$AUTH" -o "$R/verify/version-$tag.json"
  TAG="$tag" node - <<'NODE'
const fs=require('fs'),crypto=require('crypto'),R='/tmp/b46release',tag=process.env.TAG;
const d=JSON.parse(fs.readFileSync(`${R}/verify/deployments-${tag}.json`)),x=d.result?.deployments?.[0],vs=x?.versions||[];
if(d.success!==true||vs.length!==1||Number(vs[0].percentage)!==100)throw Error(tag+'_MIXED_PRODUCTION');
if(vs[0].version_id!=='d54d0bae-0bd7-4a36-beed-052aa69a3a5e')throw Error(tag+'_PRODUCTION_MOVED:'+vs[0].version_id);
const v=JSON.parse(fs.readFileSync(`${R}/verify/version-${tag}.json`)).result,m=(v.modules||[]).find(z=>z.name===v.main_module&&z.content_base64);if(!m)throw Error(tag+'_MAIN_MISSING');
const b=Buffer.from(m.content_base64,'base64'),sha=crypto.createHash('sha256').update(b).digest('hex');if(sha!=='0c2cd4b167f23e581acd69946a4b56740832d5c0f9388d6aa007c25d9ff31980')throw Error(tag+'_RUNTIME_MOVED:'+sha);
if(!b.toString('utf8').includes('__B46_FOOTER_LEGAL_20260929__'))throw Error(tag+'_FOOTER_WRAPPER_MISSING');
const got=(v.bindings||[]).map(z=>[z.name,z.type,z.service||null,z.environment||null]).sort(),want=[['ASSETS','assets',null,null],['ENGINE','service','nomadtips3-engine-343','production'],['FULL_MARKET','service','nomadtips3-full-market-343-ball46','production'],['HUB','service','nomadtips3-5usd-hub-343','production']].sort();if(JSON.stringify(got)!==JSON.stringify(want))throw Error(tag+'_BINDINGS_MOVED:'+JSON.stringify(got));
console.log(tag+'_PRODUCTION_LOCK_PASS',JSON.stringify({deployment:x.id,version:vs[0].version_id,runtime_sha256:sha,created_on:x.created_on}));
NODE
}
lock_current PRE

find "$BASE" -type f -printf '%P\n' | LC_ALL=C sort > "$R/verify/paths.txt"
nonce="${GITHUB_RUN_ID:-manual}-release-race-$(date +%s%N)"
while IFS= read -r rel; do
  mkdir -p "$R/live/$(dirname "$rel")"
  code=$(curl -sS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' -o "$R/live/$rel" -w '%{http_code}' "$DIRECT/$rel?release=$nonce-$RANDOM") || true
  [ "$code" = 200 ] || { echo "RELEASE_RACE_FETCH_FAIL:$rel:$code"; exit 1; }
done < "$R/verify/paths.txt"
node - <<'NODE'
const fs=require('fs'),R='/tmp/b46release',rt=fs.readFileSync(R+'/runtime/index.js','utf8'),m=rt.match(/const __B46_FOOTER_HTML__=(.*?);\nconst __B46_FOOTER_CSS__/s);if(!m)throw Error('RELEASE_FOOTER_CONST');
const foot=JSON.parse(m[1]),link='<link rel="stylesheet" href="/ball46-footer.css?v=20260929">',hs=new Set(['index.html','signal.html','statistics.html']),ps=fs.readFileSync(R+'/verify/paths.txt','utf8').trim().split('\n'),bad=[];
for(const p of ps){let a=fs.readFileSync('/tmp/b46artifact/base/'+p),b=fs.readFileSync(R+'/live/'+p);if(hs.has(p))b=Buffer.from(b.toString('utf8').replace(link,'').replace(foot,''));if(!a.equals(b))bad.push(p)}
console.log('RELEASE_FINAL_RACE_83_MISMATCH',bad);if(bad.length)throw Error('RELEASE_ASSETS_MOVED:'+bad.join(','));console.log('RELEASE_FINAL_RACE_83_PASS');
NODE

for ep in board signals statistics; do curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/$ep?pre_release=$nonce" -o "$R/verify/$ep-before.json"; done
node - <<'NODE'
const fs=require('fs'),R='/tmp/b46release/verify';const b=JSON.parse(fs.readFileSync(R+'/board-before.json')),s=JSON.parse(fs.readFileSync(R+'/signals-before.json')),t=JSON.parse(fs.readFileSync(R+'/statistics-before.json'));
if(b?.ok!==true||!Array.isArray(b.fixtures))throw Error('PRE_BOARD_BAD');if(!Array.isArray(s.signals))throw Error('PRE_SIGNALS_BAD');if(t?.ok!==true||!Array.isArray(t.rows))throw Error('PRE_STATISTICS_BAD');console.log('RELEASE_PRE_API_PASS',{fixtures:b.fixtures.length,signals:s.signals.length,statistics:t.rows.length});
NODE

cat > "$R/runtime/wrangler.jsonc" <<EOF
{"name":"ball46-production","main":"./index.js","compatibility_date":"2026-09-09","no_bundle":true,"services":[{"binding":"ENGINE","service":"nomadtips3-engine-343","environment":"production"},{"binding":"FULL_MARKET","service":"nomadtips3-full-market-343-ball46","environment":"production"},{"binding":"HUB","service":"nomadtips3-5usd-hub-343","environment":"production"}],"assets":{"directory":"$CAND","binding":"ASSETS","html_handling":"none","not_found_handling":"none","run_worker_first":true},"triggers":{"crons":["* * * * *"]}}
EOF
cd "$R/runtime"
npx --yes wrangler@4.92.0 deploy --dry-run --config wrangler.jsonc 2>&1 | tee "$R/verify/dry-run.log"
grep -Fq 'Read 83 files from the assets directory' "$R/verify/dry-run.log" || { echo RELEASE_DRY_NOT_83; exit 1; }
! grep -Fq 'Attaching additional modules:' "$R/verify/dry-run.log" || { echo RELEASE_DRY_EXTRA_MODULES; exit 1; }

# Last race lock, immediately before the only Production mutation.
lock_current FINAL

DEPLOYED=0
rollback_previous(){
  if [ "$DEPLOYED" = 1 ]; then
    echo 'RELEASE_POSTCHECK_FAILED_ROLLING_BACK'
    set +e
    npx --yes wrangler@4.92.0 rollback "$PRE_VERSION" --name "$SCRIPT_NAME" --message 'Automatic rollback: Ball46 refresh-state post-deploy verification failed' 2>&1 | tee "$R/verify/rollback.log"
    rb=$?
    set -e
    [ "$rb" = 0 ] || echo RELEASE_ROLLBACK_COMMAND_FAILED
  fi
}
on_exit(){ rc=$?; if [ "$rc" -ne 0 ]; then rollback_previous; fi; exit "$rc"; }
trap on_exit EXIT

npx --yes wrangler@4.92.0 deploy --config wrangler.jsonc 2>&1 | tee "$R/verify/deploy.log"
DEPLOYED=1
grep -Fq 'Found 2 new or modified static assets to upload' "$R/verify/deploy.log" || { echo RELEASE_DEPLOY_NOT_EXACT_TWO; exit 1; }
grep -Fq '+ /index.html' "$R/verify/deploy.log" || { echo RELEASE_DEPLOY_INDEX_MISSING; exit 1; }
grep -Fq '+ /workspace-route-guard-343.js' "$R/verify/deploy.log" || { echo RELEASE_DEPLOY_GUARD_MISSING; exit 1; }
[ "$(grep -c '^+ /' "$R/verify/deploy.log" || true)" = 2 ] || { echo RELEASE_DEPLOY_MORE_THAN_TWO; exit 1; }
! grep -Fq 'Attaching additional modules:' "$R/verify/deploy.log" || { echo RELEASE_DEPLOY_EXTRA_MODULES; exit 1; }
echo RELEASE_DEPLOY_EXACT_TWO_PASS

# Verify new active version retained exact current Footer runtime/bindings/cron.
curl -fsS "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/$SCRIPT_NAME/deployments?per_page=5" -H "$AUTH" -o "$R/verify/deployments-post.json"
POST_VERSION=$(node - <<'NODE'
const fs=require('fs'),j=JSON.parse(fs.readFileSync('/tmp/b46release/verify/deployments-post.json')),d=j.result?.deployments?.[0],v=d?.versions||[];if(j.success!==true||v.length!==1||Number(v[0].percentage)!==100)throw Error('POST_MIXED');if(v[0].version_id==='d54d0bae-0bd7-4a36-beed-052aa69a3a5e')throw Error('POST_VERSION_DID_NOT_CHANGE');console.log(v[0].version_id);
NODE
)
curl -fsS "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/workers/$SCRIPT_NAME/versions/$POST_VERSION?include=modules" -H "$AUTH" -o "$R/verify/version-post.json"
curl -fsS "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/$SCRIPT_NAME/schedules" -H "$AUTH" -o "$R/verify/schedules-post.json"
POST_VERSION="$POST_VERSION" node - <<'NODE'
const fs=require('fs'),crypto=require('crypto'),R='/tmp/b46release/verify';const v=JSON.parse(fs.readFileSync(R+'/version-post.json')).result,m=(v.modules||[]).find(z=>z.name===v.main_module&&z.content_base64);if(!m)throw Error('POST_MAIN');const b=Buffer.from(m.content_base64,'base64'),sha=crypto.createHash('sha256').update(b).digest('hex');if(sha!=='0c2cd4b167f23e581acd69946a4b56740832d5c0f9388d6aa007c25d9ff31980')throw Error('POST_RUNTIME_CHANGED:'+sha);if(!b.toString().includes('__B46_FOOTER_LEGAL_20260929__'))throw Error('POST_FOOTER_MISSING');const got=(v.bindings||[]).map(z=>[z.name,z.type,z.service||null,z.environment||null]).sort(),want=[['ASSETS','assets',null,null],['ENGINE','service','nomadtips3-engine-343','production'],['FULL_MARKET','service','nomadtips3-full-market-343-ball46','production'],['HUB','service','nomadtips3-5usd-hub-343','production']].sort();if(JSON.stringify(got)!==JSON.stringify(want))throw Error('POST_BINDINGS_CHANGED');const sj=JSON.parse(fs.readFileSync(R+'/schedules-post.json')),arr=Array.isArray(sj.result)?sj.result:(sj.result?.schedules||[]),crons=arr.map(x=>x.cron).filter(Boolean);if(JSON.stringify(crons)!==JSON.stringify(['* * * * *']))throw Error('POST_CRON_CHANGED:'+JSON.stringify(crons));console.log('RELEASE_POST_RUNTIME_PASS',JSON.stringify({version:process.env.POST_VERSION,sha,crons}));
NODE

# Every public static asset must equal candidate after normalizing Footer injection.
nonce="${GITHUB_RUN_ID:-manual}-post-$(date +%s%N)"
while IFS= read -r rel; do
  mkdir -p "$R/post/$(dirname "$rel")"
  code=$(curl -sS -L --retry 5 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' -o "$R/post/$rel" -w '%{http_code}' "$DIRECT/$rel?post=$nonce-$RANDOM") || true
  [ "$code" = 200 ] || { echo "RELEASE_POST_FETCH_FAIL:$rel:$code"; exit 1; }
done < "$R/verify/paths.txt"
node - <<'NODE'
const fs=require('fs'),R='/tmp/b46release',rt=fs.readFileSync(R+'/runtime/index.js','utf8'),m=rt.match(/const __B46_FOOTER_HTML__=(.*?);\nconst __B46_FOOTER_CSS__/s);if(!m)throw Error('POST_FOOTER_CONST');const foot=JSON.parse(m[1]),link='<link rel="stylesheet" href="/ball46-footer.css?v=20260929">',hs=new Set(['index.html','signal.html','statistics.html']),ps=fs.readFileSync(R+'/verify/paths.txt','utf8').trim().split('\n'),bad=[];for(const p of ps){let a=fs.readFileSync('/tmp/b46artifact/candidate/'+p),b=fs.readFileSync(R+'/post/'+p);if(hs.has(p))b=Buffer.from(b.toString('utf8').replace(link,'').replace(foot,''));if(!a.equals(b))bad.push(p)}console.log('RELEASE_POST_83_MISMATCH',bad);if(bad.length)throw Error('POST_ASSET_MISMATCH:'+bad.join(','));console.log('RELEASE_POST_83_PASS');
NODE

grep -Fq '/ball46-footer.css?v=20260929' "$R/post/index.html" || { echo RELEASE_PUBLIC_FOOTER_CSS_MISSING; exit 1; }
grep -Fq 'data-workspace-scorebar-slot' "$R/post/index.html" || { echo RELEASE_PUBLIC_STATIC_SHELL_MISSING; exit 1; }
grep -Fq 'BALL46_REFRESH_ROUTE_GUARD_20260929' "$R/post/workspace-route-guard-343.js" || { echo RELEASE_PUBLIC_GUARD_PATCH_MISSING; exit 1; }

for ep in board signals statistics; do curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/$ep?post_release=$nonce" -o "$R/verify/$ep-after.json"; done
node - <<'NODE'
const fs=require('fs'),R='/tmp/b46release/verify';const b=JSON.parse(fs.readFileSync(R+'/board-after.json')),s=JSON.parse(fs.readFileSync(R+'/signals-after.json')),t=JSON.parse(fs.readFileSync(R+'/statistics-after.json'));if(b?.ok!==true||!Array.isArray(b.fixtures))throw Error('POST_BOARD_BAD');if(!Array.isArray(s.signals))throw Error('POST_SIGNALS_BAD');if(t?.ok!==true||!Array.isArray(t.rows))throw Error('POST_STATISTICS_BAD');console.log('RELEASE_POST_API_PASS',{fixtures:b.fixtures.length,signals:s.signals.length,statistics:t.rows.length});
NODE

# Public browser proof: click Total, reload, then AH and Signal; sampler proves shell exists whenever workspace-stage exists.
chrome=$(command -v google-chrome || command -v chromium || command -v chromium-browser)
"$chrome" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --window-size=1440,1000 --remote-debugging-port=9888 --user-data-dir="$R/chrome-post" about:blank > "$R/verify/chrome-post.log" 2>&1 & CPID=$!
rm -f "$R/pages.json" "$R/pages.tmp"
for i in $(seq 1 120); do
  if curl -fsS http://127.0.0.1:9888/json > "$R/pages.tmp" 2>/dev/null && node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync('$R/pages.tmp','utf8'));if(!Array.isArray(j)||!j.some(x=>x.type==='page'&&x.webSocketDebuggerUrl))process.exit(1)" 2>/dev/null; then mv "$R/pages.tmp" "$R/pages.json"; break; fi
  sleep .1
done
[ -s "$R/pages.json" ] || { echo RELEASE_POST_CDP_NOT_READY; exit 1; }
cat > "$R/verify-public.js" <<'NODE'
const fs=require('fs'),pg=JSON.parse(fs.readFileSync('/tmp/b46release/pages.json')).find(x=>x.type==='page'&&x.webSocketDebuggerUrl);if(!pg)throw Error('NO_PAGE');const ws=new WebSocket(pg.webSocketDebuggerUrl);let id=0,M=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&M.has(m.id)){const z=M.get(m.id);M.delete(m.id);m.error?z.j(Error(JSON.stringify(m.error))):z.r(m.result)}};const call=(m,p={})=>new Promise((r,j)=>{const n=++id;M.set(n,{r,j});ws.send(JSON.stringify({id:n,method:m,params:p}))}),sl=x=>new Promise(r=>setTimeout(r,x));async function ev(x){const z=await call('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});if(z.exceptionDetails)throw Error('EVAL');return z.result.value}async function wait(x,t=30000){const s=Date.now();while(Date.now()-s<t){try{if(await ev(x))return}catch{}await sl(50)}throw Error('WAIT:'+x)}const A=(x,m)=>{if(!x)throw Error(m)};(async()=>{await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});await call('Runtime.enable');await call('Page.enable');const sampler=`(()=>{window.__b46Samples=[];const tick=()=>{const st=document.querySelector('.workspace-stage'),slot=document.querySelector('[data-workspace-scorebar-slot]');if(st)window.__b46Samples.push({t:performance.now(),slot:!!slot,h:slot?slot.getBoundingClientRect().height:0,view:document.body?.dataset?.workspaceView||'',url:location.href})};setInterval(tick,5);try{new MutationObserver(tick).observe(document.documentElement,{childList:true,subtree:true})}catch(_){}})()`;await call('Page.addScriptToEvaluateOnNewDocument',{source:sampler});const base='https://ball46.com/index.html?verify_refresh='+Date.now();await call('Page.navigate',{url:base});await wait(`document.querySelector('[data-stat-market="all"]')&&document.querySelector('[data-workspace-scorebar-slot]')`);await sl(900);await ev(`document.querySelector('[data-stat-market="all"]').click();true`);await wait(`document.body.dataset.workspaceView==='statistics'`);await sl(500);let before=await ev(`(()=>({url:location.href,v:document.body.dataset.workspaceView,total:document.querySelector('[data-stat-market="all"]')?.classList.contains('active'),slots:document.querySelectorAll('[data-workspace-scorebar-slot]').length,h:document.querySelector('[data-workspace-scorebar-slot]')?.getBoundingClientRect().height||0,samples:window.__b46Samples||[]}))()`);A(before.v==='statistics'&&before.total&&new URL(before.url).searchParams.get('view')==='statistics','PUBLIC_TOTAL_BEFORE:'+JSON.stringify(before));A(before.slots===1&&before.samples.filter(x=>x.url.includes('view=statistics')).every(x=>x.slot),'PUBLIC_SHELL_BEFORE');let old=await ev('performance.timeOrigin');await call('Page.reload',{ignoreCache:true});await sl(100);await wait(`performance.timeOrigin!==${old}`);await wait(`document.body&&document.body.dataset.workspaceView==='statistics'`);await sl(800);let after=await ev(`(()=>({url:location.href,v:document.body.dataset.workspaceView,total:document.querySelector('[data-stat-market="all"]')?.classList.contains('active'),slots:document.querySelectorAll('[data-workspace-scorebar-slot]').length,h:document.querySelector('[data-workspace-scorebar-slot]')?.getBoundingClientRect().height||0,samples:window.__b46Samples||[]}))()`);A(after.v==='statistics'&&after.total&&new URL(after.url).searchParams.get('view')==='statistics','PUBLIC_TOTAL_AFTER:'+JSON.stringify(after));A(after.slots===1&&Math.abs(after.h-before.h)<=1&&after.samples.every(x=>x.slot),'PUBLIC_SHELL_AFTER:'+JSON.stringify({bh:before.h,ah:after.h,s:after.samples.slice(0,20)}));await ev(`document.querySelector('[data-stat-market="ah"]').click();true`);await wait(`new URL(location.href).searchParams.get('market')==='ah'`);old=await ev('performance.timeOrigin');await call('Page.reload',{ignoreCache:true});await sl(100);await wait(`performance.timeOrigin!==${old}`);await wait(`document.body&&document.body.dataset.workspaceView==='statistics'`);let ah=await ev(`(()=>({url:location.href,a:document.querySelector('[data-stat-market="ah"]')?.classList.contains('active')}))()`);A(ah.a&&new URL(ah.url).searchParams.get('market')==='ah','PUBLIC_AH_AFTER:'+JSON.stringify(ah));await ev(`document.querySelector('[data-workspace-view="signal"]').click();true`);await wait(`document.body.dataset.workspaceView==='signal'`);old=await ev('performance.timeOrigin');await call('Page.reload',{ignoreCache:true});await sl(100);await wait(`performance.timeOrigin!==${old}`);await wait(`document.body&&document.body.dataset.workspaceView==='signal'`);let sig=await ev(`(()=>({url:location.href,v:document.body.dataset.workspaceView}))()`);A(sig.v==='signal'&&new URL(sig.url).searchParams.get('view')==='signal','PUBLIC_SIGNAL_AFTER:'+JSON.stringify(sig));console.log('RELEASE_PUBLIC_BROWSER_PASS',JSON.stringify({before:{url:before.url,h:before.h},after:{url:after.url,h:after.h},ah,sig}));ws.close();process.exit(0)})().catch(e=>{console.error('RELEASE_PUBLIC_BROWSER_FAIL',e);try{ws.close()}catch{}process.exit(1)});
NODE
node "$R/verify-public.js"
kill $CPID 2>/dev/null || true

trap - EXIT
DEPLOYED=0
echo RELEASE_SUCCESS
