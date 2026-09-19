(()=>{
'use strict';
const VERSION='343-bulk-odds-compat-v4-hold-last-good';
const BOARD_PATH='/api/engine/board';
const HOLD_KEY='nomad343_bulk_odds_hold_v1';
const HOLD_TTL_MS=15*60*1000;
const HOLD_LIMIT=36;
const nativeFetch=window.fetch.bind(window);
const STAGES=new Set(['opening','open','closing','close','inplay','live','current','latest','prematch','pre']);
const PRICE_KEYS=new Set(['line','hdp','handicap','total','home','homeodds','homeprice','draw','drawodds','drawprice','away','awayodds','awayprice','over','overodds','overprice','under','underodds','underprice','yes','no']);
const norm=v=>String(v??'').toLowerCase().replace(/[^a-z0-9]/g,'');
const plain=v=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const scalar=v=>v!==null&&v!==undefined&&v!==''&&typeof v!=='boolean'&&Number.isFinite(Number(v));
const fixtureKey=f=>String(f?.fixtureId??f?.id??[f?.home?.name,f?.away?.name,f?.kickoffAt??f?.kickoffUtc].join('|'));

function canonicalMarketKey(key){
  const n=norm(key),half=/(half|1h|firsthalf)/.test(n);
  if(['1x2','matchresult','fulltimeresult'].includes(n))return half?'1x2_half':'1x2';
  if(/1x2/.test(n)&&half)return'1x2_half';
  if(/corner/.test(n)&&/(asian|handicap|hdp)/.test(n))return half?'corner_asian_half':'corner_asian';
  if(/corner/.test(n))return half?'corner_line_half':'corner_line';
  if(/card/.test(n)&&/(asian|handicap|hdp)/.test(n))return half?'card_asian_half':'card_asian';
  if(/card/.test(n))return half?'card_line_half':'card_line';
  if(/asian|handicap|hdp/.test(n))return half?'asian_handicap_half':'asian_handicap';
  if(/goalline|goaloverunder|goalsoverunder|totalgoals|overunder|totalline/.test(n)||n==='goal'||n==='total')return half?'goal_line_half':'goal_line';
  if(n==='btts'||/bothteamstoscore/.test(n))return'btts';
  return String(key);
}
function isLineMarket(key){return ['asian_handicap','goal_line','corner_line','corner_asian','card_line','card_asian','asian_handicap_half','goal_line_half','corner_line_half','corner_asian_half','card_line_half','card_asian_half'].includes(key)}
function isMarket(key){return key==='1x2'||key==='1x2_half'||key==='btts'||isLineMarket(key)}
function hasStages(v){return plain(v)&&Object.keys(v).some(k=>STAGES.has(norm(k)))}
function looksPriceObject(v){if(!plain(v))return false;const keys=Object.keys(v).map(norm);return keys.some(k=>PRICE_KEYS.has(k))}
function normalizeMarket(key,value){
  if(scalar(value)&&isLineMarket(key))return{inplay:{line:Number(value)}};
  if(!plain(value))return value;
  let changed=false;const out={...value};
  for(const [stage,row] of Object.entries(value)){
    if(!STAGES.has(norm(stage))||!scalar(row)||!isLineMarket(key))continue;
    out[stage]={line:Number(row)};changed=true;
  }
  const base=changed?out:value;
  if(!hasStages(base)&&looksPriceObject(base))return{inplay:base};
  return base;
}
function normalizeTree(node,depth=0){
  if(depth>10||node===null||node===undefined)return node;
  if(Array.isArray(node)){
    let changed=false;const out=node.map(row=>{const next=normalizeTree(row,depth+1);if(next!==row)changed=true;return next});return changed?out:node;
  }
  if(!plain(node))return node;
  let changed=false;const out={...node};
  for(const [rawKey,rawValue] of Object.entries(node)){
    const key=canonicalMarketKey(rawKey);
    let value=normalizeTree(rawValue,depth+1);
    if(isMarket(key))value=normalizeMarket(key,value);
    if(value!==rawValue){out[rawKey]=value;changed=true}
    if(key!==rawKey&&isMarket(key)){
      if(!(key in out))out[key]=value;
      else if(plain(out[key])&&plain(value))out[key]={...value,...out[key]};
      changed=true;
    }
  }
  return changed?out:node;
}
function normalizeFixture(fixture){
  if(!plain(fixture))return fixture;
  let raw=fixture.providerOdds,changed=false;
  if(Array.isArray(raw)){raw={bookmakers:raw};changed=true}
  if(!plain(raw))return changed?{...fixture,providerOdds:raw}:fixture;
  const providerOdds=normalizeTree(raw);
  return changed||providerOdds!==raw?{...fixture,providerOdds}:fixture;
}
function hasUsableOdds(node,depth=0){
  if(depth>12||node===null||node===undefined)return false;
  if(Array.isArray(node))return node.some(v=>hasUsableOdds(v,depth+1));
  if(!plain(node))return false;
  for(const [key,value] of Object.entries(node)){
    if(PRICE_KEYS.has(norm(key))&&scalar(value))return true;
    if(hasUsableOdds(value,depth+1))return true;
  }
  return false;
}
function readHeld(){
  const out=new Map(),now=Date.now();
  try{
    const rows=JSON.parse(localStorage.getItem(HOLD_KEY)||'[]');
    if(!Array.isArray(rows))return out;
    for(const row of rows){
      if(!row||typeof row!=='object'||!row.key||!hasUsableOdds(row.providerOdds))continue;
      const savedAt=Number(row.savedAt||0);
      if(!savedAt||now-savedAt>HOLD_TTL_MS)continue;
      out.set(String(row.key),row);
    }
  }catch{}
  return out;
}
const held=readHeld();
function persistHeld(){
  try{
    const rows=[...held.entries()].map(([key,row])=>({key,...row})).sort((a,b)=>Number(b.savedAt||0)-Number(a.savedAt||0)).slice(0,HOLD_LIMIT);
    localStorage.setItem(HOLD_KEY,JSON.stringify(rows));
  }catch{}
}
function holdLastGoodFixture(fixture){
  const next=normalizeFixture(fixture);
  if(!plain(next))return next;
  const key=fixtureKey(next),incoming=next.providerOdds,valid=hasUsableOdds(incoming),previous=held.get(key);
  if(valid){
    held.set(key,{providerOdds:incoming,providerOddsUpdatedAt:next.providerOddsUpdatedAt??null,providerOddsFreshAt:next.providerOddsFreshAt??null,savedAt:Date.now()});
    return next;
  }
  if(!previous||!hasUsableOdds(previous.providerOdds))return next;
  return {...next,providerOdds:previous.providerOdds,providerOddsUpdatedAt:previous.providerOddsUpdatedAt??next.providerOddsUpdatedAt,providerOddsFreshAt:previous.providerOddsFreshAt??next.providerOddsFreshAt,providerOddsHeld:true};
}
function normalizeBoard(payload){
  if(!plain(payload)||!Array.isArray(payload.fixtures))return payload;
  let changed=false,cacheChanged=false;
  const before=[...held.values()].reduce((n,row)=>n+Number(row?.savedAt||0),0);
  const fixtures=payload.fixtures.map(f=>{const next=holdLastGoodFixture(f);if(next!==f)changed=true;return next});
  const after=[...held.values()].reduce((n,row)=>n+Number(row?.savedAt||0),0);
  cacheChanged=after!==before;
  if(cacheChanged)persistHeld();
  return changed?{...payload,fixtures}:payload;
}
function isBoardRequest(input){try{const raw=typeof input==='string'?input:input?.url;if(!raw)return false;return new URL(raw,window.location.href).pathname===BOARD_PATH}catch{return false}}
async function compatFetch(input,init){
  const response=await nativeFetch(input,init);
  if(!isBoardRequest(input)||!response.ok)return response;
  const text=await response.text();let payload=null;
  try{payload=JSON.parse(text)}catch{return new Response(text,{status:response.status,statusText:response.statusText,headers:response.headers})}
  const normalized=normalizeBoard(payload),headers=new Headers(response.headers);
  headers.delete('content-length');headers.delete('content-encoding');headers.delete('etag');
  return new Response(JSON.stringify(normalized),{status:response.status,statusText:response.statusText,headers});
}
window.fetch=compatFetch;
window.NOMAD343_BULK_ODDS_COMPAT={version:VERSION,networkRequestsAdded:0,holdMode:'LAST_GOOD_UNTIL_VALID_BULK',holdTtlMs:HOLD_TTL_MS,holdLimit:HOLD_LIMIT,heldEntries:()=>held.size,canonicalMarketKey,normalizeMarket,normalizeFixture,normalizeBoard};
})();
