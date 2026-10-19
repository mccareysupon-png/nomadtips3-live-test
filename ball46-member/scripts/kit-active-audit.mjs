import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const A=process.env.CLOUDFLARE_ACCOUNT_ID,T=process.env.CLOUDFLARE_API_TOKEN,S='ball46-member-production',O='https://member.ball46.com';
assert(A&&T,'CLOUDFLARE_AUTH_REQUIRED');
const h=b=>createHash('sha256').update(b).digest('hex');
const api=async p=>{const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+A+p,{headers:{Authorization:'Bearer '+T},signal:AbortSignal.timeout(22000)});const j=await r.json();assert(r.ok&&j.success,'CF_ERROR_'+r.status+':'+JSON.stringify(j.errors).slice(0,400));return j.result};
const dep=(await api('/workers/scripts/'+S+'/deployments?per_page=1')).deployments?.[0];
assert(dep?.versions?.length===1&&dep.versions[0].percentage===100,'MEMBER_ACTIVE_NOT_100_PERCENT');
const active=dep.versions[0].version_id;
const v=await api('/workers/workers/'+S+'/versions/'+active+'?include=modules');
const domains=(await api('/workers/domains')).filter(x=>x.service===S).map(x=>x.hostname).sort();
assert(domains.includes('member.ball46.com'),'MEMBER_DOMAIN_NOT_LINKED');
const routes=['/','/member','/member.html','/styles.css','/member.js','/event-flow-icons.js'];
const pages={};
for(const p of routes){try{const r=await fetch(O+p+'?_memberKitAudit='+Date.now(),{redirect:'manual',signal:AbortSignal.timeout(25000)}),b=Buffer.from(await r.arrayBuffer());pages[p]={http:r.status,location:r.headers.get('location'),type:r.headers.get('content-type'),size:b.length,sha256:h(b),memberKitMarker:b.toString('utf8').includes('kit_01.png')};if(p==='/styles.css'||p==='/member.js'||p==='/member.html') {mkdirSync('member-audit/public',{recursive:true});writeFileSync('member-audit/public/'+p.slice(1),b);}}catch(e){pages[p]={error:String(e)}}}
const report={checkedAt:new Date().toISOString(),script:S,activeVersion:active,activeDeployment:dep.id,domains,compatibilityDate:v.compatibility_date,mainModule:v.main_module,assets:v.assets?.config,bindingTypes:(v.bindings||[]).map(x=>({name:x.name,type:x.type})),moduleNames:v.modules.map(x=>x.name),pages};
mkdirSync('member-audit',{recursive:true});writeFileSync('member-audit/status.json',JSON.stringify(report,null,2));
console.log('BALL46_MEMBER_ACTIVE_READONLY',JSON.stringify(report).slice(0,16000));