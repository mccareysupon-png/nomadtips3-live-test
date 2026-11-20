import assert from 'node:assert/strict';import fs from 'node:fs';
const root='https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/workers';
async function cf(p){const r=await fetch(root+p,{headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN},signal:AbortSignal.timeout(20000)});const j=await r.json();assert(r.ok&&j.success);return j.result}
const targets=['ball46-production','ball46-form-history-v1','nomadtips3-5usd-hub-343'];
const reports=[];
for(const name of targets){
 const id=(await cf('/scripts/'+name+'/deployments?per_page=1')).deployments[0].versions[0].version_id;
 const v=await cf('/workers/'+name+'/versions/'+id+'?include=modules');
 const result={name,id,modules:[]};
 for(const m of v.modules??[]){if(!m.content_base64||!/\.(?:m?js|ts)$/.test(m.name))continue;const content=Buffer.from(m.content_base64,'base64').toString();
 const re=name==='ball46-production'?/FORM_HISTORY_SERVICE|\/last5|\/api\/form-history|\/api\/form\b/:name==='ball46-form-history-v1'?/\/last5|\/v1\/teams|\/health|async function |async fetch\(|setAlarm\(|async alarm\(|async scheduled\(/:/class BulkSpeedPolicy|async before\(|async observe\(|async telemetry\(|async failed\(|function telemetry|const TELEMETRY/;
 const ls=content.split('\n');const matches=ls.flatMap((l,i)=>re.test(l)?[i]:[]);
 const parts=matches.slice(0,name==='ball46-form-history-v1'?28:16).map(i=>({line:i+1,code:ls.slice(Math.max(0,i-1),i+8).join('\n').slice(0,1800).replace(/(?:authorization|api[_-]?key|secret|token|password)\s*:\s*[^,\n]+/gi,'[REDACTED]').replace(/(?:fb_live_|fb_test_)[A-Za-z0-9_-]+/g,'[REDACTED]').replace(/[A-Za-z0-9+/_-]{80,}/g,'[REDACTED]')}));
 if(parts.length)result.modules.push({name:m.name,parts});
 }
 reports.push(result);console.log('FORM_CONTRACT '+JSON.stringify(result));
}
fs.mkdirSync('evidence',{recursive:true});fs.writeFileSync('evidence/form-compatibility-audit.json',JSON.stringify({reports,upstreamCalls:0},null,2));
