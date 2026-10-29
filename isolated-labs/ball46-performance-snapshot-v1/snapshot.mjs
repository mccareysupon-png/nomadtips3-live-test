/*
 * BALL46 Performance Snapshot V1 — isolated pure computation, NOT installed in Production.
 * Source: existing /api/engine/statistics ledger; never contacts 5USD or changes settlements.
 * London calendar cutoff intentionally mirrors verified Production runtime (06:00).
 * CI verifies exact parity with Production card's aggregate/rate/avgOdds using the same rows.
 */
export const SNAPSHOT_SCHEMA = 'ball46-performance-snapshot-v1';
export const DEFAULT_TZ = 'Europe/London';
export const DEFAULT_CUT = 6;
const periods = ['today', 'yesterday'];
const trackedMarkets = ['AH', 'O/U', '1X2'];

function parts(ms, timezone) {
  const obj = {};
  const items = new Intl.DateTimeFormat('en-GB', {
    timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',hourCycle:'h23'
  }).formatToParts(new Date(ms));
  for (const p of items) if (p.type !== 'literal') obj[p.type] = p.value;
  return obj;
}
export function previousDay(key) {
  const [y,m,d]=key.split('-').map(Number);
  return new Date(Date.UTC(y,m-1,d)-86400000).toISOString().slice(0,10);
}
export function londonSportDay(timestamp, {timezone=DEFAULT_TZ,cut=DEFAULT_CUT}={}) {
  const p=parts(timestamp,timezone);
  const calendarDay = p.year+'-'+p.month+'-'+p.day;
  return Number(p.hour)<cut ? previousDay(calendarDay) : calendarDay;
}
function timestamp(v) {
  if(v===null||v===undefined||v==='')return null;
  if(typeof v==='number'||/^\d+(?:\.\d+)?$/.test(String(v))){
    const n=Number(v);
    return Number.isFinite(n) ? (n>1e12?n:n>1e9?n*1000:null) : null;
  }
  const n=Date.parse(String(v));return Number.isFinite(n)?n:null;
}
function createdStamp(row) {
  for(const key of ['createdAt','created_at']){
    const value=timestamp(row?.[key]);if(value!==null)return value;
  }
  return null;
}
function rowId(row) {
  return String(row?.id??row?.signalId??[row?.fixtureId,row?.market,row?.selection,row?.createdAt]
    .filter(v=>v!==undefined&&v!==null&&v!=='').join('|'));
}
function rowOutcome(row) {
  const x=String(row?.result??row?.settlement??row?.outcome??'').trim().toUpperCase();
  if(x==='WIN'||x==='HALF_WIN')return'win';
  if(x==='LOSS'||x==='HALF_LOSS')return'loss';
  if(x==='PUSH'||x==='VOID')return'push';
  return null;
}
function isPending(row) {
  return String(row?.status||'').toUpperCase()==='PENDING';
}
function market(row) {
  const x=String(row?.marketLabel??row?.market??row?.marketType??'')
    .toLowerCase().replace(/[_-]+/g,' ');
  if(/asian|handicap|\bah\b/.test(x))return'AH';
  if(/over\s*\/?\s*under|\bover\b|\bunder\b|o\s*\/?\s*u|goal line|total|corner/.test(x))return'O/U';
  if(/1x2|match result|moneyline/.test(x))return'1X2';
  return null;
}
function rowOdds(row) {
  const n=Number(row?.odds);
  return Number.isFinite(n)&&n>1?n:null;
}
function emptyBucket() {
  return {win:0,loss:0,push:0,pending:0,oddsSum:0,oddsCount:0,
    markets:{'AH':{win:0,loss:0,push:0},'O/U':{win:0,loss:0,push:0},'1X2':{win:0,loss:0,push:0}}};
}
function addOdds(b,row) {
  const n=rowOdds(row);if(n===null)return;
  b.oddsSum+=n;b.oddsCount++;
}
function addSettled(b,row,outcome) {
  b[outcome]++;addOdds(b,row);
  const m=market(row);
  if(m)b.markets[m][outcome]++;
}
function rate(b) {
  const denominator=b.win+b.loss;
  return denominator ? (b.win/denominator*100).toFixed(1).replace(/\.0$/,'')+'%' : '—';
}
function averageOdds(b) {
  return b.oddsCount?(b.oddsSum/b.oddsCount).toFixed(2):'—';
}
function publicBucket(b) {
  return {win:b.win,loss:b.loss,push:b.push,pending:b.pending,
    totalPicks:b.win+b.loss+b.push+b.pending,
    winRate:rate(b),avgOdds:averageOdds(b),
    oddsSum:b.oddsSum,oddsCount:b.oddsCount,markets:b.markets};
}
/**
 * No network, secrets, persistent mutations or source effects.
 * Input must be a COMPLETE ledger revision, checked by the caller.
 */
/**
 * Streaming accumulator for Cloudflare Worker memory safety. Each page is
 * reduced to counters immediately; raw rows are never stored inside the store.
 * Same logic and same order as the verified buildDailySnapshot implementation.
 */
export function createDailyAccumulator({asOfMs=Date.now(),timezone=DEFAULT_TZ,cut=DEFAULT_CUT}={}) {
  if(!Number.isFinite(asOfMs))throw Error('SNAPSHOT_INVALID_ASOF');
  if(timezone!==DEFAULT_TZ||cut!==DEFAULT_CUT)throw Error('SNAPSHOT_PRODUCTION_DAY_RULE_DRIFT');
  const todayKey=londonSportDay(asOfMs,{timezone,cut}),yesterdayKey=previousDay(todayKey);
  const today=emptyBucket(),yesterday=emptyBucket(),seen=new Set();
  let ignoredOtherDay=0,ignoredMissingTime=0,duplicates=0,rowsRead=0;
  function append(rows){
    if(!Array.isArray(rows))throw Error('SNAPSHOT_ROWS_NOT_ARRAY');
    for(const r of rows){
      rowsRead++;
      const id=rowId(r);
      if(id&&seen.has(id)){duplicates++;continue}
      if(id)seen.add(id);
      const t=createdStamp(r);
      if(t===null){ignoredMissingTime++;continue}
      const k=londonSportDay(t,{timezone,cut});
      if(k!==todayKey&&k!==yesterdayKey){ignoredOtherDay++;continue}
      const o=rowOutcome(r);
      if(k===todayKey){
        if(o)addSettled(today,r,o);
        else if(isPending(r)){today.pending++;addOdds(today,r)}
      }else if(o)addSettled(yesterday,r,o);
    }
    return rowsRead;
  }
  function finish({ledgerRevision=null,expectedRows=rowsRead}={}){
    if(!Number.isSafeInteger(expectedRows)||rowsRead!==expectedRows)throw Error('LEDGER_INCOMPLETE_ABORT');
    return {
      schema:SNAPSHOT_SCHEMA,
      asOfUtc:new Date(asOfMs).toISOString(),
      londonDay:{timezone,cutHour:cut,today:todayKey,yesterday:yesterdayKey},
      ledger:{rowCount:rowsRead,revision:ledgerRevision},
      today:publicBucket(today),yesterday:publicBucket(yesterday),
      diagnostics:{duplicates,ignoredOtherDay,ignoredMissingTime}
    };
  }
  return {append,finish,get rowCount(){return rowsRead}};
}
export function buildDailySnapshot(rows, options={}) {
  if(!Array.isArray(rows))throw Error('SNAPSHOT_ROWS_NOT_ARRAY');
  const a=createDailyAccumulator(options);
  a.append(rows);
  return a.finish({ledgerRevision:options.ledgerRevision??null,expectedRows:rows.length});
}
export function validateSummary(snapshot) {
  for(const k of periods){
    const b=snapshot[k];
    if(!b||![b.win,b.loss,b.push,b.pending,b.oddsSum,b.oddsCount].every(Number.isFinite))
      throw Error('SNAPSHOT_INVALID_COUNTS_'+k);
    if(b.totalPicks!==b.win+b.loss+b.push+b.pending)throw Error('SNAPSHOT_TOTAL_MISMATCH_'+k);
    if(b.winRate!==rate(b)||b.avgOdds!==averageOdds(b))throw Error('SNAPSHOT_FORMAT_MISMATCH_'+k);
    for(const market of trackedMarkets){
      const m=b.markets?.[market];
      if(!m||![m.win,m.loss,m.push].every(n=>Number.isInteger(n)&&n>=0))
        throw Error('SNAPSHOT_MARKET_COUNT_INVALID_'+k+'_'+market);
    }
  }
  if(snapshot.yesterday.pending!==0)throw Error('SNAPSHOT_YESTERDAY_PENDING');
  return true;
}