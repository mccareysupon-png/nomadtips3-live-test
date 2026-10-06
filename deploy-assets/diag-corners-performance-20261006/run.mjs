const TZ='Europe/London',CUT=6;
const base='https://www.ball46.com';

function parts(ms){
  const o={};
  for(const p of new Intl.DateTimeFormat('en-GB',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ms))){
    if(p.type!=='literal')o[p.type]=p.value;
  }
  return o;
}
function prev(k){const [y,m,d]=k.split('-').map(Number);return new Date(Date.UTC(y,m-1,d)-86400000).toISOString().slice(0,10)}
function sportDay(ms){const p=parts(ms);let k=`${p.year}-${p.month}-${p.day}`;if(Number(p.hour)<CUT)k=prev(k);return k}
function toMs(v){
  if(v==null||v==='')return null;
  if(typeof v==='number'||/^\d+(?:\.\d+)?$/.test(String(v))){
    const n=Number(v);return Number.isFinite(n)?(n>1e12?n:n>1e9?n*1000:null):null
  }
  const n=Date.parse(String(v));return Number.isFinite(n)?n:null
}
function createdStamp(r){for(const k of ['createdAt','created_at']){const n=toMs(r?.[k]);if(n!==null)return n}return null}
function outcome(r){
  const x=String(r?.result??r?.settlement??r?.outcome??'').trim().toUpperCase();
  if(x==='WIN'||x==='HALF_WIN')return'win';
  if(x==='LOSS'||x==='HALF_LOSS')return'loss';
  if(x==='PUSH'||x==='VOID')return'push';
  return null;
}
function isPending(r){return String(r?.status||'').toUpperCase()==='PENDING'}
function market(r){
  const x=String(r?.marketLabel??r?.market??r?.marketType??'').toLowerCase().replace(/[_-]+/g,' ');
  if(/asian|handicap|\bah\b/.test(x))return'AH';
  if(/over\s*\/?\s*under|\bover\b|\bunder\b|o\s*\/?\s*u|goal line|total|corner/.test(x))return'O/U';
  if(/1x2|match result|moneyline/.test(x))return'1X2';
  return null;
}
function rawMarket(r){
  return [r?.marketLabel,r?.market,r?.marketType,r?.providerMarket].filter(v=>v!=null&&String(v).trim()!=='').map(String).join(' | ');
}
function isCorner(r){
  return /corner/i.test(rawMarket(r)) || /corner/i.test(String(r?.selection??'')) || /corner/i.test(String(r?.providerMarket??''));
}
function rowId(r){return String(r?.id??r?.signalId??[r?.fixtureId,r?.market,r?.selection,r?.createdAt].filter(v=>v!==undefined&&v!==null&&v!=='').join('|'))}
function rowOdds(r){const n=Number(r?.odds);return Number.isFinite(n)&&n>1?n:null}
function empty(){return{win:0,loss:0,push:0,pending:0,other:0,rows:0,unique:0,oddsCount:0,markets:{AH:0,'O/U':0,'1X2':0,null:0}}}
function aggregate(rows){
  const b=empty(),seen=new Set();
  for(const r of rows){
    const id=rowId(r);if(id&&seen.has(id))continue;if(id)seen.add(id);
    b.unique++;
    const o=outcome(r);
    if(o)b[o]++; else if(isPending(r))b.pending++; else b.other++;
    const m=market(r);b.markets[m??'null']++;
    if(rowOdds(r)!==null)b.oddsCount++;
  }
  b.rows=rows.length;
  return b;
}

async function get(path){
  const t0=Date.now();
  const r=await fetch(base+path,{cache:'no-store',headers:{'Cache-Control':'no-cache','Accept':'application/json'},signal:AbortSignal.timeout(60000)});
  const text=await r.text();
  if(!r.ok)throw Error(`${path}:${r.status}`);
  return {ms:Date.now()-t0,text,json:JSON.parse(text)};
}

const indexResp=await fetch(base+'/index.html?_=diag'+Date.now(),{cache:'no-store',headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(60000)});
const index=await indexResp.text();

const full=await get('/api/engine/statistics?_='+Date.now());
const rows=Array.isArray(full.json?.rows)?full.json.rows:[];
const tk=sportDay(Date.now()),yk=prev(tk);
const today=rows.filter(r=>{const t=createdStamp(r);return t!==null&&sportDay(t)===tk});
const yesterday=rows.filter(r=>{const t=createdStamp(r);return t!==null&&sportDay(t)===yk});
const todayCorners=today.filter(isCorner),yesterdayCorners=yesterday.filter(isCorner);
const todayNon=today.filter(r=>!isCorner(r)),yesterdayNon=yesterday.filter(r=>!isCorner(r));

const ignoredCornerReasons={missingCreatedAt:0,unrecognizedOutcomeAndNotPending:0,duplicateId:0};
const seenCornerIds=new Set();
for(const r of rows.filter(isCorner)){
  if(createdStamp(r)===null)ignoredCornerReasons.missingCreatedAt++;
  if(!outcome(r)&&!isPending(r))ignoredCornerReasons.unrecognizedOutcomeAndNotPending++;
  const id=rowId(r);if(id&&seenCornerIds.has(id))ignoredCornerReasons.duplicateId++;if(id)seenCornerIds.add(id);
}

function delta(all,non){
  return {
    win:all.win-non.win,
    loss:all.loss-non.loss,
    push:all.push-non.push,
    pending:all.pending-non.pending,
    other:all.other-non.other,
    unique:all.unique-non.unique
  };
}
const aToday=aggregate(today),aYesterday=aggregate(yesterday),aTodayNon=aggregate(todayNon),aYesterdayNon=aggregate(yesterdayNon);
const sample=[...todayCorners,...yesterdayCorners].slice(0,20).map(r=>({
  id:rowId(r),createdAt:r.createdAt??r.created_at,status:r.status,result:r.result??r.settlement??r.outcome,
  marketLabel:r.marketLabel,market:r.market,marketType:r.marketType,providerMarket:r.providerMarket,
  selection:r.selection,line:r.line,odds:r.odds,classifiedMarket:market(r),classifiedOutcome:outcome(r),pending:isPending(r)
}));

const report={
  checkedAt:new Date().toISOString(),
  indexStatus:indexResp.status,
  runtime:{
    hasPerformance:index.includes('b46-daily-performance-runtime'),
    hasFastWindow:index.includes('PERFORMANCE_WINDOW_NOT_COVERED'),
    hasFlatScanner:index.includes('b46-flat-result-cards-runtime')
  },
  statistics:{ms:full.ms,ledgerTotal:full.json?.ledgerTotal,total:full.json?.total,pending:full.json?.pending,rows:rows.length},
  sportDay:{today:tk,yesterday:yk},
  today:{
    all:aToday,
    corners:aggregate(todayCorners),
    nonCorners:aTodayNon,
    cornersContributionToCard:delta(aToday,aTodayNon)
  },
  yesterday:{
    all:aYesterday,
    corners:aggregate(yesterdayCorners),
    nonCorners:aYesterdayNon,
    cornersContributionToCard:delta(aYesterday,aYesterdayNon)
  },
  cornerMapping:{
    mappedToOU_today:todayCorners.filter(r=>market(r)==='O/U').length,
    mappedToOtherMarket_today:todayCorners.filter(r=>market(r)!=='O/U').length,
    mappedToOU_yesterday:yesterdayCorners.filter(r=>market(r)==='O/U').length,
    mappedToOtherMarket_yesterday:yesterdayCorners.filter(r=>market(r)!=='O/U').length
  },
  ignoredCornerReasons,
  samples:sample
};
console.log(JSON.stringify(report,null,2));
