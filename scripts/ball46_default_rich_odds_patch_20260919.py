from pathlib import Path

# Dashboard: accept centrally cached rich odds and merge them into last-good fixture state.
dash = Path('nomad-live-343/dashboard-v2-stage3.js')
s = dash.read_text()
s = s.replace("const VERSION='343-dashboard-v2-stage3-v4-last-good-odds-prediction-card';", "const VERSION='343-dashboard-v2-stage3-v5-default-rich-bridge';")
anchor = "function holdLastGoodOdds(rows){const old=new Map(fixtures.map(f=>[fixtureKey(f),f]));return rows.map(f=>{const prev=old.get(fixtureKey(f));if(!prev)return f;const merged={...f};merged.providerOdds=mergeLastGoodValue(prev?.providerOdds,f?.providerOdds);if((!f?.providerOdds||!Object.keys(f.providerOdds||{}).length)&&prev?.providerOddsUpdatedAt)merged.providerOddsUpdatedAt=prev.providerOddsUpdatedAt;if((!f?.providerOdds||!Object.keys(f.providerOdds||{}).length)&&prev?.providerOddsFreshAt)merged.providerOddsFreshAt=prev.providerOddsFreshAt;return merged})}\n"
if 'function applyRichOdds(' not in s:
    if anchor not in s:
        raise SystemExit('holdLastGoodOdds anchor missing')
    s = s.replace(anchor, anchor + """let richRenderFrame=0;
function scheduleRichRender(){if(richRenderFrame)return;const run=()=>{richRenderFrame=0;renderBoard();renderFeatured()};if(typeof requestAnimationFrame==='function')richRenderFrame=requestAnimationFrame(run);else{richRenderFrame=1;setTimeout(run,0)}}
function applyRichOdds(fixtureId,fullOdds,fetchedAt){const id=String(fixtureId??'').trim();if(!id||!fullOdds||typeof fullOdds!=='object')return false;const idx=fixtures.findIndex(f=>fixtureKey(f)===id);if(idx<0)return false;const prev=fixtures[idx];fixtures[idx]={...prev,providerOdds:mergeLastGoodValue(prev?.providerOdds,fullOdds),providerOddsUpdatedAt:fetchedAt??prev?.providerOddsUpdatedAt??Date.now(),providerOddsFreshAt:fetchedAt??prev?.providerOddsFreshAt??Date.now(),providerOddsHeld:true,defaultRichOdds:true};scheduleRichRender();return true}
""", 1)
old_start = "function start(){initControls();load();setInterval(load,POLL_MS);window.NOMAD343_DASHBOARD_V2={version:VERSION,reload:load,mode:'BULK_SNAPSHOT_ONLY'}}"
new_start = "function start(){initControls();load();setInterval(load,POLL_MS);window.NOMAD343_DASHBOARD_V2={version:VERSION,reload:load,mode:'BULK_PLUS_CENTRAL_RICH_VISIBLE',applyRichOdds,getFixture:id=>fixtures.find(f=>fixtureKey(f)===String(id))||null}}"
if old_start in s:
    s = s.replace(old_start, new_start, 1)
elif new_start not in s:
    raise SystemExit('dashboard start anchor missing')
dash.write_text(s)

# Rich owner: enrich only default rows near viewport through existing central gate.
rich = Path('nomad-live-343/live-summary-full-odds-343.js')
r = rich.read_text()
r = r.replace("const VERSION='343-live-summary-john-gated-v6-last-good-persistent';", "const VERSION='343-live-summary-john-gated-v7-default-visible-rich';")
state_anchor = "const cache=new Map();\nconst inflight=new Map();\nlet retryUntil=0;\n"
if 'DEFAULT_MAX_PER_MINUTE' not in r:
    if state_anchor not in r:
        raise SystemExit('rich state anchor missing')
    r = r.replace(state_anchor, """const cache=new Map();
const inflight=new Map();
let retryUntil=0;
const DEFAULT_MAX_PER_MINUTE=6;
const defaultQueue=[];
const defaultQueued=new Set();
const defaultDone=new Set();
const defaultCalls=[];
let defaultBusy=false;
let defaultObserver=null;
const observedRows=new WeakSet();
""", 1)
fixture_anchor = "function onFixtureReady(e){\n"
if 'function startDefaultVisibleEnrichment()' not in r:
    if fixture_anchor not in r:
        raise SystemExit('fixture-ready anchor missing')
    helpers = """function trimDefaultCalls(){const cutoff=now()-60_000;while(defaultCalls.length&&defaultCalls[0]<cutoff)defaultCalls.shift()}
function applyDefaultRich(id,hit){if(!hit?.fullOdds)return false;const dash=window.NOMAD343_DASHBOARD_V2;if(!dash?.applyRichOdds)return false;return dash.applyRichOdds(id,hit.fullOdds,hit.fetchedAt)}
function pumpDefaultQueue(){if(defaultBusy||!defaultQueue.length)return;trimDefaultCalls();if(defaultCalls.length>=DEFAULT_MAX_PER_MINUTE){const wait=Math.max(1000,60_000-(now()-defaultCalls[0])+250);setTimeout(pumpDefaultQueue,wait);return}const id=defaultQueue.shift();defaultQueued.delete(id);if(defaultDone.has(id)){pumpDefaultQueue();return}defaultBusy=true;defaultCalls.push(now());requestRich(id).then(hit=>{if(applyDefaultRich(id,hit))defaultDone.add(id)}).catch(err=>{const retry=Math.max(5,Number(err?.retryAfter||0));setTimeout(()=>enqueueDefault(id),retry*1000)}).finally(()=>{defaultBusy=false;setTimeout(pumpDefaultQueue,350)})}
function enqueueDefault(id){id=String(id||'').trim();if(!id||defaultDone.has(id)||defaultQueued.has(id))return;defaultQueued.add(id);defaultQueue.push(id);pumpDefaultQueue()}
function scanDefaultRows(){if(!defaultObserver)return;document.querySelectorAll('.match-row[data-match-id]').forEach(row=>{if(observedRows.has(row))return;observedRows.add(row);defaultObserver.observe(row)})}
function startDefaultVisibleEnrichment(){if(typeof IntersectionObserver!=='function')return;defaultObserver=new IntersectionObserver(entries=>{for(const entry of entries){if(!entry.isIntersecting)continue;const row=entry.target;defaultObserver.unobserve(row);enqueueDefault(row?.dataset?.matchId)}},{root:null,rootMargin:'220px 0px',threshold:0.01});scanDefaultRows();setInterval(scanDefaultRows,1500)}

"""
    r = r.replace(fixture_anchor, helpers + fixture_anchor, 1)
old_rstart = "function start(){\n  document.addEventListener('nomad343:fixture-ready',onFixtureReady);\n  window.NOMAD343_LIVE_SUMMARY_FULL_ODDS={"
new_rstart = "function start(){\n  document.addEventListener('nomad343:fixture-ready',onFixtureReady);\n  startDefaultVisibleEnrichment();\n  window.NOMAD343_LIVE_SUMMARY_FULL_ODDS={"
if old_rstart in r:
    r = r.replace(old_rstart, new_rstart, 1)
elif new_rstart not in r:
    raise SystemExit('rich start anchor missing')
r = r.replace("mode:'BULK_PLUS_ON_DEMAND_RICH_FINAL_OWNER',", "mode:'BULK_PLUS_ON_DEMAND_AND_VISIBLE_DEFAULT_RICH',")
if 'defaultCardVisibleEnrichment:true' not in r:
    r = r.replace("automaticPolling:false,", "automaticPolling:false,\n    defaultCardVisibleEnrichment:true,\n    defaultCardMaxRequestsPerMinute:DEFAULT_MAX_PER_MINUTE,", 1)
rich.write_text(r)

# Cache-bust only these two runtime files.
idx = Path('nomad-live-343/index.html')
h = idx.read_text()
h = h.replace('343-dashboard-v2-stage3-v4-last-good-odds-prediction-card&order=20260919-1', '343-dashboard-v2-stage3-v5-default-rich-bridge&order=20260919-2')
h = h.replace('343-live-summary-john-gated-v6-last-good-persistent&order=20260918-1', '343-live-summary-john-gated-v7-default-visible-rich&order=20260919-2')
idx.write_text(h)

print('BALL46_DEFAULT_RICH_PATCH_OK')
