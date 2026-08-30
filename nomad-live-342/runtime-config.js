(()=>{
'use strict';
const DEFAULT_ENGINE='https://nomadtips3-live-engine-342-test.mccarey-supon.workers.dev';
const DEFAULT_PRICE='https://nomadtips3-live-engine-5dollar.mccarey-supon.workers.dev';
let priceOverride='';
try{
  localStorage.removeItem('nomadEngine342Base');
  priceOverride=localStorage.getItem('nomadPrice342Base')||'';
}catch{}

function cleanBase(value){return String(value||'').trim().replace(/\/$/,'')}

window.NOMAD342_RUNTIME=Object.freeze({
  version:'3.42',
  environment:'GIT',
  engineBase:DEFAULT_ENGINE,
  defaultEngineBase:DEFAULT_ENGINE,
  feedPath:'/feed',
  priceBase:cleanBase(priceOverride||DEFAULT_PRICE),
  pricePath:'/quotes',
  priceHealthPath:'/health',
  pollMs:10000,
  requestTimeoutMs:9000,
  priceTimeoutMs:8000,
});
})();
