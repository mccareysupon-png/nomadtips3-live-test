(()=>{
'use strict';
const DEFAULT_ENGINE='https://nomadtips3-live-engine-342-test.mccarey-supon.workers.dev';
const DEFAULT_PRICE='https://nomadtips3-live-engine-5dollar.mccarey-supon.workers.dev';
let override='',priceOverride='';
try{override=localStorage.getItem('nomadEngine342Base')||'';priceOverride=localStorage.getItem('nomadPrice342Base')||''}catch{}

function cleanBase(value){return String(value||'').trim().replace(/\/$/,'')}
function validEvent342Base(value){
  try{
    const url=new URL(cleanBase(value));
    return url.protocol==='https:'&&/^nomadtips3-live-engine-342(?:-test)?\.mccarey-supon\.workers\.dev$/i.test(url.hostname)&&(!url.pathname||url.pathname==='/');
  }catch{return false}
}
const engineBase=validEvent342Base(override)?cleanBase(override):DEFAULT_ENGINE;
if(override&&!validEvent342Base(override)){
  try{localStorage.removeItem('nomadEngine342Base')}catch{}
}

window.NOMAD342_RUNTIME=Object.freeze({
  version:'3.42',
  environment:'GIT',
  engineBase,
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
