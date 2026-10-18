/**
 * Prepare ONLY an authenticated, native-Engine-compatible FT observation.
 * Does not implement a new grader or Ledger v2 writer.
 *
 * Native engine must own conditional PENDING -> SETTLED, idempotent retries,
 * settlement Units and Ledger V2 projections. No Cloudflare Engine binding
 * exists in the hosted shadow configuration.
 */
const clean=v=>String(v??'').trim();
const goal=x=>Number.isInteger(x)&&x>=0&&x<=30;
export function prepareOriginalEngineFinal(candidate){
 if(!candidate?.fixture||!candidate?.score||candidate.source!=='goaloo')
  return {ok:false,reason:'UNVERIFIED_SOURCE'};
 const f=candidate.fixture,id=clean(candidate.fixtureId),
  goalooId=clean(candidate.sourceFixtureId);
 if(!id||!goalooId||f.fixtureId!==id||f.sourceIds?.goaloo!==goalooId||
  !goal(candidate.score.home)||!goal(candidate.score.away))
  return {ok:false,reason:'MATCH_IDENTITY_OR_SCORE_INVALID'};
 if(!['fixture-match-v2','fixture-match-v3'].includes(f.sourceMapping?.policy))
  return {ok:false,reason:'PERSISTENT_PROVIDER_MAP_NOT_APPROVED'};
 const kickoff=Date.parse(f.kickoffUtc);
 if(!Number.isFinite(kickoff)||!/(Z|[+-]\d\d:\d\d)$/i.test(f.kickoffUtc))
  return {ok:false,reason:'KICKOFF_UNVERIFIED'};
 if(!clean(f.home)||!clean(f.away)||!clean(f.league))
  return {ok:false,reason:'INCOMPLETE_CANONICAL_IDENTITY'};
 return {ok:true,
  idempotencyKey:'ball46:v1:FT:'+id,
  fixture:{
   id,fixture_id:id,
   status:'finished',status_code:'full',minute:90,
   teams:{home:{name:f.home},away:{name:f.away}},
   league:{name:f.league},
   // Never supply guessed corners, cards, or half-time evidence.
   goals:{home:candidate.score.home,away:candidate.score.away,
    halfHome:null,halfAway:null},
   corners:{home:null,away:null,halfHome:null,halfAway:null},
   cards:null
  },
  provenance:{source:'goaloo',sourceFixtureId:goalooId,
   verifiedAt:candidate.verifiedAt??null,
   firstFtSeenAt:candidate.firstFtSeenAt??null,
   kickoffUtc:f.kickoffUtc,canonicalId:id},
  scoring:'EXISTING_NATIVE_ONLY',usesCorners:false};
}
/**
 * Explicit release gate. The current production Engine's old /reconcile-final
 * route can be invoked with the existing 5USD token; do NOT reuse that secret
 * for a new third-party ingest integration. Require a SEPARATE native token,
 * confirmed deployed native Ledger V2 semantics, and a service binding.
 */
export async function dispatchThroughNativeLedger(transport,prepared,{
 enabled=false,authorizedDedicatedToken=null,
 nativeLedgerV2Certified=false,nativeVersionCertified=false,
 minimumTimeMs=90*60_000
}={}){
 if(!prepared?.ok)return{state:'HOLD_UNVERIFIED_PAYLOAD'};
 if(enabled!==true||nativeLedgerV2Certified!==true||nativeVersionCertified!==true)
  return {state:'HOLD_LEDGER_V2_RELEASE_GATE'};
 if(!transport?.fetch||typeof authorizedDedicatedToken!=='string'||
  authorizedDedicatedToken.length<32)
  return {state:'HOLD_NATIVE_CREDENTIAL'};
 const gameStart=Date.parse(prepared.provenance?.kickoffUtc),
  verifiedAt=Date.parse(prepared.provenance?.verifiedAt);
 if(!Number.isFinite(gameStart)||!Number.isFinite(verifiedAt)||
  verifiedAt-gameStart<minimumTimeMs)return {state:'HOLD_UNVERIFIED_FT_TIME'};
 const res=await transport.fetch('https://engine.internal/reconcile-final',{
  method:'POST',
  headers:{
   'content-type':'application/json','x-settlement-token':authorizedDedicatedToken,
   'x-ball46-fixture-idempotency':prepared.idempotencyKey
  },body:JSON.stringify({fixture:prepared.fixture})
 });
 if(!res?.ok)return{state:'NATIVE_REJECTED',http:res?.status??null};
 const data=await res.json().catch(()=>null);
 if(!data?.ok||clean(data.fixtureId)!==clean(prepared.provenance.canonicalId)||
  !Array.isArray(data.rows)||!Number.isInteger(data.settled))
  return {state:'HOLD_INVALID_NATIVE_ACK'};
 // This acknowledges only the native engine's response; it is NOT evidence
 // that the downstream Ledger V2 and Member projections were updated.
 return {state:data.settled>0?'NATIVE_ACCEPTED':'NATIVE_NO_PENDING',
  fixtureId:data.fixtureId,acceptedCount:data.settled,
  requiresLedgerV2Readback:true,verification:'NOT_COMPLETE_UNTIL_LEDGER_READBACK'};
}
