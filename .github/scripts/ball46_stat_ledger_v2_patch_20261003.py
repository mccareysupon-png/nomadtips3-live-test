from pathlib import Path
import sys

if len(sys.argv) != 3:
    raise SystemExit('usage: patcher INPUT OUTPUT')

src = Path(sys.argv[1])
out = Path(sys.argv[2])
s = src.read_text()

# Working memory may stay bounded for settled rows, but PENDING/UNRESOLVED signals
# must never be evicted before settlement. The durable statistics ledger below is
# separately unbounded by application code and is the long-term source of truth.
old_cap = 'const capped = signals.slice(-MAX_SIGNALS);'
new_cap = '''const nonSettled = signals.filter((x) => x?.status !== "SETTLED");
      const nonSettledIds = new Set(nonSettled.map((x) => String(x?.id || "")));
      const recentSettled = signals.filter((x) => x?.status === "SETTLED" && !nonSettledIds.has(String(x?.id || ""))).slice(-MAX_SIGNALS);
      const capped = [...recentSettled, ...nonSettled].sort((a, b) => Number(a?.createdAt || 0) - Number(b?.createdAt || 0));'''
if s.count(old_cap) != 1:
    raise SystemExit('BASE_CAP_ANCHOR_COUNT:' + str(s.count(old_cap)))
s = s.replace(old_cap, new_cap, 1)

start = 'var Nomad343Engine2 = class extends Nomad343Engine {'
end = '};\nfunction stub(env) {'
a = s.find(start)
b = s.find(end, a)
if a < 0 or b < 0:
    raise SystemExit('BRIDGE_CLASS_ANCHOR_MISSING')

new = r'''var STAT_LEDGER_PREFIX = "stat:v2:row:";
var STAT_LEDGER_META_KEY = "stat:v2:meta";
var STAT_LEDGER_VERSION = "signal-ledger-v2-longterm";
var STAT_LEDGER_DEFAULT_LIMIT = 2000;
var STAT_LEDGER_MAX_LIMIT = 5000;
function ledgerTs(v) {
  const n = Number(v);
  return String(Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0).padStart(13, "0");
}
__name(ledgerTs, "ledgerTs");
function ledgerKey(row) {
  return `${STAT_LEDGER_PREFIX}${ledgerTs(row?.createdAt)}:${String(row?.id || "")}`;
}
__name(ledgerKey, "ledgerKey");
function blankLedgerMeta() {
  return {version:STAT_LEDGER_VERSION,ledgerTotal:0,settledTotal:0,pending:0,unresolved:0,win:0,loss:0,push:0,halfWin:0,halfLoss:0,byMarket:{},updatedAt:0};
}
__name(blankLedgerMeta, "blankLedgerMeta");
function normalizeLedgerMeta(raw) {
  const b=blankLedgerMeta(),m=raw&&typeof raw==="object"?raw:{};
  for(const k of ["ledgerTotal","settledTotal","pending","unresolved","win","loss","push","halfWin","halfLoss"])b[k]=Math.max(0,Number(m[k]||0));
  b.byMarket={...(m.byMarket||{})};b.updatedAt=Number(m.updatedAt||0);return b;
}
__name(normalizeLedgerMeta, "normalizeLedgerMeta");
function ledgerResultBucket(row) {
  const r=String(row?.result||"").toUpperCase();
  if(r==="WIN")return"win";if(r==="LOSS")return"loss";if(r==="PUSH")return"push";if(r==="HALF_WIN")return"halfWin";if(r==="HALF_LOSS")return"halfLoss";return null;
}
__name(ledgerResultBucket, "ledgerResultBucket");
function applyLedgerMeta(meta,row,sign) {
  if(!row||!row.id)return;
  meta.ledgerTotal=Math.max(0,Number(meta.ledgerTotal||0)+sign);
  const st=String(row.status||"").toUpperCase();
  if(st==="PENDING")meta.pending=Math.max(0,Number(meta.pending||0)+sign);
  else if(st==="UNRESOLVED")meta.unresolved=Math.max(0,Number(meta.unresolved||0)+sign);
  else if(st==="SETTLED"){
    meta.settledTotal=Math.max(0,Number(meta.settledTotal||0)+sign);
    const b=ledgerResultBucket(row);if(b)meta[b]=Math.max(0,Number(meta[b]||0)+sign);
    const mk=String(row.market||"unknown");meta.byMarket[mk]=Math.max(0,Number(meta.byMarket[mk]||0)+sign);if(meta.byMarket[mk]===0)delete meta.byMarket[mk];
  }
}
__name(applyLedgerMeta, "applyLedgerMeta");
function archivalSignal(sig) {
  const keys=["id","fixtureId","league","home","away","market","marketLabel","providerMarket","period","selection","line","selectionLine","providerLine","providerLineSide","odds","bookmaker","bookmakerSlug","priceStage","priceSource","priceReference","referenceProviderLine","refereeBookCount","refereeOfferCount","refereeConsensusBooks","refereeConsensusSlugs","openingPrice","closingPrice","inplayPrice","createdAt","entryMinute","minute","entryScore","scoreAt","entryCorners","entryCards","entryStats","statisticsAtEntry","bookmakerHistory","evidence","rolling","status","result","previousResult","finalScore","finalCorners","finalCards","settlementBasis","settlementRevision","settlementSource","settlementError","settledAt","reconciledAt","lineGap","mirrorMinute","mirrorScore","mirrorCorners","mirrorCards","mirrorStatus","mirrorUpdatedAt"];
  const row={};for(const k of keys)if(sig?.[k]!==undefined)row[k]=clone2(sig[k]);
  row.statisticsLedgerVersion=STAT_LEDGER_VERSION;return row;
}
__name(archivalSignal, "archivalSignal");
function mirrorInto(row,fixture,at) {
  if(!row)return row;
  if(fixture){
    const minute=num3(fixture?.minute);if(minute!==null)row.mirrorMinute=minute;
    if(fixture?.goals!=null)row.mirrorScore=clone2(fixture.goals);
    if(fixture?.corners!=null)row.mirrorCorners=clone2(fixture.corners);
    if(fixture?.cards!=null)row.mirrorCards=clone2(fixture.cards);
    row.mirrorStatus=fixture?.boardState??fixture?.status??fixture?.statusCode??row.mirrorStatus??null;
    row.mirrorUpdatedAt=at;
  }else if(String(row.status||"").toUpperCase()==="SETTLED"){
    row.mirrorMinute=row.mirrorMinute??row.minute??row.entryMinute??null;
    row.mirrorScore=clone2(row.finalScore??row.mirrorScore??row.scoreAt??row.entryScore);
    row.mirrorCorners=clone2(row.finalCorners??row.mirrorCorners??row.entryCorners);
    row.mirrorCards=clone2(row.finalCards??row.mirrorCards??row.entryCards);
    row.mirrorStatus="finished";
    row.mirrorUpdatedAt=row.settledAt??row.mirrorUpdatedAt??at;
  }
  return row;
}
__name(mirrorInto, "mirrorInto");
function ledgerMarker(row) {
  return JSON.stringify([row?.status,row?.result,row?.previousResult,row?.settledAt,row?.reconciledAt,row?.mirrorMinute,row?.mirrorScore,row?.mirrorCorners,row?.mirrorCards,row?.mirrorStatus,row?.settlementRevision,row?.settlementSource]);
}
__name(ledgerMarker, "ledgerMarker");
var Nomad343Engine2 = class extends Nomad343Engine {
  static { __name(this, "Nomad343Engine"); }
  async upsertLedgerRows(sourceRows, fixtureMap = null) {
    const rows=(Array.isArray(sourceRows)?sourceRows:[]).filter((x)=>x?.id);
    let meta=normalizeLedgerMeta(await this.ctx.storage.get(STAT_LEDGER_META_KEY));
    let inserted=0,updated=0,unchanged=0;
    const at=now2();
    for(let i=0;i<rows.length;i+=64){
      const chunk=rows.slice(i,i+64).map((sig)=>{
        const row=archivalSignal(sig);const f=fixtureMap?.get?.(String(sig.fixtureId));mirrorInto(row,f,at);row._ledgerMarker=ledgerMarker(row);return [ledgerKey(row),row];
      });
      const keys=chunk.map(([k])=>k);
      const existing=keys.length?await this.ctx.storage.get(keys):new Map();
      const writes={};
      for(const [key,row] of chunk){
        const old=existing?.get?.(key);
        if(!old){applyLedgerMeta(meta,row,1);writes[key]=row;inserted++;continue;}
        if(String(old?._ledgerMarker||"")===String(row._ledgerMarker||"")){unchanged++;continue;}
        applyLedgerMeta(meta,old,-1);applyLedgerMeta(meta,row,1);writes[key]=row;updated++;
      }
      if(Object.keys(writes).length)await this.ctx.storage.put(writes);
    }
    meta.version=STAT_LEDGER_VERSION;meta.updatedAt=at;await this.ctx.storage.put(STAT_LEDGER_META_KEY,meta);
    return {ok:true,version:STAT_LEDGER_VERSION,inserted,updated,unchanged,meta};
  }
  async syncStatisticsLedger(finalFixture = null) {
    const signals=await this.ctx.storage.get("signals")||[];
    const board=await this.ctx.storage.get("board")||{fixtures:[]};
    const fixtureMap=new Map((board.fixtures||[]).map((f)=>[String(f?.fixtureId??f?.id??""),f]));
    if(finalFixture?.fixtureId)fixtureMap.set(String(finalFixture.fixtureId),finalFixture);
    const at=now2();let workingChanged=false;
    for(const sig of signals){
      if(!sig?.id)continue;const f=fixtureMap.get(String(sig.fixtureId));if(!f)continue;
      const minute=num3(f?.minute);if(minute!==null&&sig.mirrorMinute!==minute){sig.mirrorMinute=minute;workingChanged=true}
      const score=clone2(f?.goals);if(JSON.stringify(sig.mirrorScore)!==JSON.stringify(score)){sig.mirrorScore=score;workingChanged=true}
      const corners=clone2(f?.corners);if(JSON.stringify(sig.mirrorCorners)!==JSON.stringify(corners)){sig.mirrorCorners=corners;workingChanged=true}
      const cards=clone2(f?.cards);if(JSON.stringify(sig.mirrorCards)!==JSON.stringify(cards)){sig.mirrorCards=cards;workingChanged=true}
      const status=f?.boardState??f?.status??f?.statusCode??null;if(sig.mirrorStatus!==status){sig.mirrorStatus=status;workingChanged=true}
      sig.mirrorUpdatedAt=at;
    }
    if(workingChanged)await this.ctx.storage.put("signals",signals);
    return this.upsertLedgerRows(signals,fixtureMap);
  }
  async latestLedgerRows(limit=STAT_LEDGER_DEFAULT_LIMIT) {
    const n=Math.max(1,Math.min(STAT_LEDGER_MAX_LIMIT,Math.round(Number(limit)||STAT_LEDGER_DEFAULT_LIMIT)));
    const found=await this.ctx.storage.list({prefix:STAT_LEDGER_PREFIX,reverse:true,limit:n});
    return [...found.values()].filter((x)=>x&&typeof x==="object");
  }
  async statisticsLedgerResponse(limit=STAT_LEDGER_DEFAULT_LIMIT) {
    const meta=normalizeLedgerMeta(await this.ctx.storage.get(STAT_LEDGER_META_KEY));
    const raw=await this.latestLedgerRows(limit);
    const rows=raw.map((src)=>{
      const r=clone2(src);delete r._ledgerMarker;
      if(String(r.status||"").toUpperCase()==="PENDING"){
        r.signalEntryMinute=r.entryMinute??r.minute??null;
        r.entryMinute=r.mirrorMinute??r.entryMinute??r.minute??null;
        r.finalScore=clone2(r.mirrorScore??r.entryScore??r.scoreAt);
        r.result="LIVE";
        r.displayStatus="LIVE";
      }
      return r;
    });
    const denom=meta.win+meta.loss+meta.halfWin+meta.halfLoss;
    return {ok:true,version:VERSION,settlementRevision:SETTLEMENT_REVISION,statisticsLedgerVersion:STAT_LEDGER_VERSION,retention:"LONG_TERM_NO_APPLICATION_EXPIRY",markets:MARKET_RULES,total:meta.settledTotal,ledgerTotal:meta.ledgerTotal,pending:meta.pending,unresolved:meta.unresolved,win:meta.win,loss:meta.loss,push:meta.push,halfWin:meta.halfWin,halfLoss:meta.halfLoss,winRate:denom?Math.round(((meta.win+.5*meta.halfWin)/denom)*1000)/10:null,byMarket:meta.byMarket,rows,returned:rows.length};
  }
  async scan() {
    const meta=await super.scan();
    if(meta?.ok){const ledger=await this.syncStatisticsLedger();return {...meta,statisticsLedgerVersion:STAT_LEDGER_VERSION,ledgerInserted:ledger.inserted,ledgerUpdated:ledger.updated,ledgerTotal:ledger.meta.ledgerTotal,settledTotal:ledger.meta.settledTotal}}
    return meta;
  }
  async reconcileExternalFinal(request) {
    if(!secureTokenOk(request,this.env))return Response.json({ok:false,error:"UNAUTHORIZED"},{status:401});
    const body=await request.json().catch(()=>null);const fixture=normalizeFinalFixture(body?.fixture??body);
    if(!fixture)return Response.json({ok:false,error:"INVALID_FIXTURE_PAYLOAD"},{status:400});
    if(!isFinished2(fixture)&&!isHalfComplete2(fixture))return Response.json({ok:true,version:BRIDGE_VERSION,fixtureId:fixture.fixtureId,state:"NOT_FINAL",settled:0});
    const signals=await this.ctx.storage.get("signals")||[];const changed=[];
    for(const sig of signals){
      if(sig?.status!=="PENDING"||String(sig?.fixtureId)!==fixture.fixtureId||!periodComplete(sig,fixture))continue;
      const result=settleMarketSignal(sig,fixture);if(!result)continue;
      sig.status="SETTLED";sig.result=result;sig.finalScore=clone2(fixture.goals);sig.finalCorners=clone2(fixture.corners);sig.finalCards=clone2(fixture.cards);sig.settledAt=now2();sig.settlementError=null;sig.settlementSource="EXTERNAL_FINAL_BRIDGE";
      sig.mirrorMinute=num3(fixture.minute)??sig.mirrorMinute??sig.minute??sig.entryMinute??null;sig.mirrorScore=clone2(fixture.goals);sig.mirrorCorners=clone2(fixture.corners);sig.mirrorCards=clone2(fixture.cards);sig.mirrorStatus="finished";sig.mirrorUpdatedAt=sig.settledAt;
      changed.push({id:sig.id,market:sig.market,selection:sig.selection,line:sig.line,result:sig.result,finalScore:sig.finalScore,finalCorners:sig.finalCorners});
    }
    if(changed.length){
      const nonSettled=signals.filter((x)=>x?.status!=="SETTLED");const ids=new Set(nonSettled.map((x)=>String(x?.id||"")));const recentSettled=signals.filter((x)=>x?.status==="SETTLED"&&!ids.has(String(x?.id||""))).slice(-MAX_SIGNALS2);await this.ctx.storage.put("signals",[...recentSettled,...nonSettled].sort((a,b)=>Number(a?.createdAt||0)-Number(b?.createdAt||0)));
    }
    const ledger=await this.syncStatisticsLedger(fixture);
    return Response.json({ok:true,version:BRIDGE_VERSION,statisticsLedgerVersion:STAT_LEDGER_VERSION,fixtureId:fixture.fixtureId,finished:isFinished2(fixture),settled:changed.length,ledgerInserted:ledger.inserted,ledgerUpdated:ledger.updated,rows:changed});
  }
  async fetch(request) {
    const u=new URL(request.url);
    if(u.pathname==="/reconcile-final"&&request.method==="POST")return this.reconcileExternalFinal(request);
    if(u.pathname==="/bridge-health"&&request.method==="GET")return Response.json({ok:true,version:BRIDGE_VERSION,statisticsLedgerVersion:STAT_LEDGER_VERSION});
    if(u.pathname==="/ledger-import"&&request.method==="POST"){
      if(!secureTokenOk(request,this.env))return Response.json({ok:false,error:"UNAUTHORIZED"},{status:401});
      const body=await request.json().catch(()=>null),rows=Array.isArray(body?.rows)?body.rows:[];
      if(!rows.length||rows.length>10000)return Response.json({ok:false,error:"INVALID_IMPORT_ROWS"},{status:400});
      const r=await this.upsertLedgerRows(rows);return Response.json({ok:true,version:STAT_LEDGER_VERSION,inserted:r.inserted,updated:r.updated,unchanged:r.unchanged,ledgerTotal:r.meta.ledgerTotal,settledTotal:r.meta.settledTotal,pending:r.meta.pending});
    }
    if(u.pathname==="/ledger-sync"&&request.method==="POST"){
      if(!secureTokenOk(request,this.env))return Response.json({ok:false,error:"UNAUTHORIZED"},{status:401});
      const r=await this.syncStatisticsLedger();return Response.json({ok:true,version:STAT_LEDGER_VERSION,inserted:r.inserted,updated:r.updated,ledgerTotal:r.meta.ledgerTotal,settledTotal:r.meta.settledTotal,pending:r.meta.pending});
    }
    if(u.pathname==="/ledger-health"&&request.method==="GET"){
      const m=normalizeLedgerMeta(await this.ctx.storage.get(STAT_LEDGER_META_KEY));return Response.json({ok:true,version:STAT_LEDGER_VERSION,retention:"LONG_TERM_NO_APPLICATION_EXPIRY",...m});
    }
    if(u.pathname==="/statistics"&&request.method==="GET"){
      await this.scanIfDue();await this.syncStatisticsLedger();return Response.json(await this.statisticsLedgerResponse(u.searchParams.get("limit")));
    }
    return super.fetch(request);
  }
'''

s = s[:a] + new + s[b:]
old_paths='["/health", "/registry", "/settings", "/scan", "/board", "/signals", "/statistics", "/history", "/fixture-odds", "/referee", "/reconcile-final", "/bridge-health"]'
new_paths='["/health", "/registry", "/settings", "/scan", "/board", "/signals", "/statistics", "/history", "/fixture-odds", "/referee", "/reconcile-final", "/bridge-health", "/ledger-import", "/ledger-sync", "/ledger-health"]'
if s.count(old_paths) != 1:
    raise SystemExit('ROUTER_ALLOWLIST_ANCHOR_COUNT:' + str(s.count(old_paths)))
s = s.replace(old_paths, new_paths, 1)
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(s)
print('PATCH_V2_OK', len(s))
