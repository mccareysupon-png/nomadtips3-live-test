(()=>{
'use strict';
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
const ACTIVE_ENGINE=cleanBase(LIVE_SCORE_ENGINE);
const FALLBACK_ENGINE=cleanBase(LIVE_SCORE_FALLBACK);

window.NOMAD342_RUNTIME=Object.freeze({
  version:'3.42',
  environment:sameOriginProduction?'PRODUCTION':'GIT',
  transport:'direct-worker-v3',
  engineBase:ACTIVE_ENGINE,
  defaultEngineBase:FALLBACK_ENGINE,
  feedPath:FEED_PATH,
  priceBase:cleanBase(priceOverride||DEFAULT_PRICE),
  pricePath:'/quotes',
  priceHealthPath:'/health',
  pollMs:10000,
  requestTimeoutMs:14000,
  priceTimeoutMs:8000,
});
})();
