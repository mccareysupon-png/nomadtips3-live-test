#!/usr/bin/env bash
set -euo pipefail

ENGINE_SOURCE_SHA="${ENGINE_SOURCE_SHA:-efb5da1920183b6034dc41ced0eb119929a182d9}"
ENGINE_OLD_VERSION='nomad343-engine-v6-ceo-auto-v1.1-ah-guard-settlement-recovery-v1'
ENGINE_NEW_VERSION='nomad343-engine-v6.2-viewer-readonly-cron-referee-lock-v1'
LOCK_MARKER='BALL46_VIEWER_READONLY_LOCK_V1'

log(){ printf '\n===== %s =====\n' "$*"; }

log 'Rebuild exact audited Engine source'
git cat-file -e "$ENGINE_SOURCE_SHA^{commit}"
rm -rf /tmp/engine-canonical
mkdir -p /tmp/engine-canonical
git archive "$ENGINE_SOURCE_SHA" workers/nomadtips3-engine-343 | tar -x -C /tmp/engine-canonical
cp /tmp/engine-canonical/workers/nomadtips3-engine-343/src/market-core.js /tmp/market-core-audited.js
cp /tmp/engine-canonical/workers/nomadtips3-engine-343/src/ceo-condition.js /tmp/ceo-condition-audited.js
rm -rf workers/nomadtips3-engine-343
cp -a /tmp/engine-canonical/workers/nomadtips3-engine-343 workers/nomadtips3-engine-343
python3 - <<'PY'
from pathlib import Path
p=Path('workers/nomadtips3-engine-343/src/index.js')
s=p.read_text()
reps=[
("const VERSION='nomad343-engine-v6-ceo-auto-v1.1-ah-guard-settlement-recovery-v1';","const VERSION='nomad343-engine-v6.2-viewer-readonly-cron-referee-lock-v1';"),
("const u=new URL(request.url);if(!['/settings','/registry','/fixture-odds'].includes(u.pathname))await this.scanIfDue();","const u=new URL(request.url);/* BALL46_VIEWER_READONLY_LOCK_V1: reads never start scans; cron owns /scan */"),
("if(!['/health','/registry','/settings','/scan','/board','/signals','/statistics','/history'].includes(u.pathname))","if(!['/health','/registry','/settings','/board','/signals','/statistics','/history'].includes(u.pathname))")]
for old,new in reps:
    if s.count(old)!=1: raise SystemExit('ENGINE_CANONICAL_PATCH_MISMATCH')
    s=s.replace(old,new,1)
p.write_text(s)
PY
cmp -s /tmp/market-core-audited.js workers/nomadtips3-engine-343/src/market-core.js
cmp -s /tmp/ceo-condition-audited.js workers/nomadtips3-engine-343/src/ceo-condition.js
! grep -Fq 'await this.scanIfDue();' workers/nomadtips3-engine-343/src/index.js
grep -Fq "$ENGINE_NEW_VERSION" workers/nomadtips3-engine-343/src/index.js
grep -Fq 'crons = ["* * * * *"]' workers/nomadtips3-engine-343/wrangler.toml
node --check workers/nomadtips3-engine-343/src/index.js

log 'Persist audited Ball46 gateway lock'
p=workers/nomadtips3-343-preview/src/index.js
if grep -Fq 'VIEWER_PROVIDER_FETCH_DISABLED' "$p"; then
  echo 'Gateway lock already present in source'
else
  grep -Fq "if (path === '/fixture-odds') return env.FULL_MARKET.fetch(fullMarketRequest(request, '/fixture-odds'));" "$p"
  python3 - <<'PY'
from pathlib import Path
p=Path('workers/nomadtips3-343-preview/src/index.js')
s=p.read_text()
old="if (path === '/fixture-odds') return env.FULL_MARKET.fetch(fullMarketRequest(request, '/fixture-odds'));"
new="""if (path === '/fixture-odds') return Response.json({ok:false,error:'VIEWER_PROVIDER_FETCH_DISABLED',mode:'CENTRAL_CACHE_READ_ONLY',externalRequestsAdded:0,lock:'BALL46_VIEWER_READONLY_LOCK_V1'},{status:410,headers:{'cache-control':'no-store'}});
  if (path === '/board-cache') {
    if (request.method !== 'POST') return Response.json({ok:false,error:'METHOD_NOT_ALLOWED'},{status:405,headers:{'cache-control':'no-store'}});
    return env.FULL_MARKET.fetch(fullMarketRequest(request, '/board-cache'));
  }"""
if s.count(old)!=1: raise SystemExit('GATEWAY_FULL_MARKET_PATCH_MISMATCH')
s=s.replace(old,new,1)
old2="if (url.pathname.startsWith('/api/engine/')) {"
new2="""if (url.pathname === '/api/engine/scan' || url.pathname === '/api/engine/fixture-odds') {
      return Response.json({ok:false,error:'VIEWER_ENGINE_TRIGGER_DISABLED',lock:'BALL46_VIEWER_READONLY_LOCK_V1'},{status:403,headers:{'cache-control':'no-store'}});
    }
    if (url.pathname.startsWith('/api/engine/')) {"""
if s.count(old2)!=1: raise SystemExit('GATEWAY_ENGINE_PATCH_MISMATCH')
s=s.replace(old2,new2,1)
p.write_text(s)
PY
fi
grep -Fq 'VIEWER_PROVIDER_FETCH_DISABLED' "$p"
grep -Fq 'VIEWER_ENGINE_TRIGGER_DISABLED' "$p"
grep -Fq "path === '/board-cache'" "$p"
! grep -Fq "env.FULL_MARKET.fetch(fullMarketRequest(request, '/fixture-odds'))" "$p"
node --check "$p"

log 'Persist audited cache-only browser runtime'
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
async function readCentral(ids){const list=[...new Set((Array.isArray(ids)?ids:[]).map(v=>String(v||'').trim()).filter(Boolean))].slice(0,128),out=new Map(),missing=[];for(const id of list){const hit=local(id);if(hit)out.set(id,hit);else missing.push(id)}if(!missing.length)return out;const key=[...missing].sort().join(',');let task=inflight.get(key);if(!task){task=(async()=>{const r=await fetch(API,{method:'POST',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({fixtureIds:missing})});const j=await r.json().catch(()=>null);if(!r.ok||j?.ok!==true)throw new Error(j?.error||`HTTP_${r.status}`);if(Number(j.externalRequestsAdded||0)!==0)throw new Error('VIEWER_CACHE_READ_ATTEMPTED_UPSTREAM');const entries=j.entries&&typeof j.entries==='object'?j.entries:{};for(const id of missing)cache.set(id,normalizeEntry(id,entries[id]));return true})().finally(()=>inflight.delete(key));inflight.set(key,task)}await task;for(const id of missing)out.set(id,cache.get(id));return out}
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
grep -Fq "$LOCK_MARKER" nomad-live-343/live-summary-full-odds-343.js
grep -Fq "const API='/api/full-market/board-cache'" nomad-live-343/live-summary-full-odds-343.js
! grep -Fq '/api/full-market/fixture-odds' nomad-live-343/live-summary-full-odds-343.js
! grep -Fq 'applyRichOdds' nomad-live-343/live-summary-full-odds-343.js
! grep -Fq 'providerOdds:' nomad-live-343/live-summary-full-odds-343.js

log 'Write lock manifest and checker'
mkdir -p docs scripts
cat > docs/BALL46_VIEWER_READONLY_LOCK_V1.md <<'EOF'
# BALL46 Viewer Read-Only Architecture Lock V1

Public viewers only read Ball46 snapshots/caches. Clicking a card, expanding a match, changing a Signal filter, refreshing a page, or increasing viewer count must never trigger a 5DollarFootballAPI provider request.

- Bulk = HUB scheduler only.
- Engine scan = cron/internal scan only; read endpoints never start scans.
- Referee odds = Engine candidate/referee lane only.
- Settlement recovery = Engine recovery lane only.
- Public Full Market = `/board-cache`, read-only, `externalRequestsAdded=0`.
- Public `/api/full-market/fixture-odds` = HTTP 410.
- Public `/api/engine/scan` and `/api/engine/fixture-odds` = HTTP 403.
- Rich odds stay in `fullOdds/richOdds`, never default-card `providerOdds`.
- `market-core.js`, `ceo-condition.js`, Settings, RunState, Market Registry and referee max 4/scan were verified unchanged.

Audited production: Ball46 `ac0ca816-54ac-402c-bc50-7d6c88a1d2d1`; Engine `83cbf5c6-fb5e-46eb-908f-0035e3d9dc3d`; final audit run `35500888478`.

Marker: `BALL46_VIEWER_READONLY_LOCK_V1`
EOF
cat > docs/BALL46_VIEWER_READONLY_LOCK_V1.json <<'EOF'
{"lock":"BALL46_VIEWER_READONLY_LOCK_V1","status":"AUDITED_PRODUCTION","ball46WorkerVersion":"ac0ca816-54ac-402c-bc50-7d6c88a1d2d1","engineWorkerVersion":"83cbf5c6-fb5e-46eb-908f-0035e3d9dc3d","engineRuntimeVersion":"nomad343-engine-v6.2-viewer-readonly-cron-referee-lock-v1","finalAuditRun":35500888478,"viewerTriggeredProviderFetch":false,"publicFullOddsStatus":410,"publicEngineScanStatus":403,"publicEngineFixtureOddsStatus":403,"refereeMaxFixturesPerScan":4}
EOF
cat > scripts/ball46-viewer-readonly-lock-check.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
js=nomad-live-343/live-summary-full-odds-343.js
gateway=workers/nomadtips3-343-preview/src/index.js
engine=workers/nomadtips3-engine-343/src/index.js
grep -Fq 'BALL46_VIEWER_READONLY_LOCK_V1' "$js"
grep -Fq "const API='/api/full-market/board-cache'" "$js"
! grep -Fq '/api/full-market/fixture-odds' "$js"
! grep -Fq 'applyRichOdds' "$js"
! grep -Fq 'providerOdds:' "$js"
grep -Fq 'VIEWER_PROVIDER_FETCH_DISABLED' "$gateway"
grep -Fq 'VIEWER_ENGINE_TRIGGER_DISABLED' "$gateway"
grep -Fq "path === '/board-cache'" "$gateway"
! grep -Fq "env.FULL_MARKET.fetch(fullMarketRequest(request, '/fixture-odds'))" "$gateway"
grep -Fq 'BALL46_VIEWER_READONLY_LOCK_V1' "$engine"
! grep -Fq 'await this.scanIfDue();' "$engine"
grep -Fq 'crons = ["* * * * *"]' workers/nomadtips3-engine-343/wrangler.toml
echo BALL46_VIEWER_READONLY_LOCK_V1_SOURCE_PASS
EOF
chmod +x scripts/ball46-viewer-readonly-lock-check.sh
scripts/ball46-viewer-readonly-lock-check.sh

log 'Commit canonical audited source - NO DEPLOY'
git config user.name ball46-architecture-lock
git config user.email actions@users.noreply.github.com
git add workers/nomadtips3-engine-343 workers/nomadtips3-343-preview/src/index.js nomad-live-343/live-summary-full-odds-343.js docs/BALL46_VIEWER_READONLY_LOCK_V1.md docs/BALL46_VIEWER_READONLY_LOCK_V1.json scripts/ball46-viewer-readonly-lock-check.sh
printf '%s\n' '--- canonical diff stat ---'
git diff --cached --stat
printf '%s\n' '--- protected condition diff must be empty ---'
git diff --cached -- workers/nomadtips3-engine-343/src/market-core.js workers/nomadtips3-engine-343/src/ceo-condition.js
scripts/ball46-viewer-readonly-lock-check.sh
if git diff --cached --quiet; then echo 'CANONICAL_ALREADY_PERSISTED'; exit 0; fi
git commit -m 'lock(ball46): persist audited viewer-readonly canonical source v1'
git push origin HEAD:work/ball46-viewer-readonly-lock-v1-20260920
echo BALL46_VIEWER_READONLY_CANONICAL_SOURCE_PERSISTED
