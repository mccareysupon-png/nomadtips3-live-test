(()=>{
'use strict';
const VERSION='343-bulk-odds-compat-v3-market-alias-safe';
const BOARD_PATH='/api/engine/board';
const nativeFetch=window.fetch.bind(window);
const STAGES=new Set(['opening','open','closing','close','inplay','live','current','latest','prematch','pre']);
const norm=v=>String(v??'').toLowerCase().replace(/[^a-z0-9]/g,'');
const plain=v=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const scalar=v=>v!==null&&v!==undefined&&v!==''&&typeof v!=='boolean'&&Number.isFinite(Number(v));

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
function looksPriceObject(v){if(!plain(v))return false;const keys=Object.keys(v).map(norm);return keys.some(k=>['line','hdp','handicap','total','home','homeodds','homeprice','draw','drawodds','drawprice','away','awayodds','awayprice','over','overodds','overprice','under','underodds','underprice','yes','no'].includes(k))}
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
function normalizeBoard(payload){
  if(!plain(payload)||!Array.isArray(payload.fixtures))return payload;
  let changed=false;const fixtures=payload.fixtures.map(f=>{const next=normalizeFixture(f);if(next!==f)changed=true;return next});return changed?{...payload,fixtures}:payload;
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
window.NOMAD343_BULK_ODDS_COMPAT={version:VERSION,networkRequestsAdded:0,canonicalMarketKey,normalizeMarket,normalizeFixture,normalizeBoard};
})();
