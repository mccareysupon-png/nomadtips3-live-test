#!/usr/bin/env bash
set -euo pipefail

BALL46_URL="${BALL46_URL:-https://ball46.com}"
BALL46_EXPECTED_VERSION="${BALL46_EXPECTED_VERSION:-54341a26-03be-45b3-87e2-9abfc1818856}"
ENGINE_SOURCE_SHA="${ENGINE_SOURCE_SHA:-efb5da1920183b6034dc41ced0eb119929a182d9}"
ENGINE_OLD_VERSION='nomad343-engine-v6-ceo-auto-v1.1-ah-guard-settlement-recovery-v1'
ENGINE_NEW_VERSION='nomad343-engine-v6.2-viewer-readonly-cron-referee-lock-v1'
HUB_EXPECTED_VERSION='nomad343-5usd-hub-v5-last-good-continuity'
FULL_EXPECTED_VERSION='nomad343-ball46-full-market-v6-server-prewarm-cache'
RUN_ID="${GITHUB_RUN_ID:-manual}"

log(){ printf '\n===== %s =====\n' "$*"; }
active_version(){
  local config="$1" out="$2"
  npx --yes wrangler@4.92.0 deployments list --config "$config" --json > "$out"
  node - "$out" <<'NODE'
const fs=require('fs');const f=process.argv[2];const d=JSON.parse(fs.readFileSync(f,'utf8'));const latest=d[d.length-1];const v=latest?.versions?.find(x=>Number(x.percentage)===100)?.version_id;if(!v)process.exit(2);process.stdout.write(v);
NODE
}

log 'Materialize exact production Engine source'
git cat-file -e "$ENGINE_SOURCE_SHA^{commit}"
rm -rf workers/nomadtips3-engine-343
git archive "$ENGINE_SOURCE_SHA" workers/nomadtips3-engine-343 | tar -x
grep -Fq "$ENGINE_OLD_VERSION" workers/nomadtips3-engine-343/src/index.js
grep -Fq 'crons = ["* * * * *"]' workers/nomadtips3-engine-343/wrangler.toml
cp workers/nomadtips3-engine-343/src/index.js /tmp/engine-source-before.js
cp workers/nomadtips3-engine-343/src/market-core.js /tmp/market-core-before.js
cp workers/nomadtips3-engine-343/src/ceo-condition.js /tmp/ceo-condition-before.js

log 'Preflight Ball46 exact version lock'
cur=$(active_version workers/nomadtips3-343-preview/wrangler.ball46.jsonc /tmp/ball46-deployments-before.json)
echo "BALL46_ACTIVE=$cur"
[ "$cur" = "$BALL46_EXPECTED_VERSION" ] || { echo "BALL46_PRODUCTION_VERSION_CHANGED_ABORT expected=$BALL46_EXPECTED_VERSION actual=$cur"; exit 21; }

log 'Capture backend invariants and rollback snapshot'
mkdir -p /tmp/pre /tmp/rb0
for ep in engine hub full-market; do curl -fsS -L --retry 5 --retry-all-errors --retry-delay 1 --max-time 30 "$BALL46_URL/api/$ep/health?readonly-pre=$RUN_ID" -o "/tmp/pre/$ep-health.json"; done
curl -fsS -L --max-time 30 "$BALL46_URL/api/engine/settings?readonly-pre=$RUN_ID" -o /tmp/pre/engine-settings.json
curl -fsS -L --max-time 30 "$BALL46_URL/api/engine/registry?readonly-pre=$RUN_ID" -o /tmp/pre/engine-registry.json
curl -fsS -L --max-time 30 "$BALL46_URL/api/engine/board?readonly-pre=$RUN_ID" -o /tmp/pre/engine-board.json
for p in index.html signal.html statistics.html dashboard-v2-stage3.js live-summary-full-odds-343.js full-market-bookmaker-343.js; do
  curl -fsS -L --retry 5 --retry-all-errors --retry-delay 1 --max-time 30 "$BALL46_URL/$p?readonly-pre=$RUN_ID" -o "/tmp/rb0/$p"
  test -s "/tmp/rb0/$p"
done
node <<'NODE'
const fs=require('fs');const e=require('/tmp/pre/engine-health.json'),h=require('/tmp/pre/hub-health.json'),f=require('/tmp/pre/full-market-health.json');
if(e.version!==process.env.ENGINE_OLD_VERSION && e.version!=='nomad343-engine-v6-ceo-auto-v1.1-ah-guard-settlement-recovery-v1')throw Error('ENGINE_BASE_MISMATCH:'+e.version);
if(h.version!=='nomad343-5usd-hub-v5-last-good-continuity')throw Error('HUB_BASE_MISMATCH:'+h.version);
if(f.version!=='nomad343-ball46-full-market-v6-server-prewarm-cache')throw Error('FULL_BASE_MISMATCH:'+f.version);
const s=require('/tmp/pre/engine-settings.json'),r=require('/tmp/pre/engine-registry.json'),b=require('/tmp/pre/engine-board.json');if(s.ok!==true||!s.settings||!s.runState)throw Error('SETTINGS_INVALID');if(r.ok!==true||!r.markets)throw Error('REGISTRY_INVALID');fs.writeFileSync('/tmp/pre-finished-at',String(e.finishedAt||0));console.log('BASE_OK',{engine:e.version,hub:h.version,full:f.version,fixtures:(b.fixtures||[]).length,finishedAt:e.finishedAt});
NODE
tar -C /tmp -czf "/tmp/ball46-viewer-readonly-rb0-$RUN_ID.tar.gz" pre rb0 engine-source-before.js market-core-before.js ceo-condition-before.js

log 'Patch Engine trigger ownership only'
python3 <<'PY'
from pathlib import Path
p=Path('workers/nomadtips3-engine-343/src/index.js');s=p.read_text()
repls=[
("const VERSION='nomad343-engine-v6-ceo-auto-v1.1-ah-guard-settlement-recovery-v1';","const VERSION='nomad343-engine-v6.2-viewer-readonly-cron-referee-lock-v1';",'version'),
("const u=new URL(request.url);if(!['/settings','/registry','/fixture-odds'].includes(u.pathname))await this.scanIfDue();","const u=new URL(request.url);/* BALL46_VIEWER_READONLY_LOCK_V1: reads never start scans; cron owns /scan */",'read-scan'),
("if(!['/health','/registry','/settings','/scan','/board','/signals','/statistics','/history'].includes(u.pathname))","if(!['/health','/registry','/settings','/board','/signals','/statistics','/history'].includes(u.pathname))",'public-scan')]
for old,new,name in repls:
    n=s.count(old)
    if n!=1: raise SystemExit(f'PATCH_{name}_COUNT={n}')
    s=s.replace(old,new,1)
p.write_text(s)
PY
cmp -s /tmp/market-core-before.js workers/nomadtips3-engine-343/src/market-core.js
cmp -s /tmp/ceo-condition-before.js workers/nomadtips3-engine-343/src/ceo-condition.js
grep -Fq "$ENGINE_NEW_VERSION" workers/nomadtips3-engine-343/src/index.js
! grep -Fq 'await this.scanIfDue();' workers/nomadtips3-engine-343/src/index.js
grep -Fq "async scheduled(_event,env,ctx){ctx.waitUntil(stub(env).fetch('https://engine.internal/scan',{method:'POST'}))}" workers/nomadtips3-engine-343/src/index.js
node --check workers/nomadtips3-engine-343/src/index.js
diff -u /tmp/engine-source-before.js workers/nomadtips3-engine-343/src/index.js > /tmp/engine-lock.diff || true
cat /tmp/engine-lock.diff
grep -Fq 'BALL46_VIEWER_READONLY_LOCK_V1' /tmp/engine-lock.diff
! grep -E '^[-+].*(MARKET_RULES|DEFAULTS=|CEO_PRICE|settleMarketSignal|ceoCandidatesForFixture|MAX_ODDS_FIXTURES_PER_SCAN=)' /tmp/engine-lock.diff

log 'Deploy Engine lock'
(cd workers/nomadtips3-engine-343 && npx --yes wrangler@4.92.0 deploy --config wrangler.toml) | tee /tmp/engine-deploy.log

log 'Verify Engine conditions unchanged and cron still advances'
for ep in health settings registry board; do curl -fsS -L --max-time 30 "$BALL46_URL/api/engine/$ep?readonly-engine=$RUN_ID" -o "/tmp/post-engine-$ep.json"; done
node <<'NODE'
function clean(x){x=JSON.parse(JSON.stringify(x));delete x.version;return x}const e=require('/tmp/post-engine-health.json');if(e.version!=='nomad343-engine-v6.2-viewer-readonly-cron-referee-lock-v1')throw Error('ENGINE_NEW_NOT_LIVE:'+e.version);const bs=clean(require('/tmp/pre/engine-settings.json')),as=clean(require('/tmp/post-engine-settings.json'));if(JSON.stringify(bs)!==JSON.stringify(as))throw Error('SETTINGS_RUNSTATE_CHANGED');const br=clean(require('/tmp/pre/engine-registry.json')),ar=clean(require('/tmp/post-engine-registry.json'));if(JSON.stringify(br)!==JSON.stringify(ar))throw Error('REGISTRY_CHANGED');const b=require('/tmp/post-engine-board.json');if(b.ok!==true)throw Error('BOARD_BAD');if(b.referee&&Number(b.referee.maxFixturesPerScan)!==4)throw Error('REFEREE_LIMIT_CHANGED');console.log('ENGINE_INVARIANTS_PASS',{runState:as.runState,referee:b.referee});
NODE
code=$(curl -sS -L --max-time 20 -o /tmp/direct-scan.txt -w '%{http_code}' -X POST 'https://nomadtips3-engine-343.mccarey-supon.workers.dev/scan')
[ "$code" = 404 ] || { echo "DIRECT_PUBLIC_SCAN_NOT_CLOSED:$code"; exit 1; }
before=$(cat /tmp/pre-finished-at); passed=0
for n in $(seq 1 18); do
  sleep 5
  curl -fsS -L --max-time 20 "$BALL46_URL/api/engine/health?cron-proof=$RUN_ID-$n" -o /tmp/cron-health.json
  after=$(node -e "const j=require('/tmp/cron-health.json');process.stdout.write(String(j.finishedAt||0))")
  if [ "$after" -gt "$before" ]; then passed=1; echo "ENGINE_CRON_ADVANCED before=$before after=$after"; break; fi
done
[ "$passed" = 1 ] || { echo ENGINE_CRON_DID_NOT_ADVANCE; exit 1; }
curl -fsS -L --max-time 25 "$BALL46_URL/api/engine/board?cron-board=$RUN_ID" -o /tmp/cron-board.json
node <<'NODE'
const b=require('/tmp/cron-board.json');if(b.ok!==true)throw Error('CRON_BOARD_BAD');if(b.referee&&Number(b.referee.maxFixturesPerScan)!==4)throw Error('CRON_REFEREE_CHANGED');console.log('ENGINE_CRON_CONDITIONS_CONTINUE',{fixtures:(b.fixtures||[]).length,referee:b.referee,runState:b.runState});
NODE

log 'Re-lock Ball46 production before public cutover'
cur=$(active_version workers/nomadtips3-343-preview/wrangler.ball46.jsonc /tmp/ball46-recheck.json)
[ "$cur" = "$BALL46_EXPECTED_VERSION" ] || { echo "CONCURRENT_BALL46_DEPLOY_ABORT:$cur"; exit 22; }
for p in index.html signal.html statistics.html; do curl -fsS -L --max-time 25 "$BALL46_URL/$p?lock2=$RUN_ID" -o "/tmp/recheck-$p"; cmp -s "/tmp/rb0/$p" "/tmp/recheck-$p" || { echo "CONCURRENT_PAGE_CHANGE:$p"; exit 23; }; done

log 'Mirror exact production assets'
mv nomad-live-343 /tmp/repo-assets
mkdir -p nomad-live-343
while IFS= read -r f; do
  name="${f#/tmp/repo-assets/}"
  case "$name" in *.html|*.js|*.css|*.svg|*.json|*.txt|*.xml|*.png|*.webp|*.jpg|*.jpeg|*.ico|*.woff|*.woff2) ;; *) continue ;; esac
  tmp="/tmp/prod-file-${name//\//_}"; code=$(curl -sS -L --retry 3 --retry-all-errors --retry-delay 1 --max-time 20 -o "$tmp" -w '%{http_code}' "$BALL46_URL/$name?readonly-mirror=$RUN_ID") || code=000
  if [ "$code" = 200 ] && [ -s "$tmp" ]; then mkdir -p "nomad-live-343/$(dirname "$name")"; cp "$tmp" "nomad-live-343/$name"; fi
done < <(find /tmp/repo-assets -maxdepth 1 -type f | sort)
cp /tmp/rb0/index.html nomad-live-343/index.html; cp /tmp/rb0/signal.html nomad-live-343/signal.html; cp /tmp/rb0/statistics.html nomad-live-343/statistics.html
cp -a nomad-live-343 /tmp/public-before

log 'Patch Ball46 public gateway cache-only'
python3 <<'PY'
from pathlib import Path
p=Path('workers/nomadtips3-343-preview/src/index.js');s=p.read_text()
old="if (path === '/fixture-odds') return env.FULL_MARKET.fetch(fullMarketRequest(request, '/fixture-odds'));"
new="""if (path === '/fixture-odds') return Response.json({ok:false,error:'VIEWER_PROVIDER_FETCH_DISABLED',mode:'CENTRAL_CACHE_READ_ONLY',externalRequestsAdded:0,lock:'BALL46_VIEWER_READONLY_LOCK_V1'},{status:410,headers:{'cache-control':'no-store'}});
  if (path === '/board-cache') {
    if (request.method !== 'POST') return Response.json({ok:false,error:'METHOD_NOT_ALLOWED'},{status:405,headers:{'cache-control':'no-store'}});
    return env.FULL_MARKET.fetch(fullMarketRequest(request, '/board-cache'));
  }"""
if s.count(old)!=1: raise SystemExit(f'FULL_GATE_COUNT={s.count(old)}')
s=s.replace(old,new,1)
old2="if (url.pathname.startsWith('/api/engine/')) {"
new2="""if (url.pathname === '/api/engine/scan' || url.pathname === '/api/engine/fixture-odds') {
      return Response.json({ok:false,error:'VIEWER_ENGINE_TRIGGER_DISABLED',lock:'BALL46_VIEWER_READONLY_LOCK_V1'},{status:403,headers:{'cache-control':'no-store'}});
    }
    if (url.pathname.startsWith('/api/engine/')) {"""
if s.count(old2)!=1: raise SystemExit(f'ENGINE_GATE_COUNT={s.count(old2)}')
s=s.replace(old2,new2,1);p.write_text(s)
PY
node --check workers/nomadtips3-343-preview/src/index.js
grep -Fq 'VIEWER_PROVIDER_FETCH_DISABLED' workers/nomadtips3-343-preview/src/index.js
grep -Fq "path === '/board-cache'" workers/nomadtips3-343-preview/src/index.js
! grep -Fq "env.FULL_MARKET.fetch(fullMarketRequest(request, '/fixture-odds'))" workers/nomadtips3-343-preview/src/index.js

log 'Replace Rich Odds runtime with central-cache reader'
cat > nomad-live-343/live-summary-full-odds-343.js <<'JS'
(()=>{
'use strict';
// BALL46_VIEWER_READONLY_LOCK_V1
// Viewer actions read Ball46 central cache only. They never trigger a 5USD provider request.
const VERSION='343-live-summary-viewer-readonly-cache-v1';
const API='/api/full-market/board-cache';
const CLIENT_CACHE_MS=45_000;
const MISS_CACHE_MS=15_000;
const SIGNAL_CACHE_READ_LIMIT=32;
const cache=new Map(),inflight=new Map();
const now=()=>Date.now();
const idOf=f=>String(f?.fixtureId??f?.id??'').trim();
const defer=fn=>typeof queueMicrotask==='function'?queueMicrotask(fn):Promise.resolve().then(fn);
function local(id){const hit=cache.get(String(id));if(!hit)return null;const ttl=hit.missing?MISS_CACHE_MS:CLIENT_CACHE_MS;return now()-Number(hit.at||0)<ttl?hit:null}
function normalizeEntry(id,row){if(!row?.fullOdds||typeof row.fullOdds!=='object')return{at:now(),fixtureId:id,missing:true,fullOdds:null,cached:true,stale:Boolean(row?.stale),source:'CENTRAL_CACHE_MISS'};return{at:now(),fixtureId:id,missing:false,fullOdds:row.fullOdds,fetchedAt:Number(row.fetchedAt||0)||null,cached:true,stale:Boolean(row.stale),bookmakerCount:Number(row.bookmakerCount||0),source:'CENTRAL_CACHE_READ_ONLY'}}
async function readCentral(ids){
  const list=[...new Set((Array.isArray(ids)?ids:[]).map(v=>String(v||'').trim()).filter(Boolean))].slice(0,128),out=new Map(),missing=[];
  for(const id of list){const hit=local(id);if(hit)out.set(id,hit);else missing.push(id)}
  if(!missing.length)return out;
  const key=[...missing].sort().join(',');let task=inflight.get(key);
  if(!task){task=(async()=>{const r=await fetch(API,{method:'POST',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({fixtureIds:missing})});const j=await r.json().catch(()=>null);if(!r.ok||j?.ok!==true)throw new Error(j?.error||`HTTP_${r.status}`);if(Number(j.externalRequestsAdded||0)!==0)throw new Error('VIEWER_CACHE_READ_ATTEMPTED_UPSTREAM');const entries=j.entries&&typeof j.entries==='object'?j.entries:{};for(const id of missing)cache.set(id,normalizeEntry(id,entries[id]));return true})().finally(()=>inflight.delete(key));inflight.set(key,task)}
  await task;for(const id of missing)out.set(id,cache.get(id));return out;
}
function richFixture(base,hit){if(!base||!hit?.fullOdds)return base;return{...base,fullOdds:hit.fullOdds,richOdds:hit.fullOdds,fullOddsFetchedAt:hit.fetchedAt??base.fullOddsFetchedAt??null,fullMarketSource:'CENTRAL_CACHE_READ_ONLY',fullMarketCached:true,fullMarketStale:Boolean(hit.stale),fullMarketRenderOwner:'RICH_ODDS_CACHE_ONLY'}}
function renderPinned(expanded,fixture){if(!expanded?.isConnected||!fixture)return;defer(()=>{if(!expanded?.isConnected)return;const renderer=window.NOMAD343_FULL_MARKET_BOOKMAKER;if(!renderer?.update)return;expanded._nomadRichFixture=fixture;expanded.dataset.oddsRenderOwner='rich-odds-cache-only';renderer.update(expanded,fixture)})}
function paint(expanded,fixture,hit){if(expanded?.isConnected&&fixture&&hit?.fullOdds)renderPinned(expanded,richFixture(fixture,hit))}
async function warmSignalCache(ids){const list=[...new Set((Array.isArray(ids)?ids:[]).map(v=>String(v||'').trim()).filter(Boolean))].slice(0,SIGNAL_CACHE_READ_LIMIT);if(list.length)await readCentral(list)}
function onSignalFilter(e){warmSignalCache(e?.detail?.fixtureIds).catch(err=>console.warn('Central odds cache read unavailable',err))}
function onFixtureReady(e){const fixture=e?.detail?.fixture,id=idOf(fixture),expanded=e.target?.closest?.('.match-expanded')||document.querySelector(`.match-expanded[data-expanded-match="${CSS.escape(id)}"]`);if(!id||!expanded)return;if(fixture?.fullOdds&&typeof fixture.fullOdds==='object'){renderPinned(expanded,fixture);return}const hit=local(id);if(hit){paint(expanded,fixture,hit);return}readCentral([id]).then(rows=>paint(expanded,fixture,rows.get(id))).catch(err=>console.warn('Central odds cache read unavailable',err))}
function start(){document.addEventListener('nomad343:fixture-ready',onFixtureReady);document.addEventListener('nomad343:signal-filter-active',onSignalFilter);window.NOMAD343_LIVE_SUMMARY_FULL_ODDS={version:VERSION,mode:'VIEWER_READ_ONLY',networkMode:'CENTRAL_CACHE_READ_ONLY',renderOwner:'RICH_ODDS_CACHE_ONLY',automaticPolling:false,defaultCardVisibleEnrichment:false,signalFilterPrefetch:false,signalCacheRead:true,viewerTriggeredProviderFetch:false,fanout:false,clientCacheMs:CLIENT_CACHE_MS,source:'ENGINE_BOARD_BULK_PLUS_CENTRAL_CACHE',upstreamRequestsPerViewer:0,current:id=>cache.get(String(id))||null,clear:()=>cache.clear()}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
JS
node --check nomad-live-343/live-summary-full-odds-343.js
grep -Fq 'BALL46_VIEWER_READONLY_LOCK_V1' nomad-live-343/live-summary-full-odds-343.js
grep -Fq "const API='/api/full-market/board-cache'" nomad-live-343/live-summary-full-odds-343.js
! grep -Fq '/api/full-market/fixture-odds' nomad-live-343/live-summary-full-odds-343.js
! grep -Fq 'applyRichOdds' nomad-live-343/live-summary-full-odds-343.js
! grep -Fq 'providerOdds:' nomad-live-343/live-summary-full-odds-343.js
diff -qr /tmp/public-before nomad-live-343 > /tmp/public-assets.diff || true
cat /tmp/public-assets.diff
[ -s /tmp/public-assets.diff ]
if grep -Ev 'live-summary-full-odds-343\.js' /tmp/public-assets.diff | grep -q .; then echo UNEXPECTED_PUBLIC_ASSET_DIFF; exit 31; fi
for p in index.html signal.html statistics.html; do cmp -s "/tmp/rb0/$p" "nomad-live-343/$p"; done

log 'Static architecture lock gate'
! grep -Fq '/api/full-market/fixture-odds' nomad-live-343/live-summary-full-odds-343.js
! grep -Fq 'applyRichOdds' nomad-live-343/live-summary-full-odds-343.js
grep -Fq 'VIEWER_PROVIDER_FETCH_DISABLED' workers/nomadtips3-343-preview/src/index.js
grep -Fq 'VIEWER_ENGINE_TRIGGER_DISABLED' workers/nomadtips3-343-preview/src/index.js
! grep -Fq 'await this.scanIfDue();' workers/nomadtips3-engine-343/src/index.js
cmp -s /tmp/market-core-before.js workers/nomadtips3-engine-343/src/market-core.js
cmp -s /tmp/ceo-condition-before.js workers/nomadtips3-engine-343/src/ceo-condition.js
echo BALL46_VIEWER_READONLY_STATIC_LOCK_PASS

log 'Dry run and final concurrency lock'
npx --yes wrangler@4.92.0 deploy --dry-run --config workers/nomadtips3-343-preview/wrangler.ball46.jsonc
cur=$(active_version workers/nomadtips3-343-preview/wrangler.ball46.jsonc /tmp/ball46-final-lock.json)
[ "$cur" = "$BALL46_EXPECTED_VERSION" ] || { echo "CONCURRENT_BALL46_DEPLOY_AT_CUTOVER_ABORT:$cur"; exit 32; }

log 'Deploy Ball46 public read-only gateway'
npx --yes wrangler@4.92.0 deploy --config workers/nomadtips3-343-preview/wrangler.ball46.jsonc | tee /tmp/ball46-lock-deploy.log

log 'Verify pages unchanged and viewer-trigger routes blocked'
for p in index.html signal.html statistics.html; do curl -fsS -L --max-time 30 "$BALL46_URL/$p?readonly-after=$RUN_ID" -o "/tmp/after-$p"; cmp -s "/tmp/rb0/$p" "/tmp/after-$p" || { echo "PUBLIC_HTML_CHANGED:$p"; exit 41; }; done
curl -fsS -L --max-time 25 "$BALL46_URL/live-summary-full-odds-343.js?readonly-after=$RUN_ID" -o /tmp/live-summary-after.js
grep -Fq 'BALL46_VIEWER_READONLY_LOCK_V1' /tmp/live-summary-after.js
! grep -Fq '/api/full-market/fixture-odds' /tmp/live-summary-after.js
code=$(curl -sS -L --max-time 20 -o /tmp/public-full-block.json -w '%{http_code}' "$BALL46_URL/api/full-market/fixture-odds?fixtureId=lock-test"); [ "$code" = 410 ]
code=$(curl -sS -L --max-time 20 -o /tmp/public-scan-block.json -w '%{http_code}' -X POST "$BALL46_URL/api/engine/scan"); [ "$code" = 403 ]
code=$(curl -sS -L --max-time 20 -o /tmp/public-engine-odds-block.json -w '%{http_code}' "$BALL46_URL/api/engine/fixture-odds?fixtureId=lock-test"); [ "$code" = 403 ]
curl -fsS -L --max-time 20 -X POST -H 'content-type: application/json' --data '{"fixtureIds":["lock-test"]}' "$BALL46_URL/api/full-market/board-cache" -o /tmp/cache-read.json
node <<'NODE'
const j=require('/tmp/cache-read.json');if(j.ok!==true||Number(j.externalRequestsAdded)!==0||j.mode!=='CENTRAL_CACHE_READ_ONLY')throw Error('CACHE_ONLY_ROUTE_FAIL');console.log('CACHE_ONLY_ROUTE_PASS',j);
NODE

log 'Load test 200 viewer actions'
rm -rf /tmp/load; mkdir -p /tmp/load
seq 1 100 | xargs -P20 -I{} sh -c 'curl -fsS -L --max-time 20 -X POST -H "content-type: application/json" --data "{\"fixtureIds\":[\"lock-test\"]}" "$0/api/full-market/board-cache" -o "/tmp/load/cache-{}.json"' "$BALL46_URL"
seq 1 50 | xargs -P20 -I{} sh -c 'code=$(curl -sS -L --max-time 20 -o "/tmp/load/block-{}.json" -w "%{http_code}" "$0/api/full-market/fixture-odds?fixtureId=lock-test"); [ "$code" = 410 ]' "$BALL46_URL"
seq 1 50 | xargs -P20 -I{} sh -c 'code=$(curl -sS -L --max-time 20 -o "/tmp/load/scan-{}.json" -w "%{http_code}" -X POST "$0/api/engine/scan"); [ "$code" = 403 ]' "$BALL46_URL"
node <<'NODE'
const fs=require('fs');for(let i=1;i<=100;i++){const j=JSON.parse(fs.readFileSync(`/tmp/load/cache-${i}.json`));if(j.ok!==true||Number(j.externalRequestsAdded)!==0||j.mode!=='CENTRAL_CACHE_READ_ONLY')throw Error(`LOAD_CACHE_FAIL_${i}`)}console.log('VIEWER_LOAD_200_PASS externalRequestsAdded=0');
NODE

log 'Final condition continuity'
for ep in engine hub full-market; do curl -fsS -L --max-time 25 "$BALL46_URL/api/$ep/health?readonly-final=$RUN_ID" -o "/tmp/final-$ep.json"; done
curl -fsS -L --max-time 25 "$BALL46_URL/api/engine/settings?readonly-final=$RUN_ID" -o /tmp/final-settings.json
curl -fsS -L --max-time 25 "$BALL46_URL/api/engine/registry?readonly-final=$RUN_ID" -o /tmp/final-registry.json
curl -fsS -L --max-time 25 "$BALL46_URL/api/engine/board?readonly-final=$RUN_ID" -o /tmp/final-board.json
node <<'NODE'
function clean(x){x=JSON.parse(JSON.stringify(x));delete x.version;return x}const e=require('/tmp/final-engine.json'),h=require('/tmp/final-hub.json'),f=require('/tmp/final-full-market.json');if(e.version!=='nomad343-engine-v6.2-viewer-readonly-cron-referee-lock-v1')throw Error('FINAL_ENGINE');if(h.version!=='nomad343-5usd-hub-v5-last-good-continuity')throw Error('FINAL_HUB');if(f.version!=='nomad343-ball46-full-market-v6-server-prewarm-cache')throw Error('FINAL_FULL');const bs=clean(require('/tmp/pre/engine-settings.json')),as=clean(require('/tmp/final-settings.json'));if(JSON.stringify(bs)!==JSON.stringify(as))throw Error('FINAL_SETTINGS_CHANGED');const br=clean(require('/tmp/pre/engine-registry.json')),ar=clean(require('/tmp/final-registry.json'));if(JSON.stringify(br)!==JSON.stringify(ar))throw Error('FINAL_REGISTRY_CHANGED');const b=require('/tmp/final-board.json');if(b.ok!==true)throw Error('FINAL_BOARD');if(b.referee&&Number(b.referee.maxFixturesPerScan)!==4)throw Error('FINAL_REFEREE_LIMIT');console.log('BALL46_VIEWER_READONLY_LOCK_V1_PASS',{conditionsPreserved:true,runState:as.runState,fixtures:(b.fixtures||[]).length,referee:b.referee});
NODE

log 'Persist canonical locked source'
mkdir -p docs
cat > docs/BALL46_VIEWER_READONLY_LOCK_V1.md <<'EOF'
# BALL46 Viewer Read-Only Architecture Lock V1

Production invariant: public viewers only read Ball46 snapshots/caches. Clicking a card, expanding a match, changing a Signal filter, refreshing a page, or increasing viewer count must never trigger a 5DollarFootballAPI provider request.

- Bulk = HUB scheduler.
- Engine scan = cron/internal scan only; read endpoints never start a scan.
- Referee odds = Engine candidate/referee lane only.
- Settlement recovery = Engine recovery lane only.
- Public Full Market = `/board-cache`, read-only, `externalRequestsAdded=0`.
- Public `/api/full-market/fixture-odds` = disabled.
- Public `/api/engine/scan` and `/api/engine/fixture-odds` = disabled.
- Rich odds stay in `fullOdds/richOdds`; never merge back into default-card `providerOdds`.
- `market-core.js`, `ceo-condition.js`, Settings, RunState, Market Registry and referee limit are protected invariants.

Marker: `BALL46_VIEWER_READONLY_LOCK_V1`
EOF
chmod +x scripts/ball46-viewer-readonly-lock-deploy-v1.sh
git config user.name ball46-architecture-lock
git config user.email actions@users.noreply.github.com
git add workers/nomadtips3-engine-343 workers/nomadtips3-343-preview/src/index.js nomad-live-343/live-summary-full-odds-343.js docs/BALL46_VIEWER_READONLY_LOCK_V1.md scripts/ball46-viewer-readonly-lock-deploy-v1.sh
if ! git diff --cached --quiet; then git commit -m 'lock(ball46): viewer read-only API architecture v1 [lock-source]'; git push origin HEAD:work/ball46-viewer-readonly-lock-v1-20260920; fi

echo 'BALL46_VIEWER_READONLY_LOCK_V1_COMPLETE'
