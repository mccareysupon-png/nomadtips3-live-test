(()=>{
'use strict';
const STORAGE_BASE='nomadMarket342Base';
const STORAGE_MODE='nomadMarket342Mode';
let base='';
let mode='DISPLAY';
try{
  base=String(localStorage.getItem(STORAGE_BASE)||'').trim().replace(/\/$/,'');
  const saved=String(localStorage.getItem(STORAGE_MODE)||'DISPLAY').toUpperCase();
  if(['OFF','DISPLAY','CONFIRM','REQUIRED'].includes(saved))mode=saved;
}catch{}
if(typeof window.NOMAD342_MARKET_BASE==='string'&&window.NOMAD342_MARKET_BASE.trim()){
  base=window.NOMAD342_MARKET_BASE.trim().replace(/\/$/,'');
}
window.NOMAD342_MARKET_RUNTIME=Object.freeze({
  version:'market-v1',
  base,
  path:'/markets',
  healthPath:'/health',
  mode,
  pollMs:15000,
  timeoutMs:6500,
  maxDisplayAgeMs:45000,
  historyKey:'nomad342MarketHistoryV1',
  historyMaxRows:24,
  optional:true,
  blocksEventRender:false,
});
})();
