from pathlib import Path
import re, sys
if len(sys.argv)!=3: raise SystemExit('usage: patcher INPUT OUTPUT')
src,out=Path(sys.argv[1]),Path(sys.argv[2]); s=src.read_text()
required=['signal-ledger-v2-longterm','STAT_LEDGER_PREFIX = "stat:v2:row:"','LONG_TERM_NO_APPLICATION_EXPIRY','statisticsLedgerResponse','syncStatisticsLedger','reconcileExternalFinal','settleMarketSignal','FULL_MARKET']
for m in required:
    if m not in s: raise SystemExit('CURRENT_PRODUCTION_NOT_LEDGER_V2:'+m)
if 'missing-final-direct-v1' in s and 'chunked-working-store-v1' in s:
    out.parent.mkdir(parents=True,exist_ok=True);out.write_text(s);print('PATCH_ALREADY_PRESENT');raise SystemExit(0)
base_anchor='var Nomad343Engine = class extends DurableObject {'
if s.count(base_anchor)!=1: raise SystemExit('BASE_CLASS_ANCHOR_COUNT:'+str(s.count(base_anchor)))
helpers=r'''var WORK_STORE_VERSION = "chunked-working-store-v1";
var WORK_SIGNAL_META_KEY = "work:v2:signals:meta";
var WORK_SIGNAL_PREFIX = "work:v2:signals:";
var WORK_HISTORY_META_KEY = "work:v2:histories:meta";
var WORK_HISTORY_PREFIX = "work:v2:histories:";
var WORK_SIGNAL_CHUNK_ROWS = 96;
var WORK_HISTORY_CHUNK_FIXTURES = 6;
var WORK_SETTLED_TAIL = 120;
async function readWorkingSignals(ctx) {
  const meta=await ctx.storage.get(WORK_SIGNAL_META_KEY);
  if(meta?.version===WORK_STORE_VERSION&&meta?.generation&&Number(meta?.chunkCount)>=0){const out=[];for(let i=0;i<Number(meta.chunkCount);i++){const rows=await ctx.storage.get(`${WORK_SIGNAL_PREFIX}${meta.generation}:${i}`);if(Array.isArray(rows))out.push(...rows)}return out}
  const legacy=await ctx.storage.get("signals");return Array.isArray(legacy)?legacy:[];
}
async function writeWorkingSignals(ctx, rows) {
  const list=Array.isArray(rows)?rows:[],old=await ctx.storage.get(WORK_SIGNAL_META_KEY),generation=`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`,chunks=[];for(let i=0;i<list.length;i+=WORK_SIGNAL_CHUNK_ROWS)chunks.push(list.slice(i,i+WORK_SIGNAL_CHUNK_ROWS));
  for(let i=0;i<chunks.length;i++)await ctx.storage.put(`${WORK_SIGNAL_PREFIX}${generation}:${i}`,chunks[i]);await ctx.storage.put(WORK_SIGNAL_META_KEY,{version:WORK_STORE_VERSION,generation,chunkCount:chunks.length,rowCount:list.length,updatedAt:Date.now()});await ctx.storage.delete("signals");
  if(old?.version===WORK_STORE_VERSION&&old?.generation&&old.generation!==generation){for(let i=0;i<Number(old.chunkCount||0);i++)await ctx.storage.delete(`${WORK_SIGNAL_PREFIX}${old.generation}:${i}`)}
}
async function readWorkingHistories(ctx) {
  const meta=await ctx.storage.get(WORK_HISTORY_META_KEY);if(meta?.version===WORK_STORE_VERSION&&meta?.generation&&Number(meta?.chunkCount)>=0){const out={};for(let i=0;i<Number(meta.chunkCount);i++){const part=await ctx.storage.get(`${WORK_HISTORY_PREFIX}${meta.generation}:${i}`);if(part&&typeof part==="object"&&!Array.isArray(part))Object.assign(out,part)}return out}
  const legacy=await ctx.storage.get("histories");return legacy&&typeof legacy==="object"&&!Array.isArray(legacy)?legacy:{};
}
async function writeWorkingHistories(ctx, histories) {
  const obj=histories&&typeof histories==="object"&&!Array.isArray(histories)?histories:{},entries=Object.entries(obj),old=await ctx.storage.get(WORK_HISTORY_META_KEY),generation=`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`,chunks=[];for(let i=0;i<entries.length;i+=WORK_HISTORY_CHUNK_FIXTURES)chunks.push(Object.fromEntries(entries.slice(i,i+WORK_HISTORY_CHUNK_FIXTURES)));
  for(let i=0;i<chunks.length;i++)await ctx.storage.put(`${WORK_HISTORY_PREFIX}${generation}:${i}`,chunks[i]);await ctx.storage.put(WORK_HISTORY_META_KEY,{version:WORK_STORE_VERSION,generation,chunkCount:chunks.length,fixtureCount:entries.length,updatedAt:Date.now()});await ctx.storage.delete("histories");
  if(old?.version===WORK_STORE_VERSION&&old?.generation&&old.generation!==generation){for(let i=0;i<Number(old.chunkCount||0);i++)await ctx.storage.delete(`${WORK_HISTORY_PREFIX}${old.generation}:${i}`)}
}
'''
s=s.replace(base_anchor,helpers+base_anchor,1)
if s.count('await this.ctx.storage.get("signals") || []')!=5: raise SystemExit('SIGNAL_GET_COUNT:'+str(s.count('await this.ctx.storage.get("signals") || []')))
s=s.replace('await this.ctx.storage.get("signals") || []','await readWorkingSignals(this.ctx)')
if s.count('await this.ctx.storage.get("histories") || {}')!=2: raise SystemExit('HISTORY_GET_COUNT:'+str(s.count('await this.ctx.storage.get("histories") || {}')))
s=s.replace('await this.ctx.storage.get("histories") || {}','await readWorkingHistories(this.ctx)')
repls={'await this.ctx.storage.put("histories", histories);':'await writeWorkingHistories(this.ctx, histories);','await this.ctx.storage.put("signals", capped);':'await writeWorkingSignals(this.ctx, capped);','if (workingChanged) await this.ctx.storage.put("signals", signals);':'if (workingChanged) await writeWorkingSignals(this.ctx, signals);','await this.ctx.storage.put("signals", [...recentSettled, ...nonSettled].sort((a, b) => Number(a?.createdAt || 0) - Number(b?.createdAt || 0)));':'await writeWorkingSignals(this.ctx, [...recentSettled, ...nonSettled].sort((a, b) => Number(a?.createdAt || 0) - Number(b?.createdAt || 0)));'}
for old,new in repls.items():
    if s.count(old)!=1: raise SystemExit('WORKING_PUT_ANCHOR_COUNT:'+old+':'+str(s.count(old)))
    s=s.replace(old,new,1)
const_re=re.compile(r'(var STAT_LEDGER_DEFAULT_LIMIT = [^;]+;\nvar STAT_LEDGER_MAX_LIMIT = [^;]+;\n)')
if len(const_re.findall(s))!=1: raise SystemExit('LEDGER_CONSTANT_ANCHOR_COUNT:'+str(len(const_re.findall(s))))
s=const_re.sub(r'''\1var FINAL_RECONCILE_VERSION = "missing-final-direct-v1";
var FINAL_RECHECK_STATE_KEY = "stat:v2:final-recheck";
var FINAL_RECHECK_INTERVAL_MS = 15 * 60 * 1e3;
var FINAL_RECHECK_MIN_SIGNAL_AGE_MS = 45 * 60 * 1e3;
var FINAL_RECHECK_MAX_PER_SCAN = 3;
var FINAL_RECHECK_TIMEOUT_MS = 12 * 1e3;
''',s,count=1)
method_anchor='  async latestLedgerRows(limit = STAT_LEDGER_DEFAULT_LIMIT) {'
if s.count(method_anchor)!=1: raise SystemExit('LATEST_LEDGER_ANCHOR_COUNT:'+str(s.count(method_anchor)))
method=r'''  async autoReconcileMissingFinals() {
    const at=now2(),signals=await readWorkingSignals(this.ctx),board=await this.ctx.storage.get("board")||{fixtures:[]},boardIds=new Set((board.fixtures||[]).map((f)=>String(f?.fixtureId??f?.id??"")).filter(Boolean)),groups=new Map();
    for(const sig of signals){if(sig?.status!=="PENDING"||!sig?.fixtureId)continue;const id=String(sig.fixtureId);if(boardIds.has(id))continue;const created=Number(sig.createdAt||0);if(created>0&&at-created<FINAL_RECHECK_MIN_SIGNAL_AGE_MS)continue;if(!groups.has(id))groups.set(id,[]);groups.get(id).push(sig)}
    const rawState=await this.ctx.storage.get(FINAL_RECHECK_STATE_KEY),state=rawState&&typeof rawState==="object"&&!Array.isArray(rawState)?{...rawState}:{},candidates=[...groups.entries()].filter(([id])=>at-Number(state[id]?.checkedAt||0)>=FINAL_RECHECK_INTERVAL_MS).sort((a,b)=>Math.min(...a[1].map((x)=>Number(x?.createdAt||0)))-Math.min(...b[1].map((x)=>Number(x?.createdAt||0)))).slice(0,FINAL_RECHECK_MAX_PER_SCAN);let checked=0,finishedFixtures=0,settledSignals=0,incompleteFinalData=0,errors=0;
    for(const [fixtureId] of candidates){checked++;state[fixtureId]={...(state[fixtureId]||{}),checkedAt:at,state:"CHECKING"};try{if(!this.env.FIVEDOLLAR_API_KEY)throw new Error("FIVEDOLLAR_API_KEY_MISSING");const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),FINAL_RECHECK_TIMEOUT_MS);let response;try{response=await fetch(`https://api.5dollarfootballapi.com/v1/fixtures/${encodeURIComponent(fixtureId)}?include=events,stats`,{cache:"no-store",signal:ac.signal,headers:{accept:"application/json",authorization:`Bearer ${this.env.FIVEDOLLAR_API_KEY}`}})}finally{clearTimeout(timer)}if(!response.ok)throw new Error(`FINAL_HTTP_${response.status}`);const payload=await response.json(),fixture=normalizeFinalFixture(payload);if(!fixture||String(fixture.fixtureId)!==fixtureId)throw new Error("FINAL_FIXTURE_MISMATCH");if(!isFinished2(fixture)){state[fixtureId]={checkedAt:at,state:"NOT_FINAL",status:fixture.status??fixture.statusCode??null};continue}finishedFixtures++;let fixtureSettled=0,fixtureIncomplete=0;for(const sig of signals){if(sig?.status!=="PENDING"||String(sig?.fixtureId)!==fixtureId||!periodComplete(sig,fixture))continue;const result=settleMarketSignal(sig,fixture);if(!result){fixtureIncomplete++;incompleteFinalData++;continue}sig.status="SETTLED";sig.result=result;sig.finalScore=clone2(fixture.goals);sig.finalCorners=clone2(fixture.corners);sig.finalCards=clone2(fixture.cards);sig.settledAt=at;sig.settlementError=null;sig.settlementSource="DIRECT_FINAL_FALLBACK";sig.settlementRevision=SETTLEMENT_REVISION;sig.mirrorMinute=num3(fixture.minute)??sig.mirrorMinute??sig.minute??sig.entryMinute??null;sig.mirrorScore=clone2(fixture.goals);sig.mirrorCorners=clone2(fixture.corners);sig.mirrorCards=clone2(fixture.cards);sig.mirrorStatus="finished";sig.mirrorUpdatedAt=at;fixtureSettled++;settledSignals++}state[fixtureId]={checkedAt:at,state:fixtureIncomplete>0?"FINAL_PARTIAL":"FINAL_SETTLED",settled:fixtureSettled,incomplete:fixtureIncomplete,status:fixture.status??fixture.statusCode??"finished"}}catch(e){errors++;state[fixtureId]={checkedAt:at,state:"ERROR",error:String(e?.message||e).slice(0,160)}}}
    if(settledSignals>0){const nonSettled=signals.filter((x)=>x?.status!=="SETTLED"),nonSettledIds=new Set(nonSettled.map((x)=>String(x?.id||""))),recentSettled=signals.filter((x)=>x?.status==="SETTLED"&&!nonSettledIds.has(String(x?.id||""))).slice(-1600);await writeWorkingSignals(this.ctx,[...recentSettled,...nonSettled].sort((a,b)=>Number(a?.createdAt||0)-Number(b?.createdAt||0)))}
    const stillPendingIds=new Set(signals.filter((x)=>x?.status==="PENDING").map((x)=>String(x?.fixtureId||""))),compact={};for(const [id,value] of Object.entries(state).sort((a,b)=>Number(b[1]?.checkedAt||0)-Number(a[1]?.checkedAt||0))){if(stillPendingIds.has(id)||Object.keys(compact).length<64)compact[id]=value;if(Object.keys(compact).length>=256)break}await this.ctx.storage.put(FINAL_RECHECK_STATE_KEY,compact);return {ok:true,version:FINAL_RECONCILE_VERSION,checked,finishedFixtures,settledSignals,incompleteFinalData,errors,candidatesRemaining:Math.max(0,groups.size-candidates.length)};
  }
  async compactWorkingSignalsAfterLedger() {
    const signals=await readWorkingSignals(this.ctx),nonSettled=signals.filter((x)=>x?.status!=="SETTLED"),ids=new Set(nonSettled.map((x)=>String(x?.id||""))),recentSettled=signals.filter((x)=>x?.status==="SETTLED"&&!ids.has(String(x?.id||""))).slice(-WORK_SETTLED_TAIL),compact=[...recentSettled,...nonSettled].sort((a,b)=>Number(a?.createdAt||0)-Number(b?.createdAt||0));if(compact.length!==signals.length)await writeWorkingSignals(this.ctx,compact);return {workingTotal:compact.length,pending:nonSettled.filter((x)=>x?.status==="PENDING").length,settledTail:recentSettled.length};
  }
'''
s=s.replace(method_anchor,method+method_anchor,1)
old_scan='''  async scan() {\n    const meta = await super.scan();\n    if (meta?.ok) {\n      const ledger = await this.syncStatisticsLedger();\n      return { ...meta, statisticsLedgerVersion: STAT_LEDGER_VERSION, ledgerInserted: ledger.inserted, ledgerUpdated: ledger.updated, ledgerTotal: ledger.meta.ledgerTotal, settledTotal: ledger.meta.settledTotal };\n    }\n    return meta;\n  }'''
new_scan='''  async scan() {\n    const meta = await super.scan();\n    if (meta?.ok) {\n      const finalFlow = await this.autoReconcileMissingFinals();\n      const ledger = await this.syncStatisticsLedger();\n      const workingStore = await this.compactWorkingSignalsAfterLedger();\n      return { ...meta, statisticsLedgerVersion: STAT_LEDGER_VERSION, statisticsSource: "LEDGER_V2_ONLY", workingStoreVersion: WORK_STORE_VERSION, workingStore, finalReconcileVersion: FINAL_RECONCILE_VERSION, finalReconcile: finalFlow, ledgerInserted: ledger.inserted, ledgerUpdated: ledger.updated, ledgerTotal: ledger.meta.ledgerTotal, settledTotal: ledger.meta.settledTotal };\n    }\n    return meta;\n  }'''
if s.count(old_scan)!=1: raise SystemExit('SCAN_HOOK_ANCHOR_COUNT:'+str(s.count(old_scan)))
s=s.replace(old_scan,new_scan,1)
old_ret='return { ok: true, version: VERSION, settlementRevision: SETTLEMENT_REVISION, statisticsLedgerVersion: STAT_LEDGER_VERSION, retention: "LONG_TERM_NO_APPLICATION_EXPIRY", markets: MARKET_RULES,'
new_ret='return { ok: true, version: VERSION, settlementRevision: SETTLEMENT_REVISION, statisticsLedgerVersion: STAT_LEDGER_VERSION, statisticsSource: "LEDGER_V2_ONLY", workingStoreVersion: WORK_STORE_VERSION, finalReconcileVersion: FINAL_RECONCILE_VERSION, retention: "LONG_TERM_NO_APPLICATION_EXPIRY", markets: MARKET_RULES,'
if s.count(old_ret)!=1: raise SystemExit('STAT_RESPONSE_ANCHOR_COUNT:'+str(s.count(old_ret)))
s=s.replace(old_ret,new_ret,1)
old_bridge='if (u.pathname === "/bridge-health" && request.method === "GET") return Response.json({ ok: true, version: BRIDGE_VERSION, statisticsLedgerVersion: STAT_LEDGER_VERSION });'
new_bridge='if (u.pathname === "/bridge-health" && request.method === "GET") return Response.json({ ok: true, version: BRIDGE_VERSION, statisticsLedgerVersion: STAT_LEDGER_VERSION, statisticsSource: "LEDGER_V2_ONLY", workingStoreVersion: WORK_STORE_VERSION, finalReconcileVersion: FINAL_RECONCILE_VERSION });'
if s.count(old_bridge)!=1: raise SystemExit('BRIDGE_HEALTH_ANCHOR_COUNT:'+str(s.count(old_bridge)))
s=s.replace(old_bridge,new_bridge,1)
out.parent.mkdir(parents=True,exist_ok=True);out.write_text(s);print('PATCH_FINAL_FLOW_OK',len(s))
