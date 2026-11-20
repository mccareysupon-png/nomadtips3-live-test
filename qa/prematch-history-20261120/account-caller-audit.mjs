import assert from 'node:assert/strict';import fs from 'node:fs';
const root='https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/workers';
async function cf(p){const r=await fetch(root+p,{headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN},signal:AbortSignal.timeout(25000)});const j=await r.json();if(!r.ok||!j.success)throw Error('CF '+r.status+' '+p);return j.result}
const list=await cf('/scripts');assert(Array.isArray(list)&&list.length);
const out=[];let cursor=0;
async function inspect(w){const n=w.id;let versions;
 try{const ds=await cf('/scripts/'+encodeURIComponent(n)+'/deployments?per_page=1');versions=ds.deployments[0]?.versions?.filter(v=>v.percentage>0)||[];if(!versions.length)return {name:n,state:'NO_ACTIVE_VERSION',versions:[]};
 const details=[];for(const ver of versions){const v=await cf('/workers/'+encodeURIComponent(n)+'/versions/'+ver.version_id+'?include=modules');
 const bindings=(v.resources?.bindings??v.bindings??[]);const names=Array.isArray(bindings)?bindings.map(b=>({name:b.name,type:b.type,service:b.type==='service'?b.service:undefined})):[];const matches=[];
 for(const m of v.modules??[]){if(!m.content_base64||!/\.(?:m?js|ts|py|json)$/.test(m.name))continue;
 const s=Buffer.from(m.content_base64,'base64').toString('utf8');const domain=/5dollarfootballapi\.com|5dollarfootball|fivedollar|5usd|five.?usd/i;const direct=/https?:\/\/(?:api(?:-football)?\.)?5dollarfootballapi\.com|https?:\/\/[^"'\\s]*5dollarfootballapi\.com/i;const hits=[...s.matchAll(/api\.5dollarfootballapi\.com|5dollarfootballapi\.com|FIVEDOLLAR_API_KEY|FIVE_USD_API_KEY|FIVEUSD_API_KEY|FIVEDOLLAR_KEY|5USD_API_KEY|nomadtips3-5usd-hub-343|SOURCE_HUB|FIVE_USD_HUB|FIVEUSD_HUB/gi)].map(x=>x[0]);if(hits.length||domain.test(s))matches.push({module:m.name,directHost:direct.test(s),providerKeyReference:/FIVEDOLLAR_API_KEY|FIVE_USD_API_KEY|FIVEUSD_API_KEY|FIVEDOLLAR_KEY|5USD_API_KEY/i.test(s),hubReference:/nomadtips3-5usd-hub-343|SOURCE_HUB|FIVE_USD_HUB|FIVEUSD_HUB/i.test(s),tokens:[...new Set(hits)].slice(0,12),fetch:/(?:\bfetch\s*\(|\.fetch\s*\()/i.test(s)});}
 const keyBinding=names.filter(b=>/five.?dollar|five.?usd|5.?usd|football.?api|api.?football/i.test(b.name??''));
 const serviceBindings=names.filter(b=>b.type==='service'&&/hub|five|5usd/i.test(String(b.service??b.name??'')));
 details.push({version:ver.version_id,percentage:ver.percentage,keyBinding,serviceBindings,matches,modulesAvailable:Array.isArray(v.modules)&&v.modules.some(m=>m.content_base64)});
 }
 let schedules;try{schedules=await cf('/scripts/'+encodeURIComponent(n)+'/schedules')}catch{schedules=null}
 return {name:n,state:'OK',cron:Array.isArray(schedules)?schedules.map(x=>x.cron??x):null,versions:details};
 }catch(err){return {name:n,state:'UNVERIFIED',error:String(err.message).slice(0,200)}}
}
await Promise.all(Array.from({length:5},async()=>{while(cursor<list.length){const w=list[cursor++];out.push(await inspect(w))}}));
out.sort((a,b)=>a.name.localeCompare(b.name));const candidates=out.filter(w=>w.versions?.some(v=>v.keyBinding?.length||v.serviceBindings?.length||v.matches?.length));const direct=candidates.filter(w=>w.versions.some(v=>v.matches.some(m=>m.directHost)||v.keyBinding.length));const missing=out.filter(w=>w.state==='UNVERIFIED'||w.versions?.some(v=>!v.modulesAvailable));
const summary={workers:list.length,verified:out.filter(w=>w.state==='OK').length,missing:missing.map(w=>({name:w.name,state:w.state,error:w.error})),directCandidates:direct.map(w=>({name:w.name,cron:w.cron,versions:w.versions.map(v=>({version:v.version,keyBinding:v.keyBinding,matches:v.matches.filter(m=>m.directHost||m.providerKeyReference)}))})),candidateNames:candidates.map(w=>w.name),repoCredentialAvailable:Boolean(process.env.FIVEDOLLAR_API_KEY),scope:'CLOUDFLARE_WORKERS_ACTIVE_VERSIONS_ONLY',realProviderCalls:0};
fs.mkdirSync('evidence',{recursive:true});fs.writeFileSync('evidence/account-caller-audit.json',JSON.stringify({summary,workers:out},null,2));
console.log('ACCOUNT_CALLER_AUDIT '+JSON.stringify(summary));
