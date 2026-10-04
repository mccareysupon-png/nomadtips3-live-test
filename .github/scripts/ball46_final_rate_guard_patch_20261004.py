from pathlib import Path
import sys
if len(sys.argv)!=3: raise SystemExit('usage: patcher INPUT OUTPUT')
s=Path(sys.argv[1]).read_text(); out=Path(sys.argv[2])
for m in ('signal-ledger-v2-longterm','chunked-working-store-v1','missing-final-direct-v1','LEDGER_V2_ONLY','DIRECT_FINAL_FALLBACK'):
    if m not in s: raise SystemExit('CURRENT_FINAL_FLOW_MISSING:'+m)
if 'rate-limit-backoff-v1' in s:
    out.parent.mkdir(parents=True,exist_ok=True);out.write_text(s);print('RATE_GUARD_ALREADY_PRESENT');raise SystemExit(0)
old='var FINAL_RECHECK_MAX_PER_SCAN = 3;\nvar FINAL_RECHECK_TIMEOUT_MS = 12 * 1e3;'
new='var FINAL_RECHECK_MAX_PER_SCAN = 1;\nvar FINAL_RECHECK_TIMEOUT_MS = 12 * 1e3;\nvar FINAL_RATE_GUARD_VERSION = "rate-limit-backoff-v1";\nvar FINAL_RATE_BACKOFF_MS = 10 * 60 * 1e3;'
if s.count(old)!=1: raise SystemExit('RATE_CONSTANT_ANCHOR_COUNT:'+str(s.count(old)))
s=s.replace(old,new,1)
old_state='const rawState=await this.ctx.storage.get(FINAL_RECHECK_STATE_KEY),state=rawState&&typeof rawState==="object"&&!Array.isArray(rawState)?{...rawState}:{},candidates=[...groups.entries()].filter(([id])=>at-Number(state[id]?.checkedAt||0)>=FINAL_RECHECK_INTERVAL_MS).sort((a,b)=>Math.min(...a[1].map((x)=>Number(x?.createdAt||0)))-Math.min(...b[1].map((x)=>Number(x?.createdAt||0)))).slice(0,FINAL_RECHECK_MAX_PER_SCAN);let checked=0,finishedFixtures=0,settledSignals=0,incompleteFinalData=0,errors=0;'
new_state='const rawState=await this.ctx.storage.get(FINAL_RECHECK_STATE_KEY),state=rawState&&typeof rawState==="object"&&!Array.isArray(rawState)?{...rawState}:{};const activeBackoff=Number(state.__rateLimit?.until||0);if(activeBackoff>at)return {ok:true,version:FINAL_RECONCILE_VERSION,rateGuardVersion:FINAL_RATE_GUARD_VERSION,rateLimited:true,backoffUntil:activeBackoff,checked:0,finishedFixtures:0,settledSignals:0,incompleteFinalData:0,errors:0,candidatesRemaining:groups.size};const candidates=[...groups.entries()].filter(([id])=>at-Number(state[id]?.checkedAt||0)>=FINAL_RECHECK_INTERVAL_MS).sort((a,b)=>Math.min(...a[1].map((x)=>Number(x?.createdAt||0)))-Math.min(...b[1].map((x)=>Number(x?.createdAt||0)))).slice(0,FINAL_RECHECK_MAX_PER_SCAN);let checked=0,finishedFixtures=0,settledSignals=0,incompleteFinalData=0,errors=0,rateLimited=false,backoffUntil=0;'
if s.count(old_state)!=1: raise SystemExit('RATE_STATE_ANCHOR_COUNT:'+str(s.count(old_state)))
s=s.replace(old_state,new_state,1)
old_http='if(!response.ok)throw new Error(`FINAL_HTTP_${response.status}`);const payload=await response.json(),fixture=normalizeFinalFixture(payload);'
new_http='if(response.status===429){const retrySeconds=Math.max(0,Number(response.headers.get("retry-after")||0));backoffUntil=at+Math.max(FINAL_RATE_BACKOFF_MS,retrySeconds*1e3);rateLimited=true;errors++;state.__rateLimit={checkedAt:at,until:backoffUntil,state:"RATE_LIMIT_BACKOFF",version:FINAL_RATE_GUARD_VERSION};state[fixtureId]={checkedAt:at,state:"RATE_LIMIT",until:backoffUntil};break}if(!response.ok)throw new Error(`FINAL_HTTP_${response.status}`);if(state.__rateLimit)delete state.__rateLimit;const payload=await response.json(),fixture=normalizeFinalFixture(payload);'
if s.count(old_http)!=1: raise SystemExit('RATE_HTTP_ANCHOR_COUNT:'+str(s.count(old_http)))
s=s.replace(old_http,new_http,1)
old_compact='const stillPendingIds=new Set(signals.filter((x)=>x?.status==="PENDING").map((x)=>String(x?.fixtureId||""))),compact={};for(const [id,value] of Object.entries(state).sort((a,b)=>Number(b[1]?.checkedAt||0)-Number(a[1]?.checkedAt||0))){if(stillPendingIds.has(id)||Object.keys(compact).length<64)compact[id]=value;if(Object.keys(compact).length>=256)break}await this.ctx.storage.put(FINAL_RECHECK_STATE_KEY,compact);return {ok:true,version:FINAL_RECONCILE_VERSION,checked,finishedFixtures,settledSignals,incompleteFinalData,errors,candidatesRemaining:Math.max(0,groups.size-candidates.length)};'
new_compact='const stillPendingIds=new Set(signals.filter((x)=>x?.status==="PENDING").map((x)=>String(x?.fixtureId||""))),compact={};if(state.__rateLimit)compact.__rateLimit=state.__rateLimit;for(const [id,value] of Object.entries(state).filter(([id])=>id!=="__rateLimit").sort((a,b)=>Number(b[1]?.checkedAt||0)-Number(a[1]?.checkedAt||0))){if(stillPendingIds.has(id)||Object.keys(compact).length<64)compact[id]=value;if(Object.keys(compact).length>=256)break}await this.ctx.storage.put(FINAL_RECHECK_STATE_KEY,compact);return {ok:true,version:FINAL_RECONCILE_VERSION,rateGuardVersion:FINAL_RATE_GUARD_VERSION,rateLimited,backoffUntil:backoffUntil||null,checked,finishedFixtures,settledSignals,incompleteFinalData,errors,candidatesRemaining:Math.max(0,groups.size-candidates.length)};'
if s.count(old_compact)!=1: raise SystemExit('RATE_COMPACT_ANCHOR_COUNT:'+str(s.count(old_compact)))
s=s.replace(old_compact,new_compact,1)
old_ret='finalReconcileVersion: FINAL_RECONCILE_VERSION, retention: "LONG_TERM_NO_APPLICATION_EXPIRY"'
new_ret='finalReconcileVersion: FINAL_RECONCILE_VERSION, finalRateGuardVersion: FINAL_RATE_GUARD_VERSION, retention: "LONG_TERM_NO_APPLICATION_EXPIRY"'
if s.count(old_ret)!=1: raise SystemExit('STAT_RATE_MARKER_COUNT:'+str(s.count(old_ret)))
s=s.replace(old_ret,new_ret,1)
old_bridge='finalReconcileVersion: FINAL_RECONCILE_VERSION });'
new_bridge='finalReconcileVersion: FINAL_RECONCILE_VERSION, finalRateGuardVersion: FINAL_RATE_GUARD_VERSION });'
if s.count(old_bridge)!=1: raise SystemExit('BRIDGE_RATE_MARKER_COUNT:'+str(s.count(old_bridge)))
s=s.replace(old_bridge,new_bridge,1)
out.parent.mkdir(parents=True,exist_ok=True);out.write_text(s);print('RATE_GUARD_PATCH_OK',len(s))
