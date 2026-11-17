// BALL46 STAGING ONLY — event-driven accounting bridge.
// The canonical settlement writer must call postCanonicalTransition AFTER its ledger
// upsert succeeds. No historical scan, production endpoint, or production KV access.
import {applyLedgerTransition,displaySnapshot} from './incremental-accounting-v2-stage.mjs';

/**
 * Adapter contract (implemented by the STAGING settlement writer):
 *   load() -> {revision, balance, appliedEventIds}
 *   compareAndSwap(expectedRevision, next) -> boolean
 * Writes MUST be serialized/atomic. A normal KV get/put is NOT sufficient.
 *
 * event: {eventId, oldRow, newRow, committed:true}
 * The event ID must be stable across retries of the same canonical ledger write.
 */
export async function postCanonicalTransition(adapter,event,{at=Date.now(),maxRetries=4}={}){
 if(!event?.committed||!event.eventId||!event.newRow?.id)
  throw Error('CANONICAL_COMMITTED_EVENT_REQUIRED');
 if(!adapter||typeof adapter.load!=='function'||typeof adapter.compareAndSwap!=='function')
  throw Error('ATOMIC_STAGING_ADAPTER_REQUIRED');
 const eventId=String(event.eventId);
 for(let attempt=0;attempt<maxRetries;attempt++){
  const current=await adapter.load();
  if(!current?.balance||!Number.isSafeInteger(current.revision)||
     !Array.isArray(current.appliedEventIds))
   throw Error('STAGING_ACCOUNTING_STATE_UNAVAILABLE');
  if(current.appliedEventIds.includes(eventId))
   return {mode:'ALREADY_APPLIED',revision:current.revision,
    snapshot:displaySnapshot(current.balance)};
  const result=applyLedgerTransition(current.balance,event.oldRow??null,event.newRow,{at});
  if(result.mode==='HISTORICAL_CORRECTION_NEEDS_TARGETED_DAY_REBUILD'||
     result.mode==='OUT_OF_ORDER_SETTLEMENT_NEEDS_TARGETED_DAY_REBUILD')
   return {mode:result.mode,revision:current.revision,signalId:result.signalId};
  // Never claim an event is posted until both balance and event receipt commit.
  const next={revision:current.revision+1,balance:result.state,
   appliedEventIds:[...current.appliedEventIds,eventId]};
  if(await adapter.compareAndSwap(current.revision,next))
   return {mode:result.mode,revision:next.revision,snapshot:displaySnapshot(next.balance)};
 }
 throw Error('STAGING_ACCOUNTING_CONCURRENT_WRITE_RETRY_EXHAUSTED');
}
