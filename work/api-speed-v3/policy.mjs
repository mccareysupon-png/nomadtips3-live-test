export const PRESETS=Object.freeze([30,15,10]);
export const TELEMETRY='bulkSpeedV3Telemetry',CONTROL='bulkLiveControl',AUDIT='bulkSpeedV3Audit';
export const SAFETY_RESERVE=20,MAX_OBSERVATION_AGE_MS=30000;
export const revision=c=>JSON.stringify([c.liveRefreshSeconds,c.autoReturnMinutes,c.autoReturnAt,c.returnRefreshSeconds,c.updatedAt]);
const error=(message,status=409)=>Object.assign(Error(message),{status});
const numeric=s=>s!==null&&String(s).trim()!==''&&Number.isFinite(Number(s))?Number(s):null;
export function retryUntil(headers,at,strikes=0){
 const raw=headers.get('retry-after'),seconds=numeric(raw);
 if(seconds!==null&&seconds>=0)return at+Math.max(1000,Math.ceil(seconds*1000));
 const date=raw?Date.parse(raw):NaN,server=Date.parse(headers.get('date')||'');
 if(Number.isFinite(date))return at+Math.max(1000,date-(Number.isFinite(server)?server:at));
 return at+Math.min(300000,60000*2**Math.min(strikes,3));
}
export function readQuota(headers,at){
 const [limit,remaining,reset]=['x-ratelimit-limit','x-ratelimit-remaining','x-ratelimit-reset'].map(k=>numeric(headers.get(k)));
 if(!Number.isSafeInteger(limit)||!Number.isSafeInteger(remaining)||!Number.isSafeInteger(reset)||limit<1||remaining<0||remaining>limit||reset*1000<=at||reset*1000>at+120000)return null;
 return{limit,remaining,resetAt:reset*1000,observedAt:at,source:'5USD_RESPONSE_HEADERS',scope:'ACCOUNT_ALL_KEYS',window:'PROVIDER_FIXED_WINDOW'};
}
const empty=()=>({startedAt:null,requests:[],extraLiveRequests:[],lastBaselineLiveAt:null,extraDeferredUntil:0,response429:0,backoffUntil:0,strikes:0,accelerationBlockedStatus:null,provider:null,pending:[]});
// Existing metadata intentionally carries Today guardHit into later LIVE snapshots.
// It indicates live capacity only when the actual LIVE count reaches the existing 500-row page.
const livePageCapacityReached=m=>m?.refreshKind==='LIVE'&&m?.guardHit===true&&Number(m?.counts?.live||0)>=500;
export function quotaGate(t,at,seconds,{faulted=false,liveTruncated=false}={}){
 if(seconds===30)return{allowed:true,reason:null};
 if(!PRESETS.includes(seconds))return{allowed:false,reason:'UNSUPPORTED_INTERVAL'};
 if(faulted)return{allowed:false,reason:'TELEMETRY_UNAVAILABLE'};
 if(liveTruncated)return{allowed:false,reason:'LIVE_PAGE_GUARD_ACTIVE'};
 if(t.accelerationBlockedStatus)return{allowed:false,reason:'PROVIDER_ACCESS_ERROR_'+t.accelerationBlockedStatus};
 if(t.backoffUntil>at)return{allowed:false,reason:'PROVIDER_COOLDOWN'};
 if(t.extraDeferredUntil>at)return{allowed:false,reason:'WAIT_BASELINE_SLOT'};
 const q=t.provider;if(!q||q.source!=='5USD_RESPONSE_HEADERS'||q.scope!=='ACCOUNT_ALL_KEYS')return{allowed:false,reason:'ACCOUNT_QUOTA_UNOBSERVED'};
 if(q.limit!==40)return{allowed:false,reason:'ACCOUNT_LIMIT_CHANGED'};
 if(q.observedAt>at||at-q.observedAt>MAX_OBSERVATION_AGE_MS||q.resetAt<=at)return{allowed:false,reason:'ACCOUNT_QUOTA_STALE'};
 const pending=t.pending.filter(x=>x.startedAt>at-60000).length;
 // The shared provider header covers all keys. Reserve is headroom, not a claim that other Workers are coordinated.
 const required=SAFETY_RESERVE+Math.ceil(60/seconds)+pending;
 return q.remaining>=required?{allowed:true,reason:null}:{allowed:false,reason:'ACCOUNT_HEADROOM_LOW'};
}
export class BulkSpeedPolicy{
 constructor(storage,clock=Date.now){this.storage=storage;this.clock=clock;this.faulted=false;this.memoryBackoffUntil=0;}
 async telemetry(tx=this.storage){const t=await tx.get(TELEMETRY);return t?{...empty(),...t}:empty();}
 async rawControl(tx=this.storage){const c=await tx.get(CONTROL)||{};return{liveRefreshSeconds:Number.isFinite(c.liveRefreshSeconds)?c.liveRefreshSeconds:120,autoReturnMinutes:c.autoReturnMinutes??0,autoReturnAt:c.autoReturnAt??null,returnRefreshSeconds:c.returnRefreshSeconds??120,updatedAt:c.updatedAt??null};}
 async gate(seconds,tx=this.storage){const t=await this.telemetry(tx),m=await tx.get('meta');return quotaGate(t,this.clock(),seconds,{faulted:this.faulted,liveTruncated:livePageCapacityReached(m)});}
 async effectiveControl(control){
  if(control.liveRefreshSeconds>=30)return control;
  try{return(await this.gate(control.liveRefreshSeconds)).allowed?control:{...control,liveRefreshSeconds:30};}
  catch{this.faulted=true;return{...control,liveRefreshSeconds:30};}
 }
 async status(){
  const at=this.clock(),t=await this.telemetry(),c=await this.rawControl(),m=await this.storage.get('meta'),options={faulted:this.faulted,liveTruncated:livePageCapacityReached(m)};
  const profiles=PRESETS.map(seconds=>({seconds,...quotaGate(t,at,seconds,options)})),effectiveSeconds=c.liveRefreshSeconds<30&&!profiles.find(p=>p.seconds===c.liveRefreshSeconds)?.allowed?30:c.liveRefreshSeconds;
  return{release:'BULK_SPEED_V3',serverTime:at,control:c,revision:revision(c),effectiveSeconds,profiles,canAccelerate:profiles.some(p=>p.seconds<30&&p.allowed),accountWindow:t.provider?{...t.provider,used:t.provider.limit-t.provider.remaining,ageMs:Math.max(0,at-t.provider.observedAt),valid:t.provider.resetAt>at&&at>=t.provider.observedAt&&at-t.provider.observedAt<=MAX_OBSERVATION_AGE_MS}:null,safetyReserve:SAFETY_RESERVE,requestCoordination:'HEADERS_AND_HUB_EXTRA_REQUEST_GUARD_NOT_ALL_WORKER_RESERVATIONS',telemetry:{counterStartedAt:t.startedAt,hubRequestsLast60s:t.startedAt===null?null:t.requests.filter(x=>x.at>at-60000).length,counterScope:'BULK_HUB_ONLY',accountRequestsLast60s:null,response429:t.startedAt===null?null:t.response429,backoffUntil:Math.max(t.backoffUntil,this.memoryBackoffUntil)||null,retryAfterSeconds:Math.max(0,Math.ceil((Math.max(t.backoffUntil,this.memoryBackoffUntil)-at)/1000)),accelerationBlockedStatus:t.accelerationBlockedStatus}};
 }
 async publicState(){const s=await this.status();return{ready:true,policyRevision:'LIVE_CAPACITY_GUARD_V3_1',quotaObserved:Boolean(s.accountWindow?.valid&&s.accountWindow.limit===40),accelerationAvailable:s.canAccelerate,configuredSeconds:s.control.liveRefreshSeconds};}
 async before(url,kind){
  const at=this.clock();if(this.memoryBackoffUntil>at)throw Object.assign(error('BULK_PROVIDER_COOLDOWN',429),{retryAfter:Math.ceil((this.memoryBackoffUntil-at)/1000)});
  let extra;
  const result=await this.storage.transaction(async tx=>{
   const t=await this.telemetry(tx);if(t.backoffUntil>at)throw Object.assign(error('BULK_PROVIDER_COOLDOWN',429),{retryAfter:Math.ceil((t.backoffUntil-at)/1000)});
   const c=await this.rawControl(tx),m=await tx.get('meta'),live=kind==='ALARM_LIVE',baselineAt=t.lastBaselineLiveAt??Number(m?.liveFetchedAt||0);extra=live&&c.liveRefreshSeconds<30&&baselineAt+30000>at;
   t.requests=t.requests.filter(x=>x.at>at-60000);t.extraLiveRequests=t.extraLiveRequests.filter(x=>x>at-60000);t.pending=t.pending.filter(x=>x.startedAt>at-60000);
   if(extra){const gate=quotaGate(t,at,c.liveRefreshSeconds,{faulted:this.faulted,liveTruncated:livePageCapacityReached(m)}),maxExtra=Math.ceil(60/c.liveRefreshSeconds)-2;const reason=!gate.allowed?gate.reason:t.extraLiveRequests.length>=maxExtra?'ROLLING_EXTRA_LIMIT':null;if(reason){t.extraDeferredUntil=baselineAt+30000;await tx.put(TELEMETRY,t);return{denied:'BULK_EXTRA_DEFERRED:'+reason};}t.extraLiveRequests.push(at);}
   if(live&&!extra){t.lastBaselineLiveAt=at;t.extraDeferredUntil=0;}
   const id=crypto.randomUUID();t.startedAt??=at;t.requests.push({at,kind:kind||'TODAY',extra});t.pending.push({id,startedAt:at});await tx.put(TELEMETRY,t);return{id,startedAt:at};
  }).catch(e=>{e.bulkSpeedExtra=extra;throw e;});
  if(result.denied)throw Object.assign(error(result.denied),{bulkSpeedControlled:true});return result;
 }
 async observe(response,reservation){
  const at=this.clock(),q=readQuota(response.headers,at);if(response.status===429)this.memoryBackoffUntil=Math.max(this.memoryBackoffUntil,retryUntil(response.headers,at));
  await this.storage.transaction(async tx=>{
   const t=await this.telemetry(tx);t.pending=t.pending.filter(x=>x.id!==reservation?.id&&x.startedAt>at-60000);
   if(q){if(t.provider?.resetAt===q.resetAt)q.remaining=Math.min(q.remaining,t.provider.remaining);t.provider=q;}else t.provider=null;
   if(response.status===429){t.response429++;t.backoffUntil=Math.max(t.backoffUntil,retryUntil(response.headers,at,t.strikes));this.memoryBackoffUntil=t.backoffUntil;t.strikes++;}
   else if(response.ok){t.strikes=0;t.accelerationBlockedStatus=null;}
   if([401,402,403].includes(response.status))t.accelerationBlockedStatus=response.status;
   if(q?.remaining===0)t.backoffUntil=Math.max(t.backoffUntil,q.resetAt);
   await tx.put(TELEMETRY,t);
  });this.faulted=false;
 }
 async failed(reservation){if(!reservation)return;await this.storage.transaction(async tx=>{const t=await this.telemetry(tx);t.pending=t.pending.filter(x=>x.id!==reservation.id);await tx.put(TELEMETRY,t);});}
 async apply(raw,owner){
  if(!owner?.email||!owner?.sub)throw error('OWNER_AUTH_REQUIRED',401);
  if(!raw||Array.isArray(raw)||Object.keys(raw).sort().join(',')!=='expectedRevision,seconds'||!PRESETS.includes(raw.seconds)||typeof raw.expectedRevision!=='string'||raw.expectedRevision.length>300)throw error('INVALID_SETTING',400);
  return this.storage.transaction(async tx=>{
   const current=await this.rawControl(tx);if(raw.expectedRevision!==revision(current))throw error('REVISION_CONFLICT',412);
   if(raw.seconds<30){const gate=await this.gate(raw.seconds,tx);if(!gate.allowed)throw error(gate.reason);}
   if(current.liveRefreshSeconds===raw.seconds&&current.autoReturnMinutes===0&&current.autoReturnAt===null)return{unchanged:true,control:current};
   const next={...current,liveRefreshSeconds:raw.seconds,autoReturnMinutes:0,autoReturnAt:null,updatedAt:Math.max(this.clock(),Number(current.updatedAt||0)+1)};const audit=await tx.get(AUDIT)||[];audit.push({at:this.clock(),actor:owner.email,from:current.liveRefreshSeconds,to:raw.seconds});await tx.put(CONTROL,next);await tx.put(AUDIT,audit.slice(-50));return{unchanged:false,control:next};
  });
 }
 async alarmDelay(control,originalRetry){
  const at=this.clock(),t=await this.telemetry(),raw=await this.rawControl();if(raw.liveRefreshSeconds>=30&&t.backoffUntil<=at&&this.memoryBackoffUntil<=at)return originalRetry;
  const m=await this.storage.get('meta'),anchor=raw.liveRefreshSeconds<30&&control.liveRefreshSeconds===30?(t.lastBaselineLiveAt??Number(m?.liveFetchedAt||0)):Number(m?.liveFetchedAt||0),due=Math.max(anchor+control.liveRefreshSeconds*1000,t.backoffUntil,this.memoryBackoffUntil);
  return Math.max(1500,due-at);
 }
 async waitForDue(control){
  const at=this.clock(),t=await this.telemetry(),raw=await this.rawControl();if(raw.liveRefreshSeconds>=30&&t.backoffUntil<=at&&this.memoryBackoffUntil<=at)return null;
  const m=await this.storage.get('meta'),anchor=raw.liveRefreshSeconds<30&&control.liveRefreshSeconds===30?(t.lastBaselineLiveAt??Number(m?.liveFetchedAt||0)):Number(m?.liveFetchedAt||0),due=Math.max(anchor+control.liveRefreshSeconds*1000,t.backoffUntil,this.memoryBackoffUntil);return due>at?due-at:null;
 }
}
