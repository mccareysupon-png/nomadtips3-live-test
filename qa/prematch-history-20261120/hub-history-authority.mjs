// Candidate only: use the actual bulk policy's SAME persistent telemetry transaction.
// No independent token bucket, no provider key, no network in this module.
import {TELEMETRY,SAFETY_RESERVE,readQuota,retryUntil} from './speed-policy.mjs';
import {decideHistoryQuota,parseHistoryPath,makeHistoryGateway} from './history-gateway.mjs';
const e=(reason,status=429)=>Object.assign(Error(reason),{status,bulkSpeedControlled:true});
const fresh=(q,at)=>q?.limit===40&&q.source==='5USD_RESPONSE_HEADERS'&&q.scope==='ACCOUNT_ALL_KEYS'&&q.resetAt>at&&q.observedAt<=at&&at-q.observedAt<=15000;
function count(t,at){return t.pending.filter(x=>x.startedAt>at-60000)}
export class HistoryAuthority{
 constructor(policy,{clock=Date.now,enabled=false,coordinated=false,persistentSwitch=false}={}){this.policy=policy;this.clock=clock;this.enabled=enabled;this.coordinated=coordinated;this.persistentSwitch=persistentSwitch;this.uncertain=false}
 // Shared state used by all three transports. Do not use the public health estimate.
 async reserve({kind,path,decision=decideHistoryQuota}){
  if(!['PREMATCH_HISTORY','RICH_ODDS'].includes(kind))throw e('UNSUPPORTED_KIND',400);
  if(kind==='PREMATCH_HISTORY'&&(!this.enabled||!this.coordinated))return {allowed:false,reason:'HISTORY_DISABLED'};
  if(this.uncertain||this.policy.faulted)return {allowed:false,reason:'TELEMETRY_UNAVAILABLE'};
  return this.policy.storage.transaction(async tx=>{
   const at=this.clock(),t=await this.policy.telemetry(tx),q=t.provider,c=await this.policy.rawControl(tx);
   if(kind==='PREMATCH_HISTORY'&&this.persistentSwitch){const m=await tx.get('liveFirstHistoryMode');if(m?.enabled!==true||m?.scope!=='ISOLATED_SHADOW_ONLY')return {allowed:false,reason:'HISTORY_SWITCH_OFF'};}
   t.pending=count(t,at);
   if(Math.max(t.backoffUntil||0,this.policy.memoryBackoffUntil||0)>at)return {allowed:false,reason:'PROVIDER_COOLDOWN'};
   if(t.accelerationBlockedStatus)return {allowed:false,reason:'PROVIDER_ACCESS_ERROR'};
   if(!fresh(q,at))return {allowed:false,reason:'UNVERIFIED_QUOTA'};
   if(t.historyUncertain)return {allowed:false,reason:'REVIEW_REQUIRED'};
   if(kind==='PREMATCH_HISTORY'){
    parseHistoryPath(path,Math.floor(at/1000));
    const r=decision({sharedAllTraffic:this.coordinated,remaining:q.remaining,resetAt:q.resetAt,observedAt:q.observedAt,pending:t.pending.length,backoffUntil:t.backoffUntil,liveInFlight:t.pending.some(x=>x.kind!=='PREMATCH_HISTORY'),lastHistoryAt:t.lastHistoryAt??null},at);
    if(r!=='ALLOW')return {allowed:false,reason:r};
    // Do not consume the active HUB's safety reserve, including accelerated Live.
    const liveSlots=Math.max(2,Math.ceil(60/Math.max(10,Math.min(30,c.liveRefreshSeconds))));
    if(q.remaining-t.pending.length-1<SAFETY_RESERVE+liveSlots)return {allowed:false,reason:'PRESERVE_LIVE_RESERVE'};
    t.lastHistoryAt=at;
   }else{
    if(q.remaining-t.pending.length<=SAFETY_RESERVE)return {allowed:false,reason:'PRESERVE_LIVE_RESERVE'};
   }
   const lease={id:crypto.randomUUID(),startedAt:at,kind,allowed:true};
   t.startedAt??=at;t.requests=t.requests.filter(x=>x.at>at-60000);t.requests.push({at,kind,extra:false});
   t.pending.push({id:lease.id,startedAt:at,kind});await tx.put(TELEMETRY,t);return lease;
  })
 }
 async observe(response,lease){
  try{await this.policy.observe(response,lease)}catch(err){this.uncertain=true;throw err}
 }
 async failed(lease){
  this.uncertain=true;
  // A transport failure may have reached the provider; never blindly retry history.
  await this.policy.storage.transaction(async tx=>{const t=await this.policy.telemetry(tx);t.historyUncertain=true;t.pending=t.pending.filter(x=>x.id!==lease?.id);await tx.put(TELEMETRY,t)});
 }
}
export function historyHandler({policy,authority,authorize,transport,clock=Date.now}){
 return makeHistoryGateway({authorize,reserve:x=>authority.reserve(x),call:transport,observe:(r,l)=>authority.observe(r,l),failed:l=>authority.failed(l),clock});
}
