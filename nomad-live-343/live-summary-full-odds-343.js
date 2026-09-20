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
