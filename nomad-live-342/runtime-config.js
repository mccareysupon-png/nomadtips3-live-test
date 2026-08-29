(()=>{
'use strict';
const DEFAULT_ENGINE='https://nomadtips3-live-engine-342-test.mccarey-supon.workers.dev';
const DEFAULT_PRICE='https://nomadtips3-live-engine-5dollar.mccarey-supon.workers.dev';
let override='',priceOverride='';
try{override=localStorage.getItem('nomadEngine342Base')||'';priceOverride=localStorage.getItem('nomadPrice342Base')||''}catch{}
window.NOMAD342_RUNTIME=Object.freeze({
  version:'3.42',
  environment:'GIT',
  engineBase:String(override||DEFAULT_ENGINE).replace(/\/$/,''),
  feedPath:'/feed',
  priceBase:String(priceOverride||DEFAULT_PRICE).replace(/\/$/,''),
  pricePath:'/quotes',
  priceHealthPath:'/health',
  pollMs:10000,
  requestTimeoutMs:9000,
  priceTimeoutMs:8000,
});
})();
