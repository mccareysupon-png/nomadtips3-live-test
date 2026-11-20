import assert from 'node:assert/strict';import fs from 'node:fs';
const base='https://api.cloudflare.com/client/v4',account=process.env.CLOUDFLARE_ACCOUNT_ID,root=base+'/accounts/'+account+'/workers';
async function cf(p){const r=await fetch(root+p,{headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN},signal:AbortSignal.timeout(25000)});const j=await r.json();if(!r.ok||!j.success)throw Error('CF '+r.status+' '+p);return j.result}
const names=['nomadtips3-engine-343','nomadtips3-343-auto-engine','nomadtips3-341-5usd-staged','nomadtips3-full-market-343-ball46','nomadtips3-rich-odds-343','nomadtips3-5usd-hub-343','nomadtips3-live-engine-5usd-shadow','ball46-shadow-hook-stage-20261117','nomadtips3-car341-preview','ball46-form-history-v1'];
const out=[];
for(const name of names){try{
 const ver=(await cf('/scripts/'+name+'/deployments?per_page=1')).deployments[0].versions[0].version_id;
 const v=await cf('/workers/'+name+'/versions/'+ver+'?include=modules');
 const binds=(v.resources?.bindings??v.bindings??[]);
 const bindingNames=binds.map(b=>({name:b.name,type:b.type,...(b.type==='service'?{service:b.service}:{}),...(/^(?:CRON_ENABLED|ENGINE_ENABLED|PROVIDER_MODE|PROVIDER_ENABLED|FIVEUSD_NATIVE_MODE|FIVEUSD_SHADOW_LEGACY_DISABLED|BULK_HUB_ONLY|HUB_ONLY|AUTO_SCAN|OWNER_ENABLED|SOURCE_MODE|LIVE_ENABLED|AUTO_ENABLED|PAUSED)$/.test(b.name)&&b.type==='plain_text'&&/^[a-zA-Z0-9_-]{1,40}$/.test(String(b.text??b.value))?{flag:String(b.text??b.value)}:{})}));
 const sched=await cf('/scripts/'+name+'/schedules').catch(()=>null);
 const excerpts=[];
 for(const m of v.modules??[]){if(!m.content_base64||!/\.(m?js|ts)$/.test(m.name))continue;
 const ls=Buffer.from(m.content_base64,'base64').toString().split('\n');
 const indexes=ls.map((l,i)=>/\b(?:async )?scheduled\s*\(|async alarm\(|async function (?:fetchVerifiedCornerOnly|providerLive|providerRequest|fetchProviderOnce|fetchFullOdds)|FIVEUSD_NATIVE_MODE|(?:HUB|hub).*(?:fetch|snapshot)|(?:PAUSED|DISABLED|providerDisabled|directProvider|directFetch|providerMode)|FIVEDOLLAR_API_KEY|FIVEUSD_API_KEY/i.test(l)?i:-1).filter(i=>i>=0);
 for(const i of indexes.slice(0,35)){let code=ls.slice(Math.max(0,i-1),i+5).join('\n').slice(0,1100).replace(/(?:fb_live_|fb_test_)[A-Za-z0-9_-]+/g,'[REDACTED]').replace(/[A-Za-z0-9+/_-]{70,}/g,'[REDACTED]').replace(/(?:authorization|api[_-]?key|secret|token|password)\s*:\s*(?:["'][^"']+["']|[^,\n]+)/gi,'[REDACTED]');excerpts.push({module:m.name,line:i+1,code})}
 }
 out.push({name,version:ver,schedules:sched?.schedules??sched,bindingNames,excerpts});console.log('CALL_PATH '+JSON.stringify({name,version:ver,schedules:sched?.schedules??sched,bindingNames:bindingNames.filter(b=>/HUB|FIVE|MODE|ENABLED|PAUSED/i.test(b.name)),excerpts:excerpts.slice(0,22)}));
}catch(e){out.push({name,error:String(e.message)});console.log('CALL_PATH_ERROR '+JSON.stringify({name,error:e.message}))}}
let analytics;
try{
 const end=new Date(),start=new Date(end.getTime()-15*60000);
 const query='query($account:String!,$start:Time!,$end:Time!){viewer{accounts(filter:{accountTag:$account}){workersInvocationsAdaptive(limit:100,filter:{datetime_geq:$start,datetime_leq:$end},orderBy:[sum_requests_DESC]){dimensions{scriptName}sum{requests errors}}}}}';
 const r=await fetch(base+'/graphql',{method:'POST',headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,'content-type':'application/json'},body:JSON.stringify({query,variables:{account,start:start.toISOString(),end:end.toISOString()}}),signal:AbortSignal.timeout(20000)});
 const j=await r.json();analytics=j.errors?.length?{state:'UNAVAILABLE',errors:j.errors.map(e=>e.message).slice(0,3)}:{state:'OK',rows:j.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive??[]};console.log('INVOCATION_AUDIT '+JSON.stringify(analytics))
}catch(e){analytics={state:'UNAVAILABLE',reason:String(e.message)};console.log('INVOCATION_AUDIT '+JSON.stringify(analytics))}
fs.mkdirSync('evidence',{recursive:true});fs.writeFileSync('evidence/closeout-audit.json',JSON.stringify({out,analytics,providerRequests:0,productionWrites:0},null,2));
