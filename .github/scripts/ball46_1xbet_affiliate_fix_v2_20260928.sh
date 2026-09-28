#!/usr/bin/env bash
set -euo pipefail

DIRECT="https://ball46-production.mccarey-supon.workers.dev"
WWW="https://www.ball46.com"
ROOT="/tmp/b46-1xbet-fix-v2"
BEFORE="$ROOT/before"
AFTER="$ROOT/after"
RUNTIME="$ROOT/runtime"
VERIFY="$ROOT/verify"
CLEAN="/tmp/b46-1xbet-clean-v2"
PATH_MAP=".github/scripts/ball46_current217_live_paths_20260928.txt"
rm -rf "$ROOT" "$CLEAN"
mkdir -p "$BEFORE" "$AFTER" "$RUNTIME" "$VERIFY" "$CLEAN"

# Lock CURRENT Production only. Extra modules from the prior deploy are tolerated pre-fix,
# but the exact main index.js, bindings, assets config and cron are preserved.
python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
r=pathlib.Path('/tmp/b46-1xbet-fix-v2');a=os.environ['CLOUDFLARE_ACCOUNT_ID'];t=os.environ['CLOUDFLARE_API_TOKEN']
h={'Authorization':f'Bearer {t}','Accept':'application/json'};api=f'https://api.cloudflare.com/client/v4/accounts/{a}';script='ball46-production'
def get(u):
  with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as x:return json.load(x)
d=get(f'{api}/workers/scripts/{script}/deployments')['result']['deployments'][0];vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100:raise SystemExit('MIXED_DEPLOYMENT')
vid=vs[0]['version_id'];r.joinpath('pre-version.txt').write_text(vid)
v=get(f'{api}/workers/workers/{script}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or []
main=[m for m in mods if m.get('name')=='index.js' and m.get('content_base64')]
if len(main)!=1:raise SystemExit('INDEX_MODULE_MISSING')
runtime=base64.b64decode(main[0]['content_base64']);sha=hashlib.sha256(runtime).hexdigest();r.joinpath('runtime/index.js').write_bytes(runtime);r.joinpath('runtime.sha').write_text(sha)
expect=[('ASSETS','assets',None,None),('ENGINE','service','nomadtips3-engine-343','production'),('FULL_MARKET','service','nomadtips3-full-market-343-ball46','production'),('HUB','service','nomadtips3-5usd-hub-343','production')]
got=sorted((b.get('name'),b.get('type'),b.get('service'),b.get('environment')) for b in (v.get('bindings') or []))
if got!=sorted(expect):raise SystemExit('BINDINGS_CHANGED:'+repr(got))
if v.get('compatibility_date')!='2026-09-09' or (v.get('compatibility_flags') or []):raise SystemExit('COMPAT_CHANGED')
ac=(v.get('assets') or {}).get('config') or {};exp={'base_path':'/','html_handling':'none','not_found_handling':'none','run_worker_first':True}
if {k:ac.get(k) for k in exp}!=exp:raise SystemExit('ASSET_CONFIG_CHANGED:'+repr(ac))
s=get(f'{api}/workers/scripts/{script}/schedules')['result'];ss=s.get('schedules',[]) if isinstance(s,dict) else (s or [])
if [x.get('cron') for x in ss if isinstance(x,dict) and x.get('cron')]!=['* * * * *']:raise SystemExit('CRON_CHANGED')
r.joinpath('pre-modules.json').write_text(json.dumps([m.get('name') for m in mods],indent=2))
print('CURRENT_LOCK_OK',vid,'modules=',len(mods),'main_sha=',sha)
PY

python3 - <<'PY'
from pathlib import Path
p=Path('.github/scripts/ball46_current217_live_paths_20260928.txt');xs=[x.strip() for x in p.read_text().splitlines() if x.strip()]
if len(xs)!=79 or len(set(xs))!=79:raise SystemExit('PATH_MAP_NOT_79')
need={'index.html','odds-format-343.js','dashboard-v2-stage3.js','full-market-bookmaker-343.js','signal.js','statistics.js'}
if not need.issubset(xs):raise SystemExit('REQUIRED_MISSING:'+repr(sorted(need-set(xs))))
Path('/tmp/b46-1xbet-fix-v2/live-paths.txt').write_text('\n'.join(xs)+'\n')
print('PATH_MAP_OK=79')
PY

nonce="${GITHUB_RUN_ID}-$(date +%s%N)"
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  mkdir -p "$BEFORE/$(dirname "$rel")"
  code=$(curl -sS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' -o "$BEFORE/$rel" -w '%{http_code}' "$DIRECT/$rel?b46-1xbet-v2=$nonce-${RANDOM}") || true
  [ "$code" = 200 ] || { echo "FETCH_FAILED:$code:$rel"; exit 1; }
  [ -s "$BEFORE/$rel" ] || { echo "EMPTY:$rel"; exit 1; }
done < "$ROOT/live-paths.txt"
cp -a "$BEFORE/." "$AFTER/"

grep -Fq 'B46_1XBET_AFFILIATE_20260928' "$BEFORE/odds-format-343.js"
grep -Fq 'B46_ODDS_VISIBILITY_20260928' "$BEFORE/odds-format-343.js"
grep -Fq "['1xbet','1xBet']" "$BEFORE/full-market-bookmaker-343.js"

nonce="${GITHUB_RUN_ID}-pre-$(date +%s%N)"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/board?b46v2=$nonce" -o "$ROOT/board-before.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/signals?b46v2=$nonce" -o "$ROOT/signals-before.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/statistics?b46v2=$nonce" -o "$ROOT/stats-before.json"
node - <<'NODE'
const fs=require('fs');const b=JSON.parse(fs.readFileSync('/tmp/b46-1xbet-fix-v2/board-before.json')),s=JSON.parse(fs.readFileSync('/tmp/b46-1xbet-fix-v2/signals-before.json')),t=JSON.parse(fs.readFileSync('/tmp/b46-1xbet-fix-v2/stats-before.json'));if(b?.ok!==true||!Array.isArray(b.fixtures)||!Array.isArray(s.signals)||t?.ok!==true||!Array.isArray(t.rows))throw Error('PRE_FLOW_BAD');console.log('PRE_FLOW_OK',{fixtures:b.fixtures.length,signals:s.signals.length,stats:t.rows.length});
NODE

python3 - <<'PY'
from pathlib import Path
p=Path('/tmp/b46-1xbet-fix-v2/after/odds-format-343.js');s=p.read_text();marker='/* B46_1XBET_AFFILIATE_20260928'
i=s.find(marker)
if i<0:raise SystemExit('V1_MARKER_NOT_FOUND')
base=s[:i].rstrip()
v2=r'''/* B46_1XBET_AFFILIATE_V2_20260928
   Presentation only. 1xBet logo/tab remains a normal bookmaker menu button.
   Only numeric ODDS cells inside the active 1xBet market panel become affiliate links. */
(()=>{
'use strict';
const VERSION='343-1xbet-affiliate-v2-price-only';
const AFFILIATE_URL='https://reffpa.com/L?tag=d_6082319m_97c_&site=6082319&ad=97';
const LOGO_URL='https://upload.wikimedia.org/wikipedia/commons/d/d3/1xBet-Logo.png';
const PRICE_RE=/^(?:\d+(?:\.\d+)?|\d+\s*\/\s*\d+|[+-]\d+)$/;
function validPrice(v){const x=String(v||'').trim();return x!==''&&x!=='—'&&PRICE_RE.test(x)}
function logoTab(tab){
  if(!tab||tab.dataset.b46OneXBetLogo==='1')return;
  const b=tab.querySelector('b');if(!b)return;
  b.textContent='';const mark=document.createElement('span');mark.className='b46-1xbet-brand';mark.setAttribute('aria-label','1xBet');
  const img=document.createElement('img');img.src=LOGO_URL;img.alt='1xBet';img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';
  mark.appendChild(img);b.appendChild(mark);tab.dataset.b46OneXBetLogo='1';
}
function linkPrice(td){
  if(!td||td.querySelector('a[data-b46-1xbet-odds]'))return;
  const text=String(td.textContent||'').trim();if(!validPrice(text))return;
  const a=document.createElement('a');a.dataset.b46OneXBetOdds='1';a.href=AFFILIATE_URL;a.target='_blank';a.rel='sponsored noopener noreferrer';a.className='b46-1xbet-odds';a.textContent=text;a.title='1xBet affiliate link · 18+ · Gamble responsibly';
  td.textContent='';td.appendChild(a);
}
function decorateTab(tab){
  if(!tab)return;logoTab(tab);
  // Important: never put an <a> inside the 1xBet menu button/logo.
  tab.querySelectorAll('a').forEach(a=>{if(a.dataset.b46OneXBetOdds!=='1')a.replaceWith(document.createTextNode(a.textContent||''))});
  if(!tab.classList.contains('active'))return;
  const card=tab.closest('[data-full-market-card]')||tab.closest('.match-expanded')||document;
  const panel=card.querySelector('[data-fmb-panel]');if(!panel)return;
  panel.querySelectorAll('table').forEach(table=>{
    const headers=[...table.querySelectorAll('thead th')].map(x=>String(x.textContent||'').trim().toUpperCase()).slice(1);
    table.querySelectorAll('tbody tr').forEach(row=>{
      [...row.querySelectorAll('td')].forEach((td,i)=>{
        const h=headers[i]||'';
        if(h==='LINE'||h==='RAW'||/LINE|HANDICAP/.test(h))return;
        linkPrice(td);
      });
    });
  });
}
function run(root=document){root.querySelectorAll?.('[data-fmb-book="1xbet"]').forEach(decorateTab)}
function afterBookClick(e){const tab=e.target.closest?.('[data-fmb-book="1xbet"]');if(!tab)return;setTimeout(()=>decorateTab(tab),0)}
function start(){
  if(!document.querySelector('style[data-b46-1xbet-affiliate-v2]')){const s=document.createElement('style');s.dataset.b46OneXBetAffiliateV2='1';s.textContent='.b46-1xbet-brand{display:inline-flex;align-items:center;width:58px;height:14px;overflow:hidden;vertical-align:middle;pointer-events:none}.b46-1xbet-brand img{display:block;width:58px;height:auto;max-width:none;pointer-events:none}.b46-1xbet-odds{color:inherit!important;text-decoration:none!important;font:inherit;font-weight:inherit;cursor:pointer;border-bottom:1px dotted currentColor}.b46-1xbet-odds:hover,.b46-1xbet-odds:focus-visible{filter:brightness(.82);outline:none}@media(max-width:760px){.b46-1xbet-brand{width:50px;height:12px}.b46-1xbet-brand img{width:50px}}';document.head.appendChild(s)}
  run();
  document.addEventListener('nomad343:fixture-ready',e=>run(e.target?.closest?.('.match-expanded')||document));
  document.addEventListener('click',afterBookClick,true);
  window.BALL46_1XBET_AFFILIATE={version:VERSION,url:AFFILIATE_URL,run,decorateTab};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();'''
p.write_text(base+'\n\n'+v2+'\n')
PY

node --check "$AFTER/odds-format-343.js"
grep -Fq 'B46_1XBET_AFFILIATE_V2_20260928' "$AFTER/odds-format-343.js"
! sed -n '/B46_1XBET_AFFILIATE_V2_20260928/,$p' "$AFTER/odds-format-343.js" | grep -Fq 'MutationObserver' || { echo V2_HAS_MUTATION_OBSERVER; exit 1; }
! sed -n '/B46_1XBET_AFFILIATE_V2_20260928/,$p' "$AFTER/odds-format-343.js" | grep -Eq '\bfetch\s*\(|XMLHttpRequest|/api/' || { echo V2_TOUCHES_NETWORK; exit 1; }

python3 - <<'PY'
from pathlib import Path
import hashlib
r=Path('/tmp/b46-1xbet-fix-v2');changed=[]
for rel in r.joinpath('live-paths.txt').read_text().splitlines():
  if hashlib.sha256((r/'before'/rel).read_bytes()).digest()!=hashlib.sha256((r/'after'/rel).read_bytes()).digest():changed.append(rel)
print('CHANGED_ASSETS=',changed)
if changed!=['odds-format-343.js']:raise SystemExit('ONE_FILE_DIFF_FAILED:'+repr(changed))
PY
echo ONE_FILE_DIFF_GATE_PASS

cp "$RUNTIME/index.js" "$CLEAN/index.js"
cat > "$CLEAN/wrangler.jsonc" <<EOF
{
  "name":"ball46-production",
  "main":"./index.js",
  "compatibility_date":"2026-09-09",
  "no_bundle":true,
  "services":[
    {"binding":"ENGINE","service":"nomadtips3-engine-343","environment":"production"},
    {"binding":"FULL_MARKET","service":"nomadtips3-full-market-343-ball46","environment":"production"},
    {"binding":"HUB","service":"nomadtips3-5usd-hub-343","environment":"production"}
  ],
  "assets":{"directory":"$AFTER","binding":"ASSETS","html_handling":"none","not_found_handling":"none","run_worker_first":true},
  "triggers":{"crons":["* * * * *"]}
}
EOF
cd "$CLEAN"
npx --yes wrangler@4.92.0 deploy --dry-run --config wrangler.jsonc 2>&1 | tee "$VERIFY/dry.log"
! grep -Fq 'Attaching additional modules:' "$VERIFY/dry.log" || { echo DRY_EXTRA_MODULES; exit 1; }

python3 - <<'PY'
import json,os,pathlib,urllib.request
p=pathlib.Path('/tmp/b46-1xbet-fix-v2/pre-version.txt').read_text().strip();a=os.environ['CLOUDFLARE_ACCOUNT_ID'];t=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {t}','Accept':'application/json'};u=f'https://api.cloudflare.com/client/v4/accounts/{a}/workers/scripts/ball46-production/deployments'
with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:j=json.load(r)
c=j['result']['deployments'][0]['versions'][0]['version_id'];print('RACE_VERSION',p,c)
if c!=p:raise SystemExit('PRODUCTION_MOVED')
PY

npx --yes wrangler@4.92.0 deploy --config wrangler.jsonc 2>&1 | tee "$VERIFY/deploy.log"
! grep -Fq 'Attaching additional modules:' "$VERIFY/deploy.log" || { echo DEPLOY_EXTRA_MODULES; exit 1; }

python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
r=pathlib.Path('/tmp/b46-1xbet-fix-v2');a=os.environ['CLOUDFLARE_ACCOUNT_ID'];t=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {t}','Accept':'application/json'};api=f'https://api.cloudflare.com/client/v4/accounts/{a}';script='ball46-production'
def get(u):
  with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as x:return json.load(x)
d=get(f'{api}/workers/scripts/{script}/deployments')['result']['deployments'][0];vid=d['versions'][0]['version_id'];v=get(f'{api}/workers/workers/{script}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or [];print('POST_MODULES',[m.get('name') for m in mods])
if len(mods)!=1 or mods[0].get('name')!='index.js':raise SystemExit('POST_RUNTIME_NOT_CLEAN')
sha=hashlib.sha256(base64.b64decode(mods[0]['content_base64'])).hexdigest();pre=r.joinpath('runtime.sha').read_text().strip()
if sha!=pre:raise SystemExit('MAIN_RUNTIME_CHANGED')
print('POST_RUNTIME_CLEAN',vid,sha)
PY

nonce="${GITHUB_RUN_ID}-post-$(date +%s%N)"
mkdir -p "$VERIFY/post"
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  mkdir -p "$VERIFY/post/$(dirname "$rel")"
  curl -fsS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' "$DIRECT/$rel?$nonce-${RANDOM}" -o "$VERIFY/post/$rel"
  cmp -s "$AFTER/$rel" "$VERIFY/post/$rel" || { echo POST_ASSET_MISMATCH:$rel; exit 1; }
done < "$ROOT/live-paths.txt"
echo POST_79_ASSETS_MATCH_TARGET

curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/board?b46v2post=$nonce" -o "$VERIFY/board-post.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/signals?b46v2post=$nonce" -o "$VERIFY/signals-post.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/statistics?b46v2post=$nonce" -o "$VERIFY/stats-post.json"
node - <<'NODE'
const fs=require('fs');const b=JSON.parse(fs.readFileSync('/tmp/b46-1xbet-fix-v2/verify/board-post.json')),s=JSON.parse(fs.readFileSync('/tmp/b46-1xbet-fix-v2/verify/signals-post.json')),t=JSON.parse(fs.readFileSync('/tmp/b46-1xbet-fix-v2/verify/stats-post.json'));if(b?.ok!==true||!Array.isArray(b.fixtures)||!Array.isArray(s.signals)||t?.ok!==true||!Array.isArray(t.rows))throw Error('POST_FLOW_BAD');console.log('POST_FLOW_OK',{fixtures:b.fixtures.length,signals:s.signals.length,stats:t.rows.length});
NODE

chrome=$(command -v google-chrome || command -v chromium || true)
[ -n "$chrome" ] || { echo CHROME_NOT_FOUND; exit 1; }
"$chrome" --headless=new --no-sandbox --disable-gpu --remote-debugging-port=9227 --user-data-dir="$VERIFY/chrome" "$WWW/index.html?status=live&b46v2=${GITHUB_RUN_ID}" >"$VERIFY/chrome.log" 2>&1 & CPID=$!
trap 'kill $CPID 2>/dev/null || true' EXIT
for i in $(seq 1 30); do curl -fsS http://127.0.0.1:9227/json > "$VERIFY/pages.json" 2>/dev/null && break; sleep 1; done
sleep 6
node - <<'NODE'
const fs=require('fs');const p=JSON.parse(fs.readFileSync('/tmp/b46-1xbet-fix-v2/verify/pages.json')).find(x=>x.type==='page');if(!p)throw Error('NO_PAGE');const ws=new WebSocket(p.webSocketDebuggerUrl);let id=0,m=new Map();ws.onmessage=e=>{const x=JSON.parse(e.data);if(x.id&&m.has(x.id)){const q=m.get(x.id);m.delete(x.id);x.error?q[1](Error(JSON.stringify(x.error))):q[0](x.result)}};const call=(method,params={})=>new Promise((a,b)=>{const n=++id;m.set(n,[a,b]);ws.send(JSON.stringify({id:n,method,params}))});(async()=>{await new Promise((a,b)=>{ws.onopen=a;ws.onerror=b});const ev=async e=>(await call('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true})).result.value;const r=await ev(`(()=>{const host=document.createElement('div');host.className='match-expanded';host.style.display='none';host.innerHTML='<div data-full-market-card><button type="button" class="fmb-tab active" data-fmb-book="1xbet"><b>1xBet</b></button><div data-fmb-panel><table><thead><tr><th>STAGE</th><th>LINE</th><th>HOME</th><th>AWAY</th></tr></thead><tbody><tr><th>LIVE</th><td>-0.5</td><td>1.91</td><td>2.05</td></tr></tbody></table></div></div>';document.body.appendChild(host);const tab=host.querySelector('[data-fmb-book="1xbet"]');window.BALL46_1XBET_AFFILIATE.decorateTab(tab);const tds=[...host.querySelectorAll('tbody td')];const out={api:window.BALL46_1XBET_AFFILIATE.version,menuLinks:tab.querySelectorAll('a').length,logo:!!tab.querySelector('img'),lineLinked:!!tds[0].querySelector('a'),homeLinked:!!tds[1].querySelector('a[data-b46-1xbet-odds]'),awayLinked:!!tds[2].querySelector('a[data-b46-1xbet-odds]'),href:tds[1].querySelector('a')?.href||''};host.remove();return out})()`);console.log('V2_DOM_TEST',r);if(!r.api.includes('v2')||r.menuLinks!==0||!r.logo||r.lineLinked||!r.homeLinked||!r.awayLinked||!r.href.includes('reffpa.com'))throw Error('V2_DOM_TEST_FAILED');ws.close();process.exit(0)})().catch(e=>{console.error(e);process.exit(1)});
NODE
kill "$CPID" 2>/dev/null || true; trap - EXIT

echo BALL46_1XBET_V2_FIX_VERIFIED
