/**
 * TEST ONLY. Read-only adapter for the independent PREMATCH_STORE/preview-data
 * response. Writes ONLY to the new Pre-Match performance DO, never to source.
 *
 * This is a projection of already recorded Bot selections/settlements.
 * No provider calls, no external fetch, no generated prices or fake matches.
 */
import {emptyPerformance,applyLedgerEvent} from './performance-core.mjs';

const isoSeconds=(n,label)=>{
 if(!Number.isSafeInteger(n)||n<1500000000||n>4102444800)throw Error('INVALID_'+label);
 return new Date(n*1000).toISOString();
};
const statusValue=x=>String(x||'').trim().toUpperCase().replace(/[ _-]+/g,'_');
const allowed=new Set(['PENDING','WIN','LOSS','PUSH','DRAW','VOID','HALF_WIN','HALF_LOSS']);
export const emptyTestState=()=>({version:1,scope:'PREMATCH_TEST_ONLY',snapshot:emptyPerformance(),selected:{},settled:{},lastImportedAt:null});
export function validateTestPreview(json){
 if(json?.testLedger?.mode!=='TEST_ONLY'||!Array.isArray(json.testLedger.rows))throw Error('SOURCE_NOT_TEST_ONLY');
 if(json.dailyBook?.providerCalls!==0)throw Error('PROVIDER_CALLS_MUST_BE_ZERO');
 if(json.testLedger.rows.length>100000)throw Error('INPUT_TOO_LARGE');
 const rows=json.testLedger.rows.map(raw=>{
  const fixture=raw.fixture_id;
  const time=Number(raw.picked_at);
  const odds=Number(raw.price);
  const pick=String(raw.pick||'').trim().toUpperCase();
  if(!Number.isSafeInteger(fixture)||fixture<=0||!['HOME','DRAW','AWAY','1','X','2'].includes(pick))throw Error('INVALID_TEST_SELECTION');
  if(!Number.isFinite(odds)||odds<=1||odds>1000)throw Error('INVALID_LOCKED_ODDS');
  const pickedAt=isoSeconds(time,'PICKED_AT');
  const status=statusValue(raw.status);
  if(!allowed.has(status))throw Error('UNKNOWN_SETTLEMENT_STATUS');
  const id='pm1x2:'+fixture+':'+time+':'+pick;
  let settledAt=null,units=null;
  if(status!=='PENDING'){
   settledAt=isoSeconds(Number(raw.settled_at),'SETTLED_AT');
   if(raw.units!==null&&raw.units!==undefined){
    units=Number(raw.units);
    if(!Number.isFinite(units))throw Error('INVALID_SETTLEMENT_UNITS');
   }
  }
  return {id,pickedAt,odds,pick,status,settledAt,units};
 }).sort((a,b)=>a.pickedAt.localeCompare(b.pickedAt)||a.id.localeCompare(b.id));
 return rows;
}
const signature=s=>[s.status==='VOID'?'PUSH':s.status==='DRAW'?'PUSH':s.status,s.settledAt,s.units??''].join('|');
export function ingestTestPreview(current,json){
 const rows=validateTestPreview(json);
 const state=current?structuredClone(current):emptyTestState();
 if(state.version!==1||state.scope!=='PREMATCH_TEST_ONLY'||state.snapshot?.schema!==1||state.snapshot.market!=='1X2')throw Error('INVALID_TEST_STATE');
 let selected=0,settled=0;
 const seen=new Set();
 // All selections are immutable before any settlement; the source can expose
 // only a rolling window, so do not remove historical projected selections.
 for(const r of rows){
  if(seen.has(r.id))throw Error('DUPLICATE_SOURCE_SELECTION');
  seen.add(r.id);
  const previous=state.selected[r.id];
  if(previous){
   if(previous.odds!==r.odds||previous.pickedAt!==r.pickedAt||previous.pick!==r.pick)throw Error('LOCKED_SELECTION_CHANGED');
   continue;
  }
  state.snapshot=applyLedgerEvent(state.snapshot,{
   sequence:state.snapshot.lastSequence+1,action:'SELECTED',signalId:r.id,pickedAt:r.pickedAt,odds:r.odds
  }).snapshot;
  state.selected[r.id]={odds:r.odds,pickedAt:r.pickedAt,pick:r.pick};
  selected++;
 }
 // Settlement transitions are append-only. Contradictory revisions must
 // be reconciled explicitly by an owner, not silently change statistics.
 for(const r of rows.filter(r=>r.status!=='PENDING').sort((a,b)=>a.settledAt.localeCompare(b.settledAt)||a.id.localeCompare(b.id))){
  const sig=signature(r),previous=state.settled[r.id];
  if(previous){
   if(previous!==sig)throw Error('SETTLEMENT_REVISION_CONFLICT');
   continue;
  }
  const event={sequence:state.snapshot.lastSequence+1,action:'SETTLED',signalId:r.id,settledAt:r.settledAt,
   odds:state.selected[r.id].odds,status:r.status==='VOID'?'PUSH':r.status};
  if(r.units!==null)event.units=r.units;
  state.snapshot=applyLedgerEvent(state.snapshot,event).snapshot;
  state.settled[r.id]=sig;
  settled++;
 }
 const changed=selected+settled>0;
 if(changed)state.lastImportedAt=new Date().toISOString();
 return {state,changed,selected,settled,sourceRows:rows.length};
}
