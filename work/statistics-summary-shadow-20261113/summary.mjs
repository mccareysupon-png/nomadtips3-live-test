// Isolated shadow projection. No fetch, routes, alarms, bindings or Engine hooks.
// Storage must implement Durable Object get/put/transaction; never pass Production storage.
const PREFIX = 'b46:statistics:shadow:v1:';
const COUNTERS = ['ledgerTotal','settledTotal','pending','unresolved','win','loss','push','halfWin','halfLoss','oddsCount','oddsSum','net','stake','priced'];
const RESULTS = {WIN:'win',LOSS:'loss',PUSH:'push',HALF_WIN:'halfWin',HALF_LOSS:'halfLoss'};
const formatter = new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'});
function check(ok, message) { if (!ok) throw new Error(message); }
function timestamp(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' || /^\d+(?:\.\d+)?$/.test(String(value)) ? Number(value) : Date.parse(String(value));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n < 1e12 ? n * 1000 : n;
}
export function londonDay(value) {
  const ms = timestamp(value); if (ms === null) return null;
  const p = Object.fromEntries(formatter.formatToParts(new Date(ms)).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  const day = `${p.year}-${p.month}-${p.day}`;
  return Number(p.hour) < 6 ? new Date(Date.parse(day+'T00:00:00Z')-86400000).toISOString().slice(0,10) : day;
}
function blank() { return Object.fromEntries(COUNTERS.map(k=>[k,0])); }
export function unitSettlement(row) {
  const result=String(row.result||'').toUpperCase(), odds=Number(row.odds);
  if(result==='PUSH'||result==='VOID')return {profit:0,stake:1,priced:true};
  if(result==='LOSS')return {profit:-1,stake:1,priced:true};
  if(result==='HALF_LOSS')return {profit:-0.5,stake:1,priced:true};
  if((result==='WIN'||result==='HALF_WIN')&&Number.isFinite(odds)&&odds>1)return {profit:(odds-1)*(result==='HALF_WIN'?0.5:1),stake:1,priced:true};
  return {profit:null,stake:0,priced:false};
}
function contribution(row) {
  if (row === null) return null;
  check(row && typeof row.id === 'string' && row.id.length > 0,'ROW_ID_REQUIRED');
  const c = blank(), status = String(row.status || '').toUpperCase();
  c.ledgerTotal = 1;
  if (status === 'PENDING') c.pending = 1;
  if (status === 'UNRESOLVED') c.unresolved = 1;
  if (status === 'SETTLED') { c.settledTotal = 1; const field = RESULTS[String(row.result || '').toUpperCase()]; if(field)c[field]=1; }
  const odds = Number(row.odds);
  if (status === 'SETTLED' && Number.isFinite(odds) && odds > 1) { c.oddsCount=1; c.oddsSum=odds; }
  if(status==='SETTLED') { const s=unitSettlement(row);if(s.priced){c.net=s.profit;c.stake=s.stake;c.priced=1;} }
  const market = String(row.market || 'unknown');
  check(market.length <= 100,'MARKET_TOO_LONG');
  const settledMs=status==='SETTLED'?timestamp(row.settledAt??row.createdAt):null;
  const settledDay=settledMs===null?null:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(settledMs));
  return {market,createdDay:londonDay(row.createdAt),settledDay,c};
}
function cells(part) {
  if (!part) return [];
  const keys = ['all', 'market/'+encodeURIComponent(part.market)];
  if(part.createdDay) keys.push('created-day/'+part.createdDay,'created-day/'+part.createdDay+'/market/'+encodeURIComponent(part.market));
  if(part.settledDay) keys.push('settled-day/'+part.settledDay,'settled-day/'+part.settledDay+'/market/'+encodeURIComponent(part.market));
  return keys;
}
function add(cell, values, sign) {
  for(const k of COUNTERS) {
    const value = cell[k]+sign*values[k];
    check(Number.isFinite(value) && (k==='net'||value >= -1e-8),'SUMMARY_UNDERFLOW_'+k);
    cell[k] = Math.abs(value)<1e-8 ? 0 : value;
  }
  return cell;
}
function view(c) {
  const denominator=c.win+c.loss+c.halfWin+c.halfLoss;
  return {...c,winRate:denominator?Math.round((c.win+0.5*c.halfWin)/denominator*1000)/10:null,avgOdds:c.oddsCount?c.oddsSum/c.oddsCount:null,roi:c.stake?c.net/c.stake*100:null};
}
export class ShadowSummary {
  constructor(storage, epoch) {
    check(/^[a-zA-Z0-9-]{1,80}$/.test(epoch),'INVALID_EPOCH');
    this.storage=storage; this.prefix=PREFIX+epoch+':';
  }
  async initialize(source) {
    check(source && source.engineVersion && source.engineSha,'SOURCE_REQUIRED');
    return this.storage.transaction(async txn=>{
      check(!await txn.get(this.prefix+'manifest'),'EPOCH_EXISTS');
      await txn.put(this.prefix+'manifest',{schema:1,state:'BUILDING',source,changes:0,updatedAt:0});
    });
  }
  // revision is a serialized source sequence, NOT Date.now or settledAt.
  // Every accepted change invalidates the parity gate until re-audited.
  async apply({id, revision, row}) {
    check(typeof id==='string' && id.length>0 && id.length<=256,'ID_REQUIRED');
    check(Number.isSafeInteger(revision) && revision>0,'REVISION_REQUIRED');
    check(row===null || row?.id===id,'ID_MISMATCH');
    const next=contribution(row), key=this.prefix+'row/'+encodeURIComponent(id);
    return this.storage.transaction(async txn=>{
      const manifest=await txn.get(this.prefix+'manifest'); check(manifest,'NOT_INITIALIZED');
      const old=await txn.get(key);
      if(old && revision===old.revision) {
        check(JSON.stringify(next)===JSON.stringify(old.part),'CONFLICTING_REPLAY');
        return {state:'DUPLICATE'};
      }
      check(!old || revision>old.revision,'OUT_OF_ORDER');
      const keys=new Set([...cells(old?.part),...cells(next)]);
      const writes={};
      for(const cell of keys) {
        const sk=this.prefix+'cell/'+cell, value=await txn.get(sk)||blank();
        if(cells(old?.part).includes(cell))add(value,old.part.c,-1);
        if(cells(next).includes(cell))add(value,next.c,1);
        writes[sk]=value;
      }
      writes[key]={revision,part:next}; // Tombstone prevents old events resurrecting a deleted row.
      writes[this.prefix+'manifest']={...manifest,state:'BUILDING',changes:manifest.changes+1,updatedAt:Date.now()};
      await txn.put(writes);
      return {state:'APPLIED',cells:keys.size};
    });
  }
  async audit(expected) {
    return this.storage.transaction(async txn=>{
      const manifest=await txn.get(this.prefix+'manifest'); check(manifest,'NOT_INITIALIZED');
      const total=await txn.get(this.prefix+'cell/all')||blank();
      const mismatches=[];
      for(const k of COUNTERS.slice(0,9)) if(total[k]!==expected[k])mismatches.push(k);
      check(expected.complete===true && expected.sourceGeneration,'COMPLETE_SOURCE_REQUIRED');
      check(manifest.source.generation===expected.sourceGeneration,'SOURCE_GENERATION_CHANGED');
      await txn.put(this.prefix+'manifest',{...manifest,state:mismatches.length?'MISMATCH':'COUNTS_VERIFIED',audit:{at:Date.now(),generation:expected.sourceGeneration,mismatches}});
      return {ok:mismatches.length===0,mismatches};
    });
  }
  async read(scope='all') {
    check(scope==='all'||/^market\/[^/]{1,300}$/.test(scope)||/^(created|settled)-day\/\d{4}-\d{2}-\d{2}(\/market\/[^/]{1,300})?$/.test(scope),'INVALID_SCOPE');
    return this.storage.transaction(async txn=>{
      const manifest=await txn.get(this.prefix+'manifest'); check(manifest,'NOT_INITIALIZED');
      const c=await txn.get(this.prefix+'cell/'+scope)||blank();
      return {mode:'SHADOW_ONLY',productionReady:false,countsVerified:manifest.state==='COUNTS_VERIFIED',source:manifest.source,updatedAt:manifest.updatedAt,summary:view(c)};
    });
  }
}
// The adapter must provide pages from a stable snapshot AND catch-up changes from
// the same serialized writer. On drift discard this epoch, never publish partial data.
export async function backfill(shadow, pages) {
  let rows=0,maxPageRows=0;
  for await(const page of pages) {
    check(Array.isArray(page)&&page.length<=500,'PAGE_BOUND_EXCEEDED');
    maxPageRows=Math.max(maxPageRows,page.length);
    for(const change of page){const result=await shadow.apply(change);check(result.state==='APPLIED','DUPLICATE_BACKFILL_ROW');rows++;}
  }
  return {rows,maxPageRows};
}
