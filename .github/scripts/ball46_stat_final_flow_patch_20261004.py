from pathlib import Path
import re
import sys

if len(sys.argv) != 3:
    raise SystemExit('usage: patcher INPUT OUTPUT')

src = Path(sys.argv[1])
out = Path(sys.argv[2])
s = src.read_text()

# This patch is intentionally allowed to run only on the current long-term V2 ledger.
required = [
    'signal-ledger-v2-longterm',
    'STAT_LEDGER_PREFIX = "stat:v2:row:"',
    'LONG_TERM_NO_APPLICATION_EXPIRY',
    'statisticsLedgerResponse',
    'syncStatisticsLedger',
    'reconcileExternalFinal',
    'settleMarketSignal',
    'FULL_MARKET',
]
for marker in required:
    if marker not in s:
        raise SystemExit('CURRENT_PRODUCTION_NOT_LEDGER_V2:' + marker)

if 'missing-final-direct-v1' in s:
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(s)
    print('PATCH_ALREADY_PRESENT')
    raise SystemExit(0)

# Add bounded direct-final retry policy next to the ledger constants.
anchor = 'var STAT_LEDGER_DEFAULT_LIMIT = 2000;\nvar STAT_LEDGER_MAX_LIMIT = 5000;\n'
if s.count(anchor) != 1:
    raise SystemExit('LEDGER_CONSTANT_ANCHOR_COUNT:' + str(s.count(anchor)))
s = s.replace(anchor, anchor + '''var FINAL_RECONCILE_VERSION = "missing-final-direct-v1";\nvar FINAL_RECHECK_STATE_KEY = "stat:v2:final-recheck";\nvar FINAL_RECHECK_INTERVAL_MS = 15 * 60 * 1e3;\nvar FINAL_RECHECK_MIN_SIGNAL_AGE_MS = 45 * 60 * 1e3;\nvar FINAL_RECHECK_MAX_PER_SCAN = 3;\nvar FINAL_RECHECK_TIMEOUT_MS = 12 * 1e3;\n''', 1)

# Add an automatic fallback only for PENDING fixtures absent from the current Hub board.
# It never guesses a result: settlement occurs only after the provider confirms a terminal fixture.
method_anchor = '  async latestLedgerRows(limit=STAT_LEDGER_DEFAULT_LIMIT) {'
if s.count(method_anchor) != 1:
    raise SystemExit('LATEST_LEDGER_ANCHOR_COUNT:' + str(s.count(method_anchor)))
method = r'''  async autoReconcileMissingFinals() {
    const at=now2();
    const signals=await this.ctx.storage.get("signals")||[];
    const board=await this.ctx.storage.get("board")||{fixtures:[]};
    const boardIds=new Set((board.fixtures||[]).map((f)=>String(f?.fixtureId??f?.id??"")).filter(Boolean));
    const groups=new Map();
    for(const sig of signals){
      if(sig?.status!=="PENDING"||!sig?.fixtureId)continue;
      const id=String(sig.fixtureId);if(boardIds.has(id))continue;
      const created=Number(sig.createdAt||0);if(created>0&&at-created<FINAL_RECHECK_MIN_SIGNAL_AGE_MS)continue;
      if(!groups.has(id))groups.set(id,[]);groups.get(id).push(sig);
    }
    const rawState=await this.ctx.storage.get(FINAL_RECHECK_STATE_KEY);
    const state=rawState&&typeof rawState==="object"&&!Array.isArray(rawState)?{...rawState}:{};
    const candidates=[...groups.entries()].filter(([id])=>at-Number(state[id]?.checkedAt||0)>=FINAL_RECHECK_INTERVAL_MS).sort((a,b)=>{
      const ac=Math.min(...a[1].map((x)=>Number(x?.createdAt||0))),bc=Math.min(...b[1].map((x)=>Number(x?.createdAt||0)));return ac-bc;
    }).slice(0,FINAL_RECHECK_MAX_PER_SCAN);
    let checked=0,finishedFixtures=0,settledSignals=0,incompleteFinalData=0,errors=0;
    const finalFixtures=new Map();
    for(const [fixtureId] of candidates){
      checked++;
      state[fixtureId]={...(state[fixtureId]||{}),checkedAt:at,state:"CHECKING"};
      try{
        if(!this.env.FIVEDOLLAR_API_KEY)throw new Error("FIVEDOLLAR_API_KEY_MISSING");
        const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),FINAL_RECHECK_TIMEOUT_MS);
        let response;
        try{
          response=await fetch(`https://api.5dollarfootballapi.com/v1/fixtures/${encodeURIComponent(fixtureId)}?include=events,stats`,{cache:"no-store",signal:ac.signal,headers:{accept:"application/json",authorization:`Bearer ${this.env.FIVEDOLLAR_API_KEY}`}});
        }finally{clearTimeout(timer)}
        if(!response.ok)throw new Error(`FINAL_HTTP_${response.status}`);
        const payload=await response.json();
        const fixture=normalizeFinalFixture(payload);
        if(!fixture||String(fixture.fixtureId)!==fixtureId)throw new Error("FINAL_FIXTURE_MISMATCH");
        if(!isFinished2(fixture)){
          state[fixtureId]={checkedAt:at,state:"NOT_FINAL",status:fixture.status??fixture.statusCode??null};
          continue;
        }
        finishedFixtures++;finalFixtures.set(fixtureId,fixture);
        let fixtureSettled=0,fixtureIncomplete=0;
        for(const sig of signals){
          if(sig?.status!=="PENDING"||String(sig?.fixtureId)!==fixtureId||!periodComplete(sig,fixture))continue;
          const result=settleMarketSignal(sig,fixture);
          if(!result){fixtureIncomplete++;incompleteFinalData++;continue;}
          sig.status="SETTLED";sig.result=result;sig.finalScore=clone2(fixture.goals);sig.finalCorners=clone2(fixture.corners);sig.finalCards=clone2(fixture.cards);sig.settledAt=at;sig.settlementError=null;sig.settlementSource="DIRECT_FINAL_FALLBACK";sig.settlementRevision=SETTLEMENT_REVISION;
          sig.mirrorMinute=num3(fixture.minute)??sig.mirrorMinute??sig.minute??sig.entryMinute??null;sig.mirrorScore=clone2(fixture.goals);sig.mirrorCorners=clone2(fixture.corners);sig.mirrorCards=clone2(fixture.cards);sig.mirrorStatus="finished";sig.mirrorUpdatedAt=at;
          fixtureSettled++;settledSignals++;
        }
        state[fixtureId]={checkedAt:at,state:fixtureIncomplete>0?"FINAL_PARTIAL":"FINAL_SETTLED",settled:fixtureSettled,incomplete:fixtureIncomplete,status:fixture.status??fixture.statusCode??"finished"};
      }catch(e){
        errors++;state[fixtureId]={checkedAt:at,state:"ERROR",error:String(e?.message||e).slice(0,160)};
      }
    }
    if(settledSignals>0){
      const nonSettled=signals.filter((x)=>x?.status!=="SETTLED");
      const nonSettledIds=new Set(nonSettled.map((x)=>String(x?.id||"")));
      const recentSettled=signals.filter((x)=>x?.status==="SETTLED"&&!nonSettledIds.has(String(x?.id||""))).slice(-1600);
      await this.ctx.storage.put("signals",[...recentSettled,...nonSettled].sort((a,b)=>Number(a?.createdAt||0)-Number(b?.createdAt||0)));
    }
    const stillPendingIds=new Set(signals.filter((x)=>x?.status==="PENDING").map((x)=>String(x?.fixtureId||"")));
    const compact={};
    for(const [id,value] of Object.entries(state).sort((a,b)=>Number(b[1]?.checkedAt||0)-Number(a[1]?.checkedAt||0))){
      if(stillPendingIds.has(id)||Object.keys(compact).length<64)compact[id]=value;
      if(Object.keys(compact).length>=256)break;
    }
    await this.ctx.storage.put(FINAL_RECHECK_STATE_KEY,compact);
    return {ok:true,version:FINAL_RECONCILE_VERSION,checked,finishedFixtures,settledSignals,incompleteFinalData,errors,candidatesRemaining:Math.max(0,groups.size-candidates.length),finalFixtures};
  }
'''
s = s.replace(method_anchor, method + method_anchor, 1)

# Hook fallback after the normal production scan, then persist the same signal IDs into V2 ledger.
scan_re = re.compile(r'''  async scan\(\) \{\n    const meta=await super\.scan\(\);\n    if\(meta\?\.ok\)\{const ledger=await this\.syncStatisticsLedger\(\);return \{\.\.\.meta,statisticsLedgerVersion:STAT_LEDGER_VERSION,ledgerInserted:ledger\.inserted,ledgerUpdated:ledger\.updated,ledgerTotal:ledger\.meta\.ledgerTotal,settledTotal:ledger\.meta\.settledTotal\}\}\n    return meta;\n  \}''')
replacement = '''  async scan() {\n    const meta=await super.scan();\n    if(meta?.ok){\n      const finalFlow=await this.autoReconcileMissingFinals();\n      const ledger=await this.syncStatisticsLedger();\n      const {finalFixtures,...finalFlowPublic}=finalFlow;\n      return {...meta,statisticsLedgerVersion:STAT_LEDGER_VERSION,statisticsSource:"LEDGER_V2_ONLY",finalReconcileVersion:FINAL_RECONCILE_VERSION,finalReconcile:finalFlowPublic,ledgerInserted:ledger.inserted,ledgerUpdated:ledger.updated,ledgerTotal:ledger.meta.ledgerTotal,settledTotal:ledger.meta.settledTotal};\n    }\n    return meta;\n  }'''
s, n = scan_re.subn(replacement, s, count=1)
if n != 1:
    raise SystemExit('SCAN_HOOK_ANCHOR_COUNT:' + str(n))

# Make the data contract explicit: Statistics is served only from V2 ledger.
old_return = 'return {ok:true,version:VERSION,settlementRevision:SETTLEMENT_REVISION,statisticsLedgerVersion:STAT_LEDGER_VERSION,retention:"LONG_TERM_NO_APPLICATION_EXPIRY",markets:MARKET_RULES,'
new_return = 'return {ok:true,version:VERSION,settlementRevision:SETTLEMENT_REVISION,statisticsLedgerVersion:STAT_LEDGER_VERSION,statisticsSource:"LEDGER_V2_ONLY",finalReconcileVersion:FINAL_RECONCILE_VERSION,retention:"LONG_TERM_NO_APPLICATION_EXPIRY",markets:MARKET_RULES,'
if s.count(old_return) != 1:
    raise SystemExit('STAT_RESPONSE_ANCHOR_COUNT:' + str(s.count(old_return)))
s = s.replace(old_return, new_return, 1)

# Expose only a health marker; no new public mutation route is added.
old_bridge = 'if(u.pathname==="/bridge-health"&&request.method==="GET")return Response.json({ok:true,version:BRIDGE_VERSION,statisticsLedgerVersion:STAT_LEDGER_VERSION});'
new_bridge = 'if(u.pathname==="/bridge-health"&&request.method==="GET")return Response.json({ok:true,version:BRIDGE_VERSION,statisticsLedgerVersion:STAT_LEDGER_VERSION,statisticsSource:"LEDGER_V2_ONLY",finalReconcileVersion:FINAL_RECONCILE_VERSION});'
if s.count(old_bridge) != 1:
    raise SystemExit('BRIDGE_HEALTH_ANCHOR_COUNT:' + str(s.count(old_bridge)))
s = s.replace(old_bridge, new_bridge, 1)

out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(s)
print('PATCH_FINAL_FLOW_OK', len(s))
