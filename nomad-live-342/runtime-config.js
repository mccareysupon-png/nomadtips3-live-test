(()=>{
'use strict';
const SOT_OFF_BRIDGE='https://nomadtips3-342-sot-off-bridge-test.mccarey-supon.workers.dev';
const LIVE_SCORE_ENGINE='https://nomadtips3-live-score-feed-v3.mccarey-supon.workers.dev';
const LIVE_SCORE_FALLBACK='https://nomadtips3-live-score-feed-v2.mccarey-supon.workers.dev';
const DEFAULT_PRICE='https://nomadtips3-live-engine-5dollar.mccarey-supon.workers.dev';
const PRODUCTION_HOSTS=new Set([
  'www.nomadtips3.com',
  'nomadtips3.com',
  'nomadtips3-live-web-production-canary.mccarey-supon.workers.dev',
]);
const FEED_PATH='/feed';
const sameOriginProduction=typeof location!=='undefined'&&PRODUCTION_HOSTS.has(location.hostname);
let priceOverride='';
try{
  localStorage.removeItem('nomadEngine342Base');
  localStorage.removeItem('nomad342FeedLastGoodV1');
  priceOverride=localStorage.getItem('nomadPrice342Base')||'';
}catch{}

function cleanBase(value){return String(value||'').trim().replace(/\/$/,'')}
const ACTIVE_ENGINE=cleanBase(SOT_OFF_BRIDGE);
const DIRECT_ENGINE=cleanBase(LIVE_SCORE_ENGINE);
const LEGACY_ENGINE=cleanBase(LIVE_SCORE_FALLBACK);

window.NOMAD342_RUNTIME=Object.freeze({
  version:'3.42',
  environment:sameOriginProduction?'PRODUCTION':'GIT',
  transport:'bridge-nowgoal-sot-off',
  engineBase:ACTIVE_ENGINE,
  defaultEngineBase:DIRECT_ENGINE,
  legacyEngineBase:LEGACY_ENGINE,
  feedPath:FEED_PATH,
  baseEventSource:'TotalCorner V3',
  sotOffSource:'Nowgoal match detail',
  priceBase:cleanBase(priceOverride||DEFAULT_PRICE),
  pricePath:'/quotes',
  priceHealthPath:'/health',
  pollMs:10000,
  requestTimeoutMs:14000,
  priceTimeoutMs:8000,
});
})();
