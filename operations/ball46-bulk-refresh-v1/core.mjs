// Isolated owner preference policy only: NO fetch(), no Production bindings.
export const DEFAULT_SECONDS=30;
export const ALLOWED_SECONDS=Object.freeze([30,20,15]);
export const SAFE_TARGET_RPM=32;
export const ACCOUNT_LIMIT_RPM=40;
export function validateSeconds(v){
  if(typeof v!=='number'||!Number.isInteger(v)||!ALLOWED_SECONDS.includes(v))throw new RangeError('INVALID_BULK_REFRESH_SECONDS');
  return v;
}
export function restoreDefault(){return {requestedSeconds:DEFAULT_SECONDS};}
export function decideBulkRefresh({requestedSeconds=DEFAULT_SECONDS,nowMs=Date.now(),monitor=null,provider429=false,retryAfterSeconds=null}={}){
  const requested=validateSeconds(requestedSeconds);
  const fallback=(reason,retryUntilMs=null)=>({requestedSeconds:requested,effectiveSeconds:DEFAULT_SECONDS,reason,retryUntilMs});
  if(provider429){
    const seconds=Number.isFinite(retryAfterSeconds)&&retryAfterSeconds>=0?Math.min(Math.ceil(retryAfterSeconds),3600):60;
    return fallback('PROVIDER_429_BACKOFF',nowMs+seconds*1000);
  }
  if(requested===DEFAULT_SECONDS)return fallback('DEFAULT');
  if(!monitor||monitor.accountWideVerified!==true)return fallback('ACCOUNT_MONITOR_REQUIRED');
  if(!Number.isFinite(monitor.observedAtMs)||monitor.observedAtMs>nowMs+5000||nowMs-monitor.observedAtMs>90000)return fallback('MONITOR_STALE');
  if(monitor.providerHealthy!==true||monitor.anyBackoff===true)return fallback('PROVIDER_NOT_HEALTHY');
  if(!Number.isFinite(monitor.requestsLast60s)||monitor.requestsLast60s<0)return fallback('USAGE_UNKNOWN');
  if(!Number.isFinite(monitor.currentBulkSeconds)||!ALLOWED_SECONDS.includes(monitor.currentBulkSeconds))return fallback('CURRENT_CADENCE_UNKNOWN');
  const projected=monitor.requestsLast60s+60/requested-60/monitor.currentBulkSeconds;
  if(projected>SAFE_TARGET_RPM||projected>ACCOUNT_LIMIT_RPM)return fallback('SAFE_BUDGET_EXCEEDED');
  if(monitor.accountRemaining!=null&&(!Number.isFinite(monitor.accountRemaining)||monitor.accountRemaining<8))return fallback('REMAINING_LOW');
  return {requestedSeconds:requested,effectiveSeconds:requested,reason:'VERIFIED_SAFE',retryUntilMs:null};
}
