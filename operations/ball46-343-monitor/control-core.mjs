// Isolated tuning core. No network, secrets, Cloudflare bindings, or production writes.
export const JOBS=['live','odds','signal','results','events','stats'];
export const DEFAULTS=Object.freeze({live:30,odds:30,signal:30,results:60,events:30,stats:300});
export function validateConfig(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('invalid_config');
 const limit=input.limitPerMinute;
 if(!Number.isInteger(limit)||limit<1||limit>40)throw Error('limit_out_of_bounds');
 if(!input.jobs||typeof input.jobs!=='object'||Array.isArray(input.jobs))throw Error('invalid_jobs');
 if(Object.keys(input.jobs).sort().join(',')!==[...JOBS].sort().join(','))throw Error('job_keys_mismatch');
 const jobs={};
 for(const id of JOBS){
  const v=input.jobs[id];
  if(!v||typeof v!=='object'||typeof v.enabled!=='boolean'||!Number.isInteger(v.seconds)||v.seconds<10||v.seconds>3600)throw Error('invalid_job_'+id);
  jobs[id]={enabled:v.enabled,seconds:v.seconds};
 }
 return {limitPerMinute:limit,jobs};
}
export function estimate(config){
 const c=validateConfig(config);
 const byJob=Object.fromEntries(JOBS.map(id=>[id,c.jobs[id].enabled?60/c.jobs[id].seconds:0]));
 const naiveRPM=Object.values(byJob).reduce((a,b)=>a+b,0);
 return {byJob,naiveRPM,estimatedHeadroom:Math.max(0,c.limitPerMinute-naiveRPM),warning:'NOT_PROVIDER_USAGE: assumes one distinct upstream request per job cycle; shared fetches and fan-out are unknown'};
}
export function plan(config,observed){
 const c=validateConfig(config), e=estimate(c);
 const measured=observed&&Number.isFinite(observed.providerRequestsLast60s)&&observed.providerRequestsLast60s>=0?observed.providerRequestsLast60s:null;
 return {config:c,estimate:e,measuredProviderRPM:measured,canApply:false,reason:'TEST_ONLY_NO_PRODUCTION_ADAPTER',observedAt:observed?.observedAt||null};
}
