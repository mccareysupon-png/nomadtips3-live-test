(()=>{
'use strict';
const EVENT='m88:referee-update';
const ALLOWED=new Set([
  'schema','event_id','league_id','sport_id','home','away','score','period','minute','segment','market','market_id','selection_id',
  'home_line','away_line','home_odds_raw','away_odds_raw','odds_type','source_timestamp','received_at_utc','transport'
]);
function decode(detail){
  if(detail&&typeof detail==='object') return detail;
  if(typeof detail==='string'){try{return JSON.parse(detail)}catch{return null}}
  return null;
}
function sanitize(input){
  if(!input||typeof input!=='object'||input.schema!=='m88-msports-referee') return null;
  const topSegment=String(input.segment??'').toUpperCase();
  const marketSegment=String(input.market?.segment??'').toUpperCase();
  if(topSegment&&marketSegment&&topSegment!==marketSegment) return null;
  const segment=topSegment||marketSegment;
  const marketType=String(input.market?.type??'asian_handicap').toLowerCase();
  if(segment!=='FT'||marketType!=='asian_handicap') return null;
  const out={};
  for(const [k,v] of Object.entries(input)) if(ALLOWED.has(k)) out[k]=v;
  out.segment='FT';
  if(out.market&&typeof out.market==='object') out.market={...out.market,segment:'FT'};
  if(!out.event_id||!out.market_id||!out.selection_id) return null;
  return out;
}
window.addEventListener(EVENT,event=>{
  const payload=sanitize(decode(event?.detail));
  if(!payload) return;
  try{chrome.runtime.sendMessage({type:'M88_REFEREE_UPDATE',payload});}catch{}
});
})();