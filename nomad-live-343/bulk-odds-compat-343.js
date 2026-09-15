(()=>{
'use strict';
const VERSION='343-bulk-odds-compat-v1-scalar-object';
const BOARD_PATH='/api/engine/board';
const nativeFetch=window.fetch.bind(window);
const LINE_MARKETS=new Set([
  'asianhandicap','asian','goalline','goal','totalgoals','goalsoverunder',
  'cornerline','corner','corners','cornerasian','cornerhandicap',
  'cardline','cardsline','cards','cardasian','cardsasian','cardhandicap',
  'asianhandicaphalf','asianhalf','halfasianhandicap','1hasianhandicap',
  'goallinehalf','halfgoalline','1hgoalline','cornerlinehalf','cornerhalf','halfcornerline','1hcornerline',
  'cornerasianhalf','halfcornerasian','1hcornerasian'
]);
const STAGES=new Set(['opening','open','closing','close','inplay','live','current','latest','prematch','pre']);
const norm=v=>String(v??'').toLowerCase().replace(/[^a-z0-9]/g,'');
const plain=v=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const scalarLine=v=>v!==null&&v!==undefined&&v!==''&&typeof v!=='boolean'&&Number.isFinite(Number(v));
const lineObject=v=>({line:Number(v)});
function normalizeMarket(value){
  if(!plain(value))return value;
  let changed=false;
  const out={...value};
  for(const [key,row] of Object.entries(value)){
    if(!STAGES.has(norm(key))||!scalarLine(row))continue;
    out[key]=lineObject(row);
    changed=true;
  }
  return changed?out:value;
}
function normalizeTree(node,depth=0){
  if(depth>10||node===null||node===undefined)return node;
  if(Array.isArray(node)){
    let changed=false;
    const out=node.map(row=>{const next=normalizeTree(row,depth+1);if(next!==row)changed=true;return next});
    return changed?out:node;
  }
  if(!plain(node))return node;
  let changed=false;
  const out={...node};
  for(const [key,value] of Object.entries(node)){
    let next=value;
    if(LINE_MARKETS.has(norm(key)))next=normalizeMarket(value);
    if(next===value&&(plain(value)||Array.isArray(value)))next=normalizeTree(value,depth+1);
    if(next!==value){out[key]=next;changed=true}
  }
  return changed?out:node;
}
function normalizeFixture(fixture){
  if(!plain(fixture)||!plain(fixture.providerOdds))return fixture;
  const providerOdds=normalizeTree(fixture.providerOdds);
  return providerOdds===fixture.providerOdds?fixture:{...fixture,providerOdds};
}
function normalizeBoard(payload){
  if(!plain(payload)||!Array.isArray(payload.fixtures))return payload;
  let changed=false;
  const fixtures=payload.fixtures.map(f=>{const next=normalizeFixture(f);if(next!==f)changed=true;return next});
  return changed?{...payload,fixtures}:payload;
}
function isBoardRequest(input){
  try{
    const raw=typeof input==='string'?input:input?.url;
    if(!raw)return false;
    const u=new URL(raw,window.location.href);
    return u.pathname===BOARD_PATH;
  }catch{return false}
}
async function compatFetch(input,init){
  const response=await nativeFetch(input,init);
  if(!isBoardRequest(input)||!response.ok)return response;
  const text=await response.text();
  let payload=null;
  try{payload=JSON.parse(text)}catch{return new Response(text,{status:response.status,statusText:response.statusText,headers:response.headers})}
  const normalized=normalizeBoard(payload);
  const headers=new Headers(response.headers);
  headers.delete('content-length');headers.delete('content-encoding');headers.delete('etag');
  return new Response(JSON.stringify(normalized),{status:response.status,statusText:response.statusText,headers});
}
window.fetch=compatFetch;
window.NOMAD343_BULK_ODDS_COMPAT={version:VERSION,networkRequestsAdded:0,normalizeMarket,normalizeFixture,normalizeBoard};
})();
