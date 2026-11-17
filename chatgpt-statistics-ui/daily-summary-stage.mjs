// STAGING only. Materialize the existing HOME Daily Performance source once
// from an already-verified Ledger. Browser reads this small summary, not rows.
// Formula copied from current production index.js B46_DAILY_PERFORMANCE_20261005.
const TZ='Europe/London',CUT=6;
function parts(ms){const o={};for(const p of new Intl.DateTimeFormat('en-GB',
  {timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'})
  .formatToParts(new Date(ms)))if(p.type!=='literal')o[p.type]=p.value;return o}
function prev(k){const [y,m,d]=k.split('-').map(Number);return new Date(Date.UTC(y,m-1,d)-86400000).toISOString().slice(0,10)}
export function sportDay(ms){const p=parts(ms);let k=[p.year,p.month,p.day].join('-');if(Number(p.hour)<CUT)k=prev(k);return k}
function asMs(v){if(v==null||v==='')return null;if(typeof v==='number'||/^\d+(?:\.\d+)?$/.test(String(v))){
 const n=Number(v);return Number.isFinite(n)?(n>1e12?n:n>1e9?n*1000:null):null}
 const n=Date.parse(String(v));return Number.isFinite(n)?n:null}
function createdStamp(r){for(const k of ['createdAt','created_at']){const n=asMs(r?.[k]);if(n!==null)return n}return null}
function outcome(r){const x=String(r?.result??r?.settlement??r?.outcome??'').trim().toUpperCase();
 if(x==='WIN'||x==='HALF_WIN')return'win';
 if(x==='LOSS'||x==='HALF_LOSS')return'loss';
 if(x==='PUSH'||x==='VOID')return'push';return null}
function rowId(r){return String(r?.id??r?.signalId??[r?.fixtureId,r?.market,r?.selection,r?.createdAt].filter(v=>v!==undefined&&v!==null&&v!=='').join('|'))}
function rowOdds(r){const n=Number(r?.odds);return Number.isFinite(n)&&n>1?n:null}
function bucket(){return{win:0,loss:0,push:0,pending:0,oddsSum:0,oddsCount:0}}
function addOdds(b,r){const n=rowOdds(r);if(n===null)return;b.oddsSum+=n;b.oddsCount++}
function addSettled(b,r,o){b[o]++;addOdds(b,r)}
function isPending(r){return String(r?.status||'').toUpperCase()==='PENDING'}
export function createDailySummary(rows,asOf){
 if(!Array.isArray(rows)||!Number.isFinite(asOf)||asOf<=0)throw Error('DAILY_BOOTSTRAP_REQUIRES_VERIFIED_ROWS');
 const tk=sportDay(asOf),yk=prev(tk),today=bucket(),yesterday=bucket(),seen=new Set();
 for(const r of rows){
  const id=rowId(r);if(id&&seen.has(id))continue;if(id)seen.add(id);
  const t=createdStamp(r);if(t===null)continue;
  const k=sportDay(t);if(k!==tk&&k!==yk)continue;
  const o=outcome(r);
  if(k===tk){if(o)addSettled(today,r,o);else if(isPending(r)){today.pending++;addOdds(today,r)}}
  else if(o)addSettled(yesterday,r,o);
 }
 return{source:'ORIGINAL_LONDON_06H_CREATED_AT',schema:1,asOf,tk,yk,today,yesterday};
}
export function renderableDaily(summary,clock=Date.now()){
 if(summary?.schema!==1||summary.source!=='ORIGINAL_LONDON_06H_CREATED_AT'||
  !Number.isFinite(summary.asOf)||sportDay(clock)!==summary.tk||
  summary.yk!==prev(summary.tk))return false;
 for(const day of ['today','yesterday']){
  const x=summary[day];
  if(!x||['win','loss','push','pending','oddsCount'].some(k=>!Number.isSafeInteger(x[k])||x[k]<0)||
    !Number.isFinite(x.oddsSum)||x.oddsSum<0)return false;
 }
 return true;
}