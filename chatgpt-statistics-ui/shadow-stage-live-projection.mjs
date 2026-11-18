// STAGING ONLY. Seed once; apply accepted Book changes, never recalculate full history on read.
import {marketGroup,MARKET_GROUPS} from './market-groups-stage.mjs';
const K=['all',...MARKET_GROUPS],R=['WIN','LOSS','HALF_WIN','HALF_LOSS','PUSH'];
const day=t=>new Date(Number(t)+7*3600000).toISOString().slice(0,10);
const id=r=>String(r?.id??r?.signal_id??'');
const group=r=>marketGroup(r.market??r.market_type);
const t=r=>Number(r.settledAt??r.settled_at);
const num=v=>v==null||v===''||typeof v==='boolean'||!Number.isFinite(Number(v))?null:Number(v);
const cmp=(a,b)=>t(a)-t(b)||Number(b.createdAt)-Number(a.createdAt)||a._rank-b._rank;
const fresh=()=>({counts:Object.fromEntries(R.map(k=>[k,0])),rows:0,priced:0,net:0,peak:0,trough:0,dd:0,best:0,oddsSum:0,oddsN:0,first:0,lastRate:0,lastPriced:0});
function oneDay(rows){
 const d=fresh();
 for(const r of [...rows.values()].sort(cmp)){
  const o=r.result;if(!R.includes(o))throw Error('BAD_RESULT');
  const ts=t(r),odds=num(r.odds);d.first||=ts;d.lastRate=ts;d.counts[o]++;d.rows++;
  if(odds!==null&&odds>1){d.oddsN++;d.oddsSum+=odds}
  let p=o==='LOSS'?-1:o==='HALF_LOSS'?-.5:o==='PUSH'?0:odds!==null&&odds>1?(odds-1)*(o==='HALF_WIN'?.5:1):null;
  if(p===null)continue;
  d.priced++;d.net+=p;d.lastPriced=ts;d.peak=Math.max(d.peak,d.net);d.trough=Math.min(d.trough,d.net);d.dd=Math.max(d.dd,d.peak-d.net);d.best=Math.max(d.best,d.net-d.trough);
 }
 return d;
}
function fold(days,at){
 const counts=Object.fromEntries(R.map(k=>[k,0])),series={units:[],roi:[],rate:[]};
 let net=0,peak=0,trough=0,maxDD=0,bestRun=0,priced=0,oddsSum=0,oddsN=0,rows=0,first=null,last=null;
 for(const [k,d] of [...days].sort(([a],[b])=>a.localeCompare(b))){
  if(!d.rows)continue;
  first??=k;last=k;
  for(const r of R)counts[r]+=d.counts[r];
  rows+=d.rows;oddsSum+=d.oddsSum;oddsN+=d.oddsN;
  if(d.priced){
   maxDD=Math.max(maxDD,d.dd,peak-(net+d.trough));bestRun=Math.max(bestRun,d.best,net+d.peak-trough);
   peak=Math.max(peak,net+d.peak);trough=Math.min(trough,net+d.trough);net+=d.net;priced+=d.priced;
   series.units.push({date:d.lastPriced,value:net});series.roi.push({date:d.lastPriced,value:net/priced*100});
  }
  const wl=counts.WIN+counts.HALF_WIN+counts.LOSS+counts.HALF_LOSS;
  series.rate.push({date:d.lastRate,value:wl?(counts.WIN+counts.HALF_WIN*.5)/wl*100:0});
 }
 const wins=counts.WIN+counts.HALF_WIN,losses=counts.LOSS+counts.HALF_LOSS,pushes=counts.PUSH;
 return {schema:1,ok:true,asOf:at,source:'STAGING_INCREMENTAL_BOOK',counts,win_rate:wins+losses?wins/(wins+losses)*100:0,summary:{rows,wins,losses,pushes,priced,net,stake:priced,roi:priced?net/priced*100:null,avgOdds:oddsN?oddsSum/oddsN:null,settledDays:first?Math.round((Date.parse(last)-Date.parse(first))/86400000)+1:null,maxDD,peak,bestRun},series};
}
const publicRow=r=>{const {_rank,...v}=r;return v};
const normalize=(r,rank)=>({...r,id:id(r),market:String(r.market??r.market_type??''),settledAt:t(r),_rank:rank});
const rowOrder=(a,b)=>Number(b.createdAt)-Number(a.createdAt)||a._rank-b._rank;
function insertSorted(a,r){let l=0,h=a.length;while(l<h){const m=(l+h)>>1;if(rowOrder(a[m],r)<=0)l=m+1;else h=m}a.splice(l,0,r)}
export function createProjection(raw,{sequence=0,at=Date.now()}={}){
 const records=new Map(),unsettled=new Map(),archive=[],marketArchives=new Map(MARKET_GROUPS.map(k=>[k,[]])),buckets=new Map(K.map(k=>[k,new Map()])),days=new Map(K.map(k=>[k,new Map()])),graphs=new Map;
 let rank=0,seq=sequence,generation=1,lastAt=at,ready=true,work={rows:0,buckets:0};
 const addBucket=(r,dirty,remove=false)=>{
  const d=day(t(r));for(const key of ['all',group(r)]){
   const bs=buckets.get(key);if(!bs.has(d))bs.set(d,new Map);
   const b=bs.get(d);if(remove)b.delete(id(r));else b.set(id(r),r);
   dirty.add(key+'|'+d);
  }
 };
 const recalc=dirty=>{
  const touched=new Set;let scanned=0;
  for(const token of dirty){const [k,d]=token.split('|'),b=buckets.get(k).get(d);scanned+=b.size;
   if(b.size)days.get(k).set(d,oneDay(b));else{days.get(k).delete(d);buckets.get(k).delete(d)}
   touched.add(k);
  }
  for(const key of touched)graphs.set(key,fold(days.get(key),lastAt));
  work={rows:scanned,buckets:dirty.size};
 };
 const dirty=new Set;
 for(const rawRow of raw){
  const r=normalize(rawRow,rank++);if(!r.id||records.has(r.id))throw Error('DUPLICATE_BASELINE_ID');records.set(r.id,r);
  if(r.status==='SETTLED'){if(!Number.isSafeInteger(r.settledAt)||r.settledAt<=0)throw Error('BAD_SETTLED_AT');archive.push(r);marketArchives.get(group(r)).push(r);addBucket(r,dirty)}
  else if(['PENDING','UNRESOLVED'].includes(r.status))unsettled.set(r.id,r);else throw Error('UNKNOWN_STATUS');
 }
 archive.sort(rowOrder);for(const a of marketArchives.values())a.sort(rowOrder);recalc(dirty);
 for(const k of K)if(!graphs.has(k))graphs.set(k,fold(days.get(k),lastAt));
 function apply(event,metadata){
  if(!ready)throw Error('PROJECTION_NOT_READY');if(event.seq<=seq)return {duplicate:true,seq};
  if(event.seq!==seq+1){ready=false;throw Error('BOOK_SEQUENCE_GAP')}
  const next=event.next,prior=event.previous??null,k=id(next),old=records.get(k);
  if(!k||!R.includes(next.result)||!Number.isSafeInteger(t(next))||t(next)<=0||!next.market_type)throw Error('INVALID_BOOK_EVENT');
  // Require source metadata for new rows. Existing verified metadata is retained on correction.
  const base=metadata??old;
  if(!base||id(base)!==k||!Number.isFinite(Number(base.createdAt)))throw Error('MISSING_MATCH_METADATA');
  if(old?.status==='SETTLED'&&(!prior||id(prior)!==k||t(prior)!==t(old)||prior.result!==old.result||String(prior.market_type)!==old.market||num(prior.odds)!==num(old.odds)))throw Error('BOOK_PREVIOUS_REVISION_MISMATCH');
  if(old?.status!=='SETTLED'&&prior)throw Error('MISSING_PRIOR_SETTLEMENT');
  if(prior&&t(next)<=t(prior))throw Error('STALE_BOOK_REVISION');
  const r=normalize({...base,id:k,status:'SETTLED',result:next.result,market:next.market_type,odds:next.odds,settledAt:t(next)},old?._rank??rank++);
  const changes=new Set;
  if(old?.status==='SETTLED'){addBucket(old,changes,true);const i=archive.indexOf(old);if(i<0)throw Error('ARCHIVE_INDEX_DRIFT');archive.splice(i,1);const a=marketArchives.get(group(old)),j=a.indexOf(old);if(j<0)throw Error('MARKET_ARCHIVE_INDEX_DRIFT');a.splice(j,1)}
  unsettled.delete(k);records.set(k,r);insertSorted(archive,r);insertSorted(marketArchives.get(group(r)),r);addBucket(r,changes);seq=event.seq;generation++;lastAt=Math.max(lastAt,Number(event.at)||Date.now());recalc(changes);
  return {seq,generation,...work};
 }
 // A pending generation is accepted only after complete upstream IDs/counts are verified.
 // This updates only active metadata; it does not run graph accounting.
 function refreshPending({rows,pending,unresolved=0,verifiedAt}){
  if(!ready||!Array.isArray(rows)||!Number.isSafeInteger(verifiedAt)||verifiedAt<lastAt||rows.length!==pending+unresolved)throw Error('INVALID_PENDING_GENERATION');
  const seen=new Set(),incoming=new Map;
  for(const v of rows){const k=id(v);if(!k||seen.has(k)||!['PENDING','UNRESOLVED'].includes(v.status)||!Number.isFinite(Number(v.createdAt))||records.get(k)?.status==='SETTLED')throw Error('PENDING_GENERATION_CONFLICT');seen.add(k);incoming.set(k,normalize(v,records.get(k)?._rank??rank++))}
  if([...incoming.values()].filter(r=>r.status==='PENDING').length!==pending)throw Error('PENDING_COUNT_MISMATCH');
  for(const k of unsettled.keys())if(!incoming.has(k))records.delete(k);
  unsettled.clear();for(const [k,r] of incoming){unsettled.set(k,r);records.set(k,r)}
  generation++;lastAt=verifiedAt;
 }
 const readGraph=(k='all')=>{if(!ready||!graphs.has(k))throw Error('GRAPH_NOT_READY');return {...graphs.get(k),asOf:lastAt,generation,sequence:seq}};
 function pendingPage({market='all',offset=0,limit=50}={}){if(!ready||!K.includes(market)||!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)throw Error('BAD_PAGE');const all=[...unsettled.values()].filter(r=>market==='all'||group(r)===market).sort(rowOrder);return {generation,total:all.length,pending:all.filter(r=>r.status==='PENDING').length,unresolved:all.filter(r=>r.status==='UNRESOLVED').length,rows:all.slice(offset,offset+limit).map(publicRow),next:offset+limit<all.length?offset+limit:null}}
 function historyPage({market='all',offset=0,limit=50,expectedGeneration=generation}={}){if(!ready||expectedGeneration!==generation||!K.includes(market)||!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)throw Error('HISTORY_GENERATION_OR_PAGE');const selected=market==='all'?archive:marketArchives.get(market);return {generation,total:selected.length,rows:selected.slice(offset,offset+limit).map(publicRow),next:offset+limit<selected.length?offset+limit:null}}
 return {apply,refreshPending,readGraph,pendingPage,historyPage,detail:k=>records.has(k)?publicRow(records.get(k)):null,status:()=>({ready,sequence:seq,generation,asOf:lastAt,work,records:records.size})};
}
// Future Book transaction hook: accepted revision + outbox in SAME transaction.
// No effect unless explicitly called by the isolated candidate; never migrate or write Production here.
export async function stageJournalAccepted(tx,previous,next,at=Date.now()){
 const key='stage:projection:sequence',seq=(await tx.get(key)??0)+1;
 if(!Number.isSafeInteger(seq))throw Error('SEQUENCE_OVERFLOW');
 await tx.put('stage:projection:event:'+String(seq).padStart(16,'0'),{seq,previous:previous??null,next,at});
 await tx.put(key,seq);return seq;
}
